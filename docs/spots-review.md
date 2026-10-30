# Mera inceleme listesi

Sahada doğrulama için aday meralar. Üretildi: 2026-10-30 14:58 UTC, `node scripts/spots-review.mjs`.

- **Kıyı normali:** meranın denize baktığı yön. DTM'de su varsa en hızlı derinleşen yön (5° adım); yoksa OSM'den (iskele/mahmuzda kökten uca, mendirekte 300 m'lik kıyı ortalaması). OSM değeri karşılaştırma için parantezde.
- **Deniz noktası:** uçtan normal yönünde Open-Meteo Marine için seçilen nokta ve uca uzaklığı.
- **Open-Meteo kayması:** Marine modelinin deniz noktası yerine kullandığı grid noktasının uzaklığı. Büyükse dalga/su/akıntı başka bir yerin verisidir.
- **Lamba:** `?` = bilinmiyor; puanda lambasız sayılır. Admin formundan (`/admin/`) güncellenir.
- ⚠: OSM kıyı çizgisi yöntemiyle deniz noktası bulunamadı (3 mera); F2'de nokta DTM ile (normal boyunca su olan ilk mesafe veya ≥5 m derinlik) konuldu.
- **Derinlik 200 m:** EMODnet DTM (~115 m) kıyıya yakın hücreleri sığ/0'a doğru yumuşatır; sahadaki gerçek derinlik genellikle daha fazladır.

| # | Ad | Tür | Koordinat | Harita | Kıyı normali | Normal kaynağı | Deniz noktası | Nokta kaynağı | Open-Meteo kayması | Lamba | Derinlik 200 m |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | İskele (Kapaklı) | İskele | 40.45773, 28.97090 | [harita](https://www.google.com/maps?q=40.457728,28.970898) | 215° GB | DTM (OSM 148°) | 753 m | DTM normali | – | ? | 3.4 m |
| 2 | İskele (Armutlu) | İskele | 40.51731, 28.78977 | [harita](https://www.google.com/maps?q=40.517312,28.789766) | 190° G | DTM (OSM 172°) | 754 m | DTM normali | 3.5 km | ? | 4.2 m |
| 3 | Küçükkumla İskelesi | İskele | 40.46665, 29.10188 | [harita](https://www.google.com/maps?q=40.466648,29.101885) | 215° GB | DTM (OSM 132°) | 753 m | DTM normali | 4.7 km | ? | 0.0 m |
| 4 | Mudanya İskelesi | İskele | 40.37511, 28.88961 | [harita](https://www.google.com/maps?q=40.375108,28.889607) | 45° KD | DTM (OSM 52°) | 753 m | DTM normali | 8.9 km | ? | 2.0 m |
| 5 | Mendirek (Armutlu) | Mendirek | 40.50604, 28.84933 | [harita](https://www.google.com/maps?q=40.506039,28.849330) | 195° G | DTM (OSM 196°) | 754 m | DTM normali | 5.2 km | ? | 0.4 m |
| 6 | Mendirek (Armutlu) | Mendirek | 40.50981, 28.82821 | [harita](https://www.google.com/maps?q=40.509813,28.828213) | 170° G | OSM | 755 m | kıyı normali | 6.3 km | ? | – |
| 7 | Mendirek (Armutlu) | Mendirek | 40.50813, 28.82864 | [harita](https://www.google.com/maps?q=40.508129,28.828639) | 180° G | DTM (OSM 80°) | 755 m | ⚠ DTM ile bulundu | 6.2 km | ? | 0.5 m |
| 8 | İskele (Fıstıklı) | İskele | 40.48572, 28.87729 | [harita](https://www.google.com/maps?q=40.485724,28.877289) | 230° GB | DTM (OSM 244°) | 751 m | DTM normali | 2.6 km | ? | 8.4 m |
| 9 | Mendirek (Armutlu) | Mendirek | 40.50907, 28.82474 | [harita](https://www.google.com/maps?q=40.509072,28.824744) | 215° GB | DTM (OSM 231°) | 753 m | DTM normali | 4.9 km | ? | 0.3 m |
| 10 | Petek Sitesi İskele | İskele | 40.38079, 28.84796 | [harita](https://www.google.com/maps?q=40.380793,28.847960) | 10° K | DTM (OSM 170°) | 754 m | ⚠ DTM ile bulundu | – | ? | 23.6 m |
| 11 | Mendirek (Güzelyalı Burgaz) | Mendirek | 40.35583, 28.93012 | [harita](https://www.google.com/maps?q=40.355826,28.930124) | 0° K | DTM (OSM 73°) | 754 m | DTM normali | 10.9 km | ? | 0.0 m |
| 12 | Mendirek (Güzelyalı Burgaz) | Mendirek | 40.35678, 28.92909 | [harita](https://www.google.com/maps?q=40.356780,28.929093) | 5° K | DTM (OSM 63°) | 754 m | DTM normali | 10.8 km | ? | 1.1 m |
| 13 | İskele (İslamköy) | İskele | 40.41717, 29.09121 | [harita](https://www.google.com/maps?q=40.417167,29.091209) | 10° K | DTM (OSM 320°) | 754 m | DTM normali | 5.8 km | ? | 5.7 m |
| 14 | İskele (Tirilye) | İskele | 40.39375, 28.79843 | [harita](https://www.google.com/maps?q=40.393749,28.798426) | 0° K | DTM (OSM 26°) | 754 m | DTM normali | 6.5 km | ? | 2.1 m |
| 15 | İDO Güzelyalı Feribot İskelesi | İskele | 40.35573, 28.92871 | [harita](https://www.google.com/maps?q=40.355731,28.928711) | 5° K | DTM (OSM 143°) | 754 m | ⚠ DTM ile bulundu | 10.9 km | ? | 0.0 m |
| 16 | İskele (Demirsubaşı) | İskele | 40.43174, 29.15126 | [harita](https://www.google.com/maps?q=40.431742,29.151263) | 255° B | DTM (OSM 257°) | 750 m | DTM normali | 9.1 km | ? | 3.2 m |
