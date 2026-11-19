import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { removeUpload } from '../lib/publication-uploads.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
for (const [storage, journal, expected] of [[503, 204, false], [404, 503, false], [404, 204, true]]) {
  test(`publication cleanup keeps retry evidence until storage and journal confirm removal: ${storage}/${journal}`, async () => {
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, method: options.method });
      return new Response(null, { status: url.includes('/storage/') ? storage : journal });
    };
    assert.equal(await removeUpload({ base: 'https://test.supabase.co', key: 'sb_secret_unit_only' }, 'image.jpg'), expected);
    assert.equal(calls.length, storage === 503 ? 1 : 2);
    assert.ok(calls.every(call => call.method === 'DELETE'));
  });
}
