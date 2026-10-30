# PROGRESS

## F0 — Altyapı ✅ (2026-10-30)
- Canlı: https://av.livn.tr ve https://av-livn.akdagknmain.workers.dev (`/api/health` → D1 şema `f0`)
- D1 `av-livn` (83445f2d-…), R2 **etkin değil** (dashboard'dan "Enable R2" gerekiyor, F2'den önce)
- Statik site Worker'a gömülü (proxy, assets upload'unu 401 ile engelliyor; bkz. ARCHITECTURE)
- DNS: yalnız `av` eklendi; `@`, `www`, MX/TXT ve `/win` 301 doğrulandı (`docs/dns-inventory.md`)
- Testler: scoring 2 (%100 kapsam), worker 5, pytest 1
- Ortam eksikleri: `CLOUDFLARE_ACCOUNT_ID` ve `COPERNICUSMARINE_*` env'de yok; Overpass'a konteynerden erişilemiyor

## Sonraki: F1 — MVP (onay bekliyor)
