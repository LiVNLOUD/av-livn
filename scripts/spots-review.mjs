// Builds docs/spots-review.md: a field-checking list of candidate spots.
// Usage: node scripts/spots-review.mjs [baseUrl]   (base defaults to https://av.livn.tr; used for the
// Open-Meteo marine grid shift and the current lamp state, which live in D1)
import { readFileSync, writeFileSync } from 'node:fs';

const base = process.argv[2] ?? 'https://av.livn.tr';
const root = new URL('..', import.meta.url).pathname;
const fc = JSON.parse(readFileSync(root + 'data/spots.geojson', 'utf8'));
const KIND = { pier: 'İskele', breakwater: 'Mendirek', groyne: 'Mahmuz' };
const COMPASS = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];

function km(aLat, aLon, bLat, bLon) {
  const r = Math.PI / 180;
  const h = Math.sin(((bLat - aLat) * r) / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLon - aLon) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

async function live(id) {
  try {
    const r = await fetch(`${base}/api/spots/${encodeURIComponent(id)}?hours=1&review=${Date.now()}`);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

const rows = [];
for (const f of fc.features) {
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates;
  const l = await live(p.id);
  const hasLight = l?.spot?.has_light ?? p.has_light;
  const grid = l?.data?.sea_grid;
  const probe = p.probe_lat == null ? null : { lat: p.probe_lat, lon: p.probe_lon };
  const shift = probe && grid ? km(probe.lat, probe.lon, grid.lat, grid.lon) : null;
  rows.push({
    name: p.name,
    kind: KIND[p.kind] ?? p.kind,
    coord: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    maps: `[harita](https://www.google.com/maps?q=${lat.toFixed(6)},${lon.toFixed(6)})`,
    normal: p.shore_normal_deg == null ? '–' : `${Math.round(p.shore_normal_deg)}° ${COMPASS[Math.round(p.shore_normal_deg / 45) % 8]}`,
    probe: probe ? `${Math.round(km(lat, lon, probe.lat, probe.lon) * 1000)} m` : '⚠ yok',
    source: p.probe_source === 'dtm' ? '⚠ DTM (≥5 m)' : probe ? 'kıyı normali' : '⚠ bulunamadı',
    shift: shift == null ? '–' : `${shift.toFixed(1)} km`,
    light: hasLight == null ? '?' : hasLight ? 'var' : 'yok',
    depth: p.depth_200m == null ? '–' : `${p.depth_200m.toFixed(1)} m`,
  });
}

const header = '| # | Ad | Tür | Koordinat | Harita | Kıyı normali | Deniz noktası | Kaynak | Open-Meteo kayması | Lamba | Derinlik 200 m |';
const sep = '|---|---|---|---|---|---|---|---|---|---|---|';
const lines = rows.map((r, i) => `| ${i + 1} | ${r.name} | ${r.kind} | ${r.coord} | ${r.maps} | ${r.normal} | ${r.probe} | ${r.source} | ${r.shift} | ${r.light} | ${r.depth} |`);
const missing = rows.filter((r) => r.source.startsWith('⚠')).length;

writeFileSync(
  root + 'docs/spots-review.md',
  `# Mera inceleme listesi

Sahada doğrulama için aday meralar. Üretildi: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC, \`node scripts/spots-review.mjs\`.

- **Kıyı normali:** meranın denize baktığı yön (iskele/mahmuzda kökten uca, mendirekte 300 m'lik kıyı ortalaması).
- **Deniz noktası:** uçtan normal yönünde Open-Meteo Marine için seçilen nokta ve uca uzaklığı.
- **Open-Meteo kayması:** Marine modelinin deniz noktası yerine kullandığı grid noktasının uzaklığı. Büyükse dalga/su/akıntı başka bir yerin verisidir.
- **Lamba:** \`?\` = bilinmiyor; puanda lambasız sayılır. Admin formundan (\`/admin/\`) güncellenir.
- ⚠: deniz noktası kıyı normaliyle bulunamadı${missing ? ` (${missing} mera)` : ''}; F2'den itibaren DTM'de ≥5 m derinliğe ulaşan ilk noktadan seçilir.

${header}
${sep}
${lines.join('\n')}
`,
);
console.log(`wrote docs/spots-review.md (${rows.length} spots, ${missing} flagged)`);
