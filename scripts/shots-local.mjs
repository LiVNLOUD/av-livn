// Screenshots of the local build with live data: node scripts/shots-local.mjs <outDir> [base=http://localhost:8787]
//   [--pages /,/harita/,...] [--widths 1440,390] [--theme light] [--dsf 2] [--wait 2500]
// /api/* is fetched from https://av.livn.tr (NODE_USE_ENV_PROXY=1 in the session); prints overflow and page errors.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright');
const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const out = a[0]; const base = a[1] && !a[1].startsWith('--') ? a[1] : 'http://localhost:8787';
const pages = opt('--pages', '/,/harita/,/mera/?id=osm-way-483965349,/model/,/sahadayim/,/gunluk/,/ayarlar/').split(',');
const widths = opt('--widths', '1440,390').split(',').map(Number);
const theme = opt('--theme', null); const dsf = +opt('--dsf', 1); const wait = +opt('--wait', 2500);
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
for (const w of widths) for (const pg of pages) {
  const ctx = await b.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, deviceScaleFactor: dsf });
  if (theme) await ctx.addInitScript((t) => { try { localStorage.setItem('av-livn-theme', t); } catch {} }, theme);
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.route(/\/api\//, async (route) => {
    const u = new URL(route.request().url());
    if (u.origin === 'https://av.livn.tr') return route.continue();
    try {
      const r = await fetch('https://av.livn.tr' + u.pathname + u.search, { headers: { accept: 'application/json' } });
      await route.fulfill({ status: r.status, body: Buffer.from(await r.arrayBuffer()), headers: { 'content-type': r.headers.get('content-type') ?? 'application/json' } });
    } catch (e) { await route.abort(); }
  });
  await p.goto(base + pg, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(wait);
  const name = `${pg.replace(/[/?=&]+/g, '_').replace(/^_|_$/g, '') || 'home'}-${w}${theme ? '-' + theme : ''}.png`;
  await p.screenshot({ path: `${out}/${name}`, fullPage: true });
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  console.log(JSON.stringify({ page: pg, w, ov, errs: errs.slice(0, 3), shot: name }));
  await ctx.close();
}
await b.close();
