// V2.4: rig and motion scene (replaces the old water-column sketch, scripts/rig.ts). Pure SVG strings.
// "Nasıl bağlanır?": the real connection layout of each method, part by part (tap a part: Turkish name and size).
// "Nasıl kullanılır?": a short teaching loop (fall, lift, pause, retrieve), labelled "eğitim animasyonu"; with reduced
// motion the numbered steps stay still. The drawing is a teaching sketch: colours on screen are not how a lure looks
// under water, and sink times are estimates, never measured depth.
import type { Bait, MethodId } from '@av-livn/scoring';

export interface RigOptions {
  jigG?: number;
  lureCm?: number;
  /** Lure colour word from the tackle engine (parlak, şeffaf-simli, koyu siluet, doğal). */
  color?: string;
  bait?: Bait | null;
  sinkerG?: number;
  hookNo?: number;
}
export interface RigPart { id: string; name: string; size: string }
export interface RigScene { svg: string; parts: RigPart[]; steps: string[]; colorNote: string | null }

const BAIT_TR: Record<Bait, string> = { hamsi: 'hamsi parçası', karides: 'karides', midye: 'midye' };
const g1 = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Lure fill for the drawing (screen colour, not the underwater look). */
export function lureFill(color: string | undefined): string {
  if (!color) return '#c9d6dc';
  if (/şeffaf|simli/.test(color)) return 'rgba(220,235,240,.55)';
  if (/koyu/.test(color)) return '#2b2f3a';
  if (/parlak/.test(color)) return '#f2d64b';
  return '#9fb7a2';
}
export function colorNote(color: string | undefined): string | null {
  if (!color) return null;
  const why = /şeffaf|simli/.test(color) ? 'ışık suya düşüyorsa ışığı kırar, avlanan yem balığına benzer'
    : /koyu/.test(color) ? 'karanlıkta yukarıdan gelen zayıf ışıkta siluet verir'
    : /parlak/.test(color) ? 'bulanık suda fark edilir'
    : 'berrak suda doğal görünür';
  return `Renk: ${color} — ${why}. Ekrandaki renk su altındaki görünüm değildir.`;
}

/** Recommended sinker for natural-bait methods: a field rule (C), from depth and current. */
export function sinkerFor(depthM: number, currentMs: number | null): number {
  const need = 5 + 3 * depthM * (1 + 2 * (currentMs ?? 0));
  return [5, 10, 15, 20, 30, 40].find((s) => s >= need) ?? 40;
}

type Draw = (o: Required<Pick<RigOptions, 'jigG' | 'lureCm' | 'hookNo' | 'sinkerG'>> & RigOptions) => { body: string; parts: RigPart[] };

// helpers (viewBox 0 0 200 300; line enters from the top centre)
const line = (x1: number, y1: number, x2: number, y2: number, cls = 'rs-line') => `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
const part = (id: string, name: string, size: string, svg: string, ly?: number) => `<g class="rs-part" data-part="${id}" tabindex="0" role="button" aria-label="${esc(name)}${size ? ' · ' + esc(size) : ''}"><title>${esc(name)}${size ? ' · ' + esc(size) : ''}</title>${svg}${ly === undefined ? '' : `<line class="rs-lead-l" x1="112" y1="${ly}" x2="134" y2="${ly}"/><text class="rs-lbl" x="137" y="${ly + 3}">${esc(name.replace(/ \(.*\)$/, ''))}</text>`}</g>`;
const knot = (y: number, name = 'düğüm', size = 'FG / çift uni') => ({ svg: part('dugum', name, size, `<rect class="rs-knot" x="94" y="${y - 4}" width="12" height="8" rx="3"/>`, y), p: { id: 'dugum', name, size } });
const swivel = (y: number) => ({ svg: part('firdondu', 'fırdöndü', 'no 10–12', `<ellipse class="rs-metal" cx="100" cy="${y}" rx="4.5" ry="8"/>`, y), p: { id: 'firdondu', name: 'fırdöndü', size: 'no 10–12' } });
const hook = (x: number, y: number, flip = false) => `<path class="rs-hook" d="M${x} ${y}v13a6 6 0 0 0 ${flip ? -12 : 12} 0v-4"/>`;
const sinker = (y: number, g: number) => ({ svg: part('kursun', 'kurşun', `${g1(g)} g`, `<path class="rs-lead" d="M100 ${y}c-9 8-13 18-7 25a9 9 0 0 0 14 0c6-7 2-17-7-25z"/>`, y + 14), p: { id: 'kursun', name: 'kurşun', size: `${g1(g)} g` } });
const baitOn = (x: number, y: number, b: Bait | null | undefined) => (b ? `<ellipse class="rs-bait" cx="${x + 6}" cy="${y + 15}" rx="9" ry="5"/>` : '');

const mainAndLeader = (knotY: number) => {
  const k = knot(knotY);
  return {
    svg: part('anaip', 'ana ip', 'PE 0.2–0.6', line(100, 0, 100, knotY - 4, 'rs-line rs-pe'), 20) + k.svg + part('lider', 'lider', 'florokarbon 3–8 lb', line(100, knotY + 4, 100, knotY + 60, 'rs-line rs-fc'), knotY + 30),
    parts: [{ id: 'anaip', name: 'ana ip', size: 'PE 0.2–0.6' }, k.p, { id: 'lider', name: 'lider', size: 'florokarbon 3–8 lb' }],
  };
};

const DRAW: Record<MethodId, Draw> = {
  lrf: (o) => {
    const m = mainAndLeader(90);
    const r = 4 + Math.sqrt(o.jigG) * 2.2;
    const len = 20 + o.lureCm * 7;
    const y = 158;
    // the hook runs inside the soft lure and exits on its back: point visible, shank hidden (dashed)
    const jig = part('jighead', 'jighead', `${g1(o.jigG)} g · #${o.hookNo}`, `<line class="rs-line rs-fc" x1="100" y1="150" x2="100" y2="${y - r}"/><circle class="rs-lead" cx="100" cy="${y}" r="${r}"/>`, y - 18);
    const lure = part('silikon', 'silikon', `${g1(o.lureCm)} cm`, `<path class="rs-lure" style="fill:${lureFill(o.color)}" d="M${100 - r + 1} ${y - 4}c${-len * 0.6} -4 ${-len} 0 ${-len} 4s${len * 0.4} 8 ${len} 4z"/><path class="rs-tail" d="M${100 - r - len + 2} ${y}l-10 -7v14z" style="fill:${lureFill(o.color)}"/>`, y + 22);
    const hk = part('igne', 'iğne (silikonun içinde)', `#${o.hookNo}`, `<path class="rs-hook rs-hidden" d="M${100 - r} ${y}h${-len * 0.45}"/><path class="rs-hook" d="M${100 - r - len * 0.45} ${y}q-4 -8 -2 -12"/>`, y + 40);
    return { body: m.svg + jig + lure + hk, parts: [...m.parts, { id: 'jighead', name: 'jighead', size: `${g1(o.jigG)} g · #${o.hookNo}` }, { id: 'silikon', name: 'silikon', size: `${g1(o.lureCm)} cm` }, { id: 'igne', name: 'iğne (silikonun içinde)', size: `#${o.hookNo}` }] };
  },
  mikro_jig: (o) => {
    const m = mainAndLeader(90);
    const s = swivel(156);
    const jig = part('mikrojig', 'mikro jig', `${g1(o.jigG)} g`, `<path class="rs-metal" d="M94 166l12 0 4 50-10 10-10-10z"/>`, 196);
    const as = part('asist', 'asist iğne', `#${o.hookNo}`, hook(106, 166), 176);
    return { body: m.svg + s.svg + jig + as, parts: [...m.parts, s.p, { id: 'mikrojig', name: 'mikro jig', size: `${g1(o.jigG)} g` }, { id: 'asist', name: 'asist iğne', size: `#${o.hookNo}` }] };
  },
  dropshot_yem: (o) => {
    const m = mainAndLeader(70);
    // hook tied straight on the leader (palomar), point up; the leader runs on to the sinker 30–40 cm below
    const hk = part('igne', 'iğne (palomar ile ipe)', `#${o.hookNo}`, `<path class="rs-hook" d="M100 170h10v10a5 5 0 0 1-10 0"/>` + baitOn(102, 166, o.bait), 172);
    const tail = line(100, 130, 100, 250, 'rs-line rs-fc');
    const sk = sinker(250, o.sinkerG);
    const baitP = o.bait ? [{ id: 'yem', name: 'yem', size: BAIT_TR[o.bait] }] : [];
    return { body: m.svg + tail + hk + sk.svg + `<text class="rs-dim" x="112" y="215">30–40 cm</text>`, parts: [...m.parts, { id: 'igne', name: 'iğne (palomar ile ipe)', size: `#${o.hookNo}` }, ...baitP, sk.p] };
  },
  dip: (o) => {
    const m = mainAndLeader(60);
    const s = swivel(130);
    const kost = (y: number) => line(100, y, 124, y + 10) + hook(124, y + 10, true) + baitOn(110, y + 12, o.bait);
    const kp = part('kostek', 'köstek + iğne (2 adet)', `#${o.hookNo}`, kost(165) + kost(205), 160);
    const sk = sinker(250, o.sinkerG);
    const baitP = o.bait ? [{ id: 'yem', name: 'yem', size: BAIT_TR[o.bait] }] : [];
    return { body: m.svg + s.svg + line(100, 136, 100, 250) + kp + sk.svg, parts: [...m.parts, s.p, { id: 'kostek', name: 'köstek + iğne (2 adet)', size: `#${o.hookNo}` }, ...baitP, sk.p] };
  },
  samandira: (o) => {
    const stop = part('stoper', 'stoper + boncuk', 'derinlik ayarı', `<rect class="rs-knot" x="94" y="36" width="12" height="6" rx="2"/><circle class="rs-metal" cx="100" cy="48" r="4"/>`, 40);
    const fl = part('samandira', 'kayar şamandıra', '2–4 g', `<path class="rs-float" d="M100 60c-8 6-9 22 0 32 9-10 8-26 0-32z"/><line class="rs-line" x1="100" y1="52" x2="100" y2="60"/>`, 76);
    const sh = part('saçma', 'saçma kurşun', '0,5–2 g', `<circle class="rs-lead" cx="100" cy="150" r="4.5"/><circle class="rs-lead" cx="100" cy="162" r="4.5"/>`, 156);
    const s = swivel(190);
    const hk = part('igne', 'iğne', `#${o.hookNo}`, hook(100, 215) + baitOn(98, 217, o.bait), 228);
    const baitP = o.bait ? [{ id: 'yem', name: 'yem', size: BAIT_TR[o.bait] }] : [];
    return { body: part('anaip', 'ana ip', 'monofilament 0,20–0,25', line(100, 0, 100, 215)) + stop + fl + sh + s.svg + hk,
      parts: [{ id: 'anaip', name: 'ana ip', size: 'monofilament 0,20–0,25' }, { id: 'stoper', name: 'stoper + boncuk', size: 'derinlik ayarı' }, { id: 'samandira', name: 'kayar şamandıra', size: '2–4 g' }, { id: 'saçma', name: 'saçma kurşun', size: '0,5–2 g' }, s.p, { id: 'igne', name: 'iğne', size: `#${o.hookNo}` }, ...baitP] };
  },
  capari_tuylu: (o) => capari(o, false),
  capari_yemli: (o) => capari(o, true),
};

function capari(o: Parameters<Draw>[0], yemli: boolean): ReturnType<Draw> {
  const s = swivel(40);
  const drops = [80, 110, 140, 170, 200, 230].map((y) => line(100, y, 82, y + 6) + hook(82, y + 6, true) + (yemli ? baitOn(66, y + 8, o.bait) : `<path class="rs-feather" d="M82 ${y + 8}l-7 12M82 ${y + 8}l-1 13M82 ${y + 8}l5 11"/>`)).join('');
  const body = part('capari', yemli ? 'çapari (yemli, 6 iğne)' : 'çapari (tüylü, 6 iğne)', `#${o.hookNo}`, line(100, 46, 100, 252) + drops, 120);
  const sk = sinker(252, o.sinkerG);
  const baitP = yemli && o.bait ? [{ id: 'yem', name: 'yem', size: BAIT_TR[o.bait] }] : [];
  return { body: part('anaip', 'ana ip', 'monofilament 0,25–0,30', line(100, 0, 100, 34)) + s.svg + body + sk.svg,
    parts: [{ id: 'anaip', name: 'ana ip', size: 'monofilament 0,25–0,30' }, s.p, { id: 'capari', name: yemli ? 'çapari (yemli, 6 iğne)' : 'çapari (tüylü, 6 iğne)', size: `#${o.hookNo}` }, ...baitP, sk.p] };
}

/** Teaching loop per method: [label, x, y] positions in the water column view. */
const STEPS: Record<MethodId, [string, number, number][]> = {
  lrf: [['düşüş: serbest bırak, say', 60, 170], ['kaldırma: kamışı 2–3 kez hafif kaldır', 90, 120], ['bekleme: gergin ipte 1–2 sn', 120, 140], ['sarma: yavaş sar, tekrar düşür', 160, 130]],
  mikro_jig: [['düşüş: dibe kadar', 70, 250], ['kaldırma: sert çekiş', 90, 170], ['bekleme: jig sallanarak düşer', 110, 215], ['sarma: 2–3 tur, tekrar', 140, 160]],
  dropshot_yem: [['indir: kurşun dibe değsin', 100, 250], ['gergin tut: yem dipten 30–40 cm', 100, 215], ['bekle: hafif titret', 125, 215], ['vuruşta: kısa tut, sar', 100, 170]],
  dip: [['at: uzağa, düz dibe', 170, 250], ['gergin tut', 145, 250], ['bekle: kamış ucunu izle', 120, 250], ['vuruşta: sar', 95, 215]],
  samandira: [['derinliği stoperle ayarla', 60, 60], ['at: şamandıra dik dursun', 150, 60], ['bekle: şamandırayı izle', 150, 110], ['batınca: tut, sar', 110, 90]],
  capari_tuylu: [['indir: sürünün katmanına', 100, 210], ['kaldırma: kısa ve yavaş', 100, 160], ['bekleme', 130, 175], ['vuruşlar birikince sar', 100, 110]],
  capari_yemli: [['indir: sürünün katmanına', 100, 210], ['kaldırma: kısa ve yavaş', 100, 160], ['bekleme: yem çalışsın', 130, 175], ['vuruşlar birikince sar', 100, 110]],
};

/**
 * The scene for one method. view 'bagla': the connection layout with tappable parts. view 'kullan': water column,
 * seabed, the four numbered steps and a dot that moves through them (CSS; still with reduced motion).
 */
export function rigScene(method: MethodId, view: 'bagla' | 'kullan', o: RigOptions = {}): RigScene {
  const opts = { jigG: o.jigG ?? 1.5, lureCm: o.lureCm ?? 4, hookNo: o.hookNo ?? 8, sinkerG: o.sinkerG ?? 10, ...o };
  const d = DRAW[method](opts);
  const steps = STEPS[method].map((s) => s[0]);
  const note = method === 'lrf' || method === 'mikro_jig' || method === 'capari_tuylu' ? colorNote(o.color) : null;
  if (view === 'bagla') {
    return { svg: `<svg class="rigscene rs-bagla" viewBox="0 0 230 300" role="img" aria-label="Nasıl bağlanır: ${esc(d.parts.map((p) => p.name).join(', '))}">${d.body}</svg>`, parts: d.parts, steps, colorNote: note };
  }
  const pts = STEPS[method];
  const kf = pts.map(([, x, y], i) => `${Math.round((i / pts.length) * 100)}%{transform:translate(${x}px,${y}px)}`).join('') + `100%{transform:translate(${pts[0]![1]}px,${pts[0]![2]}px)}`;
  const route = `<polyline class="rs-route" points="${pts.map(([, x, y]) => `${x},${y}`).join(' ')}"/>`;
  const marks = route + pts.map(([, x, y], i) => `<g class="rs-step"><circle cx="${x}" cy="${y}" r="7"/><text x="${x}" y="${y + 3}">${i + 1}</text></g>`).join('');
  const svg = `<svg class="rigscene rs-kullan" viewBox="0 0 230 300" role="img" aria-label="Nasıl kullanılır (eğitim animasyonu): ${esc(steps.join('; '))}">`
    + `<style>@keyframes rs-${method}{${kf}}.rs-kullan .rs-dot-${method}{animation:rs-${method} 6s steps(1,end) infinite}@media (prefers-reduced-motion:reduce){.rs-kullan .rs-dot-${method}{animation:none;opacity:0}}</style>`
    + `<rect class="rs-water" x="0" y="40" width="230" height="225"/><path class="rs-bed" d="M0 265h230v35H0z"/><line class="rs-surface" x1="0" y1="40" x2="230" y2="40"/>`
    + marks + `<circle class="rs-dot rs-dot-${method}" r="5" cx="0" cy="0" style="transform:translate(${pts[0]![1]}px,${pts[0]![2]}px)"/>`
    + `<text class="rs-tag" x="6" y="292">eğitim animasyonu · su altı görünümü değil</text></svg>`;
  return { svg, parts: d.parts, steps, colorNote: note };
}
