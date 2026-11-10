// Faz V0: WCAG contrast of every text token on every surface, both themes (tokens-v.css). Prints a Markdown table.
// AA: normal text ≥ 4.5, large text / UI graphics ≥ 3. Usage: node docs/design/contrast.mjs [--check]
import { readFileSync } from 'node:fs';
import { scaleReport } from './colorcheck.mjs';
const css = readFileSync(new URL('../../apps/web/src/styles/tokens-v.css', import.meta.url), 'utf8');
const block = (sel) => {
  const i = css.indexOf(sel);
  const body = css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
};
const themes = { dark: block("[data-theme='dark']"), light: block("[data-theme='light']") };
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// pairs: [text token, surface tokens, required ratio]
const PAIRS = [
  ['fg-1', ['ink-0', 'ink-1', 'ink-2', 'ink-3'], 4.5],
  ['fg-2', ['ink-0', 'ink-1', 'ink-2', 'ink-3'], 4.5],
  ['fg-3', ['ink-0', 'ink-1', 'ink-2'], 4.5],
  ['act', ['ink-0', 'ink-1', 'ink-2'], 4.5],
  ['act-ink', ['act'], 4.5],
  ['warn', ['ink-1', 'ink-2', 'warn-bg'], 4.5],
  ['danger', ['ink-1', 'ink-2', 'danger-bg'], 4.5],
  ['fit-t0', ['fit-0'], 4.5], ['fit-t1', ['fit-1'], 4.5], ['fit-t2', ['fit-2'], 4.5], ['fit-t3', ['fit-3'], 4.5], ['fit-t4', ['fit-4'], 4.5],
  // charts sit on ink-1 panels: the lowest step stays quiet but visible (≥ 1.5), the top step stands out (≥ 3)
  ['fit-0', ['ink-1'], 1.5], ['fit-4', ['ink-1'], 3],
  ['wind-1', ['ink-0', 'ink-1'], 3],
  ['land-label', ['land'], 3],
  ['fg-1', ['sea-3', 'sea-4', 'sea-5'], 4.5],
  ['sel', ['sea-1', 'sea-3', 'sea-5', 'land'], 3],
];
let fail = 0;
const rows = ['| Tema | Metin | Yüzey | Oran | Gerekli | Sonuç |', '|---|---|---|---|---|---|'];
for (const [t, tok] of Object.entries(themes))
  for (const [fg, bgs, need] of PAIRS)
    for (const bg of bgs) {
      if (!tok[fg] || !tok[bg]) continue;
      const r = ratio(tok[fg], tok[bg]);
      const ok = r >= need;
      if (!ok) fail++;
      rows.push(`| ${t} | ${fg} ${tok[fg]} | ${bg} ${tok[bg]} | ${r.toFixed(2)} | ${need} | ${ok ? 'AA' : '**düşük**'} |`);
    }
// suitability scale: adjacent steps must stay apart for normal and colour-deficient vision (V0b C5)
const NEED = { normal: 12, protan: 8, deutan: 8, tritan: 8 };
rows.push('', '## Uygunluk ölçeği: komşu basamak farkı (ΔE00)', '', '| Tema | Görüş | 0→1 | 1→2 | 2→3 | 3→4 | Eşik | Sonuç |', '|---|---|---|---|---|---|---|---|');
for (const [t, tok] of Object.entries(themes)) {
  const r = scaleReport([0, 1, 2, 3, 4].map((k) => tok[`fit-${k}`]));
  for (const [v, a] of Object.entries(r.adj)) {
    const ok = Math.min(...a) >= NEED[v];
    if (!ok) fail++;
    rows.push(`| ${t} | ${v} | ${a.map((x) => x.toFixed(1)).join(' | ')} | ${NEED[v]} | ${ok ? 'ayrık' : '**yakın**'} |`);
  }
  if (!r.monotone) fail++;
  rows.push(`| ${t} | açıklık L* | ${r.L.map((x) => x.toFixed(0)).join(' → ')} | | ${r.monotone ? 'tekdüze' : '**tekdüze değil**'} | |`);
}
console.log(rows.join('\n'));
console.log(`\n${fail ? `${fail} çift eşiğin altında` : 'tüm çiftler AA'}`);
if (process.argv.includes('--check') && fail) process.exit(1);
