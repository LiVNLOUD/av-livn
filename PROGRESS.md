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

## v2 Bölüm D — (2026-10-31) ✅ uygulananlar canlıda; D3/D4/D7/D8 ve mevzuat yalnız tasarım
- **D0:**
  - Public API yalnız puan/sıra/bant/genel bilgi döndürüyor; v1 kaldırıldı.
  - Git geçmişi: kişisel saha/av verisi yok, secret yok; yalnız commit e-postaları var (`akdagkn@gmail.com` 17, `akdagknmain@gmail.com` 1).
  - Şifreli günlük yedek: `backup.yml` (gpg AES256, Actions artifact). Geri yükleme yerelde test edildi (BACKUP.md). **`BACKUP_PASSPHRASE` secret'ı bekleniyor** (ilk çalışma bu yüzden durdu).
- **D1:**
  - OSM envanteri → 41 aday (`proposed`, puanlanmaz): kumsal 24, liman/barınak 7, dere ağzı 6, kayalık 2, bilinen yer 2.
  - Gri aday katmanı + erişim yasak katmanı; `/admin/` onay/ret; yeni tipler için statik tercih değerleri (kanıt C).
  - Kök neden: Karacaali/Büyükkumla iskeleleri OSM'de iskele yolu değil, `leisure=marina` noktası. Artık ikisi de aday.
  - Eşkel OSM'de yerleşim olarak yok; Mudanya balıkçı barınağı için etiketli nesne yok.
  - İlk ada-göre aramada okulları liman sanma hatası düzeltildi.
- **D2:** Ana sayfa "Nereye, ne zaman?": `/api/windows` ile 72 saatin en iyi pencereleri (≥ 65, en çok 12 sa, mera başına 2); gün/saat seçici (`/api/spots?at=`); tür seçici (yalnız istavrit aktif); kart `?t=` ile o saatte açılır.
- **D5:** `/sahadayim/`:
  - Yakındaki 3 mera; konum cihazda kalır.
  - Büyük +1 düğmesi, uzun basışla tür, geri al, boy (13 cm uyarısı), mola.
  - Kırmızı gece modu, Wake Lock, çevrimdışı kuyruk.
  - Bitirirken açık "sıfır av"; yöntem değişince ayrı seans.
  - Yerel uçtan uca test geçti.
- **D6:** `/admin/tahmin/`: dondurulmuş puan ↔ adet/saat/kamış; puan aralığına göre verim (t aralığı) ve sıfır av oranı (Wilson), n her grafikte; n < 5'te "veri az"; aynı akşam sıra isabeti.
- **D9 bildirim:**
  - Kanallar: web push (VAPID) + ntfy; gönderen puanlama işi. Abonelik/ayar yalnız admin.
  - Türler: 17:00 günlük özet, fırsat (≥ eşik, dar bant, tekrar yok), favori merada güvenlik; sessiz saatler.
  - `/ayarlar/`, `notify-smoke.yml`, NOTIFICATIONS.md.
  - Olay: D9 sonrası 3 saatlik puanlama başarısız oldu (`web-push` ESM paketinde dinamik `require`). `--external:web-push` ile düzeltildi.
- **Tasarım:** TACKLE.md (iki takım profili, jighead/iğne/silikon kuralları, kart), SPECIES-ROADMAP.md, ABUNDANCE-MUCILAGE.md (D7, D8), REGULATION.md.
  - Mevzuat: 6/2 Tebliğ md. 8/8 cezbetme amaçlı ışığı yasaklıyor. Altbilgide "lamba = mevcut aydınlatma" notu var.
  - Çizelge 7 boyları okunamadı; 13 cm doğrulanacak.

## Faz E — arayüz, harita kalitesi, D'den kalanlar (2026-10-31) — E9 ayrı faza bırakıldı
- **Giriş hatası (öncelikli):**
  - Tek `AdminLogin` bileşeni + `mountLogin`: anahtar kırpılır; 401 "Anahtar hatalı", ağ hatası "Bağlantı yok", 503 "yönetici anahtarı yapılandırılmamış"; buton yükleniyor durumunda.
  - Kayıtlı anahtar açılışta doğrulanır.
  - 7 yönetici sayfası bu bileşeni kullanıyor. Canlı yanlış anahtar testi: `docs/screenshots/e/sonra-saha-yanlis-anahtar-390.png`.
  - Yenilenen ADMIN_TOKEN deploy 41209992493'te yüklendi ("Successfully created secret for key: ADMIN_TOKEN", admin ping 200).
- **E0:** DESIGN.md; 6 tip boyutu (12/14/16/20/28/40, rem), 4–48 px boşluk ölçeği; buton/ikincil/bağlantı/rozet/kart tek tanım; kart eylemleri aynı satır, 32 px.
- **E1:** dört bölge (≥1920), üç (1200–1919, harita/ısı haritası sekmesi), iki (768–1199), tek sütun + alt sekme çubuğu (<768); tam üst menü, admin oturumunda Adaylar/Panel.
- **E2:** mera × saat ısı haritası (`/api/hours`): sürekli puan rengi, geniş bantta tarama, gece/alacakaranlık şeridi, gün ayracı, "şimdi" çizgisi; hücre → kart o saatte.
- **E3:** pencere = zirve ± kesintisiz saatler ≥ max(65, zirve − 8), ≤ 4 sa; mera başına gün başına bir, listede her mera bir kez; sade neden + "varsayıma dayanıyor".
- **E4:** aday elmas işaretler, noktanın yanında açılır kutu (yönetici: Onayla/Reddet/Düzenle); `/admin/adaylar` filtre, toplu işlem, mini harita, OSM/Mapillary; haritaya dokunarak mera ekleme.
  - Gemport/Roda: okullar artık yasak katmanında değil. Ancak OSM'de bu limanlar adla etiketli liman nesnesi olarak yok; katmanda yalnız Borusan Port var.
- **E5:** harita modülü, yükleme göstergesi, işaretler seçili saate göre. DTM ölçüm bloğu–GEBCO dikişi yalnız görüntü için σ = 1 hücre düzleştirme; daha belirgin tarama (lejantla aynı desen). Kara zaten OSM poligonu.
- **E6:** jenerik adlar "Fıstıklı İskelesi" biçimine geçti (köyden ≥ 700 m ise yönü ekleniyor). Tür sırası levrek → lüfer/çinekop → mırmır/karagöz → kolyoz; kalamar ve sarpan kapsam dışı (kullanıcı kararı).
- **E7:** Çizelge 7 RG görüntüsünden okundu: istavrit 13 cm doğru; levrek 25, lüfer 18, kolyoz 18, karagöz 18; mırmır sınırsız. md. 16(5) birebir ve kumsal rozeti; md. 8(8): arayüzde "lamba" → "iskelenin mevcut aydınlatması".
- **E8:** watchdog (saatlik + puanlama hatasında) → PWA push, ntfy yalnız tanımlıysa, arıza başına 6 saatte bir; 2 saati geçen veride site üstünde uyarı; yedek artifact'ları 7 gün.
- **E9 (takım kutusu):** uygulanmadı, ayrı faz (TACKLE.md kuralları hazır).

## Faz F — takım kutusu, otomatik mera, kaynaklar, /model/, kalibrasyon, ısı haritası (2026-10-31) ✅ DUR
- **F0:** Takım kutusu her saat için takım, jighead, iğne #8 (A, Peksu vd. 2020), silikon, renk, saydırma ve yasal 13 cm (A) önerir. Açık veriyle herkese açık; yönetici saha derinliğiyle inceltilmiş sürümü ve fark satırını görür. Takım profilleri /admin/'den düzenlenir. Sahadayım ve ana sayfada kısa sürüm var. md. 8/8 gereği ışık önerilmez.
- **F1:** Onay adımı kaldırıldı. 63 aktif mera var, 47'si otomatik eklendi: kumsal 28, liman 9, dere ağzı 8, kayalık 2.
  - 6 yer elendi: 5'i kıyıya 30 m'den uzak, 1'i ticari liman sahası (Borusan).
  - Yönetici bir merayı herkesten gizleyip geri alabilir ve yasak alan çizebilir.
- **F2:** Kaynaklara R20 (hal fiyat–miktar tezi), R21 (Hoyle vd. 2024) ve R22 (İBB hal girişleri) eklendi.
  - TÜİK/BSGM'de aylık Marmara istavrit serisi **bulunamadı**.
  - Hal serisi kışın tepe yapıyor ve ticari avı yansıtıyor, bu yüzden mevsim eğrisine uydurulmadı. Parametreler değişmedi: A 3, B 1, C 41.
- **F3:** /model/ yayında. Parametre tablosu PARAMS'tan üretiliyor. Canlı örnek hesap, yayımlanan puanla aynı çıkıyor. Kanıt rozetleri bu sayfaya bağlanıyor; menüde "Model" var.
- **F4:** `analysis/calibrate.py` iki model kuruyor: log(efor) offset'li Poisson/NB GLM ve GAM.
  - 30 seansın altında "yetersiz veri" raporlar.
  - Sahte veriyle 8 test geçiyor.
  - `calibrate.yml` haftalık çalışıp sonucu `meta.calibration_report`'a yazar; durum /admin/tahmin/'de görünür.
- **F5:** Isı haritasında iki görünüm var: "Puan" ve "Meraya özgü fark".
  - "Belirsizliği göster" varsayılan kapalı. Açılınca bant genişliği en yüksek üçte birdeki hücreleri işaretler; lejant ortalama bandı gösterir.
  - Haritanın altında seçili meranın özeti ve kısa takım önerisi var. Harita lejantına "Ölçülmüş alan sınırı" eklendi.
  - Düzeltme: 1200–1919 px'te görünmeyen Harita/Isı haritası sekmeleri artık görünüyor.
- Düzeltme: F0 takım kutusu yanlış fonksiyondan çağrılıyordu; canlıda gizli kalıyor ve saat değişince yenilenmiyordu. Artık her saat seçiminde çiziliyor.
- CPU: 63 merada canlı ölçüm /api/hours p50 14 ms, /api/windows 15 ms, /api/spots p50 9 / max 31 ms çıktı (sınır ~10 ms). Score job artık bu üç varsayılan yanıtı her saat için hazırlayıp D1 `meta` (`pub:*`) satırına yazıyor; Worker metni parse etmeden döndürüyor. Yönetici değişikliği ve seed bu satırları siliyor (canlı hesaba düşer). Sonra: isteklerin çoğu 0–2 ms; 5–14 ms'lik birkaç istek soğuk başlangıç.
- **Açık:** Hal tablosu (tarim.ibb.istanbul) ve Kökçek tezinin tam metni oturumdan indirilemedi (bağlantı kesildi / 503).

## Faz G — veri kalitesi, takım kutusu, liste düzeni, harita kalite katmanı, levrek Bölüm A (2026-10-31/11-01) ✅ DUR
- **G1 envanter:** aktif mera 63 → 60, otomatik eklenen 47 → 44.
  - Mera olmayan nesneler çıkarıldı:
    - Eski Turyol Armutlu Şubesi (şube);
    - BUDO (bina, suyla teması yok);
    - Mudanya İskelesi ve İDO Armutlu Merkez Terminali (karadaki feribot terminali noktaları).
  - Aynı nesnenin tekrarı (birleştirme değil):
    - Güzelyalı Yat Limani (yazım farkı) → tek kayıt "Güzelyalı Yat Limanı – liman içi";
    - Armutlu Devlet Limanı noktası (mendirekleri mera);
    - Armutlu İhlas Tatil Köyü İskelesi.
  - Liman eşiği: elenen 3 liman noktası suyun üzerinde ve havza ortası olarak yeniden değerlendirildi. Tirilye Limanı ve Büyükkumla İskelesi eklendi; üçüncüsü tekrar çıktı.
  - Her tip için Türkçe etiket tek kaynakta (`kindLabel`), "undefined" testle engellendi. Canlı `/api/spots` nedenlerinde 0.
- **G2 takım kutusu:**
  - "FC 0.8–1.2 numara (≈3–5 lb)"; tüm metin ve kayıtlı profil için birim denetimi.
  - Hedef derinlik diel koluna bağlı: gece yüzeye yakın (2–4 s), alacakaranlık orta su, gündüz dibe yakın.
  - Varsayılan sabit ajing kafası; gerçek jighead boyları; LRF 5 g'ye kadar, sonra spin.
  - İğne bedeli (#8 / #10) R19 künyesiyle; 6 senaryo test olarak sabit (TACKLE.md).
- **G3 liste ve ısı haritası:** önce yapılar; "Kumsallar (28)" daraltılabilir grup; aynı puan+bant tek satır ("2 dere ağzı aynı puan — genişlet"); eşit sıralar "30.–32. eşit".
- **G5 harita:**
  - Kök neden: "ölçülmüş blok" sanılan dikdörtgen, hatch görseli kaydedilmeden çizilen merkez karolardı. Veride Gemlik Körfezi'nin neredeyse tamamı EMODnet'te enterpolasyon; ölçülmüş alan açık Marmara tarafında.
  - Yeni gösterim:
    - ölçülmüş alan ince çerçeve + "ölçülmüş alan" yazısı;
    - ölçülmemiş bölgede kesikli soluk konturlar;
    - "Belirsiz derinlik" taraması isteğe bağlı (varsayılan kapalı);
    - lejant buna göre.
  - `check_tiles.py` tüm zoom seviyelerinde (8–14) ayrımı DTM'ye karşı denetliyor (0 hata); geodata'da zorunlu adım.
  - Kalabalık: zoom < 12'de yerleşim rozeti ("Armutlu · 23 mera", en iyi puan rengi, dokununca liste); halka yayma yalnız zoom ≥ 14 ve ≤ 8 mera.
- **G4 levrek Bölüm A** (`docs/species/levrek/`):
  - 22 kaynak (A 1, B 21), DOI'ler Crossref'le doğrulandı.
  - Veri denetimi; model taslağı (34 skaler parametre: B 3, geri kalanı C).
  - 5 yön testi geçti (`analysis/levrek_draft.py`, mock hava).
  - Takım kuralları; asgari boy 25 cm.
- **CPU:** önceden hazırlanan yanıtlar 3 saat ilerisini kapsıyordu. GitHub zamanlayıcısı gecikince canlı hesaba düşüyordu (p50 ~11–13 ms); artık 6 saat yazılıyor.

## Faz H — takım kuralı, uzunluk sağlığı, levrek uygulaması, ısı haritası, kordon (2026-11-01) ✅ DUR
- **H1 takım:**
  - Takım seçimini yalnız gereken gramaj belirler: ≤ 5 g LRF (5–6 g arası LRF 5 g), ≥ 6 g spin. Hamle yalnız atış notudur.
  - "Yan 25 km/sa + hamle 30" → LRF 3 g sabit.
  - İstavritte spin 6–10 g mikro metal jig / ağır jighead.
  - 2.000 rastgele girdide "spin < 6 g" ve "LRF > 5 g" hiç yok (test).
- **H2 uzunluk:**
  - Model OSM çevre uzunluğu yerine denize uzanan uzunluğu kullanıyor (kara/kıyı dışı kısım; kapalı yolda dönmüş dikdörtgenin uzun kenarı).
  - Etki 300 m'den sonra doyar (`len_sat_m`, C).
  - İDO Güzelyalı 960 → 222 m. Şüpheliler `docs/audit/length-audit.md`'de (3/16).
  - İlk 10 aynı saatte: sıra büyük ölçüde korundu, Mudanya 2 → 3, Armutlu uzun batı mendireği 11 → 10.
- **H3 levrek (deneysel):**
  - Motor `packages/scoring/src/v2/levrek.ts`: 43 parametre (B 3, C 40); lamba etkisi orta (C).
  - 6 yön testi gerçek motorla geçti.
  - D1 tür sütunu (migration 0013, şema v2.8); API `?species=`; önceden hazırlanmış yanıtlar her iki tür için.
  - Web: tür çipi, liste, ısı haritası, pencereler, harita, kart, /model/#levrek.
  - Levrek takım kutusu: varsayılan spin 6–32 g; sakin/sığ korunaklı yerde LRF; yasal asgari 25 cm.
  - Bildirim türleri ayarlarda. Kalibrasyon raporu tür başına.
- **H4:**
  - `docs/outreach/gemlik-batimetri-talep.md` (gönderilmedi).
  - Doğrulananlar: K. Kadir Eriş Prof. Dr.; Sabuncu 2017, Özmaral 2012, Filikci 2016.
  - Babayev 2015 bulunamadı.
  - Derinlik öncelik zinciri MODEL.md §13'te.
- **H5 ısı haritası:**
  - İki satırlı başlık ("Pazar 1 Kasım" / saatler); etiket çakışma kuralı ve testi.
  - Tam gün adları; ad sütunu 260 px; satır 24 px; ince "şimdi" çizgisi.
  - ≥ 1920 px'de geniş ısı haritası ve katlanır harita.
- **H6 kordon (taş tahkimat):**
  - Yeni mera tipi: kıyıya ≤ 25 m paralel tahkimat, deniz duvarı, sahil yolu ya da yaya yolu; 300–500 m parçalar.
  - Lamba önceliği: OSM sokak lambası yoğunluğu. Bölgede OSM'de lamba yok, bu yüzden tip önceliği 0,5 (C).
  - Tercihler: istavrit 0,70, levrek 0,65 (C).
  - Yerleşim raporu `docs/spots-candidates.md`: 30 kordon eklendi (Gemlik 10, Kurşunlu 9, Mudanya 5, Armutlu/Fıstıklı 6). Elenen 11 (10 zaten kumsal/kayalık, 1 access=no). Kumla, Narlı, Umurbey, Güzelyalı'da OSM etiketi yok.
  - Sanayi ve askeri sınırlar haritada.
  - Overpass yansıları `around.c` filtresini farklı işlediği için yollar bbox ile çekilip kıyı süzgeci yerelde uygulanıyor.

## Faz I — dürüst, sade, sınanabilir karar desteği (2026-11-03) — sürüyor
- Plan: `/root/.claude/plans/proje-av-livn-spicy-dragonfly.md` özeti `docs/AUDIT-I.md` §3'te. Adımlar I0–I10.
- [x] I0 Faz H kapanışı.
- [x] I1 `docs/AUDIT-I.md`: 23 bulgu, öncelik sırası, karar soruları.
- [x] I2 kritik hatalar: takım kutusu, astro check (+ Sahadayım api gölgeleme), WebGL2 notu, pencere/bildirim erişim süzgeci, güçlü/görece, eksik veri kuralları (MODEL §15), e2e (CI) — AUDIT-I #1–#6
- [x] I3 aydınlatma: üç durumlu ışık ve koşullu takım, takımda eksik veri ≠ sakin, feribot duyarlılığı (`docs/audit/lamp-sensitivity.json`: İDO gece 1.liği 27/30 saat → 0,5 önselle 0) ✅; Mapillary: 90 meranın 22'sinde görüntü var. 132 görüntü gözle incelendi; deniz tarafında direk görülen 5 mera 0,6 lamba bulgusu aldı. İDO ve diğer feribot iskelelerinde görüntü yok (`docs/audit/mapillary-review.md`) ✅
- [x] I4 kanıt sınıfları (`basis`), Peksu R19/R19b, mevsim yeniden sınıflı, akıntı bulunabilirlik/avlanabilirlik ayrımı, uzunluk tek sayım (ilk 10 önce/sonra `docs/audit/i4-length-top10.json`), saha derinliği ±30 m, Sentinel-2 sınıf atamıyor, `docs/DATA-SOURCES.md`, ek etkenler RESEARCH.md
- [~] I5 kapsam: BBOX batı 28,15, il etiketi (migration 0015), Bursa dışı rozeti / plan dışı, `docs/audit/coverage.md` kodu ✅; geodata çalıştırması ve sonuçlar bekliyor
- [~] I6 av günlüğü alanları (migration 0014), başlangıçta dondurma, düzenleme dondurmayı bozmaz, kalibrasyon yalnız ileriye dönük + zaman bölmeli test ✅; 1 Kasım seansı eklendi (`ses-retro-20261101-ido`) ✅; eşlenmiş çekimlerle sıralama kararlılığı (ilk 3 payı) ve veri yeterliliği API'de ✅; ayrık rozetler ve puan açıklaması ana ekranda (I9)
- [x] I7 takım: tek batış modeli (`v2/sink.ts` + saha k), saydırma aralığı, toplam atış ağırlığı uyarısı, PE varsayımı kaldırıldı; gece aydınlık/karanlık/bilinmiyor koşullu (I3)
- [x] I8 referans incelemesi `docs/REFERENCES-REVIEW.md` (Fishbrain, Windy.com, Navionics, 3 repo; doğrulanamayanlar işaretli)
- [x] I9 ana ekran: bugün → en yakın güçlü → görece kararı, tek ana öneri + takım görseli + gerekçe + sağlamlık rozetleri, ≤ 2 alternatif, açıklamalar açılır alanda; 390/360 px taşma 0 (e2e). Kalan: canlı ekran görüntüleri (I10)
- [ ] I10 teslim
