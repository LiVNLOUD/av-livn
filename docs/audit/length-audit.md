# Yapı uzunlukları denetimi (H2)

Otomatik üretilir: `python -m av_pipeline.spots.build_spots` (geodata.yml). Model artık **denize uzanan** uzunluğu kullanır
(kıyı çizgisinin 15 m bandı ve kara dışında kalan kısım; kapalı dış hatta en küçük dönmüş dikdörtgenin uzun kenarı).
Ham OSM uzunluğu kapalı yolda çevre uzunluğudur. Uzunluğun derinliğe etkisi 300 m'den sonra doyar (MODEL.md, `len_sat_m`, kanıt C).
Uydu görüntüsüyle karşılaştırma otomatik yapılmaz (kural): şüphelileri OSM bağlantısından görsel kontrol edin.

**Şüpheli: 3 / 22 yapı.**

| Yapı | Tip | OSM ham (m) | Denize uzanan (m) | Uç erişimi (m) | Bayrak | OSM |
|---|---|---|---|---|---|---|
| Güzelyalı Yat Limanı – doğu mendireği | breakwater | 1067 | 459 | 189 |  | [way/252356832](https://www.openstreetmap.org/way/252356832) |
| İDO Güzelyalı Feribot İskelesi | pier | 960 | 222 | 121 | OSM uzunluğu 960 m, denize uzanan yalnız 222 m (dış hat çevresi ya da kıyı boyunca rıhtım) | [way/503770078](https://www.openstreetmap.org/way/503770078) |
| Armutlu Devlet Limanı – uzun batı mendireği | breakwater | 930 | 353 | 214 |  | [way/1413355181](https://www.openstreetmap.org/way/1413355181) |
| Mudanya İskelesi | pier | 353 | 139 | 126 | OSM uzunluğu 353 m, denize uzanan yalnız 139 m (dış hat çevresi ya da kıyı boyunca rıhtım) | [way/1233883494](https://www.openstreetmap.org/way/1233883494) |
| Demirsubaşı İskelesi | pier | 353 | 152 | 160 | OSM uzunluğu 353 m, denize uzanan yalnız 152 m (dış hat çevresi ya da kıyı boyunca rıhtım) | [way/77362926](https://www.openstreetmap.org/way/77362926) |
| Armutlu Devlet Limanı – kısa batı mendireği | breakwater | 292 | 88 | 100 |  | [way/1422122108](https://www.openstreetmap.org/way/1422122108) |
| Kapaklı İskelesi (Kapaklı güneyi) | pier | 283 | 283 | 145 |  | [way/1005837524](https://www.openstreetmap.org/way/1005837524) |
| Güzelyalı Yat Limanı – batı mendireği | breakwater | 204 | 89 | 121 |  | [way/252356833](https://www.openstreetmap.org/way/252356833) |
| Fıstıklı İskelesi (Fıstıklı güneybatısı) | pier | 184 | 86 | 112 |  | [way/1414984335](https://www.openstreetmap.org/way/1414984335) |
| Kurşunlu – uzun batı mendireği | breakwater | 132 | 57 | 88 |  | [way/978867061](https://www.openstreetmap.org/way/978867061) |
| Küçükkumla İskelesi | pier | 128 | 38 | 67 |  | [way/1218507890](https://www.openstreetmap.org/way/1218507890) |
| Kurşunlu – uzun doğu mendireği | breakwater | 121 | 56 | 85 |  | [way/1104376819](https://www.openstreetmap.org/way/1104376819) |
| Kurşunlu – orta doğu mendireği | breakwater | 121 | 56 | 85 |  | [way/978867060](https://www.openstreetmap.org/way/978867060) |
| Kurşunlu – kısa doğu mendireği | breakwater | 119 | 53 | 84 |  | [way/1104376820](https://www.openstreetmap.org/way/1104376820) |
| Tirilye İskelesi | pier | 116 | 51 | 81 |  | [way/483965349](https://www.openstreetmap.org/way/483965349) |
| Armutlu Devlet Limanı – orta batı mendireği | breakwater | 112 | 112 | 109 |  | [way/1394208144](https://www.openstreetmap.org/way/1394208144) |
| Petek Sitesi İskele | pier | 99 | 40 | 64 |  | [way/1456975486](https://www.openstreetmap.org/way/1456975486) |
| Kurşunlu – orta batı mendireği | breakwater | 98 | 44 | 79 |  | [way/978867062](https://www.openstreetmap.org/way/978867062) |
| Armutlu İskelesi (Armutlu batısı) | pier | 93 | 42 | 73 |  | [way/1170373161](https://www.openstreetmap.org/way/1170373161) |
| Kurşunlu – kısa batı mendireği | breakwater | 84 | 38 | 74 |  | [way/978867059](https://www.openstreetmap.org/way/978867059) |
| Armutlu Devlet Limanı – doğu mendireği | breakwater | 64 | 64 | 60 |  | [way/1364814104](https://www.openstreetmap.org/way/1364814104) |
| İslamköy İskelesi (İslamköy batısı) | pier | 16 | 16 | 46 |  | [way/479047532](https://www.openstreetmap.org/way/479047532) |
