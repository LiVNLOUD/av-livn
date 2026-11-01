# Levrek v1 taslak — duyarlılık (mock hava)

Üretildi: `python analysis/levrek_draft.py`. Hava **mock** (ocak, Gemlik Körfezi, sabit senaryolar); meralar `data/spots.geojson`
(63 kayıt; G1 temizliğinden önceki envanter olabilir). Yalnız tasarım doğrulaması: uygulamada levrek puanı yok.

## Senaryolara göre meralar arası yayılım

| Senaryo | min | medyan | max | en iyi tip (medyan) |
|---|---|---|---|---|
| sakin berrak gece | 49 | 62 | 76 | rocky (76) |
| fırtına ertesi bulanık gece | 54 | 69 | 84 | river_mouth (84) |
| öğle, sakin berrak | 35 | 48 | 62 | rocky (62) |
| yağış sonrası alacakaranlık | 55 | 69 | 84 | river_mouth (84) |
| kış ani soğuma gecesi | 44 | 58 | 72 | rocky (72) |
| fırtına sırasında | 30 | 30 | 76 | pier (30) |

## Tipe göre medyan (fırtına ertesi bulanık gece)

| Tip | n | medyan |
|---|---|---|
| river_mouth | 8 | 84 |
| rocky | 2 | 83 |
| breakwater | 6 | 78 |
| beach | 28 | 69 |
| pier | 10 | 65 |
| harbour | 9 | 57 |

## Yön testleri

| Test | Sonuç | Değerler |
|---|---|---|
| 1. fırtına ertesi bulanık su > berrak sakin su (kayalık, gece) | geçti | 83 > 76 |
| 2. alacakaranlık ve gece > öğle (kayalık, sakin) | geçti | 79, 76 > 62 |
| 3. yağış sonrası dere ağzı > açık kumsal | geçti | 84 > 69 |
| 4. kış ani soğuma (−3 °C/48 sa, 8,5 °C) puanı düşürür | geçti | 72 < 76 |
| 5. fırtına sırasında maruz mera güvenlik kapısında (≤ 30) | geçti | 30 ≤ 30 (Tirilye İskelesi) |

Ölçek: ideal senaryo 92, en kötü 8 (ham 0.841 / 0.1920).
