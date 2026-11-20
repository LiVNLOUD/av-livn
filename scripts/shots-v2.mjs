#!/usr/bin/env node
// V2 screenshots (1440 and 390 only; device scale 2): plan method card (bağla / kullan), /ayarlar/ inventory,
// Sahadayım day and night. Local build with live data (Sahadayım needs the local admin key: wrangler dev ADMIN_TOKEN).
//   NODE_USE_ENV_PROXY=1 node scripts/shots-v2.mjs [outDir=docs/screenshots/v2-takim] [base=http://localhost:8787] [--api https://av.livn.tr]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const out = args[0] && !args[0].startsWith('--') ? args[0] : 'docs/screenshots/v2-takim';
const base = args[1] && !args[1].startsWith('--') ? args[1] : 'http://localhost:8787';
const apiOrigin = args.includes('--api') ? args[args.indexOf('--api') + 1] : 'https://av.livn.tr';
mkdirSync(out, { recursive: true });
const b = await chromium.launch();

async function page(w, admin = false) {
  const ctx = await b.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, deviceScaleFactor: 2, isMobile: w < 500, hasTouch: w < 500 });
  if (admin) await ctx.addInitScript(() => { localStorage.setItem('av-livn-admin', 'dev-token'); localStorage.setItem('av-livn-saha-hint', '1'); localStorage.removeItem('av-livn-live-session'); });
  const p = await ctx.newPage();
  await p.route(/\/api\//, async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith('/api/admin')) return route.continue();
    const r = await fetch(apiOrigin + u.pathname + u.search, { headers: { accept: 'application/json' } });
    await route.fulfill({ status: r.status, body: await r.text(), headers: { 'content-type': 'application/json' } });
  });
  return { p, ctx };
}

for (const w of [1440, 390]) {
  // plan: the method card opened under "Ne ile başla?"
  const { p, ctx } = await page(w);
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  if (w < 1024) await p.locator('#m-more').click();
  if (await p.locator('#rig-card').isVisible()) {
    await p.locator('#rig-card > summary').click();
    await p.locator('#rig-card').scrollIntoViewIfNeeded();
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${out}/plan-yontem-bagla-${w}.png` });
    await p.locator('#rig .mc-view button[data-v=kullan]').click();
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${out}/plan-yontem-kullan-${w}.png` });
    await p.locator('#rig .mc-tab').nth(1).click();
    await p.locator('#rig .mc-view button[data-v=bagla]').click();
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${out}/plan-yontem-ikincil-${w}.png` });
  }
  await ctx.close();
  // inventory
  const a = await page(w);
  await a.p.goto(base + '/ayarlar/', { waitUntil: 'networkidle' });
  await a.p.locator('#gear').scrollIntoViewIfNeeded();
  await a.p.waitForTimeout(300);
  await a.p.screenshot({ path: `${out}/ayarlar-envanter-${w}.png` });
  await a.ctx.close();
}
// Sahadayım (phone): day and night
{
  const { p, ctx } = await page(390, true);
  p.on('dialog', (d) => d.accept('5'));
  await p.goto(base + '/sahadayim/', { waitUntil: 'networkidle' });
  await p.selectOption('#spot', { index: 3 });
  await p.selectOption('#method', 'dropshot_yem');
  await p.selectOption('#bait', 'hamsi');
  await p.locator('#start').click();
  await p.waitForTimeout(2500);
  for (let i = 0; i < 3; i++) await p.locator('#bite').click();
  await p.locator('#plus').click();
  await p.screenshot({ path: `${out}/sahadayim-gunduz-390.png` });
  await p.locator('#red').click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/sahadayim-gece-390.png` });
  await ctx.close();
}
await b.close();
console.log('ok');
