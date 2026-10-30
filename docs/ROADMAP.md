# Yol haritası

Her fazın sonunda testler yeşil, deploy canlı, PROGRESS.md güncel olur ve 5 satırlık rapor verilir. Bir sonraki faza "devam" onayı olmadan geçilmez.

## F0 — Altyapı
- [x] Monorepo iskeleti (npm workspaces: apps/web, workers/api, packages/scoring; pipeline/ Python)
- [x] CLAUDE.md, docs/*, PROGRESS.md
- [x] Skill'ler `.claude/skills/` (frontend-design, webapp-testing, superpowers'tan 3 skill, lisanslarıyla)
- [x] Cloudflare doğrulama (token verify, wrangler whoami)
- [x] DNS envanteri (`docs/dns-inventory.md`, `scripts/dns-inventory.sh`)
- [x] D1 `av-livn` · R2: hesapta etkin değil, manuel adım
- [x] "Merhaba" deploy: workers.dev + av.livn.tr
- [x] CI (vitest + typecheck + build + pytest)

## F1 — MVP
- Overpass aday meralar (Actions `workflow_dispatch`) → kıyı normali, sea_probe, derinlik/eğim → `data/spots.geojson` → D1 seed
- D1 şeması: spots, weather_hourly, scores_hourly
- Saatlik cron: Open-Meteo Forecast + Marine (çoklu koordinat) → D1 → istavrit v1 puanı
- Puanlama motoru (docs/SCORING.md), %100 kapsam
- API: /api/spots, /api/spots/:id/scores, /api/spots/:id/conditions, /api/admin/spots (token)
- Web: mera listesi, 72 saatlik puan grafiği, bileşen dökümü, admin formu, atıflar, PWA manifest + shell SW
- Playwright mobil smoke

## F2 — Dip haritası
EMODnet DTM (ERDDAP netCDF) + CMEMS staticbathy → gdal_contour (5,10,15,20,30,50,75,100 m) → tippecanoe → PMTiles → R2 → MapLibre katmanı. Kıyı çizgisi + iskeleler. Mera kartında normal boyunca derinlik profili.

## F3 — Oşinografi
Copernicus Marmara 500 m günlük (Actions, `copernicusmarine` toolbox; dataset ID'leri `describe` ile doğrulanır) → mera başına 0/5/10/20 m sıcaklık, akıntı, tuzluluk → R2 JSON → günlük cron ile D1. Puanda SST trendi ve akıntı için öncelikli kaynak.

## F4 — Av günlüğü + PWA
Tek dokunuşla kayıt (tür, adet, boy, yem, ağırlık, iğne no). Koşullar ve puan dökümü kayıt anında otomatik saklanır. IndexedDB çevrimdışı kuyruk, çevrimdışı mera kartları.

## F5 — Kalibrasyon + bildirim
≥100 kayıtta lojistik regresyon ile kural tabanlı puan karşılaştırılır (rapor). Telegram bildirimi: sonraki 24 saatte puanı 75 üstü olan pencereler.

## F6 — Genişleme
Levrek, lüfer/çinekop ve kalamar profilleri. İsteğe bağlı Claude API ile sözlü brifing. livn.tr ana sayfasına av.livn.tr kartı (livn-site reposu).
