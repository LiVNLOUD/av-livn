# Veri kaynakları — ne ölçülüyor, ne modelleniyor, ne zaman geçersiz (I4)

Bu tablo kodla doğrulandı (dosya adları satırda). "Ölçüm", "bölgesel model", "dolaylı gösterge", "literatür" ve
"varsayım" ayrımı `packages/scoring/src/v2/params.ts` içindeki `basis` alanıyla aynıdır.

| Değişken | Kaynak | Tür | Katman / çözünürlük | Mera ile eşleşme | Geçerlilik kuralı | Kod |
|---|---|---|---|---|---|---|
| Su sıcaklığı | Copernicus Karadeniz/Marmara 500 m, `cmems_mod_blk_phy-tem_anfc_mrm-500m_PT1H-i` | bölgesel model (analiz + tahmin) | **0,5–20,5 m derinlik ortalaması**, saatlik; yüzey sıcaklığı değil | en yakın ıslak hücre; bugün tüm meralar ≤ 0,8 km | saat zaman damgasıyla eşlenir: seri −3 gün … +5 gün; kapsamadığı saatte Open-Meteo kalır; hücre > 2 km ise kullanılmaz (`OCEAN_MAX_KM`) | `pipeline/av_pipeline/ocean/marmara.py`, `workers/api/src/precompute_v2.ts` `applyOcean` |
| Akıntı | aynı model, `…phy-cur_anfc_mrm-500m_PT1H-i` | bölgesel model | **0,5–5,5 m ortalama hız** (yön kullanılmaz) | aynı hücre | aynı kural; ızgara sıcaklıkla uyuşmazsa akıntı atılır | aynı |
| Su sıcaklığı kısa normali | aynı modelin günlük analiz arşivi (2021–2026) | bölgesel model | 0,5–20,5 m, gün bazında | aynı | uzun dönem klimatoloji değil (kanıt C) | `marmara.py` `normal()` |
| Rüzgar, hamle, yön, bulut, yağış, basınç | Open-Meteo (DWD ICON) | küresel/bölgesel model | 10 m rüzgar, saatlik | meranın hava hücresi | eksikse saat "yok" seviyesine düşer, öneri verilmez (MODEL.md §15) | `workers/api/src/cron.ts`, `v2/data.ts` |
| Dalga | Open-Meteo Marine | model | anlamlı dalga yüksekliği | en yakın deniz noktası (kartta mesafe yazılır) | eksikse öneri yok | aynı |
| Derinlik | EMODnet DTM 2024 (~115 m hücre) | ölçüm hücresi ya da **enterpolasyon** | kıyıya 0–50 / 50–150 m bantları | mera ucu çevresi | enterpolasyonlu hücrenin ağırlığı 0,3 (`dtm_weight_interp`); saha ölçümü yalnız ±30 m çevresinde (`FIELD_REACH_M`) | `pipeline/av_pipeline/spots/build_spots.py`, `v2/model.ts` |
| Yapı uzunluğu | OpenStreetMap | dolaylı gösterge | denize uzanan uzunluk | yapı | yalnız derinlik önseline girer, 300 m'de doyar | `build_spots.py` `structure_length` |
| Dip tipi | EUSeaMap 2025 | bölgesel sınıflandırma | geniş sediment sınıfı (noktasal habitat değil) | mera noktası | güven sınıfıyla ağırlıklı | `pipeline/av_pipeline/habitat/` |
| Dip parlaklığı | Sentinel-2 L2A | dolaylı gösterge | 10 m piksel | uç 0–150 m su pikselleri, 800–1500 m açık su referansı | **dip sınıfı atanmaz**; açık/koyu yalnız not (derinlik, bulanıklık, gölge, yansıma ayırt edilemez) | `desk/sentinel2.py` |
| İskele lambası | saha > uzaktan > masa başı (OSM `street_lamp`, Mapillary incelemesi) > tip önseli | ölçüm / dolaylı / varsayım | — | mera | görüntü yokluğu "lamba yok" değildir; fener (`seamark:light`) puan artırmaz | `desk/osm_lamps.py`, `data/lighting/mapillary.json` |

**Diğer etkenler (puana eklenmedi):** oksijen, tuzluluk/tabakalaşma, klorofil, yem organizmaları, dere debisi, su seviyesi.
Gerekçe ve öncelik `docs/RESEARCH.md` "Faz I — ek etkenler" bölümünde.
