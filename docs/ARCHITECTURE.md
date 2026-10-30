# Mimari

```
            ┌─────────────── GitHub Actions (Python, günlük) ───────────────┐
            │ pipeline/: Overpass → mera adayları · EMODnet/CMEMS batimetri │
            │ → kontur → PMTiles · CMEMS Marmara 500 m günlük               │
            └───────────────┬───────────────────────────────┬───────────────┘
                            │ data/*.geojson (commit)       │ R2 (PMTiles, JSON)
                            ▼                               ▼
 Telefon (PWA) ──HTTPS──► Worker `av-livn` (Hono, TS) ──► D1 `av-livn`
  av.livn.tr               ├─ /api/*  JSON API             (spots, weather_hourly,
                           ├─ /*      gömülü statik site    scores_hourly, catches)
                           └─ cron (saatlik) → Open-Meteo → D1 → puan
```

## Bileşenler
- **workers/api**: Hono + TypeScript. Tek Worker hem API'yi hem web'i servis eder. Statik dosyalar build sırasında `scripts/embed-assets.mjs` ile `src/generated/assets.ts`'e gömülür (ETag, `_astro/*` için immutable cache). Sebep: bulut oturumu proxy'si Authorization başlığını değiştirdiği için wrangler'ın JWT ile asset upload'u 401 veriyor. Gömme yöntemi bunu atlatıyor ve deploy'u tek, atomik bir yüklemeye indiriyor. Gerçek token'lı CI'dan deploy'a geçilirse Workers Assets'e dönülebilir.
- **packages/scoring**: saf puanlama motoru; Worker ve web aynı kodu kullanır.
- **apps/web**: Astro (statik), MapLibre GL JS (F2), PWA. Mobil öncelikli, karanlık tema varsayılan.
- **pipeline/**: Python; ağır işler (netCDF, GDAL, tippecanoe) yalnız Actions'ta çalışır.
- **D1**: zaman serisi + av günlüğü. **R2**: PMTiles + günlük oşinografi JSON (F2+, R2'nin hesapta etkinleştirilmesi gerekiyor).

## Sınırlar (ücretsiz katman)
- Cron: hesap başına 5. Kullanım: saatlik hava (F1), günlük oşinografi içe aktarma (F3).
- Cron CPU ~10 ms: Open-Meteo'ya çoklu koordinatlı tek istek atılır, D1'e batch yazılır. Gerekirse meralar parçalara bölünür.
- Worker paket boyutu 3 MB (gzip). Gömülü site bunun içinde kalmalı; PMTiles R2'de durur.

## Alan adı
`av.livn.tr` → Workers Custom Domain (Cloudflare yönetimli `AAAA 100::`). `livn.tr`/`www` Pages `livn` projesinde kalır, `/win` Page Rule'una dokunulmaz. Bkz. `docs/dns-inventory.md`.
