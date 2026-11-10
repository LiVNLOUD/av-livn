// node --test scripts/assets-check.test.mjs — the intake on generated PNGs in a temporary repo copy of the manifest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { run, report } from './assets-check.mjs';

async function repo() {
  const root = mkdtempSync(join(tmpdir(), 'assets-'));
  mkdirSync(join(root, 'apps/web/src/data'), { recursive: true });
  cpSync('apps/web/src/data/assets.json', join(root, 'apps/web/src/data/assets.json'));
  mkdirSync(join(root, 'assets-inbox'));
  writeFileSync(join(root, 'assets-inbox/README.md'), 'x');
  return root;
}
// a fish-ish blob: opaque ellipse on a transparent canvas
const cutout = (w, h) => sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: Buffer.from(`<svg width="${w}" height="${h}"><ellipse cx="${w / 2}" cy="${h / 2}" rx="${w * 0.4}" ry="${h * 0.3}" fill="#2c8f98"/></svg>`) }]).png().toBuffer();
const opaque = (w, h, c = '#08111a') => sharp({ create: { width: w, height: h, channels: 3, background: c } }).png().toBuffer();

test('a transparent species PNG is converted to a 960×480 WebP and leaves the inbox', async () => {
  const root = await repo();
  writeFileSync(join(root, 'assets-inbox/istavrit.png'), await cutout(1536, 768));
  const r = await run({ root, inbox: join(root, 'assets-inbox') });
  assert.equal(r.rows[0].ok, true, r.rows[0].why.join());
  const m = await sharp(join(root, 'apps/web/public/img/species/istavrit.webp')).metadata();
  assert.deepEqual([m.format, m.width, m.height, m.hasAlpha], ['webp', 960, 480, true]);
  assert.equal(existsSync(join(root, 'assets-inbox/istavrit.png')), false);
  assert.equal(existsSync(join(root, 'assets-inbox/README.md')), true);
  assert.equal(r.ready, 1);
});

test('an opaque species PNG is rejected with the reason and stays in the inbox', async () => {
  const root = await repo();
  writeFileSync(join(root, 'assets-inbox/levrek.png'), await opaque(1536, 768));
  const r = await run({ root, inbox: join(root, 'assets-inbox') });
  assert.equal(r.rows[0].ok, false);
  assert.match(r.rows[0].why.join(), /alfa|şeffaf/);
  assert.equal(existsSync(join(root, 'assets-inbox/levrek.png')), true);
  assert.equal(existsSync(join(root, 'apps/web/public/img/species/levrek.webp')), false);
});

test('a 3:2 cut-out is trimmed and fitted into a 2:1 box; a tiny cut-out and a badly shaped opaque OG fail; unknown names are listed', async () => {
  const root = await repo();
  writeFileSync(join(root, 'assets-inbox/kolyoz.png'), await cutout(1536, 1024));
  writeFileSync(join(root, 'assets-inbox/jighead.png'), await cutout(200, 200));
  writeFileSync(join(root, 'assets-inbox/og.png'), await opaque(1200, 1200));
  writeFileSync(join(root, 'assets-inbox/balik.png'), await cutout(800, 800));
  const r = await run({ root, inbox: join(root, 'assets-inbox') });
  const row = (n) => r.rows.find((x) => x.name === n);
  assert.equal(row('kolyoz').ok, true, row('kolyoz').why.join());
  const m = await sharp(join(root, 'apps/web/public/img/species/kolyoz.webp')).metadata();
  assert.deepEqual([m.width, m.height], [960, 480]);
  assert.match(row('jighead').why.join(' '), /çok küçük/);
  assert.match(row('og').why.join(' '), /kırpma %\d+/);
  assert.deepEqual(r.unmatched, ['balik.png']);
  assert.match(report(r), /Eşleşmeyen dosya adları .*balik\.png/);
});

test('app-1024 gives 192/512/180 and a maskable icon with the artwork inside the 80 % safe zone', async () => {
  const root = await repo();
  const icon = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#08111a' } })
    .composite([{ input: Buffer.from('<svg width="1024" height="1024"><rect x="60" y="60" width="904" height="904" fill="none" stroke="#e8eff3" stroke-width="40"/></svg>') }]).png().toBuffer();
  writeFileSync(join(root, 'assets-inbox/app-1024.png'), icon);
  const r = await run({ root, inbox: join(root, 'assets-inbox') });
  assert.equal(r.rows[0].ok, true, r.rows[0].why.join());
  for (const [f, s] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180], ['icon-maskable-512.png', 512]]) {
    const m = await sharp(join(root, 'apps/web/public/icons', f)).metadata();
    assert.deepEqual([m.width, m.height], [s, s], f);
  }
  // the artwork (a light frame 60 px inside the 1024 icon) must land inside the 80 % safe zone, the edge is background
  const { data, info } = await sharp(join(root, 'apps/web/public/icons/icon-maskable-512.png')).raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => data[(y * info.width + x) * info.channels];
  const frame = Math.round(512 * 0.1 + (60 / 1024) * 512 * 0.8); // safe-zone offset + scaled inset ≈ 75
  assert.ok(at(5, 256) < 40, 'edge is background');
  assert.ok(at(frame, 256) > 150, `frame at x≈${frame}`);
  assert.ok(at(frame - 12, 256) < 40, 'nothing outside the frame');
});

test('an empty inbox reports 0/17 and nothing to do', async () => {
  const root = await repo();
  const r = await run({ root, inbox: join(root, 'assets-inbox') });
  assert.equal(r.total, 17);
  assert.match(report(r), /Hazır: 0\/17[\s\S]*işlenecek PNG yok/);
});
