import { randomUUID } from 'node:crypto';
import { AccountError } from './account.js';
import { generateChat } from './chat.js';
import { billingRpc, quotaFailures } from './billing.js';

export async function generatePaidChat(input, { config, user, model, key }) {
  const requestId = randomUUID();
  let reserveAttempted = false, providerStarted = false, settled = false, totalTokens = null, tokenCap;
  async function settle(total, outcome) {
    const response = await billingRpc(config, 'settle_paid_ai_attempt', {
      p_request_id: requestId, p_total_tokens: total, p_outcome: outcome
    });
    if (response.settled !== true) throw new AccountError('Не удалось завершить учёт запроса.', 503, 'paid_quota_unavailable');
    settled = true;
  }
  try {
    const result = await generateChat({ ...input, history: input.history.slice(-4), selectedProvider: 'anymodel', selectedModel: model.id }, {
      key, provider: 'anymodel', providerModel: model.id, timeoutMs: 45000,
      beforeRequest: async ({ maxTokens }) => {
        tokenCap = maxTokens;
        reserveAttempted = true;
        const reservation = await billingRpc(config, 'reserve_paid_ai_attempt', {
          p_user_id: user.id, p_request_id: requestId, p_model_id: model.id, p_token_cap: maxTokens
        });
        if (reservation.allowed !== true) {
          reserveAttempted = false;
          const code = reservation.code;
          const [status, message] = Object.hasOwn(quotaFailures, code) ? quotaFailures[code] : [503, 'Не удалось проверить лимит тарифа.'];
          throw new AccountError(message, status, reservation.code || 'paid_quota_unavailable');
        }
        providerStarted = true;
      },
      onUsage: async usage => {
        if (usage.totalTokens > tokenCap) {
          await settle(null, 'uncertain');
          throw new AccountError('Провайдер превысил резерв запроса. Обратитесь в поддержку.', 502, 'usage_out_of_range');
        }
        totalTokens = usage.totalTokens;
        await settle(totalTokens, 'completed');
      }
    });
    if (!settled) await settle(null, 'uncertain');
    return result;
  } catch (error) {
    if (reserveAttempted && !settled) {
      const rejected = !providerStarted || [400, 401, 402, 403, 404, 415, 422, 429].includes(error.providerStatus);
      try {
        await settle(rejected ? 0 : totalTokens, rejected ? 'rejected' : totalTokens === null ? 'uncertain' : 'completed');
      } catch { console.warn('sAI usage settlement pending', { requestId }); }
    }
    throw error;
  }
}
