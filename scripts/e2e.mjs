// I2: end-to-end checks of real user flows (Node Playwright). Fails (exit 1) on any broken step.
// Usage: node scripts/e2e.mjs <baseUrl> [--api https://av.livn.tr] [--shots dir]
//   --api: serve /api/* from another origin (local build + live data; the local D1 may have no scores)
// Flows:
//   1. home at 390 px: spot list renders, no horizontal overflow, no console errors
//   2. open a spot card: chart and the tackle box render with rows (the H3 `box` shadowing bug blanked it)
//   3. no WebGL2: the map shows a note instead of hanging; list and windows still work
//   4. 360 px: no horizontal overflow; tap targets of the main actions ≥ 40 px
//   5. M4 "5 saniye testi": at 3440/1920/1440/768/390 px the five answers of the plan card are on the first screen
//      without scrolling; no label/value column under 280 px; no jargon on the first screen; visitor menu; the
//      public tackle endpoint carries no brand (M2)
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

// helpers for M1/M4
const ANSWERS = ['#verdict', '#a-where', '#a-tackle', '#a-why li', '#a-trust'];
/** Every answer visible and inside the first screen (above the bottom tab bar), without scrolling. */
const firstScreen = (p) => p.evaluate((sels) => {
  const tab = document.querySelector('nav.tabbar');
  const bottom = innerHeight - (tab && getComputedStyle(tab).display !== 'none' ? tab.getBoundingClientRect().height : 0);
  return sels.map((s) => {
    const e = document.querySelector(s);
    if (!e || e.closest('[hidden]') || !e.offsetParent) return [s, 'yok'];
    const r = e.getBoundingClientRect();
    return [s, r.top >= 0 && r.bottom <= bottom ? 'ok' : `ekran dışı (alt ${Math.round(r.bottom)} > ${Math.round(bottom)})`];
  }).filter(([, v]) => v !== 'ok');
}, ANSWERS);
/** M1 text rule: a value next to its label is at least 280 px wide; narrower values sit under the label. */
const narrowColumns = (p) => p.evaluate(() => [...document.querySelectorAll('dd, .qa .a')].filter((e) => e.offsetParent).flatMap((dd) => {
  const r = dd.getBoundingClientRect();
  if (r.width >= 280) return [];
  const label = dd.tagName === 'DD' ? dd.previousElementSibling : dd.parentElement?.querySelector('.q');
  if (!label) return [];
  const l = label.getBoundingClientRect();
  return r.top >= l.bottom - 1 ? [] : [`${(label.textContent ?? '').trim().slice(0, 16)}: ${Math.round(r.width)} px`];
}));
const waitPlan = (p) => p.waitForFunction(() => {
  const v = document.querySelector('#verdict')?.textContent ?? '';
  const t = document.querySelector('#a-tackle')?.textContent ?? '';
  return v && !/Yükleniyor/.test(v) && (document.querySelector('.q3')?.hidden || !/hesaplanıyor/.test(t));
}, null, { timeout: 15000 }).catch(() => {});

// 1. home plan at 390 px
{
  const { p, errors } = await page(390, 844);
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  await waitPlan(p);
  const verdict = (await p.locator('#verdict').innerText()).trim();
  /Yükleniyor|Bilinmiyor/.test(verdict) ? fail(`home: verdict "${verdict}"`) : ok(`home: 1) "${verdict}" — ${(await p.locator('#verdict-sub').innerText()).trim()}`);
  if (await p.locator('.q2').isVisible()) {
    const where = (await p.locator('#a-where').innerText()).trim();
    ok(`home: 2) ${where} · ${(await p.locator('#a-when').innerText()).trim()}`);
    const tk = (await p.locator('#a-tackle').innerText()).trim();
    / · .* g .*iğne|· \d+(,\d+)? g · /.test(tk) ? ok(`home: 3) ${tk}`) : fail(`home: tackle line "${tk}"`);
    const why = await p.locator('#a-why li').allInnerTexts();
    why.length >= 1 && why.length <= 3 ? ok(`home: 4) ${why.join(' | ')}`) : fail(`home: ${why.length} reasons`);
    // N1: a two-option tackle line names its condition, never "A / B"
    / \/ /.test(tk) ? fail(`home: tackle line with a bare slash "${tk}"`) : ok('home: tackle line without a bare slash');
    const tr = (await p.locator('#a-trust').innerText()).trim();
    // N3: no "Yüksek" while the forward calibration has not passed
    const gate = await (await fetch((apiOrigin ?? base) + '/api/trust-gate')).json().catch(() => null);
    gate && !gate.passed && tr === 'Yüksek' ? fail('home: trust "Yüksek" before the calibration passed') : ok(`home: trust cap (calibration ${gate?.passed ? 'passed' : `not passed, n=${gate?.n ?? '?'}`})`);
    // N5: freshness line on the card
    const fresh = (await p.locator('#fresh').innerText()).trim();
    /^Hava verisi: /.test(fresh) ? ok(`home: ${fresh}`) : fail(`home: freshness line "${fresh}"`);
    if (await p.locator('#stale-card').isVisible()) ok(`home: stale warning "${(await p.locator('#stale-card').innerText()).trim()}"`);
    /^(Düşük|Orta|Yüksek)$/.test(tr) ? ok(`home: 5) ${tr} — ${(await p.locator('#a-trust-sub').innerText()).trim()}`) : fail(`home: trust "${tr}"`);
    // I5: the plan only picks Bursa spots
    const listed = (await (await fetch((apiOrigin ?? base) + '/api/spots')).json()).spots.find((x) => x.name === where);
    !listed || !listed.province || listed.province === 'bursa' ? ok(`home: pick in Bursa (${where})`) : fail(`home: pick outside Bursa (${where}, ${listed.province})`);
    // M1: no jargon on the first screen (it lives under "Neden?")
    const front = await p.evaluate(() => { const c = document.querySelector('#plan').cloneNode(true); c.querySelector('#why-more')?.remove(); return c.innerText; });
    const jargon = front.match(/ilk 3|bant(lar)?\b|kanıt [ABC]|örtüş|en iyi ilan/);
    jargon ? fail(`home: jargon on the first screen "${jargon[0]}"`) : ok('home: no jargon on the first screen');
    const eq = await p.locator('#eq-pick button').count();
    ok(eq ? `home: ${eq} equivalent options — "${(await p.locator('#eq-note').innerText()).trim()}"` : 'home: one main pick');
    const alts = await p.locator('#alts li').count();
    alts <= 2 ? ok(`home: ${alts} alternatives (≤ 2)`) : fail(`home: ${alts} alternatives`);
  }
  const tabs = (await p.locator('nav.tabbar a:visible').allInnerTexts()).map((x) => x.trim());
  JSON.stringify(tabs) === JSON.stringify(['Plan', 'Harita', 'Model']) ? ok('visitor tab bar: Plan, Harita, Model') : fail(`visitor tab bar: ${tabs.join(', ')}`);
  const ov = await overflow(p);
  ov <= 0 ? ok('home 390: no horizontal overflow') : fail(`home 390: horizontal overflow ${ov} px`);
  errors.length ? fail(`home: console errors ${errors.slice(0, 3).join(' | ')}`) : ok('home: no console errors');
}

// M2: the public tackle endpoint returns the generic classes only
{
  const t = await (await fetch((apiOrigin ?? base) + '/api/tackle')).text();
  /Gosen|Ares|Vanford|Bassterra|Nasci|Kairiki|Daiwa|Shimano/.test(t) ? fail('/api/tackle: brand names in the public response') : ok('/api/tackle: generic classes only');
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
  const tkText = await p.locator('.tackle').innerText();
  / \/ /.test((await p.locator('#tk').innerText()).replace(/Ultra hafif \/ LRF/g, '')) ? fail('card: tackle value with a bare slash') : ok('card: tackle values without a bare slash');
  /Peksu|J\. Appl\./.test(tkText) ? fail('card: article citation visible in the tackle box') : ok('card: citation only under "Neden?"');
  const narrowCard = await narrowColumns(p);
  narrowCard.length ? fail(`card: value columns under 280 px: ${narrowCard.slice(0, 4).join(', ')}`) : ok('card: no value column under 280 px');
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
  const small = await p.evaluate(() => [...document.querySelectorAll('.tabbar a, button.btn, .views button, #eq-pick button')]
    .filter((e) => e.offsetParent !== null)
    .map((e) => [e.textContent.trim().slice(0, 20), Math.round(e.getBoundingClientRect().height)])
    .filter(([, h]) => h < 40));
  small.length ? fail(`360: tap targets under 40 px: ${JSON.stringify(small.slice(0, 6))}`) : ok('360: main tap targets ≥ 40 px');
}

// 5. M4: five-second test, text rule and screenshots at five widths (home + spot card)
for (const [w, h] of [[3440, 1440], [1920, 1080], [1440, 900], [768, 1024], [390, 844]]) {
  const { p, errors } = await page(w, h);
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  await waitPlan(p);
  await p.waitForTimeout(1200);
  const miss = await firstScreen(p);
  miss.length ? fail(`5 sn testi ${w}: ${miss.map(([s, v]) => `${s} ${v}`).join(', ')}`) : ok(`5 sn testi ${w}: beş cevap ilk ekranda`);
  const narrow = await narrowColumns(p);
  narrow.length ? fail(`${w}: value columns under 280 px: ${narrow.slice(0, 4).join(', ')}`) : ok(`${w}: no value column under 280 px`);
  const ov = await overflow(p);
  ov <= 0 ? ok(`${w}: no horizontal overflow`) : fail(`${w}: horizontal overflow ${ov} px`);
  errors.length ? fail(`${w}: console errors ${errors.slice(0, 3).join(' | ')}`) : ok(`${w}: no console errors`);
  if (w >= 768) {
    const nav = (await p.locator('header.site nav a:visible').allInnerTexts()).map((x) => x.trim());
    JSON.stringify(nav) === JSON.stringify(['Plan', 'Harita', 'Model']) ? ok(`${w}: visitor menu Plan, Harita, Model`) : fail(`${w}: visitor menu ${nav.join(', ')}`);
  }
  if (shots) await p.screenshot({ path: `${shots}/home-${w}.png` });
  const where = (await p.locator('#a-where').innerText().catch(() => '')).trim();
  const list = await (await fetch((apiOrigin ?? base) + '/api/spots')).json();
  const s = list.spots.find((x) => x.name === where) ?? list.spots.find((x) => x.score?.total != null && !x.score.gated);
  if (shots && s) {
    const { p: c, errors: ce } = await page(w, h);
    await c.goto(`${base}/mera/?id=${encodeURIComponent(s.id)}`, { waitUntil: 'networkidle' });
    await c.waitForTimeout(1200);
    await c.screenshot({ path: `${shots}/card-${w}.png` });
    const n2 = await narrowColumns(c);
    n2.length ? fail(`card ${w}: value columns under 280 px: ${n2.slice(0, 4).join(', ')}`) : ok(`card ${w}: no value column under 280 px`);
    ce.length ? fail(`card ${w}: console errors ${ce.slice(0, 3).join(' | ')}`) : ok(`card ${w}: no console errors`);
  }
}

// 6. Faz O: go-to-spot zoom + ring (O1), one label per spot (O2), the time bar (O3), the table (O5), "now" label (O6)
for (const [w, h] of [[3440, 1440], [2576, 1440], [1920, 1080], [1440, 900], [390, 844]]) {
  const { p, errors } = await page(w, h);
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  await waitPlan(p);
  await p.waitForTimeout(1500);
  if (w >= 768) {
    // O3: the map and the list follow the plan's hour
    const tbShown = await p.locator('#timebar').isVisible();
    ok(tbShown ? `${w}: time bar "${(await p.locator('#timebar').innerText()).replace(/\s+/g, ' ').trim()}"` : `${w}: plan hour is now (no time bar)`);
    // O1: choosing an option (chip, else the main pick) zooms the map onto it with a ring
    const chip = p.locator('#eq-pick button').nth(1);
    const target = (await chip.count()) ? (await chip.innerText()).trim() : (await p.locator('#a-where').innerText()).trim();
    if (await chip.count()) await chip.click(); else await p.locator('#pick-open').click();
    await p.waitForTimeout(2200);
    const m = await p.evaluate((name) => {
      const map = document.getElementById('map').__avMap;
      if (!map) return null;
      const feats = map.queryRenderedFeatures().filter((f) => ['spot-labels', 'cand-labels'].includes(f.layer.id) && String(f.properties.label ?? f.properties.name ?? '').startsWith(name));
      const ring = map.queryRenderedFeatures({ layers: ['pick-ring'] }).length;
      return { zoom: map.getZoom(), labels: feats.length, ring };
    }, target);
    if (!m) fail(`${w}: no map`);
    else {
      m.zoom >= 14.5 ? ok(`${w}: map zoomed to ${target} (z ${m.zoom.toFixed(1)})`) : fail(`${w}: map zoom ${m.zoom.toFixed(1)} after choosing ${target}`);
      m.ring >= 1 ? ok(`${w}: ring around the chosen spot`) : fail(`${w}: no ring`);
      m.labels === 1 ? ok(`${w}: "${target}" labelled once`) : fail(`${w}: "${target}" labelled ${m.labels} times`);
    }
    if (shots) await p.screenshot({ path: `${shots}/map-${w}.png` });
    if (await p.locator('#timebar').isVisible()) {
      await p.locator('#tb-now').click();
      await p.waitForTimeout(600);
      (await p.locator('#timebar').isVisible()) ? fail(`${w}: "şimdiye dön" did not reset the hour`) : ok(`${w}: "şimdiye dön" resets to now`);
    }
  }
  // O5: all spots — a table on wide screens, no overflow
  await p.locator('.views [data-v="spots"]').click();
  await p.waitForTimeout(900);
  if (w >= 1200) {
    const cols = await p.locator('.spot-table thead th').count();
    const rows = await p.locator('.spot-table tbody tr[data-id]').count();
    cols >= 5 && rows > 10 ? ok(`${w}: spot table ${cols} columns, ${rows} rows`) : fail(`${w}: spot table ${cols} columns, ${rows} rows`);
    // P0: no cell wraps to more than 2 lines; the table uses the list region (≥ 1100 px from 1920 px)
    const t = await p.evaluate(() => {
      const cells = [...document.querySelectorAll('.spot-table td, .spot-table th')];
      const tall = cells.filter((c) => { const cs = getComputedStyle(c); const lh = parseFloat(cs.lineHeight) || 20; return c.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) > 2 * lh + 2; }).map((c) => c.textContent.trim().slice(0, 30));
      return { tall, width: Math.round(document.querySelector('.spot-table').getBoundingClientRect().width), head: [...document.querySelectorAll('.spot-table thead th')].map((h) => h.textContent.trim()) };
    });
    t.tall.length ? fail(`${w}: table cells over 2 lines: ${t.tall.slice(0, 4).join(' | ')}`) : ok(`${w}: no table cell over 2 lines`);
    w >= 1920 && t.width < 1100 ? fail(`${w}: table only ${t.width} px wide`) : ok(`${w}: table ${t.width} px wide`);
    /\(bugün \d\d:\d\d\)|\(\S+ \d\d:\d\d\)/.test(t.head.join(' ')) ? ok(`${w}: score header names the hour: ${t.head[2]}`) : fail(`${w}: score header "${t.head[2]}"`);
  }
  (await overflow(p)) <= 0 ? ok(`${w}: all spots without horizontal overflow`) : fail(`${w}: all spots overflow`);
  if (shots) await p.screenshot({ path: `${shots}/spots-${w}.png` });
  // O6: the "now" label never touches an hour label
  await p.locator('.views [data-v="heat"]').click();
  await p.waitForTimeout(1200);
  const clash = await p.evaluate(() => {
    const now = document.querySelector('.heatmap .hm-nowl');
    if (!now) return 'no now label';
    const a = now.getBBox();
    return [...document.querySelectorAll('.heatmap .hm-tick')].map((t) => t.getBBox()).filter((b) => b.x < a.x + a.width && a.x < b.x + b.width && b.y < a.y + a.height && a.y < b.y + b.height).length;
  });
  clash === 0 ? ok(`${w}: "şimdi" clear of the hour labels`) : fail(`${w}: "şimdi" label clash (${clash})`);
  if (shots) await p.screenshot({ path: `${shots}/heat-${w}.png` });
  errors.length ? fail(`${w} (O): console errors ${errors.slice(0, 3).join(' | ')}`) : ok(`${w} (O): no console errors`);
}

await browser.close();
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
