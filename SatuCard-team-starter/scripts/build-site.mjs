import { copyFile, mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
async function copyAssets(source, destination) {
  await mkdir(destination);
  for (const item of await readdir(source, { withFileTypes: true })) {
    const from = resolve(source, item.name), to = resolve(destination, item.name);
    if (item.isDirectory()) await copyAssets(from, to);
    else if (item.isFile()) await copyFile(from, to);
    else throw new Error('Unsupported public asset: ' + item.name);
  }
}
export async function buildSite(outputDirectory) {
const output = resolve(outputDirectory || resolve(root, 'site-output'));

// Rebuild only the fixed output directory under this application.
if (!outputDirectory) {
  if (dirname(output) !== resolve(root) || output !== resolve(root, 'site-output')) throw new Error('Invalid build output path');
  await rm(output, { recursive: true, force: true });
}
// A custom destination must be new. Imports and tests never erase caller files.
await mkdir(output);

// Server modules and configuration never enter the public artifact. This also
// prevents access through encoded URLs that bypass edge path matching.
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.isFile() && ['.html', '.css', '.js'].includes(extname(entry.name))) {
    await copyFile(resolve(root, entry.name), resolve(output, entry.name));
  }
}
await copyAssets(resolve(root, 'assets'), resolve(output, 'assets'));

// Cache versions follow file contents, so dependent pages cannot retain an old UI.
for (const entry of await readdir(output)) {
  if (!entry.endsWith('.html')) continue;
  const file = resolve(output, entry);
  const html = await readFile(file, 'utf8');
  const refs = [...html.matchAll(/(?:src|href|data-hero-module)="([a-zA-Z0-9_./-]+\.(?:js|css))(?:\?[^"]*)?"/g)];
  let updated = html;
  for (const [attribute, path] of refs) {
    const asset = resolve(output, path);
    if (!asset.startsWith(output + '/') && !asset.startsWith(output + '\\')) continue;
    const hash = createHash('sha256').update(await readFile(asset)).digest('hex').slice(0, 12);
    updated = updated.replaceAll(attribute, attribute.replace(/="[^"]*"/, '="' + path + '?v=' + hash + '"'));
  }
  await writeFile(file, updated);
}
return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildSite();
