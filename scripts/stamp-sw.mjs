// Replace __BUILD__ in dist/sw.js with a short hash of all built files (except sw.js itself).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const dist = new URL('../apps/web/dist/', import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const h = createHash('sha256');
for (const f of walk(dist).sort()) {
  if (f.endsWith('sw.js')) continue;
  h.update(relative(dist, f));
  h.update(readFileSync(f));
}
const version = h.digest('hex').slice(0, 12);
const sw = join(dist, 'sw.js');
writeFileSync(sw, readFileSync(sw, 'utf8').replace('__BUILD__', version));
console.log(`sw.js version ${version}`);
