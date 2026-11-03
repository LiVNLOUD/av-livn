// I2: end-to-end checks of real user flows (Node Playwright). Fails (exit 1) on any broken step.
// Usage: node scripts/e2e.mjs <baseUrl> [--api https://av.livn.tr] [--shots dir]
//   --api: serve /api/* from another origin (local build + live data; the local D1 may have no scores)
// Flows:
//   1. home at 390 px: spot list renders, no horizontal overflow, no console errors
//   2. open a spot card: chart and the tackle box render with rows (the H3 `box` shadowing bug blanked it)
//   3. no WebGL2: the map shows a note instead of hanging; list and windows still work
//   4. 360 px: no horizontal overflow; tap targets of the main actions ≥ 40 px
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const base = args.find((a, i) => !a.startsWith('--') && !['--api', '--shots'].includes(args[i - 1])) ?? 'http://localhost:8787';
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const apiOrigin = opt('--api');
const shots = opt('--shots');
if (shots) mkdirSync(shots, { recursive: true });

let failed = 0;
const fail = (msg) => { console.error('FAIL', msg); failed++; };
const ok = (msg) => console.log('ok  ', msg);
const browser = await chromium.launch();

async function page(w, h, { webgl = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'tr-TR', isMobile: w < 500, hasTouch: w < 500 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  if (!webgl) await p.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/.test(String(type)) ? null : orig.call(this, type, ...rest); };
  });
  if (apiOrigin) await p.route(/\/api\//, async (route) => {
    const u = new URL(route.request().url());
    if (u.origin === apiOrigin) return route.continue();
    const r = await fetch(apiOrigin + u.pathname + u.search, { headers: { accept: 'application/json' } });
    await route.fulfill({ status: r.status, body: await r.text(), headers: { 'content-type': r.headers.get('content-type') ?? 'application/json' } });
  });
  return { p, errors };
}
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

// 1. home list at 390 px
{
  const { p, errors } = await page(390, 844);
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  const rows = await p.locator('.r-spots a, .r-spots [data-id], #spots li').count();
  rows > 0 ? ok(`home: ${rows} list rows`) : fail('home: no spot rows');
  const ov = await overflow(p);
  ov <= 0 ? ok('home 390: no horizontal overflow') : fail(`home 390: horizontal overflow ${ov} px`);
  errors.length ? fail(`home: console errors ${errors.slice(0, 3).join(' | ')}`) : ok('home: no console errors');
  if (shots) await p.screenshot({ path: `${shots}/e2e-home-390.png` });
}

// 2. spot card with the tackle box
{
  const { p, errors } = await page(390, 844);
  const list = await (await fetch((apiOrigin ?? base) + '/api/spots')).json();
  const s = list.spots.find((x) => x.score?.total != null && !x.score.gated) ?? list.spots[0];
  await p.goto(`${base}/mera/?id=${encodeURIComponent(s.id)}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1000);
  const name = await p.locator('#name').innerText();
  /alınamadı|uyumsuz|bulunamadı/.test(name) ? fail(`card: error title "${name}"`) : ok(`card: "${name}"`);
  (await p.locator('#chart svg').count()) ? ok('card: chart drawn') : fail('card: no chart');
  const tk = p.locator('.tackle');
  const tkRows = await p.locator('#tk dt').count();
  (await tk.isVisible()) && tkRows >= 4 ? ok(`card: tackle box with ${tkRows} rows`) : fail(`card: tackle box missing (visible ${await tk.isVisible()}, rows ${tkRows})`);
  (await p.locator('#render-err').isVisible()) ? fail('card: render error banner shown') : ok('card: no render error');
  errors.length ? fail(`card: console errors ${errors.slice(0, 3).join(' | ')}`) : ok('card: no console errors');
  const ov = await overflow(p);
  ov <= 0 ? ok('card 390: no horizontal overflow') : fail(`card 390: horizontal overflow ${ov} px`);
  if (shots) await p.screenshot({ path: `${shots}/e2e-card-390.png`, fullPage: true });
}

// 3. no WebGL2
for (const path of ['/', '/harita/']) {
  const { p, errors } = await page(1280, 900, { webgl: false });
  await p.goto(base + path, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  const note = await p.locator('.map-off-note').count();
  note ? ok(`no WebGL2 ${path}: map note shown`) : fail(`no WebGL2 ${path}: no map note`);
  const stuck = await p.locator('.map-loading:not(.map-off-note):visible').count();
  stuck ? fail(`no WebGL2 ${path}: loading indicator still visible`) : ok(`no WebGL2 ${path}: not stuck loading`);
  if (path === '/') {
    const rows = await p.locator('.r-spots a, .r-spots [data-id], #spots li').count();
    rows > 0 ? ok(`no WebGL2: list still has ${rows} rows`) : fail('no WebGL2: list empty');
  }
  const bad = errors.filter((e) => !/webgl/i.test(e));
  bad.length ? fail(`no WebGL2 ${path}: console errors ${bad.slice(0, 3).join(' | ')}`) : ok(`no WebGL2 ${path}: no other console errors`);
}

// 4. 360 px overflow and tap targets
{
  const { p } = await page(360, 780);
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  const ov = await overflow(p);
  ov <= 0 ? ok('home 360: no horizontal overflow') : fail(`home 360: horizontal overflow ${ov} px`);
  const small = await p.evaluate(() => [...document.querySelectorAll('.tabbar a, button.btn, .species .sp')]
    .filter((e) => e.offsetParent !== null)
    .map((e) => [e.textContent.trim().slice(0, 20), Math.round(e.getBoundingClientRect().height)])
    .filter(([, h]) => h < 40));
  small.length ? fail(`360: tap targets under 40 px: ${JSON.stringify(small.slice(0, 6))}`) : ok('360: main tap targets ≥ 40 px');
}

await browser.close();
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
