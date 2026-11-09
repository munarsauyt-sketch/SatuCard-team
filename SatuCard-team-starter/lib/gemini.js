export const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const models = new Set([GEMINI_MODEL, 'gemini-3.8-flash']);
export function geminiModel() { return process.env.GEMINI_CHAT_MODEL?.trim() || GEMINI_MODEL; }

// Explicit provider selection; never silently fall back to a billable provider.
export function geminiSelected() { return process.env.SATUCARD_AI_PROVIDER === 'gemini'; }
export function geminiEnabled() {
  return process.env.GEMINI_CHAT_ENABLED === 'true' &&
    models.has(geminiModel());
}
export function geminiUsers() {
  return new Set((process.env.GEMINI_ALLOWED_USER_IDS || '').split(',').map(id => id.trim().toLowerCase())
    .filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)));
}
export async function generateGemini({ input, imageDataUrl, instructions, schema }, { key, timeoutMs = 25000, fetcher = fetch }) {
  const model = geminiModel();
  if (!models.has(model)) throw new Error('Unsupported model');
  const controller = new AbortController(); let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Provider timeout')); }, timeoutMs); });
  const parts = [{ text: JSON.stringify(input) }];
  if (imageDataUrl) parts.push({ inlineData: { mimeType: 'image/jpeg', data: imageDataUrl.split(',')[1] } });
  try {
    return await Promise.race([timeout, (async () => {
      const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', signal: controller.signal,
        headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: instructions }] }, contents: [{ role: 'user', parts }],
          generationConfig: { maxOutputTokens: 2400, thinkingConfig: { thinkingLevel: model === GEMINI_MODEL ? 'MINIMAL' : 'LOW', includeThoughts: false },
            responseMimeType: 'application/json', responseJsonSchema: schema } })
      });
      if (!response.ok) throw Object.assign(new Error('Provider unavailable'), { providerStatus: response.status });
      const result = await response.json(), candidates = result.candidates;
      if (result.error || result.promptFeedback?.blockReason || !Array.isArray(candidates) || candidates.length !== 1) throw new Error('Invalid response');
      const candidate = candidates[0], output = candidate.content?.parts;
      if (candidate.finishReason !== 'STOP' || candidate.content?.role !== 'model' || !Array.isArray(output) || output.length < 1 || output.length > 16 ||
          output.some(part => typeof part.text !== 'string' || part.thought || Object.keys(part).some(key => !['text', 'thoughtSignature'].includes(key))) || output.map(part => part.text).join('').length > 6000) throw new Error('Incomplete response');
      return JSON.parse(output.map(part => part.text).join(''));
    })()]);
  } finally { clearTimeout(timer); }
}
