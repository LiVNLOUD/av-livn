// F0: tackle and lure suggestion for istavrit (docs/TACKLE.md). Pure: the score job stores the open-data inputs
// per hour; the card turns them into rows with this function. Rules are C-level heuristics, except the hook
// size (Peksu et al. 2020, A, local) and the legal minimum size (6/2 Tebliğ Çizelge 7, A).
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
  { id: 'lrf', name: 'LRF: Ares Blue Porter AJ-S 6.3 + Vanford FA C2000S', jigMin: 0.6, jigMax: 3, maxGustKmh: 25, line: 'Gosen PE 0.2 + FC 0,8–1,2 lb' },
  { id: 'spin', name: 'Spin: Bassterra XT+ 274 + Nasci FD C3000 HG', jigMin: 5, jigMax: 20, maxGustKmh: 50, line: 'Kairiki 8 + Daiwa Prorex FC' },
];

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
}

export interface TackleRow {
  key: 'takim' | 'jighead' | 'igne' | 'silikon' | 'renk' | 'saydirma' | 'yasal';
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
  sinkS: number;
  rows: TackleRow[];
  /** Information only, never a suggestion (md. 8/8). */
  notes: string[];
}

export const LEGAL_MIN_ISTAVRIT_CM = 13;
const n1 = (x: number) => x.toFixed(1).replace('.', ',').replace(',0', '');
const round05 = (x: number) => Math.round(x * 2) / 2;

/** Hour category from the sun and the pier's lighting. */
export function lightCase(sunAlt: number, lampP: number | null): 'gündüz' | 'alacakaranlık' | 'aydınlık gece' | 'karanlık gece' {
  if (sunAlt > 0) return 'gündüz';
  if (sunAlt > -6) return 'alacakaranlık';
  return (lampP ?? 0) >= 0.5 ? 'aydınlık gece' : 'karanlık gece';
}

export function tackle(i: TackleInput, profiles: TackleProfile[] = DEFAULT_PROFILES, legalMinCm = LEGAL_MIN_ISTAVRIT_CM): Tackle {
  const lrf = profiles.find((p) => p.id === 'lrf') ?? DEFAULT_PROFILES[0]!;
  const spin = profiles.find((p) => p.id === 'spin') ?? DEFAULT_PROFILES[1]!;
  const cur = i.currentMs ?? 0;
  const gust = i.gustKmh ?? i.windKmh ?? 0;
  const cross = i.crossKmh ?? 0;
  const depth = Math.max(0.5, i.depthM);

  // jighead: ~1 m per 2–4 s and still touching bottom (TACKLE.md)
  let lrfG = (0.8 + 0.25 * depth) * (1 + 2 * cur) + (cross >= 15 ? 0.5 : 0);
  lrfG = round05(lrfG);
  const why: string[] = [];
  if (gust > lrf.maxGustKmh) why.push(`hamle ${Math.round(gust)} km/sa`);
  if (cross >= 20) why.push(`yan rüzgar ${Math.round(cross)} km/sa`);
  if (cur >= 0.25) why.push(`akıntı ${n1(cur)} m/s`);
  if (lrfG > lrf.jigMax) why.push(`gereken ağırlık ${n1(lrfG)} g > LRF üst sınırı ${n1(lrf.jigMax)} g`);
  const useSpin = why.length > 0;
  const profile = useSpin ? spin : lrf;
  const jigG = useSpin ? Math.min(spin.jigMax, Math.max(spin.jigMin, Math.round(spin.jigMin + 0.8 * depth + 20 * cur))) : Math.min(lrf.jigMax, Math.max(lrf.jigMin, lrfG));

  const calm = cur < 0.15 && cross < 10;
  const jigType = calm && !useSpin ? 'mafsallı' : 'sabit';
  const light = lightCase(i.sunAlt, i.lampP);
  const turbid = (i.turbidity ?? 1) < 0.8;
  const cold = (i.sstDev ?? 0) <= -1.5;
  const lureCm = cold ? 4 : turbid ? 6 : 5;
  const color = turbid ? 'parlak' : light === 'aydınlık gece' ? 'şeffaf-simli' : light === 'karanlık gece' ? 'koyu siluet' : 'doğal';
  const shape = turbid || light === 'karanlık gece' ? 'kürek kuyruk (titreşim)' : 'iğne kuyruk (doğal düşüş)';
  // sink rate (m/s) grows with weight; count to the bottom, then lift
  const rate = useSpin ? 0.9 : 0.25 + 0.12 * jigG;
  const sinkS = Math.max(2, Math.round(depth / rate));

  const rows: TackleRow[] = [
    {
      key: 'takim', label: 'Takım', value: profile.id === 'lrf' ? 'LRF' : 'Spin', evidence: 'C',
      why: useSpin ? `${why.join(', ')}: hafif takım kontrolü kaybeder` : `rüzgar ve akıntı hafif takıma uygun (${profile.line})`,
    },
    {
      key: 'jighead', label: 'Jighead', value: `${n1(jigG)} g ${jigType}`, evidence: 'C',
      why: `uçta ~${n1(depth)} m${cur ? `, akıntı ${n1(cur)} m/s` : ''}${cross >= 15 ? ', yan rüzgar' : ''}; ${jigType === 'mafsallı' ? 'sakin suda daha doğal düşüş' : 'akıntı/rüzgarda dibe temas için sabit'}`,
    },
    {
      key: 'igne', label: 'İğne', value: '#8', evidence: 'A',
      why: `Peksu vd. 2020 (İstanbul Boğazı): #8'de modal boy 17,7 cm, #10'da 13,4 cm; #10 yasal ${legalMinCm} cm sınırında küçük balığı artırır`,
    },
    {
      key: 'silikon', label: 'Silikon', value: `${lureCm} cm, ${shape}`, evidence: 'C',
      why: cold ? 'su normalden soğuk: küçük ve yavaş' : turbid ? 'bulanık su: bir boy büyük, titreşimli' : 'istavritin ağız boyuna uygun 1,5–2"',
    },
    {
      key: 'renk', label: 'Renk', value: color, evidence: 'C',
      why: turbid ? 'bulanıkta görünürlük' : light === 'aydınlık gece' ? "iskelenin mevcut aydınlatması altında ışık–gölge sınırı" : light === 'karanlık gece' ? 'karanlıkta siluet' : 'gün ışığında doğal görünüm',
    },
    {
      key: 'saydirma', label: 'Saydırma', value: `${sinkS} s`, evidence: 'C',
      why: `${n1(depth)} m dibe ~${n1(rate)} m/s düşüş; dibe değince 2–3 sarım, düşüşte bekle`,
    },
    { key: 'yasal', label: 'Yasal asgari boy', value: `${legalMinCm} cm`, evidence: 'A', why: '6/2 Tebliğ Çizelge 7; altındakini denize geri bırakın' },
  ];
  const notes = ["Kendi ışığınızla balık toplamak yasak (md. 8/8); kafa lambasını suya tutmayın."];
  if (color === 'koyu siluet') notes.push('Fosforlu (glow) silikon bir boyadır; onu şarj etmek için ışık kullanmanın kapsamı doğrulanmalı.');
  return { profile: profile.id, jigG, jigType, hook: 8, lureCm, color, sinkS, rows, notes };
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
