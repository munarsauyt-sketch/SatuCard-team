import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

// Compare the redesign to the original revision, including anonymous controls.
const root = fileURLToPath(new URL('..', import.meta.url));
const repository = resolve(root, '..');
const baseline = process.env.INTERFACE_BASE_REF || '61aec24';
const pages = ['index.html', 'editor.html', 'video.html', 'auth.html', 'dashboard.html'];
const report = [];
const count = values => values.reduce((map, key) => map.set(key, (map.get(key) || 0) + 1), new Map());
function missing(before, after) {
  const a = count(before), b = count(after);
  return [...a].filter(([key, total]) => total > (b.get(key) || 0)).map(([key, total]) => ({ key, missing: total - (b.get(key) || 0) }));
}
function inventory(document) {
  const nodes = [...document.querySelectorAll('*')];
  const formKey = form => form ? form.id || `anonymous:${[...document.forms].indexOf(form)}:${form.getAttribute('method') || 'get'}` : null;
  return {
    ids: nodes.filter(n => n.id).map(n => `${n.tagName}#${n.id}`),
    classes: nodes.flatMap(n => [...n.classList].map(c => `${n.tagName}.${c}`)),
    data: nodes.flatMap(n => [...n.attributes].filter(a => a.name.startsWith('data-')).map(a => `${n.tagName}[${a.name}=${a.value}]`)),
    scripts: [...document.scripts].map(n => JSON.stringify({ src: n.getAttribute('src'), type: n.type, async: n.hasAttribute('async'), defer: n.defer, inline: n.src ? '' : n.textContent.trim() })),
    forms: [...document.querySelectorAll('input,select,textarea,button')].map(n => {
      const hooks = [...n.attributes].filter(a => a.name.startsWith('data-')).map(a => `${a.name}=${a.value}`).sort().join('|');
      const key = n.id ? `#${n.id}` : n.name ? `${n.tagName}[name=${n.name}][value=${n.getAttribute('value') || ''}]` : hooks ? `${n.tagName}:${hooks}` : `${n.tagName}:${n.type}:${n.textContent.trim()}`;
      return JSON.stringify({ key, form: formKey(n.form) });
    }),
  };
}
for (const page of pages) {
  const original = execFileSync('git', ['-c', `safe.directory=${repository.replaceAll('\\', '/')}`, 'show', `${baseline}:SatuCard-team-starter/${page}`], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  const before = new JSDOM(original).window.document;
  const after = new JSDOM(await readFile(resolve(root, page), 'utf8')).window.document;
  const old = inventory(before), current = inventory(after);
  // The login preview is a static image. These renderer-only dependencies were
  // deliberately retired during the audit fixes; all controller scripts remain.
  const retiredScripts = page === 'auth.html' ? ['product-samples.js', 'studio-renderer.js', 'marketing.js'] : [];
  const removedScripts = old.scripts.filter(value => retiredScripts.includes((JSON.parse(value).src || '').split('?')[0]));
  if (retiredScripts.length) {
    assert.equal(after.querySelector('canvas:not([hidden]),[data-mark-card]:not([hidden]),[data-template-item]'), null, 'Auth must not require the retired renderer');
    assert.ok(after.querySelector('.auth-card-example img[src]'), 'Auth retains a real image preview');
  }
  old.scripts = old.scripts.filter(value => !removedScripts.includes(value));
  const failures = Object.fromEntries(Object.keys(old).map(key => [key, missing(old[key], current[key])]));
  const duplicateIds = [...count([...after.querySelectorAll('[id]')].map(node => node.id))].filter(([, total]) => total > 1);
  const idBindings = [...before.querySelectorAll('[id]')].flatMap(node => {
    const target = after.getElementById(node.id);
    if (!target) return [];
    return [
      ...[...node.attributes].filter(a => a.name.startsWith('data-') || a.name === 'name' || a.name === 'type').filter(a => target.getAttribute(a.name) !== a.value).map(a => `${node.id}: ${a.name}`),
      ...[...node.classList].filter(name => !target.classList.contains(name)).map(name => `${node.id}: .${name}`),
    ];
  });
  // Added scripts may occur between original ones, but the original order is stable.
  let at = 0;
  for (const script of current.scripts) if (script === old.scripts[at]) at++;
  const result = { page, baseline, counts: Object.fromEntries(Object.keys(old).map(key => [key, old[key].length])), retiredScripts, failures, duplicateIds, idBindings, scriptOrderPreserved: at === old.scripts.length };
  report.push(result);
  console.log(JSON.stringify(result));
}
if (process.env.INTERFACE_REPORT) await writeFile(process.env.INTERFACE_REPORT, JSON.stringify(report, null, 2));
assert.ok(report.every(r => Object.values(r.failures).every(v => v.length === 0) && r.duplicateIds.length === 0 && r.idBindings.length === 0 && r.scriptOrderPreserved), 'Original interface bindings must be preserved');
console.log('All five pages preserve original IDs, classes, data attributes, script order and form ownership.');
