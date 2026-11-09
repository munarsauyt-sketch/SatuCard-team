export async function postProviderJson(url, body, { key, timeoutMs = 12000, fetcher = fetch }) {
  if (typeof key !== 'string' || !key.trim()) throw new Error('Provider unavailable');
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('Provider timeout'));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([timeout, (async () => {
      let response;
      try {
        response = await fetcher(url, {
          method: 'POST',
          redirect: 'error',
          signal: controller.signal,
          headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
          body: JSON.stringify(body)
        });
      } catch {
        throw new Error('Provider unavailable');
      }
      if (!response.ok) throw Object.assign(new Error('Provider unavailable'), { providerStatus: response.status });
      try {
        return await response.json();
      } catch {
        throw new Error('Invalid response');
      }
    })()]);
  } finally {
    clearTimeout(timer);
  }
}

export function providerMessages({ input, instructions, schema }, addSchema = false) {
  // Only validated text fields are eligible for forwarding to a text adapter.
  const { message, history, card, facts, language, tone, mode, previousProposal } = input;
  const system = addSchema
    ? instructions + '\nReturn exactly one JSON object matching this schema: ' + JSON.stringify(schema)
    : instructions;
  return [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify({ message, history, card, facts, language, tone, mode, previousProposal }) }
  ];
}

export function parseProviderText(content) {
  if (typeof content !== 'string' || !content.trim() || content.length > 6000) {
    throw new Error('Incomplete response');
  }
  try {
    return JSON.parse(content);
  } catch {
    throw new Error('Invalid response');
  }
}

export function parseCompletion(result) {
  if (result?.error || !Array.isArray(result?.choices) || result.choices.length !== 1) {
    throw new Error('Invalid response');
  }
  const { finish_reason: finish, message } = result.choices[0] ?? {};
  if (finish !== 'stop' || message?.role !== 'assistant' || message.refusal ||
      message.tool_calls?.length || message.function_call) {
    throw new Error('Incomplete response');
  }
  return parseProviderText(message.content);
}
