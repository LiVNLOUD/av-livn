# Yol haritası

Her fazın sonunda testler yeşil, deploy canlı, PROGRESS.md güncel olur ve 5 satırlık rapor verilir. Bir sonraki faza "devam" onayı olmadan geçilmez.

## F0 — Altyapı
- [x] Monorepo iskeleti (npm workspaces: apps/web, workers/api, packages/scoring; pipeline/ Python)
- [x] CLAUDE.md, docs/*, PROGRESS.md
- [x] Skill'ler `.claude/skills/` (frontend-design, webapp-testing, superpowers'tan 3 skill, lisanslarıyla)
- [x] Cloudflare doğrulama (token verify, wrangler whoami)
- [x] DNS envanteri (`docs/dns-inventory.md`, `scripts/dns-inventory.sh`)
- [x] D1 `av-livn` (R2 kullanılmıyor)
- [x] "Merhaba" deploy: workers.dev + av.livn.tr
- [x] CI (vitest + typecheck + build + pytest)

## F0.1 — Deploy yalnız Actions'tan
- [x] `deploy.yml` + `scripts/smoke.sh`; Workers static assets'e dönüş

## F0.2 — Copernicus doğrulaması
- [x] `copernicus-check.yml`

## F1 — MVP
- [x] Overpass aday meralar: `geodata.yml` (Actions, elle tetikleme + aylık) → `data/spots.geojson` doğrudan main'e commit → deploy tetiklenir. Her aday `status: candidate`
- [x] Kıyı normali (OSM coastline, kara solda), `sea_probe` (750/1000/500 m), Open-Meteo Marine ile probe kontrolü
- [x] D1: spots, cells, forecast_snapshots (hücre başına tek satır), observations (hücre × saat)
- [x] Saatlik cron (`7 * * * *`): Open-Meteo Forecast + Marine, hücre başına çoklu koordinat, kind başına 1 istek
- [x] Puanlama motoru v1 (`packages/scoring`), sınır değer tabloları, %100 kapsam
- [x] API: `/api/spots`, `/api/spots/:id`, `/api/admin/spots` (Bearer `ADMIN_TOKEN`)
- [x] Web: mera listesi, 72 saatlik puan grafiği, bileşen dökümü, koşullar, admin formu, PWA manifest + service worker
- [x] Mobil (390 px) Playwright smoke: `scripts/ui-smoke.mjs`, ekran görüntüleri `docs/screenshots/`
- Derinlik/eğim (`depth_200m`, `slope`) F2'ye kaldı (EMODnet DTM ile)

## F1.1–F1.5 — Düzeltmeler
- [x] Gece çarpanı modeli (tam gece / alacakaranlık / gündüz, lambasız ×0.75), ağırlıklar 27/20/13/13/13/14
- [x] Puanlar cron'da önceden hesaplanır (`spot_scores`), cron 4'e bölündü, API yalnız okur
- [x] Sürümlü service worker, `_headers` (HTML/SW no-cache, `_astro` immutable)
- [x] `docs/spots-review.md`, admin ping + deploy'da admin kontrolü
- [x] Koşul uygunluğu motordan (`conditionsAt`), 3 renk + gri, WCAG ≥ 4.5:1 testi

## F2 — Dip haritası
- [x] EMODnet DTM 2024 (ERDDAP, ~115 m) → `gdal_contour` (2…100 m) + derinlik bantları + kara maskesi → tek PMTiles (~0.2 MB), static asset
- [x] Copernicus Marmara 500 m statik batimetri ID'si `geodata.yml`'de aranır ve EMODnet'le karşılaştırılır (bulunamazsa yalnız EMODnet)
- [x] Mera özellikleri: DTM'den kıyı normali (en hızlı derinleşen yön), deniz noktası, `depth_200m`, `slope_pct` (0–300 m), `max_depth_100m`, 0–500 m profil
- [x] `/harita/`: MapLibre + PMTiles (bellekten okunur, Range gerekmez), meralar puan rengiyle, kart, lejant
- [x] Mera sayfasında derinlik profili grafiği

## F3 — Oşinografi
Copernicus Marmara 500 m günlük (Actions, `copernicusmarine` toolbox; dataset ID'leri `describe` ile doğrulanır) → mera başına 0/5/10/20 m sıcaklık, akıntı, tuzluluk → doğrudan D1 `ocean_daily` (Actions'ta `wrangler d1 execute --remote --file`). Modüller `pipeline/av_pipeline/ocean/`: `fetch.py` (yalnız Actions), `summarize.py` (saf: xarray Dataset + probe noktaları → özet), `emit_sql.py` (UPSERT). Oturumda sentetik xarray fixture'larıyla test edilir. Puanda SST trendi ve akıntı için öncelikli kaynak.

## F4 — Av günlüğü + PWA
Tek dokunuşla kayıt (tür, adet, boy, yem, ağırlık, iğne no). Koşullar ve puan dökümü kayıt anında otomatik saklanır. IndexedDB çevrimdışı kuyruk, çevrimdışı mera kartları.

## F5 — Kalibrasyon + bildirim
≥100 kayıtta lojistik regresyon ile kural tabanlı puan karşılaştırılır (rapor). Telegram bildirimi: sonraki 24 saatte puanı 75 üstü olan pencereler.

## F6 — Genişleme
Levrek, lüfer/çinekop ve kalamar profilleri. İsteğe bağlı Claude API ile sözlü brifing. livn.tr ana sayfasına av.livn.tr kartı (livn-site reposu).
