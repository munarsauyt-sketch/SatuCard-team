import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

test('public build includes browser assets and omits server sources and configuration', async () => {
  await import('../scripts/build-site.mjs');
  const publicFile = path => existsSync(new URL('../site-output/' + path, import.meta.url));
  for (const path of ['editor.html', 'auth.html', 'auth-client.js', 'studio-chat.js', 'assets/fonts/manrope-latin.woff2']) {
    assert.equal(publicFile(path), true, path);
  }
  for (const path of ['lib', 'database', 'tests', 'scripts', 'docs', 'api', 'vercel.json', '.env.example']) {
    assert.equal(publicFile(path), false, path);
  }
});
