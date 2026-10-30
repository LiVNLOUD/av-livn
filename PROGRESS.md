# PROGRESS

## F0 — Altyapı ✅ (2026-10-30)
- Canlı: https://av.livn.tr ve https://av-livn.akdagknmain.workers.dev (`/api/health` → D1 şema `f0`)
- D1 `av-livn` (83445f2d-…), R2 **etkin değil** (dashboard'dan "Enable R2" gerekiyor, F2'den önce)
- Statik site Worker'a gömülü (proxy, assets upload'unu 401 ile engelliyor; bkz. ARCHITECTURE)
- DNS: yalnız `av` eklendi; `@`, `www`, MX/TXT ve `/win` 301 doğrulandı (`docs/dns-inventory.md`)
- Testler: scoring 2 (%100 kapsam), worker 5, pytest 1
- Ortam eksikleri: `CLOUDFLARE_ACCOUNT_ID` ve `COPERNICUSMARINE_*` env'de yok; Overpass'a konteynerden erişilemiyor

## F0.1 — Deploy GitHub Actions'a taşındı
- `deploy.yml`: test → typecheck → build → D1 migrations → deploy → smoke (av.livn.tr + livn.tr/www/`/win`)
- Worker'a gömme geri alındı → Workers static assets (`run_worker_first: /api/*`)
- Oturumdan deploy yok; R2 kullanılmıyor

## F0.2 — Copernicus doğrulaması
- `copernicus-check.yml` ✅: kimlik geçerli; tem/cur/sal dataset'leri erişilebilir (BLKSEA_ANALYSISFORECAST_PHY_007_001, v202311)
- 2026-10-29 yüzey subset'i: 42×80 grid, 36 KB, thetao 17.2–18.6 °C, %61 kara (NaN)
- `cmems_mod_blk_phy_anfc_mrm-500m_staticbathy` bulunamadı → F2'de doğru statik ID aranacak

## F1 — MVP ✅ (2026-10-30)
- **Meralar:** `spots.yml` (Actions) Overpass'tan 16 aday üretti (10 iskele, 6 mendirek) → `data/spots.geojson` main'e doğrudan commit. 13 merada deniz noktası var, 3'ünde yok. Hepsi `status: candidate`.
- **Cron:** canlıda çalışıyor (13:07Z). 20 hücre, 20 snapshot, 20 gözlem. Kind başına tek Open-Meteo isteği.
- **Puanlama:** 112 test, %100 kapsam. Sınır tabloları: açı 0/45/90/135/180, dalga 0.3/0.6/1.2, ay 0/0.5/1, kapı 39/40/41 km/sa ve 1.19/1.2/1.21 m.
- **Worker:** 31 test (seed, cron, API, admin, edge cache). pytest: 22.
- **Web:** liste, 72 saatlik SVG grafik, bileşen dökümü, admin, PWA. 390 px ekran görüntüleri `docs/screenshots/`.
- **CPU:** ilk ölçümde `/api/spots` p99 ~16 ms (sınır ~10 ms) → yanıtlar 10 dk edge cache'te. Cron dakikası p50 7.8 / p99 10.6 ms (API istekleriyle karışık). Bir sonraki cron'da tekrar ölçülecek.
- **Zone ayarı:** livn.tr zone'unun Browser Cache TTL'i (4 sa) API yanıtlarını yeniden yazıyor → istemciye `no-cache` dönülüyor.
- **Bilinen sınırlar:**
  - Open-Meteo Marine, körfez içi noktaları birkaç km uzaktaki açık deniz grid'ine kaydırıyor; arayüz mesafeyi gösteriyor, F3'te CMEMS 500 m gelecek.
  - Gündüz puanı ~74 (gece bileşeni yalnız 25/100); kalibrasyon kararı bekliyor.
  - `ADMIN_TOKEN` repo secret'ı yok → admin 503.
  - `depth_200m`/`slope` F2'ye kaldı.
