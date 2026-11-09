import { performance } from 'node:perf_hooks';
import { generateChat } from '../lib/chat.js';
import { configuredEvaluation, getTextProvider } from '../lib/chat-providers.js';

const card = { title: '', subtitle: '', description: '', features: [], template: 'studio' };
const request = { language: 'ru', tone: 'neutral', history: [], facts: '', card };
const cases = [
  {
    id: 'new-product-ru',
    input: { mode: 'build', message: 'Собери карточку Logitech G435.', card: { ...card, title: 'Logitech G435' }, facts: 'Цвет: чёрный' },
    check: 'Точное название модели, нет выдуманных характеристик или чисел.'
  },
  {
    id: 'follow-up-ru',
    input: { mode: 'build', message: 'Продолжай с этим фактом.', card: { ...card, title: 'Чашка' }, facts: 'Материал: керамика. Объём: 200 мл.',
      history: [{ role: 'user', content: 'Собери карточку чашки.' }, { role: 'assistant', content: 'Из чего сделана чашка?' }] },
    check: 'Сохранился смысл уточнения, объём остался 200 мл.'
  },
  {
    id: 'shorten-ru',
    input: { message: 'Сделай предыдущий вариант короче.', facts: 'Цвет: белый. Материал: дерево.',
      card: { ...card, title: 'Органайзер настольный для канцелярии и мелочей' },
      previousProposal: { ...card, title: 'Деревянный органайзер для мелочей', description: 'Белый органайзер из дерева для рабочего стола.' } },
    check: 'Вариант короче предыдущего, цвет и материал сохранены.'
  },
  {
    id: 'translate-kk',
    input: { mode: 'translate', language: 'kk', message: 'Переведи текущую карточку на қазақша.',
      card: { ...card, title: 'Термокружка TM-500', description: 'Объём 500 мл.', features: ['Высота 18 см'], template: 'neon' } },
    check: 'Естественный казахский, TM-500, 500 мл и 18 см без подмены свойств.'
  },
  {
    id: 'new-product-kk',
    input: { mode: 'build', language: 'kk', message: 'Керамика кесеге тауар карточкасын жаса.', card: { ...card, title: 'Керамика кесе' },
      facts: 'Түсі ақ. Көлемі 200 мл.' },
    check: 'Естественный казахский, белый цвет и объём 200 мл.'
  }
];

const providers = ['gemini', 'groq', 'mistral', 'cloudflare', 'cohere', 'alibaba', 'scaleway'];
const trialProviders = new Set(['alibaba', 'scaleway']);
const [flag, provider, caseId] = process.argv.slice(2);
if (flag !== '--live' || !providers.includes(provider)) {
  for (const { id, check } of cases) console.log(id + ' — ' + check);
  console.log('Живой прогон: node scripts/evaluate-sai.mjs --live <провайдер> [case-id]');
  console.log('Провайдеры: ' + providers.join(', '));
  if (flag) process.exitCode = 1;
} else {
  const selected = caseId ? cases.filter(item => item.id === caseId) : cases;
  const trial = trialProviders.has(provider);
  let credentials;
  if (provider === 'gemini') credentials = { key: process.env.GEMINI_API_KEY?.trim() };
  else credentials = trial ? configuredEvaluation(provider) : getTextProvider(provider);
  if (trial && !credentials) {
    console.error('Для Alibaba и Scaleway нужны Preview, серверный ключ и разрешение в SAI_PREVIEW_EVALUATION.');
    process.exitCode = 1;
  } else if (!credentials?.key || !selected.length) {
    console.error('Укажите настройки доступа выбранного провайдера и существующий сценарий.');
    process.exitCode = 1;
  } else {
    for (const { id, input, check } of selected) {
      const start = performance.now();
      try {
        const result = await generateChat({ ...request, ...input }, { key: credentials.key, accountId: credentials.accountId, provider, timeoutMs: 25000 });
        console.log(JSON.stringify({ provider, id, ms: Math.round(performance.now() - start), check, ...result }));
        if (!result.proposal) process.exitCode = 1;
      } catch (error) {
        console.log(JSON.stringify({ provider, id, ms: Math.round(performance.now() - start), providerStatus: error.providerStatus ?? null,
          reason: error.message === 'Unsupported numeric claim' ? 'unsupported_numeric_claim' : 'provider_or_output_error' }));
        process.exitCode = 1;
        if ([401, 402, 403, 429].includes(error.providerStatus)) break;
      }
    }
  }
}
