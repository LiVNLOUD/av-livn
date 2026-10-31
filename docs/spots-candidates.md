# Mera adayları (D1)

Otomatik üretilir: `python -m av_pipeline.spots.inventory build` (geodata.yml). Adaylar `status = 'proposed'`:
puanlanmaz ve listede görünmez; haritada gri "aday" katmanında durur. `/admin/` sayfasında **Onayla** ile
mevcut meralara katılır (sonraki saatlik puanlamada), **Reddet** ile elenir. Kaynak © OpenStreetMap katkıcıları (ODbL).

**Toplam 37 aday.** Ticari liman/sanayi alanı (erişim yasak katmanı): 2.

| Tip | Aday |
|---|---|
| kumsal | 24 |
| liman / balıkçı barınağı | 7 |
| dere ağzı | 6 |

| Yerleşim | Aday |
|---|---|
| Armutlu | 13 |
| Fıstıklı | 5 |
| İslamköy | 3 |
| Büyükkumla | 2 |
| Güzelyalı Yalı | 2 |
| Kapaklı | 2 |
| Tirilye | 2 |
| Dr.Ziya Kaya | 1 |
| Güzelyalı Burgaz | 1 |
| Güzelyalı Eğitim | 1 |
| Güzelyalı Siteler | 1 |
| Karacaali | 1 |
| Kumla | 1 |
| Kumsaz | 1 |
| Kurşunlu | 1 |

## Yeni tipler için istavrit tercih değerleri (kanıt C, literatür yok)

| Tip | Yapı terimi | Lamba önseli | Derinlik önseli |
|---|---|---|---|
| rıhtım (quay) | iskele ile aynı (0.75 × uzunluk) | 0.5 | iskele formülü |
| liman / balıkçı barınağı | 0.80 | 0.6 | 3 m |
| kayalık kıyı | 0.80 (doğal kaya) | 0.1 | 2.5 m |
| dere ağzı | 0.60 | 0.15 | 1 m |
| kumsal | 0.45 | 0.2 | 1.2 m |

Kıyı tiplerinde yapı uzunluğu yoktur; uzunluk çarpanı 150 m'lik bir yapınınkine sabitlenir. Değerler sezgiseldir
(istavrit yapı/sert zemin ve ışık çevresinde toplanır; kumsalda açık su). Av günlüğüyle kalibre edilecek.

## Adaylar

| Ad | Tip | Yerleşim | Erişim tahmini | OSM |
|---|---|---|---|---|
| Kumsal (Armutlu güneybatısu) | kumsal | Armutlu | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1394523720 |
| Kumsal (Armutlu güneybatısu) 2 | kumsal | Armutlu | acik (yerleşime 1405 m) | way/1394523720 |
| Kumsal (Armutlu güneybatısu) 3 | kumsal | Armutlu | acik (yerleşime 1113 m) | way/1394523720 |
| Kumsal (Armutlu güneydoğusu) | kumsal | Armutlu | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1392831837 |
| Kumsal (Armutlu güneydoğusu) 2 | kumsal | Armutlu | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1392831837 |
| Kumsal (Armutlu güneydoğusu) 3 | kumsal | Armutlu | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1392831837 |
| Kumsal (Armutlu güneydoğusu) 4 | kumsal | Armutlu | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1392831837 |
| Kumsal (Armutlu güneydoğusu) 5 | kumsal | Armutlu | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1393123413 |
| Kumsal (Armutlu güneysu) | kumsal | Armutlu | acik (yerleşime 1119 m) | way/1394208138 |
| Kumsal (Armutlu güneysu) 2 | kumsal | Armutlu | acik (yerleşime 1236 m) | way/1394208138 |
| Kumsal (Armutlu güneysu) 3 | kumsal | Armutlu | acik (yerleşime 1088 m) | way/1394523720 |
| Armutlu İskelesi | liman / balıkçı barınağı | Armutlu | kisitli_feribot (feribot iskelesi: sefer saatlerinde kısıtlı olabilir) | node/2590599404 |
| Eski Turyol Armutlu Şubesi | liman / balıkçı barınağı | Armutlu | kisitli_feribot (feribot iskelesi: sefer saatlerinde kısıtlı olabilir) | node/11132493095 |
| Büyükkumla İskelesi | liman / balıkçı barınağı | Büyükkumla | belirsiz (OSM access=private ya da özel marina) | node/2794622004 |
| Büyükkumla Deresi ağzı | dere ağzı | Büyükkumla | acik (yerleşime 330 m) | way/681112515 |
| Karsak Çayı ağzı | dere ağzı | Dr.Ziya Kaya | acik (yerleşime 256 m) | way/700323582 |
| Kumsal (Fıstıklı batısu) | kumsal | Fıstıklı | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1391521782 |
| Kumsal (Fıstıklı batısu) 2 | kumsal | Fıstıklı | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1392831837 |
| Kumsal (Fıstıklı batısu) 3 | kumsal | Fıstıklı | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1414985743 |
| Kumsal (Fıstıklı güneybatısu) | kumsal | Fıstıklı | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1414985744 |
| Fıstıklı Deresi ağzı | dere ağzı | Fıstıklı | acik (yerleşime 1487 m) | way/698849100 |
| Güzelyalı Yat Limani | liman / balıkçı barınağı | Güzelyalı Burgaz | belirsiz (OSM access=private ya da özel marina) | node/11450096002 |
| Kumsal (Güzelyalı Eğitim kuzeysu) | kumsal | Güzelyalı Eğitim | acik (yerleşime 200 m) | way/665674892 |
| Kumsal (Güzelyalı Siteler kuzeysu) | kumsal | Güzelyalı Siteler | acik (yerleşime 628 m) | way/1305691029 |
| Kumsal (Güzelyalı Yalı kuzeybatısu) | kumsal | Güzelyalı Yalı | acik (yerleşime 425 m) | way/1305691027 |
| Kumsal (Güzelyalı Yalı kuzeydoğusu) | kumsal | Güzelyalı Yalı | acik (yerleşime 165 m) | way/1305691023 |
| Kumsal (Kapaklı güneydoğusu) | kumsal | Kapaklı | acik (yerleşime 1044 m) | way/757494038 |
| Kapaklı Deresi ağzı | dere ağzı | Kapaklı | acik (yerleşime 337 m) | way/684554355 |
| Karacaali İskelesi | liman / balıkçı barınağı | Karacaali | belirsiz (OSM access=private ya da özel marina) | node/13872728204 |
| Kumla Deresi ağzı | dere ağzı | Kumla | acik (yerleşime 312 m) | way/1218508014 |
| Dere ağzı (Kumsaz) | dere ağzı | Kumsaz | acik (yerleşime 255 m) | way/253063517 |
| Kurşunlu Yat Limanı | liman / balıkçı barınağı | Kurşunlu | belirsiz (OSM access=private ya da özel marina) | way/1165497962 |
| Kumsal (Tirilye kuzeybatısu) | kumsal | Tirilye | acik (yerleşime 155 m) | way/519554786 |
| Tirilye Limanı | liman / balıkçı barınağı | Tirilye | belirsiz (OSM access=private ya da özel marina) | node/11865648199 |
| Kumsal (İslamköy kuzeybatısu) | kumsal | İslamköy | belirsiz (yerleşimden uzak (> 1,5 km)) | way/479047534 |
| Kumsal (İslamköy kuzeybatısu) 2 | kumsal | İslamköy | belirsiz (yerleşimden uzak (> 1,5 km)) | way/479047534 |
| Kumsal (İslamköy kuzeybatısu) 3 | kumsal | İslamköy | belirsiz (yerleşimden uzak (> 1,5 km)) | way/479047535 |

## Erişim yasak (ticari liman / sanayi)

| Ad | OSM |
|---|---|
| Borusan Port | node/825452158 |
| Borusan Port | way/588510511 |

## Bilinen yerler (kullanıcı listesi)

- **Kurşunlu:** 0 mevcut mera, 1 aday (≤ 2,5 km). osm-way-1165497962 Kurşunlu Yat Limanı (liman / balıkçı barınağı)
- **Gemlik:** 1 mevcut mera, 1 aday (≤ 2,5 km). osm-way-700323582 Karsak Çayı ağzı (dere ağzı)
- **Karacaali:** 0 mevcut mera, 3 aday (≤ 2,5 km). osm-node-13872728204 Karacaali İskelesi (liman / balıkçı barınağı); osm-node-2794622004 Büyükkumla İskelesi (liman / balıkçı barınağı); osm-way-681112515 Büyükkumla Deresi ağzı (dere ağzı)
- **Büyükkumla:** 1 mevcut mera, 4 aday (≤ 2,5 km). osm-node-13872728204 Karacaali İskelesi (liman / balıkçı barınağı); osm-node-2794622004 Büyükkumla İskelesi (liman / balıkçı barınağı); osm-way-1218508014 Kumla Deresi ağzı (dere ağzı); osm-way-681112515 Büyükkumla Deresi ağzı (dere ağzı)
- **Narlı:** 0 mevcut mera, 0 aday (≤ 2,5 km). 
- **Mudanya:** 1 mevcut mera, 0 aday (≤ 2,5 km). 
- **Kumyaka:** 1 mevcut mera, 1 aday (≤ 2,5 km). osm-node-11865648199 Tirilye Limanı (liman / balıkçı barınağı)
- **Eşkel:** OSM'de yerleşim noktası yok.
