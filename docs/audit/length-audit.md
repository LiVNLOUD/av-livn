# Yapı uzunlukları denetimi (H2)

Otomatik üretilir: `python -m av_pipeline.spots.build_spots` (geodata.yml). Model artık **denize uzanan** uzunluğu kullanır
(kıyı çizgisinin 15 m bandı ve kara dışında kalan kısım; kapalı dış hatta en küçük dönmüş dikdörtgenin uzun kenarı).
Ham OSM uzunluğu kapalı yolda çevre uzunluğudur. Uzunluğun derinliğe etkisi 300 m'den sonra doyar (MODEL.md, `len_sat_m`, kanıt C).
Uydu görüntüsüyle karşılaştırma otomatik yapılmaz (kural): şüphelileri OSM bağlantısından görsel kontrol edin.

**Şüpheli: 11 / 16 yapı.**

| Yapı | Tip | OSM ham (m) | Denize uzanan (m) | Uç erişimi (m) | Bayrak | OSM |
|---|---|---|---|---|---|---|
| Güzelyalı Yat Limanı – doğu mendireği | breakwater | 1067 | 0 | 33 | denize uzanan 0 m < beklenen alt sınır 20 m | [way/252356832](https://www.openstreetmap.org/way/252356832) |
| İDO Güzelyalı Feribot İskelesi | pier | 960 | 0 | 73 | OSM uzunluğu 960 m, denize uzanan yalnız 0 m (dış hat çevresi ya da kıyı boyunca rıhtım) | [way/503770078](https://www.openstreetmap.org/way/503770078) |
| Armutlu Devlet Limanı – uzun batı mendireği | breakwater | 930 | 0 | 14 | denize uzanan 0 m < beklenen alt sınır 20 m | [way/1413355181](https://www.openstreetmap.org/way/1413355181) |
| Mudanya İskelesi | pier | 353 | 0 | 2 | OSM uzunluğu 353 m, denize uzanan yalnız 0 m (dış hat çevresi ya da kıyı boyunca rıhtım) | [way/1233883494](https://www.openstreetmap.org/way/1233883494) |
| Demirsubaşı İskelesi | pier | 353 | 122 | 130 | OSM uzunluğu 353 m, denize uzanan yalnız 122 m (dış hat çevresi ya da kıyı boyunca rıhtım) | [way/77362926](https://www.openstreetmap.org/way/77362926) |
| Armutlu Devlet Limanı – orta batı mendireği | breakwater | 292 | 0 | 10 | denize uzanan 0 m < beklenen alt sınır 20 m | [way/1422122108](https://www.openstreetmap.org/way/1422122108) |
| Kapaklı İskelesi (Kapaklı güneyi) | pier | 283 | 266 | 115 |  | [way/1005837524](https://www.openstreetmap.org/way/1005837524) |
| Güzelyalı Yat Limanı – batı mendireği | breakwater | 204 | 0 | 0 | denize uzanan 0 m < beklenen alt sınır 20 m | [way/252356833](https://www.openstreetmap.org/way/252356833) |
| Fıstıklı İskelesi (Fıstıklı güneybatısı) | pier | 184 | 70 | 81 |  | [way/1414984335](https://www.openstreetmap.org/way/1414984335) |
| Küçükkumla İskelesi | pier | 128 | 38 | 37 |  | [way/1218507890](https://www.openstreetmap.org/way/1218507890) |
| Tirilye İskelesi | pier | 116 | 36 | 51 |  | [way/483965349](https://www.openstreetmap.org/way/483965349) |
| Armutlu Devlet Limanı – kısa batı mendireği | breakwater | 112 | 0 | 11 | denize uzanan 0 m < beklenen alt sınır 20 m | [way/1394208144](https://www.openstreetmap.org/way/1394208144) |
| Petek Sitesi İskele | pier | 99 | 0 | 6 | denize uzanan 0 m < beklenen alt sınır 10 m | [way/1456975486](https://www.openstreetmap.org/way/1456975486) |
| Armutlu İskelesi (Armutlu batısı) | pier | 93 | 27 | 42 |  | [way/1170373161](https://www.openstreetmap.org/way/1170373161) |
| Armutlu Devlet Limanı – doğu mendireği | breakwater | 64 | 0 | 13 | denize uzanan 0 m < beklenen alt sınır 20 m | [way/1364814104](https://www.openstreetmap.org/way/1364814104) |
| İslamköy İskelesi (İslamköy batısı) | pier | 16 | 1 | 16 | denize uzanan 1 m < beklenen alt sınır 10 m | [way/479047532](https://www.openstreetmap.org/way/479047532) |
