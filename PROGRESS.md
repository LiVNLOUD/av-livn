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
  - Worker'da yalnız `:07` hava cron'u kaldı: 14:07'de tek başına 8.6 ms; 15:07 dakikasında API istekleriyle karışık p99 13.2 ms. Sınıra yakın; aşarsa hücreler iki cron dakikasına bölünecek.
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

## v2 Bölüm A — Araştırma, veri denetimi, model tasarımı (2026-10-30) ⏸ onay bekliyor
- **Kapsam:** uygulama kodu değişmedi; canlı v1.1 aynı. v1 arşivi `docs/archive/SCORING-v1.md`.
- **RESEARCH.md:** 18 kaynak (A 11, B 3 + 1 aday, C 2, fizik 1); içeriği okunan 8. Bulunamayanlar açıkça yazıldı: GB Karadeniz ve Romanya diyeti, kışlama göçü birincil kaynağı, ALAN, basınç, sıcaklık tercih bandı.
- **DATA-AUDIT.md:**
  - DTM: 16/16 transekt %100 enterpolasyonlu; bbox'ın %74'ü GEBCO dolgusu, kontur halkaları bundan geliyor.
  - 6/16 mera noktası uçta değil (İDO 219 m kökte).
  - Copernicus mrm-500m Gemlik Körfezi'nde 379 ıslak hücre, saatlik, 1–25 m. BS multiyear ve SST L4 Gemlik'te 0 hücre, bu yüzden SST yalnız değişim hızı.
  - EUSeaMap yalnız çamur sınıfları; biyojenik veri yok.
  - Fetch OSM land polygons ile hesaplandı; DTM maskesi kesik ve kullanılamaz.
  - Kaynak: `audit.yml` [run 41093963924](https://github.com/LiVNLOUD/av-livn/actions/runs/41093963924).
- **MODEL.md:** HSI = 100 · HSI_s · HSI_d, ağırlıklı geometrik ortalama; diel iki kol + ışık indeksi (bulut dahil); lamba üç durum karışımı; 42 parametre (A 3, B 1, C 38); Monte Carlo %10–90; kalibrasyon planı; saha formu; referans repo incelemesi.
- **Duyarlılık (16 × 72 sa, mock Copernicus):**
  - Meralar arası std v1 0.06 → v2 11.6 (en düşük saat 8.7).
  - Gündüz std 0 → 14.8.
  - Plato %81 → %14.
  - 5/5 yön testi geçti.
  - Yayılımın çoğu C-düzeyi önsellerden (yapı uzunluğu, lamba); saha doğrulaması gerekli.
- **Sıradaki:** Bölüm B (B1 motor … B6), kullanıcı onayından sonra.

## v2 Bölüm B — uygulama (2026-10-30/31)
- **B0:** 6 mera noktası OSM yapısının ana karaya en uzak düğümüne taşındı (eski nokta `alt`); paylaşılan düğüm kısa yapıya verilir, birleştirme yok (16 mera). Open-Meteo: tür başına tek çoklu-koordinat isteği, 429/5xx'te üstel geri çekilme, son iyi veri korunur, çağrı sayısı `meta.om_last_run`.
- **B1:** `packages/scoring/src/v2` HSI motoru; log-doğrusal ölçek (ideal 92, en kötü 8; birim testli), 5 yön testi, bileşen başına kaynak + kanıt, Monte Carlo %10–90, saatlik `score.yml` ile `spot_scores_v2`.
- **B5:** `/saha/` formu (lamba üç durum + renk, yapı, dip tipi, "jighead'e ne takıldı", dikine/batma süresi derinlik + kronometre, erişim, not, fotoğraf, çevrimdışı kuyruk); kayıt anında tek mera yeniden puanlanır.
- **B2:** Copernicus Marmara 500 m saatlik su sıcaklığı (1–20 m) ve akıntı (1–5 m), `ocean.yml` 6 saatte bir; 2021-11+ günlük arşivden kısa normal (kanıt C, ağırlık 0.03).
- **B3:** tam ekran harita: OpenFreeMap altlık, Türkçe adlar, ölçek, OSM vektör kıyı, geniş ve kenarı soldurulmuş batimetri, taralı enterpolasyon alanı, burun/liman etiketleri, çakışmasız v2 işaretleri.
- **B4/B6:** kart ve liste v2: bant > 30 ise sıra öne, derinlik kaynağı metni, kanıt rozeti + kaynak etiketi, %10–90 bantlı grafik, uçtan profil + saha noktaları; v2 renk bantları (65/40), bulut ve lamba üç durumu koşullar panelinde.

## v2 Bölüm C — adlar, dürüstlük, saha formu, av günlüğü, masa başı veri (2026-10-31) ✅
- **C2c "18 mera":** canlıda hiç 18 görünmedi; ekran görüntüsünü yanlış okumuştum (küçültülmüş görüntü), gerçek sayı 16. Yine de tek kaynak: `ACTIVE` + `ACTIVE_COUNT_SQL`; liste `count` = kart `spot_count` testi.
- **C1:** aynı adlı yapılar ayrıştı: en yakın liman ≤ 1 km ya da yerleşim + yön ("Armutlu Devlet Limanı – uzun/orta/kısa batı mendireği"); OSM adı ve id değişmez, yönetici adı korunur.
- **C2:** erişim rozeti + "gizle" anahtarı (puana girmez); her merada sıranın ana nedeni (sürücü takası ablasyonu, `explain.ts`, %100 test). Saha kaynaklı değerler "değer gizli".
- **C3:** anahtar cihazda kalır, çıkış düğmesi; giriş düzenle/sil/onayla/reddet; kaynak türü saha/uzaktan/masa başı ve öncelik zinciri. Canlı CPU (Workers Observability): nokta puanı POST 42, PATCH 24, DELETE 27 ms > 10 ms → Worker yalnız kaydeder, `score.yml` 15 dk'lık `--pending` çalışması Monte Carlo ile günceller ("en geç 20 dakika"). `field-smoke.yml` canlı test: 201/200/200, sızıntı yok.
- **C4:** `/gunluk/` av günlüğü (yalnız anahtarla): seans, efor (aktif dk, kamış), yöntem, tür/adet/boy, açık "sıfır av", 13 cm uyarısı, çevrimdışı kuyruk, CSV. Model çıktısı kayıtta dondurulur (geçmiş saat → `spot_scores_v2_history`, daha eskisi gözlemlerden yeniden hesap, "recomputed"). Birim adet/saat/kamış.
- **C6:** `desk.yml` (aylık): OSM lamba (1 bulgu: Demirsubaşı seyir ışığı 37 m → p 0.6), Mapillary (token var, 16 merada ±50 m'de 0 görüntü), Sentinel-2 (12 sahne/mera; uçlar açık sudan ayırt edilemiyor, oran 0.97–1.10 → bulgu yok; ilk çalışmanın yanlış "koyu" sınıfı düzeltildi ve silindi). Literatür, ÇED, OpenSeaMap: meraya uygulanabilir değer bulunamadı (DESK-DATA.md). Önce/sonra: öğlen fark yok; 21:00'de Demirsubaşı 74.7 → 77.0, sıra #3 değişmedi.
- **C5:** 390 px: `docs/screenshots/saha-*-390.png`, `gunluk-*-390.png` (form yerel D1 ile, giriş ekranı canlı).

## v2 Bölüm D — (2026-10-31, sürüyor)
- **D0:** gizlilik düzeltmesi canlı (public API yalnız puan/sıra/bant/genel bilgi; v1 kaldırıldı). Git geçmişi: kişisel saha/av verisi yok, secret yok; yalnız commit e-postaları (`akdagkn@gmail.com` 17, `akdagknmain@gmail.com` 1). Şifreli günlük yedek `backup.yml` (gpg AES256, `BACKUP_PASSPHRASE` secret'ı bekleniyor), geri yükleme testi yerelde geçti (BACKUP.md).
- **D1:** envanter adayları `proposed` (puanlanmaz), harita gri katman + erişim yasak katmanı, `/admin/` onay/ret. Karacaali/Büyükkumla kök nedeni: OSM'de iskele yolu değil `leisure=marina` noktası.
- **D2:** ana sayfa "Nereye, ne zaman?": 72 saatin en iyi pencereleri, gün/saat seçici, tür seçici.
