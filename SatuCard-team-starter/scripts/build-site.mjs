import { cp, mkdir, readdir, rm } from 'node:fs/promises';
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
