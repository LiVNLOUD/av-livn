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

## F1 — MVP (bkz. ROADMAP)
