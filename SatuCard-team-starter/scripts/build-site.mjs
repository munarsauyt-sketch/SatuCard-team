import { cp, mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(root, 'site-output');

// Rebuild only the fixed output directory under this application.
if (dirname(output) !== resolve(root)) throw new Error('Invalid build output path');
await rm(output, { recursive: true, force: true });
await mkdir(output);

// Server modules and configuration never enter the public artifact. This also
// prevents access through encoded URLs that bypass edge path matching.
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.isFile() && ['.html', '.css', '.js'].includes(extname(entry.name))) {
    await cp(resolve(root, entry.name), resolve(output, entry.name));
  }
}
await cp(resolve(root, 'assets'), resolve(output, 'assets'), { recursive: true });

// Cache versions follow file contents, so dependent pages cannot retain an old UI.
for (const entry of await readdir(output)) {
  if (!entry.endsWith('.html')) continue;
  const file = resolve(output, entry);
  const html = await readFile(file, 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([a-zA-Z0-9_./-]+\.(?:js|css))(?:\?[^"]*)?"/g)];
  let updated = html;
  for (const [attribute, path] of refs) {
    const asset = resolve(output, path);
    if (!asset.startsWith(output + '/') && !asset.startsWith(output + '\\')) continue;
    const hash = createHash('sha256').update(await readFile(asset)).digest('hex').slice(0, 12);
    updated = updated.replaceAll(attribute, attribute.replace(/="[^"]*"/, '="' + path + '?v=' + hash + '"'));
  }
  await writeFile(file, updated);
}
