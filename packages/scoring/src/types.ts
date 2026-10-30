/** One hourly sample of weather + sea conditions at a spot (UTC hour). Units: km/h, deg (from), hPa, °C, m, m/s. */
export interface HourlyPoint {
  ts: string;
  pressure?: number | null;
  windSpeed?: number | null;
  windDir?: number | null;
  windGust?: number | null;
  temp?: number | null;
  precip?: number | null;
  cloud?: number | null;
  waveH?: number | null;
  sst?: number | null;
  curVel?: number | null;
  curDir?: number | null;
  seaLevel?: number | null;
}

export interface SpotInput {
  lat: number;
  lon: number;
  /** Seaward-facing shore normal, degrees clockwise from north. */
  shoreNormalDeg: number | null;
  hasLight: boolean | null;
}

export interface SpeciesProfile {
  id: string;
  name: string;
  version: number;
  weights: Record<string, number>;
  params: {
    wave_soft_limit_m?: number;
    sst_ideal_c?: [number, number];
    current_ideal_ms?: [number, number];
    current_max_ms?: number;
  };
  /** Month (1–12, as string key) → coefficient. */
  season: Record<string, number>;
  safety: { gust_kmh_max: number; wave_m_max: number; cap: number };
}

export interface ComponentResult {
  value: number | null;
  reason: string;
}

export interface ScoredComponent extends ComponentResult {
  key: string;
  weight: number;
  contribution: number | null;
}

export interface ScoreResult {
  ts: string;
  /** Final 0–100 score after the safety cap; null when no component has data. */
  total: number | null;
  raw: number | null;
  gated: boolean;
  warnings: string[];
  missing: string[];
  components: ScoredComponent[];
}

/** Read access to the hourly series relative to the scored hour. */
export interface SeriesView {
  at: Date;
  now: HourlyPoint | undefined;
  /** Point `hours` before (negative) or after (positive) the scored hour. */
  offset(hours: number): HourlyPoint | undefined;
}

export interface ComponentContext {
  series: SeriesView;
  spot: SpotInput;
  profile: SpeciesProfile;
}

export type Component = (ctx: ComponentContext) => ComponentResult;
