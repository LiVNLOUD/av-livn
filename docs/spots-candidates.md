# Mera adayları (D1)

Otomatik üretilir: `python -m av_pipeline.spots.inventory build` (geodata.yml). Adaylar `status = 'proposed'`:
puanlanmaz ve listede görünmez; haritada gri "aday" katmanında durur. `/admin/` sayfasında **Onayla** ile
mevcut meralara katılır (sonraki saatlik puanlamada), **Reddet** ile elenir. Kaynak © OpenStreetMap katkıcıları (ODbL).

**Toplam 41 aday.** Ticari liman/sanayi alanı (erişim yasak katmanı): 2.

| Tip | Aday |
|---|---|
| kumsal | 24 |
| liman / balıkçı barınağı | 7 |
| dere ağzı | 6 |
| bilinen yer (kullanıcı listesi) | 2 |
| kayalık kıyı | 2 |

| Yerleşim | Aday |
|---|---|
| Armutlu | 14 |
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
| Kumyaka | 1 |
| Kurşunlu | 1 |
| Narlı | 1 |
| — | 1 |

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
| Kumsal (Armutlu güneybatısı) | kumsal | Armutlu | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1394523720 |
| Kumsal (Armutlu güneybatısı) 2 | kumsal | Armutlu | acik (yerleşime 1405 m) | way/1394523720 |
| Kumsal (Armutlu güneybatısı) 3 | kumsal | Armutlu | acik (yerleşime 1113 m) | way/1394523720 |
| Kumsal (Armutlu güneydoğusu) | kumsal | Armutlu | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1392831837 |
| Kumsal (Armutlu güneydoğusu) 2 | kumsal | Armutlu | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1392831837 |
| Kumsal (Armutlu güneydoğusu) 3 | kumsal | Armutlu | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1392831837 |
| Kumsal (Armutlu güneydoğusu) 4 | kumsal | Armutlu | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1392831837 |
| Kumsal (Armutlu güneydoğusu) 5 | kumsal | Armutlu | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1393123413 |
| Kumsal (Armutlu güneyi) | kumsal | Armutlu | acik (yerleşime 1119 m) | way/1394208138 |
| Kumsal (Armutlu güneyi) 2 | kumsal | Armutlu | acik (yerleşime 1236 m) | way/1394208138 |
| Kumsal (Armutlu güneyi) 3 | kumsal | Armutlu | acik (yerleşime 1088 m) | way/1394523720 |
| Armutlu İskelesi | liman / balıkçı barınağı | Armutlu | kisitli_feribot (feribot iskelesi: sefer saatlerinde kısıtlı olabilir) | node/2590599404 |
| Eski Turyol Armutlu Şubesi | liman / balıkçı barınağı | Armutlu | kisitli_feribot (feribot iskelesi: sefer saatlerinde kısıtlı olabilir) | node/11132493095 |
| Boz Burnu | kayalık kıyı | Armutlu | belirsiz (kayalık: yürüyüş yolu bilinmiyor) | node/11981834876 |
| Büyükkumla İskelesi | liman / balıkçı barınağı | Büyükkumla | acik (yerleşime 248 m) | node/2794622004 |
| Büyükkumla Deresi ağzı | dere ağzı | Büyükkumla | acik (yerleşime 330 m) | way/681112515 |
| Karsak Çayı ağzı | dere ağzı | Dr.Ziya Kaya | acik (yerleşime 256 m) | way/700323582 |
| Kumsal (Fıstıklı batısı) | kumsal | Fıstıklı | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1391521782 |
| Kumsal (Fıstıklı batısı) 2 | kumsal | Fıstıklı | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1392831837 |
| Kumsal (Fıstıklı batısı) 3 | kumsal | Fıstıklı | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1414985743 |
| Kumsal (Fıstıklı güneybatısı) | kumsal | Fıstıklı | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1414985744 |
| Fıstıklı Deresi ağzı | dere ağzı | Fıstıklı | acik (yerleşime 1487 m) | way/698849100 |
| Güzelyalı Yat Limani | liman / balıkçı barınağı | Güzelyalı Burgaz | belirsiz (marina: giriş kısıtlı olabilir) | node/11450096002 |
| Kumsal (Güzelyalı Eğitim kuzeyi) | kumsal | Güzelyalı Eğitim | acik (yerleşime 200 m) | way/665674892 |
| Kumsal (Güzelyalı Siteler kuzeyi) | kumsal | Güzelyalı Siteler | acik (yerleşime 628 m) | way/1305691029 |
| Kumsal (Güzelyalı Yalı kuzeybatısı) | kumsal | Güzelyalı Yalı | acik (yerleşime 425 m) | way/1305691027 |
| Kumsal (Güzelyalı Yalı kuzeydoğusu) | kumsal | Güzelyalı Yalı | acik (yerleşime 165 m) | way/1305691023 |
| Kumsal (Kapaklı güneydoğusu) | kumsal | Kapaklı | acik (yerleşime 1044 m) | way/757494038 |
| Kapaklı Deresi ağzı | dere ağzı | Kapaklı | acik (yerleşime 337 m) | way/684554355 |
| Karacaali İskelesi | liman / balıkçı barınağı | Karacaali | acik (yerleşime 358 m) | node/13872728204 |
| Kumla Deresi ağzı | dere ağzı | Kumla | acik (yerleşime 312 m) | way/1218508014 |
| Dere ağzı (Kumsaz) | dere ağzı | Kumsaz | acik (yerleşime 255 m) | way/253063517 |
| Kumyaka kıyısı (konum tahmini) | bilinen yer (kullanıcı listesi) | Kumyaka | acik (kullanıcı listesi; konum yerleşime en yakın kıyı noktası, sahada düzeltin) |  |
| Kurşunlu Yat Limanı | liman / balıkçı barınağı | Kurşunlu | belirsiz (marina: giriş kısıtlı olabilir) | way/1165497962 |
| Narlı kıyısı (konum tahmini) | bilinen yer (kullanıcı listesi) | Narlı | acik (kullanıcı listesi; konum yerleşime en yakın kıyı noktası, sahada düzeltin) |  |
| Kumsal (Tirilye kuzeybatısı) | kumsal | Tirilye | acik (yerleşime 155 m) | way/519554786 |
| Tirilye Limanı | liman / balıkçı barınağı | Tirilye | belirsiz (marina: giriş kısıtlı olabilir) | node/11865648199 |
| Ayı Burnu | kayalık kıyı | — | belirsiz (kayalık: yürüyüş yolu bilinmiyor) | node/11981818601 |
| Kumsal (İslamköy kuzeybatısı) | kumsal | İslamköy | belirsiz (yerleşimden uzak (> 1,5 km)) | way/479047534 |
| Kumsal (İslamköy kuzeybatısı) 2 | kumsal | İslamköy | belirsiz (yerleşimden uzak (> 1,5 km)) | way/479047534 |
| Kumsal (İslamköy kuzeybatısı) 3 | kumsal | İslamköy | belirsiz (yerleşimden uzak (> 1,5 km)) | way/479047535 |

## Erişim yasak (ticari liman / sanayi)

| Ad | OSM |
|---|---|
| Borusan Port | node/825452158 |
| Borusan Port | way/588510511 |

## Neden Karacaali ve Büyükkumla iskeleleri listede yoktu?

İkisi de OpenStreetMap'te iskele *yolu* (`man_made=pier`) olarak değil, adı "… İskelesi" olan tek bir **nokta**
(`leisure=marina`) olarak çizilmiş. Harita etiket katmanı adlı liman/marina noktalarını gösterdiği için haritada
göründüler; mera listesi ise yalnız `man_made=pier|breakwater|groyne` **yollarından** üretiliyordu (uç noktası ve
uzunluk için çizgi gerekir). D1 envanteri nokta ve alan nesnelerini de alır; ikisi artık aday.

## Bilinen yerler (kullanıcı listesi)

- Eşkel: OSM'de yerleşim noktası yok
- **Kurşunlu:** 0 mevcut mera, 1 aday (≤ 2,5 km). osm-way-1165497962 Kurşunlu Yat Limanı (liman / balıkçı barınağı)
- **Gemlik:** 1 mevcut mera, 1 aday (≤ 2,5 km). osm-way-700323582 Karsak Çayı ağzı (dere ağzı)
- **Karacaali:** 0 mevcut mera, 3 aday (≤ 2,5 km). osm-node-13872728204 Karacaali İskelesi (liman / balıkçı barınağı); osm-node-2794622004 Büyükkumla İskelesi (liman / balıkçı barınağı); osm-way-681112515 Büyükkumla Deresi ağzı (dere ağzı)
- **Büyükkumla:** 1 mevcut mera, 4 aday (≤ 2,5 km). osm-node-13872728204 Karacaali İskelesi (liman / balıkçı barınağı); osm-node-2794622004 Büyükkumla İskelesi (liman / balıkçı barınağı); osm-way-1218508014 Kumla Deresi ağzı (dere ağzı); osm-way-681112515 Büyükkumla Deresi ağzı (dere ağzı)
- **Narlı:** 0 mevcut mera, 1 aday (≤ 2,5 km). known-narli Narlı kıyısı (konum tahmini) (bilinen yer (kullanıcı listesi))
- **Mudanya:** 1 mevcut mera, 0 aday (≤ 2,5 km). 
- **Kumyaka:** 1 mevcut mera, 2 aday (≤ 2,5 km). known-kumyaka Kumyaka kıyısı (konum tahmini) (bilinen yer (kullanıcı listesi)); osm-node-11865648199 Tirilye Limanı (liman / balıkçı barınağı)
- **Eşkel:** OSM'de yerleşim noktası yok.
