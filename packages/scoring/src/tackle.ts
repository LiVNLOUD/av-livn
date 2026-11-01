// F0/G2: tackle and lure suggestion for istavrit (docs/TACKLE.md). Pure: the score job stores the open-data inputs
// per hour; the card turns them into rows with this function. Rules are C-level heuristics, except the hook
// size (R19, Peksu et al. 2020, A, local) and the legal minimum size (6/2 Tebliğ Çizelge 7, A).
// G2: the target depth follows the model's diel arm (night: mid-water/near the surface under the light, twilight:
// mid-water, day: near the bottom); fixed (non-articulated) ajing heads by default; LRF up to 5 g, then spin.
// md. 8/8: never suggests bringing light; "light" here is only the pier's existing lighting.

export type Evidence = 'A' | 'B' | 'C';

export interface TackleProfile {
  id: 'lrf' | 'spin';
  name: string;
  /** Casting weight range the rod/reel handles (g). */
  jigMin: number;
  jigMax: number;
  /** Above this gust (km/h) the profile is no longer controllable. */
  maxGustKmh: number;
  line: string;
}

export const DEFAULT_PROFILES: TackleProfile[] = [
  { id: 'lrf', name: 'LRF: Ares Blue Porter AJ-S 6.3 + Vanford FA C2000S', jigMin: 0.6, jigMax: 5, maxGustKmh: 25, line: 'Gosen PE 0.2 + FC 0.8–1.2 numara (≈3–5 lb)' },
  { id: 'spin', name: 'Spin: Bassterra XT+ 274 + Nasci FD C3000 HG', jigMin: 6, jigMax: 32, maxGustKmh: 50, line: 'Kairiki 8 + Daiwa Prorex FC' },
];

/** RESEARCH.md R19, cited verbatim on the hook row (a test checks it against RESEARCH.md). */
export const R19_CITE = 'Peksu M., Uzer U., Yıldız T., Ayaz A., Karakulak F.S. (2020). J. Appl. Ichthyol. 36(6):893–900';
/** Ajing jighead sizes on the market (g). */
export const JIG_SIZES = [0.6, 0.8, 1, 1.2, 1.5, 2, 2.5, 3, 4, 5];

/** Per-hour inputs (all public data). */
export interface TackleInput {
  depthM: number;
  currentMs: number | null;
  windKmh: number | null;
  gustKmh: number | null;
  /** Wind component along the shore (km/h): pushes the line sideways. */
  crossKmh: number | null;
  sunAlt: number;
  /** Probability that the pier's existing lighting is on/there (null = not public). */
  lampP: number | null;
  /** Turbidity term of the model, 0..1 (1 = clear). */
  turbidity: number | null;
  /** Water temperature deviation from the short normal (°C). */
  sstDev: number | null;
  /** Spot kind (rocky shore: bottom target). */
  kind?: string | null;
  /** H3 (levrek): wave height at the spot's sea cell (m). */
  waveM?: number | null;
}

export interface TackleRow {
  key: 'takim' | 'jighead' | 'igne' | 'silikon' | 'renk' | 'saydirma' | 'yasal' | 'agirlik' | 'yem' | 'teknik';
  label: string;
  value: string;
  why: string;
  evidence: Evidence;
}

export interface Tackle {
  profile: 'lrf' | 'spin';
  jigG: number;
  jigType: 'sabit' | 'mafsallı';
  hook: number;
  lureCm: number;
  color: 'şeffaf-simli' | 'koyu siluet' | 'doğal' | 'parlak';
  /** Where the lure should fish this hour (diel arm). */
  zone: 'yüzeye yakın' | 'orta su' | 'dibe yakın';
  targetM: number;
  sinkS: number;
  rows: TackleRow[];
  /** Information only, never a suggestion (md. 8/8). */
  notes: string[];
}

export const LEGAL_MIN_ISTAVRIT_CM = 13;
const n1 = (x: number) => x.toFixed(1).replace('.', ',').replace(',0', '');
const nearestSize = (g: number) => JIG_SIZES.reduce((best, s) => (Math.abs(s - g) < Math.abs(best - g) ? s : best), JIG_SIZES[0]!);

/** Hour category from the sun and the pier's lighting. */
export function lightCase(sunAlt: number, lampP: number | null): 'gündüz' | 'alacakaranlık' | 'aydınlık gece' | 'karanlık gece' {
  if (sunAlt > 0) return 'gündüz';
  if (sunAlt > -6) return 'alacakaranlık';
  return (lampP ?? 0) >= 0.5 ? 'aydınlık gece' : 'karanlık gece';
}

/**
 * Unit check for tackle texts (G2): line sizes are Japanese numbers or PE, pounds only as an approximation
 * after a number ("≈3–5 lb"), speeds in km/sa (km/s means per second in Turkish). Returns the problems found.
 */
export function unitIssues(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(\S*)\s*lb\b/g)) {
    const before = text.slice(0, m.index! + m[0].length);
    if (!/≈\s*[\d.,]+(?:[–-][\d.,]+)?\s*lb$/.test(before)) out.push(`lb yalnız "≈… lb" yaklaşık değeri olarak: "${m[0].trim()}"`);
  }
  if (/\bFC\s*[\d.,]/.test(text) && !/\bFC\s*[\d.,]+(?:[–-][\d.,]+)?\s*numara/.test(text)) out.push('FC kalınlığı numara ile yazılır');
  if (/\bkm\/s\b/.test(text)) out.push('hız km/sa ile yazılır');
  return out;
}

export function tackle(i: TackleInput, profiles: TackleProfile[] = DEFAULT_PROFILES, legalMinCm = LEGAL_MIN_ISTAVRIT_CM): Tackle {
  const lrf = profiles.find((p) => p.id === 'lrf') ?? DEFAULT_PROFILES[0]!;
  const spin = profiles.find((p) => p.id === 'spin') ?? DEFAULT_PROFILES[1]!;
  const cur = i.currentMs ?? 0;
  const gust = i.gustKmh ?? i.windKmh ?? 0;
  const cross = i.crossKmh ?? 0;
  const depth = Math.max(0.5, i.depthM);
  const light = lightCase(i.sunAlt, i.lampP);
  const night = light === 'aydınlık gece' || light === 'karanlık gece';

  // target depth from the diel arm: night fish rise to the light/plankton, day fish hold near the bottom
  const zone: Tackle['zone'] = night ? 'yüzeye yakın' : light === 'alacakaranlık' ? 'orta su' : 'dibe yakın';
  const targetM = Math.round((night ? Math.min(1.5, 0.3 * depth) : light === 'alacakaranlık' ? 0.5 * depth : depth) * 10) / 10;
  const bottom = zone === 'dibe yakın' || i.kind === 'rocky';

  // weight: night calm water 0.8–1.5 g; heavier with the target depth, the current, the cross wind (line belly)
  // and strong gusts. H1: the set is chosen by the weight alone — LRF up to its upper limit (5 g), spin only when
  // at least the spin rod's lower limit (6 g) is needed; between the two, LRF at its limit. Gusts only add a note.
  const need = (0.8 + 0.2 * targetM) * (1 + 2 * cur) + 0.12 * Math.max(0, cross - 10) + 0.04 * Math.max(0, gust - 20);
  const useSpin = need >= spin.jigMin;
  const profile = useSpin ? spin : lrf;
  const SPIN_ISTAVRIT_MAX = 10; // micro metal jig / heavy jighead for istavrit
  const jigG = useSpin ? Math.min(SPIN_ISTAVRIT_MAX, Math.max(spin.jigMin, Math.round(need))) : Math.min(lrf.jigMax, Math.max(lrf.jigMin, nearestSize(need)));
  const gustNote = gust > lrf.maxGustKmh ? `hamle ${Math.round(gust)} km/sa: atışta misinayı elle frenle, rüzgara yan at` : null;

  const calm = cur < 0.15 && cross < 10;
  const jigType = bottom && calm && !useSpin ? 'mafsallı' : 'sabit';
  const turbid = (i.turbidity ?? 1) < 0.8;
  const cold = (i.sstDev ?? 0) <= -1.5;
  const lureCm = cold ? 4 : turbid ? 6 : 5;
  const color = turbid ? 'parlak' : light === 'aydınlık gece' ? 'şeffaf-simli' : light === 'karanlık gece' ? 'koyu siluet' : 'doğal';
  const shape = turbid || light === 'karanlık gece' ? 'kürek kuyruk (titreşim)' : 'iğne kuyruk (doğal düşüş)';
  // sink rate (m/s) grows with weight; count to the target depth (night: short, 2–4 s)
  const rate = useSpin ? 0.9 : 0.25 + 0.12 * jigG;
  const raw = Math.round(targetM / rate);
  const sinkS = night ? Math.min(4, Math.max(2, raw)) : Math.max(2, raw);
  const arm = night ? `modelin gece kolu (${light})` : light === 'alacakaranlık' ? 'modelin alacakaranlık tepesi' : 'modelin gündüz kolu: derinlik';

  const rows: TackleRow[] = [
    {
      key: 'takim', label: 'Takım', value: profile.id === 'lrf' ? 'LRF' : 'Spin', evidence: 'C',
      why: useSpin
        ? `gereken ağırlık ${n1(need)} g ≥ spin alt sınırı ${n1(spin.jigMin)} g: ${jigG >= 8 ? 'mikro metal jig' : 'ağır jighead ya da mikro metal jig'} 6–10 g (derin uç ve akıntıda dikine)${need > SPIN_ISTAVRIT_MAX ? '; koşul istavrit için zor' : ''}`
        : `${need > lrf.jigMax ? `gereken ağırlık ${n1(need)} g, spin alt sınırı ${n1(spin.jigMin)} g'ın altında: LRF üst sınırında (${n1(lrf.jigMax)} g) kal, saydırmayı uzat` : `gereken ağırlık ${n1(need)} g ≤ LRF üst sınırı ${n1(lrf.jigMax)} g`} (${profile.line})${gustNote ? `; ${gustNote}` : ''}`,
    },
    {
      key: 'jighead', label: 'Jighead', value: `${n1(jigG)} g ${jigType}`, evidence: 'C',
      why: `hedef ${zone} (~${n1(targetM)} m, ${arm})${cur ? `, akıntı ${n1(cur)} m/s` : ''}${cross > 10 ? `, yan rüzgar ${Math.round(cross)} km/sa` : ''}; ${useSpin ? (jigG >= 8 ? 'mikro metal jig' : 'ağır jighead') : jigType === 'mafsallı' ? 'dip/kaya hedefinde sakin suda mafsallı' : 'istavritte varsayılan sabit ajing kafası'}`,
    },
    {
      key: 'igne', label: 'İğne', value: '#8', evidence: 'A',
      why: `#8: daha seçici, yasal boy üstü oranı yüksek, daha az vuruş. #10: daha çok vuruş, ${legalMinCm} cm altı oranı yüksek, geri bırakma gerekir. Modal boy #8'de 17,7 cm, #10'da 13,4 cm (R19: ${R19_CITE})`,
    },
    {
      key: 'silikon', label: 'Silikon', value: `${lureCm} cm, ${shape}`, evidence: 'C',
      why: cold ? 'su normalden soğuk: küçük ve yavaş' : turbid ? 'bulanık su: bir boy büyük, titreşimli' : 'istavritin ağız boyuna uygun 1,5–2"',
    },
    {
      key: 'renk', label: 'Renk', value: color, evidence: 'C',
      why: turbid ? 'bulanıkta görünürlük' : light === 'aydınlık gece' ? 'iskelenin mevcut aydınlatması altında ışık–gölge sınırı' : light === 'karanlık gece' ? 'karanlıkta siluet' : 'gün ışığında doğal görünüm',
    },
    {
      key: 'saydirma', label: 'Saydırma', value: `${sinkS} s`, evidence: 'C',
      why: night
        ? `yüzeye yakın: kısa say (2–4 s), ~${n1(rate)} m/s düşüş; ışık–gölge sınırında düşüşte bekle`
        : zone === 'orta su'
        ? `orta su (~${n1(targetM)} m): ~${n1(rate)} m/s düşüş, sonra yavaş sarım`
        : `dibe yakın (~${n1(depth)} m): ~${n1(rate)} m/s düşüş; dibe değince 2–3 sarım, düşüşte bekle`,
    },
    { key: 'yasal', label: 'Yasal asgari boy', value: `${legalMinCm} cm`, evidence: 'A', why: '6/2 Tebliğ Çizelge 7; altındakini denize geri bırakın' },
  ];
  const notes = ['Kendi ışığınızla balık toplamak yasak (md. 8/8); kafa lambasını suya tutmayın.'];
  if (gustNote) notes.push(`${gustNote.charAt(0).toLocaleUpperCase('tr')}${gustNote.slice(1)}.`);
  if (color === 'koyu siluet') notes.push('Fosforlu (glow) silikon bir boyadır; onu şarj etmek için ışık kullanmanın kapsamı doğrulanmalı.');
  return { profile: profile.id, jigG, jigType, hook: 8, lureCm, color, zone, targetM, sinkS, rows, notes };
}

/** One-line version (Sahadayım, home page). */
export function tackleShort(t: Tackle): string {
  return `${t.profile === 'lrf' ? 'LRF' : 'Spin'} · ${n1(t.jigG)} g ${t.jigType} · #${t.hook} · ${t.lureCm} cm ${t.color}`;
}

/** Wind component along the shore (km/h) from wind speed/direction (from) and the seaward shore normal. */
export function crossWind(windKmh: number | null, windDir: number | null, normalDeg: number | null): number | null {
  if (windKmh === null || windDir === null || normalDeg === null) return null;
  return Math.round(Math.abs(windKmh * Math.sin(((windDir - normalDeg) * Math.PI) / 180)) * 10) / 10;
}

// ---------------------------------------------------------------------------------------------------------------
// H3: levrek tackle (docs/species/levrek/TACKLE.md). Spin by default (Bassterra XT+ 274, 6–32 g); light levrek on the
// LRF set only in calm, shallow, sheltered water. All rules C except the legal size (A).
export const LEGAL_MIN_LEVREK_CM = 25;
export const SPIN_SIZES = [7, 10, 14, 18, 21, 24, 28, 32];

export interface LevrekTackle {
  profile: 'lrf' | 'spin';
  weightG: number;
  lure: 'silikon shad' | 'silikon kum balığı' | 'minnow' | 'metal jig' | 'LRF shad';
  lureCm: string;
  color: string;
  rows: TackleRow[];
  notes: string[];
}

export function tackleLevrek(i: TackleInput, profiles: TackleProfile[] = DEFAULT_PROFILES, legalMinCm = LEGAL_MIN_LEVREK_CM): LevrekTackle {
  const lrf = profiles.find((p) => p.id === 'lrf') ?? DEFAULT_PROFILES[0]!;
  const spin = profiles.find((p) => p.id === 'spin') ?? DEFAULT_PROFILES[1]!;
  const wave = i.waveM ?? 0;
  const cur = i.currentMs ?? 0;
  const gust = i.gustKmh ?? i.windKmh ?? 0;
  const depth = Math.max(0.5, i.depthM);
  const light = lightCase(i.sunAlt, i.lampP);
  const night = light === 'aydınlık gece' || light === 'karanlık gece';
  const turbid = (i.turbidity ?? 1) < 0.8;
  const cold = (i.sstDev ?? 0) <= -1.5;
  const sheltered = ['harbour', 'pier', 'quay', 'promenade', 'manual'].includes(i.kind ?? '');

  // light levrek on LRF: calm, shallow, sheltered
  const useLrf = wave < 0.3 && gust < 20 && cur < 0.2 && depth <= 4 && sheltered;
  let weightG: number;
  let lure: LevrekTackle['lure'];
  if (useLrf) {
    weightG = Math.min(lrf.jigMax, Math.max(3, nearestSize(1.5 + 0.5 * depth)));
    lure = 'LRF shad';
  } else {
    const base = wave < 0.5 ? 10 : wave <= 1 ? 15 : 24;
    const want = base * (cur >= 0.25 ? 1.4 : 1) * (depth >= 8 ? 1.3 : 1);
    weightG = SPIN_SIZES.reduce((b, x) => (Math.abs(x - want) < Math.abs(b - want) ? x : b), SPIN_SIZES[0]!);
    weightG = Math.min(spin.jigMax, Math.max(spin.jigMin, weightG));
    lure = turbid ? 'silikon shad' : (night || light === 'alacakaranlık') && depth <= 3 ? 'minnow' : light === 'gündüz' && (depth >= 6 || cur >= 0.25) ? 'metal jig' : 'silikon kum balığı';
  }
  const lureCm = useLrf ? '5–7 cm' : cold ? '7–9 cm' : turbid ? '10–12 cm' : lure === 'metal jig' ? `${weightG} g` : '9–12 cm';
  const color = turbid ? 'chartreuse / beyaz' : light === 'karanlık gece' ? 'koyu siluet (siyah, mor)' : light === 'aydınlık gece' ? 'beyaz-gümüş (ışık–gölge sınırı)' : light === 'alacakaranlık' ? 'doğal gümüş (sardalya)' : 'doğal, ince profil';
  const technique = i.kind === 'river_mouth'
    ? 'akıntıyla sürükle; tatlı–tuzlu su sınırında yavaşla'
    : turbid
      ? 'köpük hattına ve dalga kırılımının arkasına at; yavaş, dibe yakın sarım'
      : lure === 'metal jig'
        ? 'uzun atış, dibe indir, kısa sıçratma ve düşüşte bekle'
        : night
          ? 'yavaş, düzgün sarım (gece görsel av zor); ışık–gölge sınırına paralel'
          : 'orta hızda sarım, arada duruş';
  const rows: TackleRow[] = [
    {
      key: 'takim', label: 'Takım', value: useLrf ? 'LRF (hafif levrek)' : 'Spin', evidence: 'C',
      why: useLrf ? `sakin (dalga ${n1(wave)} m), sığ (${n1(depth)} m) ve korunaklı: hafif levrek; FC'yi 1.5–2 numaraya (≈6–8 lb) çıkar` : `${spin.name.replace(/^Spin: /, '')}, atış ${n1(spin.jigMin)}–${n1(spin.jigMax)} g; dalga ${n1(wave)} m`,
    },
    { key: 'agirlik', label: 'Ağırlık', value: `${n1(weightG)} g`, evidence: 'C', why: useLrf ? 'kısa atış, yavaş düşüş' : `dalga ${n1(wave)} m${cur >= 0.25 ? `, akıntı ${n1(cur)} m/s` : ''}${depth >= 8 ? `, derin uç ${n1(depth)} m` : ''}: kıyıdan atış mesafesi ve dibe temas` },
    { key: 'yem', label: 'Yem', value: `${lure}, ${lureCm}`, evidence: 'C', why: turbid ? 'bulanık su: titreşimli kürek kuyruk, bir boy büyük' : cold ? 'su normalden soğuk: küçük ve yavaş' : lure === 'minnow' ? 'sığ suda alacakaranlık/gece yüzeye yakın av' : lure === 'metal jig' ? 'gündüz derin uç ya da akıntı' : 'yem balığı taklidi' },
    { key: 'renk', label: 'Renk', value: color, evidence: 'C', why: turbid ? 'bulanıkta görünürlük' : night ? 'gece siluet ya da ışık–gölge kontrastı' : 'doğal görünüm' },
    { key: 'teknik', label: 'Teknik', value: technique.split(';')[0]!, evidence: 'C', why: technique },
    { key: 'yasal', label: 'Yasal asgari boy', value: `${legalMinCm} cm`, evidence: 'A', why: '6/2 Tebliğ Çizelge 7; altındakini denize geri bırakın' },
  ];
  const notes = ['Kendi ışığınızla balık toplamak yasak (md. 8/8); kafa lambasını suya tutmayın.'];
  if (gust > spin.maxGustKmh * 0.6) notes.push(`Hamle ${Math.round(gust)} km/sa: rüzgarı arkana ya da yana al, misinayı elle frenle.`);
  return { profile: useLrf ? 'lrf' : 'spin', weightG, lure, lureCm, color, rows, notes };
}

/** One-line levrek version. */
export function tackleLevrekShort(t: LevrekTackle): string {
  return `${t.profile === 'lrf' ? 'LRF' : 'Spin'} · ${n1(t.weightG)} g · ${t.lure} ${t.lureCm} · ${t.color}`;
}
