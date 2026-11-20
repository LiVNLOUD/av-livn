#!/usr/bin/env node
// V1.7 (D8): after `astro build`, give every page <link rel="modulepreload"> for the whole static import tree of its
// module scripts. Without it the browser only finds a page's shared chunks after the entry script has arrived and
// been parsed — one extra round trip on the decision card's critical path (~0.7 s on a throttled phone).
// Dynamic imports (the MapLibre chunk) are not followed: they stay lazy.
//   node scripts/preload-modules.mjs [distDir]
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';

/** Static import specifiers of a built module ("./x.js" from `import"./x.js"` or `from"./x.js"`), not import(). */
export function staticImports(code) {
  const out = new Set();
  for (const m of code.matchAll(/(?:\bfrom\s*|\bimport\s*)["'](\.{1,2}\/[^"']+\.js)["']/g)) out.add(m[1]);
  return [...out];
}

/** Every module reachable through static imports from the entry URLs (site paths like /_astro/x.js), entry excluded. */
export function importTree(entries, read) {
  const seen = new Set(entries);
  const order = [];
  const stack = [...entries];
  while (stack.length) {
    const url = stack.shift();
    const code = read(url);
    if (code == null) continue;
    for (const spec of staticImports(code)) {
      const dep = posix.normalize(posix.join(posix.dirname(url), spec));
      if (seen.has(dep)) continue;
      seen.add(dep);
      order.push(dep);
      stack.push(dep);
    }
  }
  return order;
}

/** Adds the preload links before the first stylesheet of <head> (after any request-starting inline script). */
export function addPreloads(html, read) {
  const entries = [...html.matchAll(/<script type="module" src="(\/_astro\/[^"]+\.js)"/g)].map((m) => m[1]);
  if (!entries.length) return html;
  const deps = importTree(entries, read).filter((u) => !html.includes(`href="${u}"`));
  if (!deps.length) return html;
  const links = deps.map((u) => `<link rel="modulepreload" href="${u}">`).join('');
  const head = html.indexOf('</head>');
  const css = html.indexOf('<link rel="stylesheet"');
  const at = css >= 0 && css < head ? css : head;
  return html.slice(0, at) + links + html.slice(at);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dist = process.argv[2] ?? new URL('../apps/web/dist/', import.meta.url).pathname;
  const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
  const read = (url) => { try { return readFileSync(join(dist, url), 'utf8'); } catch { return null; } };
  let pages = 0, links = 0;
  for (const f of walk(dist).filter((x) => x.endsWith('.html'))) {
    const html = readFileSync(f, 'utf8');
    const next = addPreloads(html, read);
    if (next !== html) { writeFileSync(f, next); pages++; links += (next.match(/rel="modulepreload"/g) ?? []).length - (html.match(/rel="modulepreload"/g) ?? []).length; }
  }
  console.log(`modulepreload: ${links} links in ${pages} pages`);
}
