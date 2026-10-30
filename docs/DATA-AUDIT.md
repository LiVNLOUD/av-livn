# DATA-AUDIT — v2 veri katmanlarının gerçeklik denetimi

Durum: v2 Bölüm A, 2026-10-30. Script'ler `analysis/audit/`, ham çıktılar `docs/audit/`. Copernicus ve Overpass adımları Actions'ta çalıştı (`audit.yml`, [run 41093963924](https://github.com/LiVNLOUD/av-livn/actions/runs/41093963924)). Diğer adımlar oturumdan, açık servislerle çalıştı.

| Script | Çıktı |
|---|---|
| `dtm_audit.py` | `dtm_audit.json`, `dtm_transects.csv`, `dtm_transects.png` |
| `habitat_audit.py` | `habitat_audit.json` |
| `copernicus_audit.py` (Actions) | `copernicus.json` |
| `osm_audit.py` (Actions) | `osm_structures.json` |
| `land_polygons.sh` (Actions) | `data/osm/land_marmara.geojson` |
| `tip_audit.py` | `tip_audit.json` |
| `fetch_audit.py` | `fetch_rose.json` |

## 1. EMODnet DTM 2024 (~115 m)

**Kaynak payı** (bbox deniz hücreleri, 2024 source_references poligonları):

| Kaynak | Pay | `value_count` medyan | Enterpolasyonlu | Laplacian medyan (pürüzlülük) |
|---|---|---|---|---|
| GEBCO2024 (küresel dolgu) | %73.7 | 1 | %100 | 0.13 m |
| CDI ölçüm (Ifremer SISMER, EDMO 486) | %23.8 | 67 | %9 | 2.25 m |
| Coastal_heights_2024 (Deltares) | %2.0 | 3 | %100 | 1.59 m |
| poligon yok | %0.5 | 3 | %100 | 1.43 m |

- Toplam: 90 343 deniz hücresi; %79'u enterpolasyonlu (`interpolation_flag = 1`).
- **Quality Index:** WFS `emodnet:quality_index` katmanı var. Hücre bazında vekil olarak `interpolation_flag`, `value_count` ve kaynak poligonu kullanıldı.

**Kıyıya paralel eşit aralıklı kontur halkaları = enterpolasyon izi (kanıt):**
- GEBCO dolgusunun Laplacian'ı ölçüm hücrelerinden **17 kat düzgün** (0.13 m'ye karşı 2.25 m); hücrelerin %100'ü enterpolasyonlu ve hücre başına tek değer var.
- Halkalar bu düzgün alanda oluşuyor: derinlik kıyı mesafesiyle neredeyse doğrusal artıyor (GEBCO r = 0.75, eğim 2.3 m/100 m, artık SD 16 m).
- Ham "derinlik ↔ kıyı mesafesi" korelasyonu tek başına ayırt edici değil (CDI'de de r = 0.75). Ayırt edici olan pürüzlülük ve `value_count`.

**16 mera × 0–500 m transekt** (25 m adım; `dtm_transects.csv`, figür `dtm_transects.png`):
- 16 transektin hepsinde 0–500 m hücrelerin **%100'ü enterpolasyonlu**.
- Uç hücresi ya Coastal_heights kara hücresi (+0.03 m) ya da veri yok.
- İlk deniz hücresi uçtan 25–425 m uzakta.

**"200 m'de 0 m" kök nedeni:**
- 200 m'deki hücre ya hâlâ kara veya kıyı yükseklik hücresi (`elevation ≈ −0.03…0`, Coastal_heights veya kaynak yok), ya da GEBCO dolgusunun kıyıya doğru sıfıra yumuşattığı bir hücre.
- Ölçüm (CDI) hücresi hiçbir merada ilk 500 m'de yok.
- Sonuç: 0–2 m değerleri bir ölçüm değil, enterpolasyon ve kara maskesi ürünü.

**Feribot ve yolcu iskelesi zemin gerçeği testi:**
- OSM'de bbox'ta 8 feribot/yolcu terminali var (`osm_structures.json`): Mudanya İskelesi, BUDO, İDO Güzelyalı, İDO Armutlu ve Esenköy.
- Model meralarından iki feribot iskelesi:
  - **Mudanya İskelesi:** 200 m'de 1.96 m (GEBCO, enterpolasyonlu).
  - **İDO Güzelyalı:** 200 m'de −0.03 m (kara veya kaynak yok).
- Feribot yanaşan bir iskelenin ucunda derinlik birkaç metreden az olamaz. Bu yüzden 0–2 m değerleri **güvenilmez** olarak işaretlendi.
- **İDO/BUDO gemi su çekimi ya da iskele derinliği için açık kaynak bulunamadı.** Crossref, web araması ve İDO sayfaları sonuçları filo sayısı veriyor, su çekimi vermiyor.
- v2'de feribot iskelesi derinlik önseli ≥ 5 m (kanıt C, gerekçesi bu test).

## 2. Mera geometrisi: nokta uçta mı? (`tip_audit.json`)
- **Yöntem:** uç, OSM way düğümlerinden **ana karaya** en uzak olanı. Ana kara, 60 m aşındırılmış OSM kara poligonu; aşındırma, kıyı çizgisinin etrafından dolaştığı iskele ve mendirekleri ana karadan ayırır.
- **Sonuç: 10/16 nokta uçta (≤ 25 m), 6 nokta uçta değil:**
  - İDO Güzelyalı: 219 m, kökte
  - Burgaz mendireği: 175 m ve 91 m
  - Armutlu mendireği: 113 m ve 37 m
  - Petek Sitesi: 41 m
- **İDO Güzelyalı profilinin ilk ~125 m'si neden boş:** mera noktası iskelenin kökünde ve OSM kara poligonunun içinde. Normal boyunca ilk hücreler kara veya veri yok; DTM'de ilk deniz hücresi 300 m'de. Hücre bazında `dtm_transects.csv`'de görülür.
  - Nedenin bir kısmı yanlış düğüm (kök seçilmiş), bir kısmı kara maskesi.
  - **Bölüm B:** mera noktası `tip_audit.json`'daki uca taşınır; profil uçtan başlar.

## 3. Copernicus `mrm-500m_static` ve Marmara 500 m ürünleri (`copernicus.json`)

| Veri seti | Çözünürlük | bbox ıslak hücre | Gemlik Körfezi ıslak hücre | Derinlik seviyeleri | Zaman |
|---|---|---|---|---|---|
| `cmems_mod_blk_phy_anfc_mrm-500m_static` | 0.00625° (~500 m) | 2668 | 397 | — | — |
| `…phy-tem_anfc_mrm-500m_PT1H-i` | 500 m | 2588 | 379 | 1, 2, … 25 m (1 m adım) | saatlik; arşiv 2022-09 → ileri tahmin 2026-11-06 (≈ +7 gün) |
| `…phy-tem_anfc_mrm-500m_P1D-m` | 500 m | 2588 | 379 | aynı | günlük, 2021-11 → |
| `…phy-cur_anfc_mrm-500m_PT1H-i` | 500 m | — | — | 1–12 m | saatlik |
| `…phy-sal / ssh _mrm-500m_PT1H-i` | 500 m | — | — | — | saatlik |

- **Mera başına kıyıya en yakın ıslak hücre:** 0.06–0.78 km. En uzak: İDO 0.78 km, Burgaz 0.75 km ve 0.66 km.
- **DTM ile karşılaştırma:** Copernicus deptho Marmara'da 500 m. EMODnet DTM'den daha kaba ve kıyı şeridini çözmüyor; mera ölçeğinde (0–150 m atış) derinlik kaynağı olarak **kullanılamaz**. Su sıcaklığı ve akıntı için kullanılabilir (mera ıslak hücreye ≤ 0.8 km).

## 4. Su sıcaklığı klimatolojisi (`audit.yml`)

| Ürün | Gemlik Körfezi'ni kapsıyor mu? | Kanıt |
|---|---|---|
| BLKSEA_MULTIYEAR_PHY_007_004 (reanaliz 2.5 km, 1993 → 2025-07, P1M klimatoloji var) | **Hayır** | bbox'ta 0 ıslak hücre: Marmara bu ızgarada kara |
| SST_BS_SST_L4_REP_OBSERVATIONS_010_022 (0.05°, 1982 →) | **Hayır** | bbox'ta 0 ıslak hücre |
| SST_BS_SST(A)_L4_NRT_010_006 (0.0625°, 2008 →) | **Hayır** (körfez dışı kısmen) | bbox'ta 13 ıslak, Gemlik Körfezi'nde 0; meraya 1.5–29 km |
| ERA5 SST (0.25°) | Değerlendirildi, **uygun değil** | Gemlik Körfezi ~10 × 18 km, ızgara hücresinden küçük; bu oturumda veri indirilmedi (çözünürlük gerekçesi) |
| OSTIA (0.05°) | Muhtemelen hayır | Aynı sınıf L4; REP ürünü burada 0 hücre verdi. Doğrulanmadı. |
| MUR (0.01°, 2002 →) | Aday | Küresel 1 km. Erişim Earthdata hesabı ister; oturumdan doğrulanmadı. |
| **Copernicus anfc mrm-500m P1D kendi arşivi (2021-11 →)** | **Evet**, ~4 tam yıl | Körfezde 379 ıslak hücre. Reanaliz değil, analiz arşivi; kısa seri. |

**Karar (MODEL.md'ye işlendi):**
- v2 su sıcaklığı terimi **yalnız 48 sa değişim hızı** kullanır.
- Mevsim normaline göre sapma terimi **bayrakla ve düşük ağırlıkla**, Bölüm B2'de mrm-500m P1D arşivinden (2021-11 →) gün-of-yıl ortalaması kurulduktan sonra eklenebilir. Gerekçe: kapsayan bir reanaliz klimatolojisi yok; 4 yıllık analiz arşivi gerçek bir "normal" için kısa.

## 5. Taban tipi (EUSeaMap 2025, EMODnet Geology) ve biyojenik habitat (`habitat_audit.json`)

**EUSeaMap 2025 EUNIS-2019** (`eusm2025_eunis2019_full`, WFS):
- bbox'ta 540 poligon, alanın %42.2'si.
- Sınıf dağılımı (bbox alanının yüzdesi):
  - İnce çamur: %26.0
  - Kumlu çamur: %15.5
  - Çamurlu kum: %0.5
  - Diğer: <%0.4
- Kaya veya iri taban sınıfı yok.
- `eusm2025_subs_full` bu çalışma alanında yayınlanmıyor (400). `eusm2025_eunis2019_full` substrate alanı kullanıldı.

**Mera başına:**
- 12 mera poligon içinde; 4 mera poligona 9–76 m uzaklıkta (littoral boşluk küçük).
- Sınıflar: hepsi infralittoral; ince çamur veya kumlu çamur. Armutlu iskelesi, bir Armutlu mendireği ve İDO "Seabed" (sınıfsız).
- **Güven** (`eusm2025_subs_conf` WMS GetFeatureInfo `GRAY_INDEX`): 13 merada 2, 3 merada 0.
  - Lejantta etiket yok. 1 düşük / 2 orta / 3 yüksek okuması EUSeaMap güven şemasından yapılmış bir **yorumdur, doğrulanmadı**.
  - 0, "değer yok" olarak işlendi.
- **Not:** EUSeaMap atış mesafesindeki yapay yapıyı (iskele ayağı, mendirek taşı) çözmez. Mera ölçeğinde asıl sert zemin yapının kendisi.

**EMODnet Geology** (`gtk:seabed_substrate_1m`, 1:1M; 250k ve 100k bbox'ta boş):
- 2 poligon. Her merada "Mud to muddy sand" (Folk 5 sınıf); ince sınıflarda "no data".
- Ayırt edici değil.

**Biyojenik habitat:**
- `biogenic_substrate_poly_2025`: bbox'ta 3 kaba Posidonia poligonu (EUSeaMap 2016 kökenli). Hiçbiri meraya 2 km'den yakın değil.
- Biyojenik noktalar 0; seagrass EOV poligonları 0.
- **Mytilus yatakları için açık veri yok.**

## 6. Fetch (maruziyet gülü): OSM kara poligonu ve DTM maskesi (`fetch_rose.json`)
- **Yöntem:** uçtan 16 yön (22.5°). Vektör fetch = OSM land polygons (osmdata `land-polygons-split-4326`, Marmara'ya kırpılmış) ile ilk açık su şeridinin uzunluğu, tavan 100 km.
- **DTM maskesi:** `elevation ≥ 0` veya NaN = kara; 50 m adım.
- **Fark:** mera başına medyan |DTM − OSM| 0.16–2.7 km. Tek istisna Armutlu iç mendireği (#6): 13.7 km, DTM liman içini açık deniz sanıyor.
- DTM ızgarası bbox'la sınırlı: her merada 6–11 yön **kesik** (bbox dışına çıkıyor). Fetch için DTM maskesi kullanılamaz; yalnız karşılaştırma.
- **Açık yön sayısı** (OSM > 5 km): 1–8/16.
  - En korunaklı: Armutlu iç mendireği 1/16, Demirsubaşı 2/16, İslamköy 3/16.
  - En açık: Mudanya ve Tirilye 8/16.

## 7. Mera tablosu (özet)

| # | Mera | Nokta → uç | İlk deniz hücresi (DTM) | DTM 200 m (m) | 200 m kaynak | GEBCO payı 0–500 m | EUSeaMap (mesafe, güven) | Copernicus ıslak hücre | Açık yön | DTM–OSM fetch farkı |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | İskele (Kapaklı) | 0 m (uçta) | 75 m | 5.92 | Coastal_heights_2024 | %43 | İnce çamur (0, 2) | 0.25 km | 7/16 | 1.21 km |
| 2 | İskele (Armutlu) | 0 m (uçta) | 200 m | 7.09 | GEBCO2024 | %62 | Sınıfsız (0, 0) | 0.57 km | 6/16 | 0.16 km |
| 3 | Küçükkumla İskelesi | 0 m (uçta) | 300 m | 0.0 | yok | %19 | İnce çamur (0, 2) | 0.49 km | 6/16 | 0.51 km |
| 4 | Mudanya İskelesi | 0 m (uçta) | 150 m | 1.96 | GEBCO2024 | %76 | İnce çamur (0, 2) | 0.35 km | 8/16 | 0.27 km |
| 5 | Mendirek (Armutlu) | 37 m (uçta değil) | 225 m | −0.03 | Coastal_heights_2024 | %0 | Sınıfsız (0, 2) | 0.06 km | 6/16 | 0.22 km |
| 6 | Mendirek (Armutlu) | 113 m (uçta değil) | 425 m | — | yok | %0 | Kumlu çamur (0, 2) | 0.47 km | 1/16 | 13.7 km |
| 7 | Mendirek (Armutlu) | 21 m (uçta) | 225 m | −0.03 | yok | %38 | Kumlu çamur (0, 2) | 0.30 km | 7/16 | 0.24 km |
| 8 | İskele (Fıstıklı) | 0 m (uçta) | 75 m | 7.5 | Coastal_heights_2024 | %19 | Kumlu çamur (0, 2) | 0.28 km | 7/16 | 2.73 km |
| 9 | Mendirek (Armutlu) | 19 m (uçta) | 250 m | 0.0 | yok | %0 | Kumlu çamur (0, 2) | 0.31 km | 6/16 | 0.24 km |
| 10 | Petek Sitesi İskele | 41 m (uçta değil) | 175 m | 31.85 | Coastal_heights_2024 | %0 | İnce çamur (45 m, 2) | 0.18 km | 6/16 | 0.34 km |
| 11 | Mendirek (Güzelyalı Burgaz) | 175 m (uçta değil) | 300 m | −0.03 | yok | %24 | Kumlu çamur (53 m, 2) | 0.75 km | 6/16 | 0.25 km |
| 12 | Mendirek (Güzelyalı Burgaz) | 91 m (uçta değil) | 175 m | 1.52 | yok | %43 | Kumlu çamur (9 m, 0) | 0.66 km | 6/16 | 0.20 km |
| 13 | İskele (İslamköy) | 0 m (uçta) | 200 m | 6.61 | Coastal_heights_2024 | %0 | Kumlu çamur (0, 2) | 0.28 km | 3/16 | 0.71 km |
| 14 | İskele (Tirilye) | 6 m (uçta) | 125 m | 1.25 | yok | %52 | İnce çamur (0, 2) | 0.13 km | 8/16 | 0.26 km |
| 15 | İDO Güzelyalı Feribot İskelesi | 219 m (uçta değil) | 300 m | −0.03 | yok | %19 | Sınıfsız (76 m, 0) | 0.78 km | 6/16 | 0.24 km |
| 16 | İskele (Demirsubaşı) | 0 m (uçta) | 25 m | 2.4 | GEBCO2024 | %95 | İnce çamur (0, 2) | 0.12 km | 2/16 | 0.52 km |

- DTM sütunları saklı mera noktasından ölçüldü (uç taşınmadan önce).
- Petek Sitesi'nde 200 m'de 31.85 m: 175 m'de Coastal_heights hücresinden derin hücreye sıçrama. Tek hücrelik enterpolasyon artefaktı olabilir; saha ölçümü gerekiyor.

## 8. Sonuç tablosu

| Katman | Karar | Gerekçe |
|---|---|---|
| EMODnet DTM, mera 0–150 m derinliği | **Bayrakla kullanılabilir** (düşük güven, ağırlık 0.3) | 16/16 transekt %100 enterpolasyonlu; uçta kara/0 m; feribot iskelesinde 0–2 m. Saha ölçümü ve yapı önseli öncelikli. |
| EMODnet DTM, açık deniz konturları ve harita | **Bayrakla kullanılabilir** | GEBCO dolgusu (%74) taralı gösterilmeli (B3) |
| EMODnet DTM kara maskesi (fetch) | **Kullanılamaz** | bbox kesik (6–11 yön), liman içini açık deniz sayıyor |
| OSM land polygons (fetch, kıyı çizgisi) | **Kullanılabilir** | Vektör, Marmara geneli; uç kara içindeyse ilk su şeridi alınır |
| OSM yapı geometrisi (uç, uzunluk, tür) | **Kullanılabilir** | 6/16 nokta uca taşınmalı (B) |
| EUSeaMap 2025 EUNIS substrate | **Bayrakla kullanılabilir** | Kapsam iyi, ama yalnız çamur sınıfları (ayırt edici değil); güven etiketi doğrulanmadı |
| EMODnet Geology 1:1M | **Kullanılamaz** (mera ölçeği) | 2 poligon, tek sınıf |
| Biyojenik (Posidonia, Mytilus, seagrass) | **Kullanılamaz** | 3 kaba poligon, merada yok; Mytilus açık veri yok |
| Copernicus mrm-500m sıcaklık/akıntı (saatlik, 1–25 m) | **Kullanılabilir** | Gemlik'te 379 ıslak hücre; mera ≤ 0.8 km |
| Copernicus mrm-500m deptho | **Kullanılamaz** (mera derinliği) | 500 m; kıyı şeridini çözmüyor |
| Copernicus BS multiyear ve SST L4 REP/NRT (klimatoloji) | **Kullanılamaz** | Gemlik'te 0 hücre |
| mrm-500m P1D arşivi (2021-11 →) klimatoloji | **Bayrakla kullanılabilir** (B2) | Kısa seri, analiz arşivi |
| Open-Meteo Marine (dalga) | **Bayrakla kullanılabilir** | Kaba ızgara; maruziyet gülüyle ölçeklenir |
