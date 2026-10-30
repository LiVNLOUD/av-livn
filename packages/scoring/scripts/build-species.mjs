// Compiles data/species/*.yaml into src/species.generated.json (committed; a test checks it is in sync).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export function compileSpecies(dir) {
  const out = {};
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.yaml')).sort()) {
    const doc = parse(readFileSync(join(dir, f), 'utf8'));
    out[doc.id] = doc;
  }
  return out;
}

const root = new URL('../../../', import.meta.url).pathname;
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const json = JSON.stringify(compileSpecies(join(root, 'data/species')), null, 2) + '\n';
  writeFileSync(new URL('../src/species.generated.json', import.meta.url), json);
  console.log('wrote src/species.generated.json');
}
