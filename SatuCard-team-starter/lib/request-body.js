import { AccountError } from './account.js';

// Check actual streamed bytes as well as Content-Length before parsing input.
export async function readBoundedBody(request, maxBytes) {
  const oversized = () => new AccountError('Слишком много данных.', 413, 'request_too_large');
  if (Number(request.headers.get('content-length')) > maxBytes) throw oversized();
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw oversized();
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
