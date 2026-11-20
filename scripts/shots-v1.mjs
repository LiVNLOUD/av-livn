#!/usr/bin/env node
// V1.9 screenshots of the live site (docs/screenshots/v1/, device scale 2, the visible screen only).
//   NODE_USE_ENV_PROXY=1 node scripts/shots-v1.mjs [outDir=docs/screenshots/v1] [base=https://av.livn.tr]
// Desktop 1440 / 1920, phone 390 (first screen, timeline, tackle and trust), /harita/ per layer, a night hour, the
// light theme and WebGL off. Prints the files and any page errors.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2] ?? 'docs/screenshots/v1';
const base = process.argv[3] ?? 'https://av.livn.tr';
mkdirSync(out, { recursive: true });
const b = await chromium.launch();

// tonight 22:00 Türkiye (UTC+3) = 19:00 UTC, as the ?t= hour
const night = new Date(); night.setUTCHours(19, 0, 0, 0);
if (night.getTime() < Date.now()) night.setUTCDate(night.getUTCDate() + 1);
const T = night.toISOString();

async function shot(name, path, { w = 1440, h = w < 500 ? 844 : w >= 1900 ? 1080 : 900, theme = null, webgl = true, before = null, wait = 3000 } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 500, hasTouch: w < 500 });
  if (theme) await ctx.addInitScript((t) => { try { localStorage.setItem('av-livn-theme', t); } catch {} }, theme);
  if (!webgl) await ctx.addInitScript(() => {
    const o = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t, ...r) { return /webgl/.test(String(t)) ? null : o.call(this, t, ...r); };
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(base + path, { waitUntil: 'networkidle' }).catch(() => {});
  await p.waitForTimeout(wait);
  if (before) { await before(p); await p.waitForTimeout(1500); }
  await p.screenshot({ path: `${out}/${name}.png` });
  console.log(`${name}.png${errs.length ? `  errors: ${errs.join(' | ').slice(0, 160)}` : ''}`);
  await ctx.close();
}
const layer = (l) => async (p) => { await p.locator(`.layers input[value=${l}] + span`).click(); await p.waitForTimeout(l === 'ruzgar' || l === 'akinti' ? 2500 : 1200); };

await shot('ana-1440', '/');
await shot('ana-1920', '/', { w: 1920 });
await shot('ana-390', '/', { w: 390 });
await shot('ana-390-cizelge', '/', { w: 390, before: async (p) => { await p.locator('#m-tl').click(); await p.locator('#dock').scrollIntoViewIfNeeded(); } });
await shot('ana-390-takim-guven', '/', { w: 390, before: async (p) => { await p.locator('#m-more').click(); await p.locator('.q3').scrollIntoViewIfNeeded(); } });
await shot('ana-1440-gece', `/?t=${encodeURIComponent(T)}`);
await shot('ana-1440-acik', '/', { theme: 'light' });
await shot('ana-390-acik', '/', { w: 390, theme: 'light' });
await shot('ana-1440-webgl-yok', '/', { webgl: false });
for (const l of ['puan', 'ruzgar', 'dalga', 'akinti', 'sst', 'yagis', 'bulut']) await shot(`harita-1440-${l}`, '/harita/', { before: l === 'puan' ? null : layer(l) });
await shot('harita-390-ruzgar', '/harita/', { w: 390, before: layer('ruzgar') });
await shot('harita-1440-gece', `/harita/?t=${encodeURIComponent(T)}`);
await shot('harita-1440-acik', '/harita/', { theme: 'light' });
await shot('harita-1440-webgl-yok', '/harita/', { webgl: false });
await b.close();
