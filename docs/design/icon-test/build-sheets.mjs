// Blind icon test sheets: icons in a shuffled order, numbered, no labels. One sheet per set × size, rendered at real
// size (dsf 1) and as a 4× nearest-neighbour enlargement of that same raster. Key (number → name) in key-*.json.
// node docs/design/icon-test/build-sheets.mjs [round] [sets...]   (round changes the shuffle; default: round 1, both sets)
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const { chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright');
const D = new URL('.', import.meta.url).pathname; const M = D + '../mockups/';
const ROUND = +(process.argv[2] || 1); const only = process.argv.slice(3);
const sets = Object.fromEntries(Object.entries({ new: M + 'icons.svg', old: M + 'icons-v0-rejected/icons.svg' }).filter(([k]) => !only.length || only.includes(k)));
const names = Object.keys(JSON.parse(readFileSync(D + '../../../apps/web/src/icons/icons.json', 'utf8')));
let seed = 20261110 + (ROUND - 1) * 7919; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const shuffle = (a) => a.map((x) => [rnd(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
mkdirSync(D + `sheets${ROUND > 1 ? '-r' + ROUND : ''}`, { recursive: true });
const b = await chromium.launch();
for (const [set, file] of Object.entries(sets)) for (const size of [16, 24]) {
  const order = shuffle(names); const key = Object.fromEntries(order.map((n, i) => [i + 1, n]));
  writeFileSync(D + `sheets${ROUND > 1 ? '-r' + ROUND : ''}/key-${set}-${size}.json`, JSON.stringify(key, null, 1));
  const cell = size * 3;
  const html = `<!doctype html><body style="margin:0;background:#08111a;color:#e8eff3;font:11px sans-serif">${readFileSync(file, 'utf8')}
<div style="display:grid;grid-template-columns:repeat(8,${cell}px);gap:6px;padding:8px">${order.map((n, i) => `<div style="display:grid;justify-items:center;gap:3px"><span style="color:#8ea3b0">${i + 1}</span><svg width="${size}" height="${size}" style="color:#e8eff3"><use href="#i-${n}"/></svg></div>`).join('')}</div></body>`;
  const p = await b.newPage({ viewport: { width: 8 * (cell + 6) + 16, height: 400 }, deviceScaleFactor: 1 });
  await p.setContent(html); const out = D + `sheets${ROUND > 1 ? '-r' + ROUND : ''}/${set}-${size}px.png`;
  await p.screenshot({ path: out, fullPage: true });
  // nearest-neighbour 4× of the same raster (keeps the real-size pixels, just bigger to look at)
  const buf = readFileSync(out).toString('base64');
  const z = await b.newPage({ viewport: { width: (8 * (cell + 6) + 16) * 4, height: 400 } });
  await z.setContent(`<body style="margin:0"><img id="i" src="data:image/png;base64,${buf}" style="image-rendering:pixelated;transform-origin:0 0;transform:scale(4)">`);
  const dim = await z.evaluate(() => { const i = document.getElementById('i'); return [i.naturalWidth, i.naturalHeight]; });
  await z.setViewportSize({ width: dim[0] * 4, height: dim[1] * 4 });
  await z.screenshot({ path: D + `sheets${ROUND > 1 ? '-r' + ROUND : ''}/${set}-${size}px-x4.png` });
  await p.close(); await z.close();
}
await b.close(); console.log('sheets ok');
