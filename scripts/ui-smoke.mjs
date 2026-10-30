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

const box = await page.locator('#chart svg').boundingBox();
await page.mouse.click(box.x + box.width * 0.4, box.y + box.height / 2);
const after = await page.locator('#when').textContent();
if (before === after) fail('hour selection did not change');
console.log('selected:', before, '→', after);
if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) fail('horizontal overflow on spot');
await page.locator('#chart').screenshot({ path: `${out}/f1-chart-390.png` });

await page.goto(base + '/mera/?id=yok', { waitUntil: 'networkidle' });
const nf = await page.locator('h1').textContent();
if (!/bulunamadı/.test(nf)) fail('404 spot message missing');

const real = errors.filter((e) => !/404/.test(e));
if (real.length) fail('console errors: ' + real.join(' | '));
await browser.close();
console.log(process.exitCode ? 'UI smoke FAILED' : 'UI smoke ok');
