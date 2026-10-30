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

## F1.1–F1.5 — Düzeltmeler ✅ (2026-10-30)
- **F1.1 Gece çarpanı:** puan = ham × çarpan (tam gece 1.0, alacakaranlık 0.70, gündüz 0.25; lambasız/bilinmeyen ×0.75), ağırlıklar 27/20/13/13/13/14.
  - Canlı 72 sa, 16 mera: gündüz 21.8–23.4 (hedef < 30 ✓), alacakaranlık 41.7–49.1, tam gece 65.9–70.1 (hepsi lamba bilinmiyor → ×0.75).
- **F1.2 CPU:**
  - Worker cron'u 3 dakikaya bölününce bile tek grup (5 mera) **99 ms** harcadı. Puanlama saatlik GitHub Actions işine taşındı (`score.yml`, Node'da ~75 ms, D1 REST API ile yazar).
  - Worker'da yalnız `:07` hava cron'u kaldı (8.6 ms).
  - Okuma uçları (kontrollü ölçüm, 25 istek/dk): health p50 4.3 ms (taban), liste p50 4.3 ms, detay p50 3.2 / p99 7.1 ms. Paketli JSON ayrıştırılmadan döner, edge cache kaldırıldı.
- **F1.3 Önbellek:** `/`, `/mera/`, `/sw.js`, `/manifest.webmanifest` → `no-cache`, `/_astro/*` → `immutable` (`_headers` ile; zone yeniden yazmıyor). API'de istemciye `no-cache`. SW sürümü build hash'iyle damgalanıyor, HTML network-first.
- **F1.4 Meralar:** `docs/spots-review.md`.
  - `ADMIN_TOKEN` repo secret'ı workflow'a **görünmüyor** (deploy log: `ADMIN_TOKEN set: false`), admin 503.
  - Ping/401/404 kontrolü (`scripts/admin-smoke.sh`) secret görünür olunca deploy'da çalışır.
- **F1.5 Koşul renkleri:** `conditionsAt()` motordan, 3 renk + gri, ikon + etiket + hedef satırı. Palet kontrastı ≥ 4.5:1 (test). Halka da aynı paletle.

## F2 — Dip haritası ✅ (2026-10-30)
- **EMODnet DTM 2024** (`bathymetry_dtm_2024`, 1/960° ≈ 115 m, 481×250, 0.49 MB) → kontur/bant/kara → `bathy.pmtiles` **0.19 MiB** (zoom 8–14). Static asset; sunucu Range desteklemediği için istemci dosyayı bir kez indirip bellekten okur.
- **Copernicus statik:** `cmems_mod_blk_phy_anfc_mrm-500m_static` bulundu. EMODnet'e göre 1245 noktada ortalama +3.96 m (mutlak 4.2 m) daha derin. Harita için EMODnet kullanılıyor.
- **Meralar:** DTM'den kıyı normali (en hızlı derinleşen yön; OSM normali birkaç merada ters bakıyordu), deniz noktası, `depth_200m`, `slope_pct`, `max_depth_100m`, 0–500 m profil. 16/16 merada deniz noktası var.
- **Sınır:** DTM kıyıya yakın hücreleri sığa doğru yumuşatıyor; 200 m açıktaki derinlikler çoğu merada 0–9 m görünüyor, gerçekte daha derin olabilir. Lejantta ve listede belirtildi.
- **Web:** `/harita/` (MapLibre, bundle'lanmış worker), mera kartı, lejant; mera sayfasında derinlik profili. 390 px ekran görüntüleri `docs/screenshots/` ve `docs/screenshots/live/`.
- **Testler:** scoring 195 (%100), worker 39, web 6, pytest 35.
