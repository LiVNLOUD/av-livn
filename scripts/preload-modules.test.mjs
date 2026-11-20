// node --test scripts/preload-modules.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPreloads, importTree, staticImports } from './preload-modules.mjs';

const files = {
  '/_astro/page.js': 'import{a}from"./shared.js";import"./side.js";const m=()=>import("./map.js");',
  '/_astro/shared.js': 'import{b}from"./deep.js";export const a=1',
  '/_astro/side.js': 'import{b}from"./deep.js";',
  '/_astro/deep.js': 'export const b=2',
  '/_astro/map.js': 'import"./maplibre.js"',
};
const read = (u) => files[u] ?? null;

test('static imports only, not import()', () => {
  assert.deepEqual(staticImports(files['/_astro/page.js']), ['./shared.js', './side.js']);
});

test('the whole static tree once, entry and dynamic chunks left out', () => {
  assert.deepEqual(importTree(['/_astro/page.js'], read), ['/_astro/shared.js', '/_astro/side.js', '/_astro/deep.js']);
});

test('links go before the first stylesheet, after an inline script; idempotent', () => {
  const html = '<html><head><script>start()</script><link rel="stylesheet" href="/a.css"><script type="module" src="/_astro/page.js"></script></head><body></body></html>';
  const out = addPreloads(html, read);
  const i = out.indexOf('modulepreload');
  assert.ok(i > out.indexOf('start()') && i < out.indexOf('rel="stylesheet"'));
  assert.equal((out.match(/modulepreload/g) ?? []).length, 3);
  assert.ok(!out.includes('map.js'));
  assert.equal(addPreloads(out, read), out);
});

test('a page without module scripts is unchanged', () => {
  const html = '<html><head><link rel="stylesheet" href="/a.css"></head></html>';
  assert.equal(addPreloads(html, read), html);
});
