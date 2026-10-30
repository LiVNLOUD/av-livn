// Mobile UI smoke test (webapp-testing pattern, Node Playwright).
// Usage: node scripts/ui-smoke.mjs <baseUrl> <screenshotDir>
// Flow: list → first spot → select a later hour → breakdown updates. Fails on console errors.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [base = 'http://localhost:8787', out = 'docs/screenshots'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR' });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
const fail = (msg) => { console.error('FAIL', msg); process.exitCode = 1; };

await page.goto(base + '/', { waitUntil: 'networkidle' });
const rows = await page.locator('a.spot').count();
if (rows === 0) fail('no spots in list');
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
if (overflow) fail('horizontal overflow on list');
await page.screenshot({ path: `${out}/f1-list-390.png`, fullPage: true });
console.log('list rows:', rows);

await page.locator('a.spot').first().click();
await page.waitForLoadState('networkidle');
await page.waitForSelector('#chart svg');
const parts = await page.locator('.part').count();
if (parts !== 7) fail(`expected 7 components, got ${parts}`);
const before = await page.locator('#when').textContent();
await page.screenshot({ path: `${out}/f1-spot-390.png`, fullPage: true });

const condCount = await page.locator('#cond > div[data-band]').count();
if (condCount < 10) fail(`expected ≥10 condition boxes, got ${condCount}`);
const bands = await page.locator('#cond > div[data-band]').evaluateAll((els) => els.map((e) => e.getAttribute('data-band')));
console.log('condition bands now:', bands.join(' '));
if (!(await page.locator('.part.mult').count())) fail('night multiplier row missing');
await page.screenshot({ path: `${out}/f1-5-day-390.png`, fullPage: true });

// Select the first full-night hour by asking the same API the page uses.
const spotId = new URL(page.url()).searchParams.get('id');
const nightIdx = await page.evaluate(async (id) => {
  const b = await (await fetch(`/api/spots/${encodeURIComponent(id)}`)).json();
  return b.scores.findIndex((s) => s.multipliers[0]?.phase === 'full');
}, spotId);
const box = await page.locator('#chart svg').boundingBox();
const n = await page.evaluate(() => Number(document.querySelector('#chart svg').getAttribute('aria-valuemax')) + 1);
await page.mouse.click(box.x + box.width * ((nightIdx + 0.5) / n), box.y + box.height / 2);
const after = await page.locator('#when').textContent();
if (before === after) fail('hour selection did not change');
const nightRow = await page.locator('.part.mult .reason').textContent();
if (!/gece|alacakaranlık/.test(nightRow)) fail('night hour not selected: ' + nightRow);
console.log('selected:', before, '→', after, '|', nightRow);
await page.screenshot({ path: `${out}/f1-5-night-390.png`, fullPage: true });
if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) fail('horizontal overflow on spot');
await page.locator('#chart').screenshot({ path: `${out}/f1-chart-390.png` });

await page.goto(base + '/mera/?id=yok', { waitUntil: 'networkidle' });
const nf = await page.locator('h1').textContent();
if (!/bulunamadı/.test(nf)) fail('404 spot message missing');

const real = errors.filter((e) => !/404/.test(e));
if (real.length) fail('console errors: ' + real.join(' | '));
await browser.close();
console.log(process.exitCode ? 'UI smoke FAILED' : 'UI smoke ok');
