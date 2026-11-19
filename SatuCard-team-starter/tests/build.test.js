import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { buildSite } from '../scripts/build-site.mjs';

test('public build includes browser assets and omits server sources and configuration', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'satucard-build-test-'));
  try {
  const output = await buildSite(resolve(temporary, 'site'));
  const publicFile = path => existsSync(resolve(output, path));
  for (const path of ['editor.html', 'auth.html', 'auth-client.js', 'studio-chat.js', 'video-guide.html', 'video-help.js', 'video-help.css', 'video-vivid-templates.js', 'video-file-safety.js', 'assets/fonts/manrope-latin.woff2']) {
    assert.equal(publicFile(path), true, path);
  }
  for (const path of ['lib', 'database', 'tests', 'scripts', 'docs', 'api', 'vercel.json', '.env.example']) {
    assert.equal(publicFile(path), false, path);
  }
  assert.match(await readFile(resolve(output, 'auth.html'), 'utf8'), /auth-client\.js\?v=[a-f0-9]{12}/);
  await assert.rejects(buildSite(output), /EEXIST/);
  } finally {
    if (!temporary.startsWith(resolve(tmpdir()) + sep) || !temporary.split(sep).at(-1).startsWith('satucard-build-test-')) throw new Error('Unsafe test cleanup');
    await rm(temporary, { recursive: true, force: true });
  }
});
