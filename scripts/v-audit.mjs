// Faz V0: read-only measurements of the live site for the known issues (docs/design/v0-findings.md).
// Usage: node scripts/v-audit.mjs [base] > out.json
// Particle pixel counts only show whether drawing works; they are NOT evidence that weather data is current (D1).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const base = process.argv[2] ?? 'https://av.livn.tr';
const out = { base, at: new Date().toISOString() };
const b = await chromium.launch();

// --- 1. particle canvas: drawn pixels with the wind layer on (desktop + phone)
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500 });
  await p.goto(base + '/harita/');
  await p.waitForFunction(() => document.documentElement.dataset.layersReady === '1', null, { timeout: 30000 }).catch(() => {});
  await p.locator('.layers input[value=ruzgar] + span').click();
  const samples = [];
  for (const t of [500, 2000, 4000]) {
    await p.waitForTimeout(t === 500 ? 500 : t - (samples.length ? [500, 2000][samples.length - 1] : 0));
    samples.push(await p.evaluate(() => {
      const c = document.querySelector('canvas.particles');
      if (!c) return { canvas: false };
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      const r = c.getBoundingClientRect();
      return { canvas: true, w: c.width, h: c.height, css: [Math.round(r.width), Math.round(r.height)], drawn: n, raf: !!window.requestAnimationFrame };
    }));
  }
  const field = await p.evaluate(() => { const m = document.getElementById('map').__avMap; return { layer: !!m.getLayer('wx-field'), zoom: m.getZoom() }; });
  const info = await p.evaluate(() => document.getElementById('layer-info')?.innerText ?? null);
  out[`particles_${w}`] = { samples, field, info };
  await p.close();
}

// --- 2. weather grid
const wx = await (await fetch(base + '/api/grid/wx')).json();
const hour = Math.floor(Date.now() / 3_600_000);
const k = hour - wx.from_hour;
const ws = (wx.vars.ws[k] ?? []).filter((v) => v !== null);
out.grid = { nlat: wx.nlat, nlon: wx.nlon, cells: wx.nlat * wx.nlon, dlat: wx.dlat, dlon: wx.dlon, built_at: wx.built_at, hours: wx.hours, now_wind_kmh: { min: Math.min(...ws), max: Math.max(...ws) }, scale_kmh: [0, 65] };
const all = wx.vars.ws.flat().filter((v) => v !== null);
out.grid.wind_72h = { min: Math.min(...all), max: Math.max(...all), p90: all.sort((a, c) => a - c)[Math.floor(all.length * 0.9)] };

// --- 3. legend open + area share; 4. map blank time; slider effect
for (const [w, h] of [[1920, 1080], [1440, 900], [390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500 });
  const t0 = Date.now();
  await p.goto(base + '/harita/', { waitUntil: 'commit' });
  const mapReadyMs = await p.waitForFunction(() => document.getElementById('map')?.dataset.ready, null, { timeout: 30000 }).then(() => Date.now() - t0).catch(() => null);
  const leg = await p.evaluate(() => {
    const l = document.getElementById('legend'); const m = document.getElementById('map');
    if (!l || !m) return null;
    const a = l.getBoundingClientRect(), r = m.getBoundingClientRect();
    return { open: l.open, area_pct: Math.round((a.width * a.height) / (r.width * r.height) * 1000) / 10 };
  });
  // slider: does the weather layer image change after +12 h?
  await p.locator('.layers input[value=ruzgar] + span').click();
  await p.waitForTimeout(1200);
  const img = () => p.evaluate(() => { const s = document.getElementById('map').__avMap.getSource('wx-field'); return s ? String(s.url ?? s._options?.url ?? '').slice(-40) : null; });
  const before = await img();
  await p.locator('.ts-range').focus();
  for (let i = 0; i < 12; i++) await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(1800);
  const after = await img();
  out[`harita_${w}`] = { map_ready_ms: mapReadyMs, legend: leg, slider_changes_wind_image: before !== null && after !== null ? before !== after : null };
  await p.close();
}

// --- 5. D8 stages: desktop and mid-range phone (4x CPU, slow 4G 1.6 Mbps / 150 ms), cold and warm cache
async function stages(w, h, mobile) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage();
  if (mobile) {
    const c = await ctx.newCDPSession(p);
    await c.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await c.send('Network.enable');
    await c.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  }
  const run = async () => {
    await p.goto(base + '/', { waitUntil: 'commit' });
    return p.evaluate(() => new Promise((ok) => {
      const t0 = performance.now();
      const f = () => {
        const fcp = performance.getEntriesByName('first-contentful-paint')[0];
        const plan = performance.getEntriesByName('plan-ready')[0];
        const map = document.getElementById('map')?.dataset.ready;
        if ((plan && (map || innerWidth < 768)) || performance.now() - t0 > 30000) {
          ok({ skeleton_fcp_ms: fcp ? Math.round(fcp.startTime) : null, decision_ms: plan ? Math.round(plan.startTime) : null, map_interactive_ms: map ? Math.round(performance.now()) : null });
        } else setTimeout(f, 50);
      };
      f();
    }));
  };
  const cold = await run();
  const warm = await run();
  let mapPage = null;
  if (mobile) {
    const t0 = Date.now();
    await p.goto(base + '/harita/', { waitUntil: 'commit' });
    mapPage = await p.waitForFunction(() => document.getElementById('map')?.dataset.ready, null, { timeout: 60000 }).then(() => Date.now() - t0).catch(() => null);
  }
  await ctx.close();
  return { cold, warm, harita_map_ready_warm_ms: mapPage };
}
out.d8_desktop_1440 = await stages(1440, 900, false);
out.d8_mobile_390 = await stages(390, 844, true);

// --- 6. plan card: verdict and trust together
{
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(base + '/');
  await p.waitForFunction(() => performance.getEntriesByName('plan-ready').length, null, { timeout: 20000 });
  out.plan_card = await p.evaluate(() => ({ verdict: document.getElementById('verdict')?.textContent, trust: document.getElementById('a-trust')?.textContent, why: [...document.querySelectorAll('#a-why li')].map((x) => x.textContent) }));
  await p.close();
}
// --- 7. lamp wording in the public reasons
const spots = (await (await fetch(base + '/api/spots')).json()).spots;
const reasons = spots.map((s) => s.score?.reason ?? s.reason ?? '').join(' | ');
out.lamp_wording = { count_probability_text: (JSON.stringify(spots).match(/olasılığı 0,\d\d/g) ?? []).length, example: (JSON.stringify(spots).match(/[^"]{0,40}olasılığı 0,\d\d[^"]{0,40}/) ?? [null])[0] };
out.spots = spots.length;
await b.close();
console.log(JSON.stringify(out, null, 1));
