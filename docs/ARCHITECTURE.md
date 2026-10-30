# Mimari

```
            ┌─────────────── GitHub Actions (Python, günlük) ───────────────┐
            │ pipeline/: Overpass → mera adayları · EMODnet/CMEMS batimetri │
            │ → kontur → PMTiles · CMEMS Marmara 500 m günlük               │
            └───────────────┬───────────────────────────────┬───────────────┘
                            │ data/*.geojson (commit)       │ D1 (oşinografi özetleri)
                            ▼                               ▼
 Telefon (PWA) ──HTTPS──► Worker `av-livn` (Hono, TS) ──► D1 `av-livn`
  av.livn.tr               ├─ /api/*  JSON API             (spots, forecast_snapshots,
                           ├─ /*      Workers static assets observations, catches)
                           └─ cron :07 → Open-Meteo → D1 (snapshot, gözlem)
 GitHub Actions score.yml (saatlik :23) → D1 REST API: snapshot oku → puanla → spot_scores
```

## Bileşenler
- **workers/api**: Hono + TypeScript. Tek Worker; `/api/*` Worker'da (`run_worker_first`), geri kalan her şey Workers static assets'ten (`apps/web/dist`, `not_found_handling = 404-page`).
- **packages/scoring**: saf puanlama motoru; Worker ve web aynı kodu kullanır.
- **apps/web**: Astro (statik), MapLibre GL JS (F2), PWA. Mobil öncelikli, karanlık tema varsayılan.
- **pipeline/**: Python; ağır işler (netCDF, GDAL, tippecanoe) yalnız Actions'ta çalışır.
- **D1**: mera, hava/deniz tahmin snapshot'ları, saatlik gözlem tarihçesi, oşinografi özetleri (F3), av günlüğü (F4).
- **PMTiles** (F2): R2 yok; static asset olarak Worker ile birlikte dağıtılır (Workers static assets dosya başına 25 MiB sınırı).

## Puanların önceden hesaplanması (F1.2)
- Puanlar ve koşul uygunlukları istek anında hesaplanmaz. Mera başına 75 saatlik hazır JSON `spot_scores` tablosunda tutulur:
  - `list_json`: liste için `[puan, kapı, uyarı, eksik]`
  - `detail_json`: grafik, döküm ve koşullar
- `/api/spots` ve `/api/spots/:id` yalnız okur ve mevcut saate göre dilimler. Edge cache 10 dk tutulur, istemciye `no-cache` gider.
- **Hesaplama GitHub Actions'ta yapılır** (`score.yml`, saatlik :23 ve her deploy sonrası). Önce Worker cron'unu 3 dakikaya bölmeyi denedim; canlı ölçümde tek bir puanlama grubu (5 mera) soğuk isolate'te **99 ms** CPU harcadı (sınır ~10 ms).
- Actions işi (`scripts/score-job.ts`, esbuild ile paketlenir) aynı saf motoru (`workers/api/src/precompute.ts` → `scoreRecords`) Node'da çalıştırır:
  - D1'den REST API ile okur, parametreli sorgularla yazar. Kayıt başına JSON ~125 KB olduğundan D1'in 100 KB SQL metni sınırı nedeniyle `.sql` dosyası kullanılamaz.
  - Node'da 16 mera için ~100 ms hesaplama, saatte ~2 MB yazma.
- Admin düzenlemesi puana bir sonraki saatlik çalışmada yansır.

## Sınırlar (ücretsiz katman)
- Cron: hesap başına 5. Kullanım: 1 (hava :07). Puanlama (saatlik) ve F3'teki günlük oşinografi içe aktarması Actions'ta yapılır, D1'e API ile yazar.
- Actions dakikaları: puanlama işi saatte ~1 dk (ayda ~720 dk). Repo private ise ücretsiz kotanın (2000 dk/ay) önemli bir kısmını kullanır.
- Cron CPU ~10 ms: Open-Meteo'ya çoklu koordinatlı tek istek atılır, D1'e batch yazılır. Gerekirse meralar parçalara bölünür.
- Worker paket boyutu 3 MB (gzip; static assets bu sınıra dahil değil). Static asset dosyası başına 25 MiB.

## Alan adı
`av.livn.tr` → Workers Custom Domain (Cloudflare yönetimli `AAAA 100::`). `livn.tr`/`www` Pages `livn` projesinde kalır, `/win` Page Rule'una dokunulmaz. Bkz. `docs/dns-inventory.md`.

## Deploy
- **Yalnız GitHub Actions** (`.github/workflows/deploy.yml`, main'e push veya elle tetikleme): test → typecheck → build → `wrangler d1 migrations apply --remote` → `wrangler deploy` → `scripts/smoke.sh`. Kimlik bilgileri repo secrets'ta (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`).
- Smoke testi deploy'dan sonra hem av.livn.tr'yi (health, ana sayfa) hem de livn.tr, www ve `/win` 301 → win.ps1 kurallarının bozulmadığını kontrol eder.
- Gerekçe: Bulut oturumundaki proxy her isteğe kendi Cloudflare token'ını ekleyip Authorization başlığını değiştiriyor. Bu yüzden wrangler'ın static asset yüklemesinde kullandığı kısa ömürlü JWT 401 alıyor. Gerçek token Actions'ta bulunuyor. Ayrıca deploy'un tek, denetlenebilir bir yoldan geçmesi, her deploy'da livn.tr korumalarının otomatik doğrulanmasını sağlıyor. Oturumda wrangler yalnız D1 migration/sorgu, `tail` ve teşhis için kullanılır.
- Copernicus kimliği yalnız Actions secrets'ta (`COPERNICUSMARINE_SERVICE_USERNAME/PASSWORD`). Erişim `copernicus-check.yml` ile doğrulanır.
