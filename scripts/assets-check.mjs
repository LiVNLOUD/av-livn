#!/usr/bin/env node
// Bitmap asset intake (docs/design/assets-needed.md). The user drops ChatGPT output as <name>.png into assets-inbox/;
// this script checks each file automatically and converts the ones that pass:
//   - format PNG; cut-outs (alpha) are trimmed to their content and fitted into the target box with transparent padding
//     (content must be at least 60 % of the target's long side); opaque images must be at least the target size and may
//     lose at most 25 % of their area to a centred crop (reported, then checked by eye);
//   - alpha: species/tackle/bait need a transparent background (alpha channel and transparent corners); OG and the app
//     icon must be opaque;
//   - resize to the stored (@2x) size ('contain', transparent padding) and write WebP (or PNG for OG / app icon);
//   - file size ≤ maxKB (WebP quality stepped down 82 → 60 before giving up);
//   - app-1024.png also gives icon-192/512, apple-touch-icon (180) and a maskable 512 (artwork scaled into the central
//     80 % safe zone, background filled with the icon's corner colour).
// Files that pass are written and removed from the inbox; failures stay in the inbox and are reported with the reason.
// The visual checklist (anatomy, proportions) is a separate, human step — this only does what a machine can check.
//
//   node scripts/assets-check.mjs [--dry] [--skip a,b] [--root <repo>] [--inbox <dir>] [--report <md>]
// --skip: names rejected in the visual check; they stay in the inbox untouched (reason goes to the audit log).
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };

export async function checkOne(file, a) {
  const img = sharp(file);
  const m = await img.metadata();
  const why = [];
  if (m.format !== 'png') why.push(`biçim ${m.format}, PNG bekleniyor`);
  const { data, info } = await img.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let content = null, crop = 0;
  if (a.alpha) {
    const t = await img.clone().trim({ threshold: 8 }).toBuffer({ resolveWithObject: true }).catch(() => null);
    content = t ? [t.info.width, t.info.height] : [m.width, m.height];
    const fit = Math.min(a.width / content[0], a.height / content[1]); // contain scale
    if (Math.max(content[0] * fit, content[1] * fit) < 0.6 * Math.max(a.width, a.height) || content[0] < 0.6 * a.width && content[1] < 0.6 * a.height)
      why.push(`içerik ${content[0]}×${content[1]}, hedef ${a.width}×${a.height} için çok küçük`);
  } else {
    if (m.width < a.width || m.height < a.height) why.push(`ölçü ${m.width}×${m.height}, en az ${a.width}×${a.height} gerekli`);
    const ar = m.width / m.height, want = a.width / a.height;
    crop = 1 - Math.min(ar / want, want / ar);
    if (crop > 0.25) why.push(`en/boy ${ar.toFixed(2)}, hedef ${want.toFixed(2)}: ortadan kırpma %${Math.round(crop * 100)} alan kaybettirir (en çok %25)`);
  }
  const px = (x, y) => data[(y * info.width + x) * 4 + 3];
  const corners = [px(0, 0), px(info.width - 1, 0), px(0, info.height - 1), px(info.width - 1, info.height - 1)];
  if (a.alpha) {
    if (!m.hasAlpha) why.push('alfa kanalı yok (şeffaf arka plan gerekli)');
    else if (corners.some((v) => v > 16)) why.push('köşeler şeffaf değil (arka plan şeffaf olmalı)');
  } else if (m.hasAlpha && corners.some((v) => v < 250)) why.push('şeffaf alan var (bu görsel opak olmalı)');
  return { meta: m, why, content, crop };
}

async function encode(file, a) {
  // cut-outs: trim transparent margins, fit inside the box with a 4 % margin, pad transparent; opaque: centred cover crop
  const pad = Math.round(Math.min(a.width, a.height) * 0.04);
  const base = a.alpha
    ? sharp(await sharp(file).trim({ threshold: 8 }).toBuffer()).resize(a.width - 2 * pad, a.height - 2 * pad, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    : sharp(file).resize(a.width, a.height, { fit: 'cover', position: 'centre' });
  if (a.format === 'png') {
    const flat = base.flatten({ background: '#08111a' });
    const full = await flat.clone().png({ compressionLevel: 9 }).toBuffer();
    if (full.length <= a.maxKB * 1024) return { buf: full, q: null };
    for (const q of [95, 90, 80, 70]) { // palette PNG (lossy colour quantisation) before giving up
      const buf = await flat.clone().png({ compressionLevel: 9, palette: true, quality: q, dither: 1 }).toBuffer();
      if (buf.length <= a.maxKB * 1024) return { buf, q };
    }
    return { buf: null, q: 70 };
  }
  for (const q of [82, 76, 70, 64, 60]) {
    const buf = await base.clone().webp({ quality: q, alphaQuality: 90, effort: 6 }).toBuffer();
    if (buf.length <= a.maxKB * 1024) return { buf, q };
  }
  return { buf: null, q: 60 };
}

async function derive(file, d) {
  const src = sharp(file);
  const { data } = await src.clone().raw().toBuffer({ resolveWithObject: true });
  const bg = { r: data[0], g: data[1], b: data[2], alpha: 1 }; // top-left pixel = icon background
  if (!d.maskable) return src.clone().resize(d.size, d.size).png({ compressionLevel: 9 }).toBuffer();
  const inner = Math.round(d.size * 0.8);
  const art = await src.clone().resize(inner, inner).png().toBuffer();
  return sharp({ create: { width: d.size, height: d.size, channels: 4, background: bg } })
    .composite([{ input: art, gravity: 'centre' }]).png({ compressionLevel: 9 }).toBuffer();
}

export async function run({ root, inbox, dry = false, skip = [] }) {
  const man = JSON.parse(readFileSync(join(root, 'apps/web/src/data/assets.json'), 'utf8'));
  const byName = new Map(man.assets.map((a) => [a.name, a]));
  const files = existsSync(inbox) ? readdirSync(inbox).filter((f) => !/^readme/i.test(f) && !f.startsWith('.')) : [];
  const rows = [], unmatched = [];
  for (const f of files) {
    const name = f.replace(/\.[^.]+$/, '');
    const a = byName.get(name);
    if (!a) { unmatched.push(f); continue; }
    if (skip.includes(name)) { rows.push({ file: f, name, target: a.target, in: '—', ok: false, why: ['gözle denetimde reddedildi (denetim kaydı)'], kb: null, q: null, derived: [], skipped: true }); continue; }
    const path = join(inbox, f);
    const { meta, why, content, crop } = await checkOne(path, a);
    let out = null;
    if (!why.length) {
      const { buf, q } = await encode(path, a);
      if (!buf) why.push(`dosya boyutu sınırı ${a.maxKB} KB aşılıyor (en düşük kalitede bile)`);
      else out = { buf, q };
    }
    const note = content ? `içerik ${content[0]}×${content[1]}` : crop > 0.005 ? `kırpma %${Math.round(crop * 100)}` : '';
    const row = { file: f, name, target: a.target, in: `${meta.width}×${meta.height}${note ? ' (' + note + ')' : ''}`, ok: !why.length, why, kb: out ? Math.round(out.buf.length / 1024) : null, q: out?.q ?? null, derived: [] };
    if (out && !dry) {
      mkdirSync(dirname(join(root, a.target)), { recursive: true });
      writeFileSync(join(root, a.target), out.buf);
      for (const d of a.derive ?? []) {
        mkdirSync(dirname(join(root, d.target)), { recursive: true });
        writeFileSync(join(root, d.target), await derive(join(root, a.target), d));
        row.derived.push(d.target);
      }
      rmSync(path);
    }
    rows.push(row);
  }
  const ready = man.assets.filter((a) => existsSync(join(root, a.target))).length;
  return { rows, unmatched, ready, total: man.assets.length, expected: man.assets.map((a) => `${a.name}.png`) };
}

export function report(r) {
  const out = [`Hazır: ${r.ready}/${r.total}`, ''];
  if (r.rows.length) {
    out.push('| Dosya | Giriş | Hedef | Otomatik kontrol | Boyut |', '|---|---|---|---|---|');
    for (const x of r.rows) out.push(`| ${x.file} | ${x.in} | ${x.target} | ${x.ok ? 'geçti' : 'KALDI: ' + x.why.join('; ')} | ${x.kb != null ? x.kb + ' KB' + (x.q ? ` (${x.target.endsWith('.png') ? 'palet ' : ''}q${x.q})` : '') : '—'} |`);
  } else out.push('Gelen kutusunda işlenecek PNG yok.');
  if (r.unmatched.length) out.push('', `Eşleşmeyen dosya adları (dokunulmadı): ${r.unmatched.join(', ')}`, `Beklenen adlar: ${r.expected.join(', ')}`);
  return out.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = resolve(arg('--root', '.'));
  const r = await run({ root, inbox: resolve(root, arg('--inbox', 'assets-inbox')), dry: process.argv.includes('--dry'), skip: (arg('--skip', '') || '').split(',').filter(Boolean) });
  const text = report(r);
  console.log(text);
  const rep = arg('--report', null);
  if (rep) writeFileSync(rep, `# Görsel denetimi — otomatik adım (${new Date().toISOString().slice(0, 16)}Z)\n\n${text}\n`);
  if (r.rows.some((x) => !x.ok && !x.skipped)) process.exitCode = 2;
}
