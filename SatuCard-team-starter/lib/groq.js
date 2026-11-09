export const GROQ_MODEL = 'openai/gpt-oss-20b';

export function groqFallbackKey() {
  return process.env.GROQ_CHAT_FALLBACK_ENABLED === 'true' ? process.env.GROQ_API_KEY?.trim() : undefined;
}

export async function generateGroq({ input, instructions, schema }, { key, timeoutMs = 12000, fetcher = fetch }) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('Provider timeout')); }, timeoutMs);
  });
  try {
    return await Promise.race([timeout, (async () => {
      const response = await fetcher('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: GROQ_MODEL, max_completion_tokens: 1800, reasoning_effort: 'low', reasoning_format: 'hidden',
          messages: [{ role: 'system', content: instructions }, { role: 'user', content: JSON.stringify(input) }],
          response_format: { type: 'json_schema', json_schema: { name: 'satucard_chat', strict: true, schema } }
        })
      });
      if (!response.ok) throw Object.assign(new Error('Provider unavailable'), { providerStatus: response.status });
      const result = await response.json();
      if (result.error || !Array.isArray(result.choices) || result.choices.length !== 1) throw new Error('Invalid response');
      const { finish_reason: finish, message } = result.choices[0];
      if (finish !== 'stop' || message?.role !== 'assistant' || message.refusal || message.tool_calls || message.function_call ||
          typeof message.content !== 'string' || !message.content.trim() || message.content.length > 6000) throw new Error('Incomplete response');
      return JSON.parse(message.content);
    })()]);
  } finally { clearTimeout(timer); }
}
