#!/usr/bin/env node
// V1 acceptance (docs/REVISION-V.md V1 + D1): the checks scripts/e2e.mjs does not already make.
//   node scripts/e2e-v1.mjs [base] [--api https://av.livn.tr]
// --api serves /api/* from that origin (local pages, live data), as in e2e.mjs. Weather grids are replaced by fixtures
// where a check needs known values (Playwright route), so the outcome does not depend on today's weather.
//
//   1. fast hour change: five hours picked in a row, older answers slowed down → the map shows the last hour's spots
//   2. WebGL off: the decision, the av zaman çizelgesi and the spot list still work
//   3. reduced motion: no particle animation; direction stays visible as arrows (timeline + spot glyphs)
//   4. legend closed on first load (home and /harita/)
//   5. text contrast: visible text over a solid background is AA (4.5:1, large text 3:1)
//   6. particles (D1): a fixture grid of calm 5 km/sa wind, fixed random seed → after 2 s at least N visible pixels.
//      This only proves that drawing works at low speed; it says nothing about the data being current.
//   7. scenarios from fixture grids: dry / rainy, missing hour, calm / strong wind → the legend state and text match
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const base = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--api') ?? 'http://localhost:8787';
const apiOrigin = opt('--api');
let failed = 0;
const ok = (m) => console.log(`ok   ${m}`);
const fail = (m) => { failed++; console.log(`FAIL ${m}`); };

const b = await chromium.launch();

/** Page with optional live API proxy, WebGL off, reduced motion, seeded Math.random and per-path overrides. */
async function page(w, h, { webgl = true, reducedMotion = 'no-preference', seed = null, routes = {} } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion, isMobile: w < 500, hasTouch: w < 500 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  if (!webgl) await p.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/.test(String(type)) ? null : orig.call(this, type, ...rest); };
  });
  // mulberry32: the particle seeding (Math.random) is the same on every run
  if (seed != null) await p.addInitScript((s) => {
    let a = s >>> 0;
    Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }, seed);
  await p.route(/\/api\//, async (route) => {
    const u = new URL(route.request().url());
    for (const [re, fn] of Object.entries(routes)) if (new RegExp(re).test(u.pathname + u.search)) return fn(route, u);
    if (!apiOrigin || u.origin === apiOrigin) return route.continue();
    const r = await fetch(apiOrigin + u.pathname + u.search, { headers: { accept: 'application/json' } });
    await route.fulfill({ status: r.status, body: await r.text(), headers: { 'content-type': r.headers.get('content-type') ?? 'application/json' } });
  });
  return { p, ctx, errors };
}
const waitPlan = (p) => p.waitForFunction(() => performance.getEntriesByName('plan-ready').length > 0, null, { timeout: 30000 }).catch(() => {});
const waitLayers = (p) => p.waitForFunction(() => document.documentElement.dataset.layersReady === '1', null, { timeout: 30000 }).catch(() => {});
const json = (route, body) => route.fulfill({ status: 200, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

// ---------------------------------------------------------------- fixture weather grid (same lattice as the live one)
const liveGrid = await (await fetch((apiOrigin ?? base) + '/api/grid/wx')).json();
/** wx grid with every cell and hour set by fn(hourIndex) → {ws km/sa, wd °, pr in 0.1 mm/sa (as stored), cc %}; null = missing. */
function wxFixture(fn) {
  const n = liveGrid.nlat * liveGrid.nlon;
  const vars = { ws: [], wd: [], pr: [], cc: [] };
  for (let k = 0; k < liveGrid.hours; k++) {
    const v = fn(k);
    for (const key of Object.keys(vars)) vars[key].push(Array(n).fill(v[key]));
  }
  return { ...liveGrid, vars, source: 'fixture (e2e-v1)', built_at: new Date().toISOString() };
}

// ---------------------------------------------------------------- 1. fast hour change: the latest selection wins
{
  // the n-th /api/spots?at=… answer is held back longer than the next one, so answers arrive newest first
  let n = 0;
  const { p, ctx } = await page(1440, 900, {
    routes: {
      '^/api/spots\\?at=': async (route, u) => {
        const delay = Math.max(0, 1500 - 300 * n++);
        const r = await fetch((apiOrigin ?? base) + u.pathname + u.search, { headers: { accept: 'application/json' } });
        const body = await r.text();
        await new Promise((res) => setTimeout(res, delay));
        await route.fulfill({ status: r.status, body, headers: { 'content-type': 'application/json' } }).catch(() => {});
      },
    },
  });
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  await waitPlan(p);
  await p.waitForSelector('#strip .tl-hit', { timeout: 15000 }).catch(() => {});
  // five different hours spread over the timeline (it shows 24 columns from now)
  const nCols = await p.locator('#strip .tl-hit').count();
  const cols = [0.15, 0.3, 0.45, 0.6, 0.8].map((f) => Math.floor(f * nCols));
  n = 0;
  for (const c of cols) await p.locator(`#strip .tl-hit[data-c="${c}"]`).dispatchEvent('click');
  await p.waitForTimeout(3000);
  const st = await p.evaluate(() => ({ t: new URL(location.href).searchParams.get('t'), mapHour: document.getElementById('map')?.dataset.hour ?? null, tb: document.getElementById('tb-time')?.textContent ?? '' }));
  st.t && st.mapHour && Date.parse(st.t) === Date.parse(st.mapHour)
    ? ok(`fast hour change: map shows the last pick (${st.mapHour}; ${n} requests, older answers slower)`)
    : fail(`fast hour change: URL hour ${st.t}, map hour ${st.mapHour}`);
  await ctx.close();
}

// ---------------------------------------------------------------- 2. WebGL off: decision, timeline and list still work
{
  const { p, ctx, errors } = await page(1440, 900, { webgl: false });
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  await waitPlan(p);
  await p.waitForTimeout(800);
  const s = await p.evaluate(() => ({ verdict: document.getElementById('verdict')?.textContent ?? '', strip: !!document.querySelector('#strip svg .tl-hit'), alts: document.querySelectorAll('#alts .alt-b').length }));
  s.verdict && !/Yükleniyor/.test(s.verdict) ? ok(`WebGL off: decision shown ("${s.verdict}")`) : fail(`WebGL off: decision "${s.verdict}"`);
  s.strip ? ok('WebGL off: av zaman çizelgesi drawn') : fail('WebGL off: no timeline');
  s.alts > 0 ? ok(`WebGL off: equal-options table has ${s.alts} row(s)`) : fail('WebGL off: no equal-options rows');
  await p.locator('#strip .tl-hit').nth(12).dispatchEvent('click');
  await p.waitForTimeout(500);
  const t = await p.evaluate(() => new URL(location.href).searchParams.get('t'));
  t ? ok(`WebGL off: timeline still picks an hour (${t})`) : fail('WebGL off: timeline click did nothing');
  await p.locator('.views [data-v="spots"]').click();
  await p.waitForTimeout(800);
  const rows = await p.locator('.r-spots [data-id]').count();
  rows > 0 ? ok(`WebGL off: spot list has ${rows} rows`) : fail('WebGL off: spot list empty');
  errors.filter((e) => !/WebGL/i.test(e)).length ? fail(`WebGL off: page errors ${errors.join(' | ').slice(0, 200)}`) : ok('WebGL off: no page errors');
  await ctx.close();
}

// ---------------------------------------------------------------- 3. reduced motion: no particles, arrows stay
{
  const { p, ctx } = await page(1440, 900, { reducedMotion: 'reduce' });
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  await waitPlan(p);
  await p.waitForTimeout(1500);
  const arr = await p.locator('#strip .tl-arr').count();
  arr > 0 ? ok(`reduced motion: ${arr} wind arrows in the timeline`) : fail('reduced motion: no wind arrows in the timeline');
  await p.goto(base + '/harita/', { waitUntil: 'networkidle' });
  await waitLayers(p);
  await p.locator('.layers input[value=ruzgar] + span').click();
  await p.waitForTimeout(2500);
  const px = await p.evaluate(() => {
    const c = document.querySelector('canvas.particles');
    if (!c || !c.width) return 0;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });
  const field = await p.evaluate(() => !!document.getElementById('map').__avMap?.getLayer('wx-field'));
  px === 0 && field ? ok('reduced motion: wind field shown, no particle animation') : fail(`reduced motion: ${px} particle pixels, field ${field}`);
  const spot = (await (await fetch((apiOrigin ?? base) + '/api/spots')).json()).spots.find((x) => x.score?.total != null) ;
  const gl = await p.evaluate((spot) => {
    const m = document.getElementById('map').__avMap;
    m.jumpTo({ center: [spot.lon, spot.lat], zoom: 14.6 });
    return new Promise((r) => m.once('idle', () => r(m.queryRenderedFeatures({ layers: ['glyphs'] }).map((f) => f.properties.img))));
  }, spot).catch(() => []);
  gl.length ? ok(`reduced motion: ${gl.length} spot glyph(s) with wind arrows (${gl[0]})`) : fail('reduced motion: no spot glyphs at close zoom');
  await ctx.close();
}

// ---------------------------------------------------------------- 4. legend closed on first load
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const { p, ctx } = await page(w, h);
  await p.goto(base + '/harita/', { waitUntil: 'networkidle' });
  await waitLayers(p);
  const open = await p.evaluate(() => document.getElementById('legend')?.open);
  open === false ? ok(`${w}: /harita/ legend closed on first load`) : fail(`${w}: /harita/ legend open=${open}`);
  const scale = await p.locator('.maplibregl-ctrl-scale, .scale-bar, #scale').count();
  scale ? ok(`${w}: /harita/ scale always visible`) : fail(`${w}: /harita/ no scale`);
  await ctx.close();
}

// ---------------------------------------------------------------- 5. text contrast (AA) on the first screen
/** In the page: every visible text element on screen whose background resolves to solid colours; ratio < AA → bad. */
const contrastAudit = (p) => p.evaluate(() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const lum = ([r, g, b2]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b2); };
  const over = (top, bot) => [0, 1, 2].map((i) => top[i] * top[3] + bot[i] * (1 - top[3])).concat(1);
  /** Composited background behind el, or null when an image, gradient or canvas is under it (not decidable). */
  const bgOf = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage !== 'none' || e.tagName === 'CANVAS' || e.classList.contains('maplibregl-map') || e.id === 'map') return null;
      const c = rgba(cs.backgroundColor);
      if (c[3] > 0) { layers.push(c); if (c[3] >= 0.999) break; }
    }
    let acc = rgba(getComputedStyle(document.body).backgroundColor);
    if (acc[3] < 1) acc = [0, 0, 0, 1];
    for (const l of layers.reverse()) acc = over(l, acc);
    return acc;
  };
  let n = 0, skipped = 0;
  const bad = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const el = t.parentElement;
    if (!el || seen.has(el) || !t.textContent.trim()) continue;
    seen.add(el);
    if (el.closest('svg, .vh, [hidden], .maplibregl-ctrl-attrib, .maplibregl-popup')) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.99) continue;
    const bg = bgOf(el);
    if (!bg) { skipped++; continue; }
    const fg = over(rgba(cs.color), bg);
    const [a, b2] = [lum(fg), lum(bg)];
    const ratio = (Math.max(a, b2) + 0.05) / (Math.min(a, b2) + 0.05);
    const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    n++;
    if (ratio < need) bad.push(`${t.textContent.trim().slice(0, 30)} ${ratio.toFixed(2)} < ${need}`);
  }
  return { n, skipped, bad };
});
for (const [path, w, h, theme] of [['/', 1440, 900, 'dark'], ['/', 390, 844, 'dark'], ['/', 1440, 900, 'light'], ['/harita/', 1440, 900, 'dark']]) {
  const { p, ctx } = await page(w, h);
  if (theme === 'light') await p.addInitScript(() => { try { localStorage.setItem('av-livn-theme', 'light'); } catch {} });
  await p.goto(base + path, { waitUntil: 'networkidle' });
  if (path === '/') await waitPlan(p); else await waitLayers(p);
  await p.waitForTimeout(800);
  const r = await contrastAudit(p);
  r.bad.length ? fail(`contrast ${path} ${w} ${theme}: ${r.bad.length}/${r.n} below AA — ${r.bad.slice(0, 4).join('; ')}`) : ok(`contrast ${path} ${w} ${theme}: ${r.n} text elements AA (${r.skipped} over the map or an image not decidable)`);
  await ctx.close();
}

// ---------------------------------------------------------------- 6. particles at 5 km/sa (D1)
{
  const calm = wxFixture(() => ({ ws: 5, wd: 270, pr: 0, cc: 20 }));
  const { p, ctx } = await page(1440, 900, { seed: 7, routes: { '^/api/grid/wx': (route) => json(route, calm) } });
  await p.goto(base + '/harita/', { waitUntil: 'networkidle' });
  await waitLayers(p);
  await p.locator('.layers input[value=ruzgar] + span').click();
  await p.waitForTimeout(2000);
  const r = await p.evaluate(() => {
    const c = document.querySelector('canvas.particles');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] >= 96) n++;
    return { n, w: c.width, h: c.height };
  });
  // N = particles × visible trail length × 0.5. Particles: the layer's own count (canvas area / 1600, 300–1400).
  // Visible trail: a stroke starts at alpha 0.85 (217) and fades ×0.94 per frame, so it stays ≥ 96 for
  // ln(96/217)/ln(0.94) ≈ 13 frames, at the 0.6 px/frame floor ≈ 7.8 px. Half of that allows for overlap and
  // anti-aliased edges. This proves only that calm air is drawn visibly.
  const count = Math.round(Math.min(1400, Math.max(300, (r.w * r.h) / 1600)));
  const N = Math.round(count * 13 * 0.6 * 0.5);
  r.n >= N ? ok(`particles (5 km/sa fixture, seed 7): ${r.n} visible pixels ≥ N = ${N} (${count} particles × 7.8 px × 0.5)`) : fail(`particles: ${r.n} visible pixels < N = ${N}`);
  await ctx.close();
}

// ---------------------------------------------------------------- 7. scenarios from fixture grids
{
  const fixtures = {
    dry: wxFixture(() => ({ ws: 12, wd: 200, pr: 0, cc: 10 })),
    rainy: wxFixture(() => ({ ws: 18, wd: 200, pr: 24, cc: 95 })), // 2,4 mm/sa
    missing: wxFixture(() => ({ ws: null, wd: null, pr: null, cc: null })),
    strong: wxFixture(() => ({ ws: 55, wd: 20, pr: 0, cc: 60 })),
  };
  const cases = [
    ['dry', 'yagis', (s) => s.state === 'ok' && /yağış yok/.test(s.info), 'rain layer says "yağış yok", state ok'],
    ['rainy', 'yagis', (s) => s.state === 'ok' && !/yağış yok/.test(s.info) && s.pop && /2,4/.test(s.pop), 'rain drawn, tap read-out 2,4 mm/sa'],
    ['missing', 'ruzgar', (s) => s.state === 'nodata' || /veri yok/.test(s.pop ?? ''), 'missing hour is "veri yok", not zero'],
    ['dry', 'ruzgar', (s) => s.state === 'ok' && s.pop && /12/.test(s.pop), 'calm wind read-out 12 km/sa'],
    ['strong', 'ruzgar', (s) => s.state === 'ok' && s.pop && /55/.test(s.pop), 'strong wind read-out 55 km/sa'],
  ];
  for (const [fx, layer, check, what] of cases) {
    const { p, ctx } = await page(1440, 900, { routes: { '^/api/grid/wx': (route) => json(route, fixtures[fx]) } });
    await p.goto(base + '/harita/', { waitUntil: 'networkidle' });
    await waitLayers(p);
    await p.locator(`.layers input[value=${layer}] + span`).click();
    await p.waitForTimeout(1200);
    // tap the middle of the lattice for the read-out
    const pt = await p.evaluate((g) => { const m = document.getElementById('map').__avMap; const c = m.project([g.lon0 + g.dlon * (g.nlon - 1) / 2, g.lat0 + g.dlat * (g.nlat - 1) / 2]); return [c.x, c.y]; }, liveGrid);
    const box = await p.locator('#map').boundingBox();
    await p.mouse.click(box.x + pt[0], box.y + pt[1]);
    await p.waitForTimeout(500);
    const s = await p.evaluate(() => { const e = document.getElementById('layer-info'); return { info: e.hidden ? '' : e.textContent, state: e.dataset.state, pop: document.querySelector('.wx-pop')?.textContent ?? null }; });
    check(s) ? ok(`scenario ${fx}/${layer}: ${what}`) : fail(`scenario ${fx}/${layer}: ${what} — state ${s.state}, pop "${(s.pop ?? '').slice(0, 60)}", info "${s.info.slice(0, 80)}"`);
    await ctx.close();
  }
}

// ---------------------------------------------------------------- V2: method card, inventory, Sahadayım
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const { p, ctx } = await page(w, h);
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  await waitPlan(p);
  if (w < 1024) await p.locator('#m-more').click();
  const card = p.locator('#rig-card');
  if (!(await card.isVisible())) { ok(`${w}: method card hidden (levrek or no tackle inputs this hour)`); await ctx.close(); continue; }
  await p.locator('#rig-card > summary').click();
  const parts = () => p.evaluate(() => [...document.querySelectorAll('#rig .rs-part')].map((g) => g.getAttribute('data-part')).join(','));
  const tabs = await p.locator('#rig .mc-tab').count();
  const a = await parts();
  await p.locator('#rig .mc-tab').nth(1).click();
  const bParts = await parts();
  tabs === 2 && a && bParts && a !== bParts ? ok(`${w}: switching primary → secondary changes the rig layout (${a.split(',').length} → ${bParts.split(',').length} parts)`) : fail(`${w}: method switch did not change the rig (${a} | ${bParts})`);
  const kinds = await p.evaluate(() => [...new Set([...document.querySelectorAll('#rig .mk')].map((e) => e.textContent))]);
  kinds.length ? ok(`${w}: reasons carry evidence kinds (${kinds.join(', ')})`) : fail(`${w}: no evidence kinds on the reasons`);
  await p.locator('#rig .mc-view button[data-v=kullan]').click();
  (await p.locator('#rig svg').getAttribute('aria-label'))?.includes('eğitim animasyonu') ? ok(`${w}: use view labelled "eğitim animasyonu"`) : fail(`${w}: use view not labelled`);
  await p.locator('#rig .mc-view button[data-v=bagla]').click();
  await p.locator('#rig .rs-part').first().dispatchEvent('click');
  const label = await p.textContent('#rig .mc-part');
  /·/.test(label ?? '') ? ok(`${w}: tapping a part names it ("${label}")`) : fail(`${w}: part tap gave "${label}"`);
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ov <= 0 ? ok(`${w}: no overflow with the method card open`) : fail(`${w}: overflow ${ov}px`);
  await ctx.close();
}
{
  const { p, ctx } = await page(390, 844);
  await p.goto(base + '/ayarlar/', { waitUntil: 'networkidle' });
  await p.locator('#gear-groups .chip[data-g=kursun]').first().click();
  await p.locator('input[name=mode][value=dogal]').check();
  await p.locator('#my-tackle button[type=submit]').click();
  await p.reload({ waitUntil: 'networkidle' });
  const kept = await p.evaluate(() => ({ chip: document.querySelector('#gear-groups .chip[data-g=kursun]')?.getAttribute('aria-pressed'), mode: document.querySelector('input[name=mode]:checked')?.value, stored: localStorage.getItem('av-livn-my-tackle') }));
  kept.chip === 'true' && kept.mode === 'dogal' ? ok('inventory: owned sinker and "yalnız doğal" kept on this device') : fail(`inventory not kept: ${JSON.stringify(kept)}`);
  await ctx.close();
}
if (!/av\.livn\.tr/.test(base)) {
  // Sahadayım needs the admin key: local dev server only (ADMIN_TOKEN dev-token)
  const { p, ctx } = await page(390, 844);
  await ctx.addInitScript(() => { localStorage.setItem('av-livn-admin', 'dev-token'); localStorage.setItem('av-livn-saha-hint', '1'); localStorage.removeItem('av-livn-live-session'); });
  await p.unroute(/\/api\//);
  await p.route(/\/api\//, async (route) => {
    const u = new URL(route.request().url());
    if (!apiOrigin || u.pathname.startsWith('/api/admin')) return route.continue();
    const r = await fetch(apiOrigin + u.pathname + u.search, { headers: { accept: 'application/json' } });
    await route.fulfill({ status: r.status, body: await r.text(), headers: { 'content-type': 'application/json' } });
  });
  p.on('dialog', (d) => d.accept('4,5'));
  await p.goto(base + '/sahadayim/', { waitUntil: 'networkidle' });
  await p.selectOption('#spot', { index: 3 });
  await p.selectOption('#method', 'dropshot_yem');
  await p.locator('#start').click();
  await p.waitForTimeout(1500);
  await p.locator('#bite').click(); await p.locator('#bite').click(); await p.locator('#plus').click();
  const c = await p.evaluate(() => ({ bites: document.getElementById('bites').textContent, fish: document.getElementById('count').textContent, rig: document.querySelectorAll('#l-rig .rs-part').length }));
  c.bites === '2' && c.fish === '1' && c.rig > 3 ? ok(`Sahadayım: bites ${c.bites}, fish ${c.fish}, rig drawn (${c.rig} parts)`) : fail(`Sahadayım counts ${JSON.stringify(c)}`);
  await p.locator('#depth').click();
  await p.waitForTimeout(1200);
  const dv = await p.textContent('#depth-v');
  dv === '4,5' ? ok(`Sahadayım: Dip entry kept (${dv} m; ${await p.textContent('#l-warn')})`) : fail(`Sahadayım: depth shows "${dv}"`);
  const small = await p.evaluate(() => [...document.querySelectorAll('.lv-main .act')].map((b) => Math.round(b.getBoundingClientRect().height)));
  small.every((x) => x >= 64) ? ok(`Sahadayım: four main controls ≥ 64 px (${small.join(', ')})`) : fail(`Sahadayım: controls ${small.join(', ')} px`);
  const visible = await p.evaluate(() => { const r = document.getElementById('depth').getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!top?.closest('#depth'); });
  visible ? ok('Sahadayım: bottom controls not covered (tab bar under the live screen)') : fail('Sahadayım: a bottom control is covered');
  await p.locator('#red').click();
  const red = await p.evaluate(() => ({ on: document.body.classList.contains('red'), color: getComputedStyle(document.querySelector('.lv-sec')).color, bg: getComputedStyle(document.querySelector('.live')).backgroundColor }));
  red.on && red.bg === 'rgb(0, 0, 0)' && /rgb\((24\d|25\d), /.test(red.color) ? ok(`Sahadayım night mode: red on black (${red.color})`) : fail(`night mode ${JSON.stringify(red)}`);
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ov <= 0 ? ok('Sahadayım 390: no horizontal overflow') : fail(`Sahadayım overflow ${ov}px`);
  await ctx.close();
}

await b.close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
