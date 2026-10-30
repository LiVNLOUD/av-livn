// data/spots.geojson → SQL on stdout (or file). Used by deploy.yml: wrangler d1 execute --remote --file.
import { readFileSync, writeFileSync } from 'node:fs';
import { seedSql } from '../workers/api/src/lib/seed.ts';

const root = new URL('..', import.meta.url).pathname;
const fc = JSON.parse(readFileSync(root + 'data/spots.geojson', 'utf8'));
const out = process.argv[2];
const text = seedSql(fc, new Date().toISOString());
if (out) writeFileSync(out, text);
else process.stdout.write(text);
console.error(`seed: ${fc.features.length} spots`);
