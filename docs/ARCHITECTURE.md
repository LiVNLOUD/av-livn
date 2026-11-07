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
 Worker cron :07 ── çekimden sonra workflow_dispatch ──► GitHub Actions score.yml → D1 REST API: snapshot oku → puanla → spot_scores
                    (birincil tetik; GitHub'ın kendi :23 zamanlaması yalnız yedek)
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
- `/api/spots` ve `/api/spots/:id` yalnız okur ve mevcut saate göre dilimler. Detay, paketli JSON (`packDetail`) olarak ayrıştırılmadan döner; istemci `unpackDetail` ile açar. Edge cache yok (Cache API put/clone maliyeti işten fazlaydı); istemciye `no-cache`.
- **Hesaplama GitHub Actions'ta yapılır** (`score.yml`; tetikler aşağıda, ayrıca her deploy sonrası). Önce Worker cron'unu 3 dakikaya bölmeyi denedim; canlı ölçümde tek bir puanlama grubu (5 mera) soğuk isolate'te **99 ms** CPU harcadı (sınır ~10 ms).
- Actions işi (`scripts/score-job.ts`, esbuild ile paketlenir) aynı saf motoru (`workers/api/src/precompute.ts` → `scoreRecords`) Node'da çalıştırır:
  - D1'den REST API ile okur, parametreli sorgularla yazar. Kayıt başına JSON ~125 KB olduğundan D1'in 100 KB SQL metni sınırı nedeniyle `.sql` dosyası kullanılamaz.
  - Node'da 16 mera için ~100 ms hesaplama, saatte ~2 MB yazma.
- Admin düzenlemesi puana bir sonraki saatlik çalışmada yansır.

### Tetikler (2026-11-07'den beri)
- **Birincil: Cloudflare Worker cron'u `7 * * * *`.** Sırası: hava çekimi (Open-Meteo → D1), model çalıştırma bilgisi, sonra `guardScoring` (`workers/api/src/lib/staleness.ts`). Guard gerekirse `score.yml`'i `workflow_dispatch` ile başlatır (`GH_DISPATCH_TOKEN`, yalnız bu repo, Actions yaz). Sebepler:
  - `new weather`: bu cron'un çekimi başarılı ve puanlar bu çekimden eski (normal saatlik yol);
  - `stale weather`: çekim başarısız ve veri > 60 dk. Başlayan iş önce `POST /api/admin/weather/refresh` ile havayı yeniden çeker;
  - `stale scores`: puan > 75 dk.
  - `saha düzeltmesi`: puanı etkileyen bir saha kaydı (lamba, derinlik, erişim, dip; saha formu ve yöneticinin lamba durumu) kaydedilince Worker hemen tetikler. En fazla 10 dk'da bir (`meta.field_dispatch_at`, atomik). Arada gelen kayıtlar aynı çalışmanın `--field-followup` adımında, pencere dolunca birlikte puanlanır. Av günlüğü kaydı puan girdisi değildir, tetiklemez.
- İki dispatch arası en az 30 dk. Her dispatch `meta.score_dispatch_log`'a yazılır (son 200); son durum `meta.score_guard_last`'ta.
- Puanlama işi başlarken hava > 60 dk ise önce taze çekim ister; puanlar en yeni havayı zaten kullanıyorsa ve bekleyen saha düzenlemesi yoksa hemen çıkar (`nothingNew`).
- **Yedek: GitHub zamanlaması `23 * * * *`.** Ölçülen başlama oranı %8 (72 sa, 288 beklenen yuvadan 23; `docs/audit/monitor-72h.md`). Bu yüzden yalnız yedektir; 15 dakikalık `:08/:38/:53` yuvaları kaldırıldı.
- **Bayatlık alarmı:** Worker her saat kendisi gönderir (2 sa sınırı, 6 sa tekrar aralığı). GitHub `watchdog.yml` 6 saatte bir çalışır; Worker'ın kendisi durursa diye bağımsız kontroldür.

## Sınırlar (ücretsiz katman)
- Cron: hesap başına 5 (Cloudflare). Kullanım: 1 (`7 * * * *`: hava çekimi + puanlama tetiği). Puanlama ve oşinografi içe aktarması Actions'ta yapılır, D1'e API ile yazar.
- GitHub zamanlamaları: score.yml saatlik yedek (:23), watchdog 6 saatte bir, ocean.yml 6 saatte bir, haftalık/aylık işler (calibrate, geodata, desk, backup).
- Actions dakikaları: puanlama işi saatte ~2 dk (Worker tetiği; ayda ~1500 dk). Yedek :23 çalışması başlarsa ~20 sn'de çıkar. Repo public olduğu için standart çalıştırıcı dakikası sınırsız; private yapılırsa bu kullanım 2000 dk/ay ücretsiz kotasına yaklaşır.
- Cron CPU ~10 ms: Open-Meteo'ya çoklu koordinatlı tek istek atılır, D1'e batch yazılır. Gerekirse meralar parçalara bölünür.
- Worker paket boyutu 3 MB (gzip; static assets bu sınıra dahil değil). Static asset dosyası başına 25 MiB.

## Alan adı
`av.livn.tr` → Workers Custom Domain (Cloudflare yönetimli `AAAA 100::`). `livn.tr`/`www` Pages `livn` projesinde kalır, `/win` Page Rule'una dokunulmaz. Bkz. `docs/dns-inventory.md`.

## Deploy
- **Yalnız GitHub Actions** (`.github/workflows/deploy.yml`, main'e push veya elle tetikleme): test → typecheck → build → `wrangler d1 migrations apply --remote` → `wrangler deploy` → `scripts/smoke.sh`. Kimlik bilgileri repo secrets'ta (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`).
- Smoke testi deploy'dan sonra hem av.livn.tr'yi (health, ana sayfa) hem de livn.tr, www ve `/win` 301 → win.ps1 kurallarının bozulmadığını kontrol eder.
- Gerekçe: Bulut oturumundaki proxy her isteğe kendi Cloudflare token'ını ekleyip Authorization başlığını değiştiriyor. Bu yüzden wrangler'ın static asset yüklemesinde kullandığı kısa ömürlü JWT 401 alıyor. Gerçek token Actions'ta bulunuyor. Ayrıca deploy'un tek, denetlenebilir bir yoldan geçmesi, her deploy'da livn.tr korumalarının otomatik doğrulanmasını sağlıyor. Oturumda wrangler yalnız D1 migration/sorgu, `tail` ve teşhis için kullanılır.
- Copernicus kimliği yalnız Actions secrets'ta (`COPERNICUSMARINE_SERVICE_USERNAME/PASSWORD`). Erişim `copernicus-check.yml` ile doğrulanır.
