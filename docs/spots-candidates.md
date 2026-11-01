# Otomatik eklenen meralar (F1)

Otomatik üretilir: `python -m av_pipeline.spots.inventory build` (geodata.yml). Onay adımı yok: kontrollerden geçen
her yer doğrudan aktif mera olur ve v2 modelle puanlanır; kartta "otomatik eklendi — sahada doğrulanmadı" yazar.
Yönetici bir merayı herkesten gizleyebilir ve `/admin/` "Gizlenenler" listesinden geri alabilir. Kaynak © OpenStreetMap katkıcıları (ODbL).

**Kontroller:** a) OSM nesnesi kıyı çizgisine ≤ 30 m; b) `access=private|no`, askeri alan, sanayi alanı, ticari liman ve
yönetici yasak alanları içinde değil; c) kumsala md. 16/5 tarihli uyarı rozeti (kesin yasak değil); d) 150 m içindeki aynı
tip meralar ayrı kalır, birbirine "yakın mera" bağlantısı alır. Yalnız aynı noktanın kopyası (≤ 25 m) atılır.
G1: liman/marina çokgeni kenarına göre ölçülür; çokgensiz liman noktası suyun üzerindeyse havza ortası sayılır (≤ 150 m).

**Eklenen: 73 mera.** Elenen: 4. Ticari liman (erişim yasak katmanı): 28.

| Tip | Eklenen |
|---|---|
| kordon (taş tahkimat) | 30 |
| kumsal | 28 |
| dere ağzı | 8 |
| liman / balıkçı barınağı | 5 |
| kayalık kıyı | 2 |

| Yerleşim | Eklenen |
|---|---|
| Armutlu | 21 |
| Fıstıklı | 7 |
| Kurşunlu | 7 |
| Kumsaz | 4 |
| İslamköy | 3 |
| Büyükkumla | 2 |
| Cumhuriyet | 2 |
| Demirsubaşı | 2 |
| Dr.Ziya Kaya | 2 |
| Güzelyalı Siteler | 2 |
| Güzelyalı Yalı | 2 |
| Hasanbey | 2 |
| Kapaklı | 2 |
| Orhaniye | 2 |
| Tirilye | 2 |
| Ömerbey Mah. | 2 |
| Balıkpazarı | 1 |
| Güzelyalı Burgaz | 1 |
| Güzelyalı Eğitim | 1 |
| Hisar | 1 |
| Karacaali | 1 |
| Kayhan | 1 |
| Kumla | 1 |
| Kumyaka | 1 |
| — | 1 |

## Yeni tipler için istavrit tercih değerleri (kanıt C, literatür yok)

| Tip | Yapı terimi | Lamba önseli | Derinlik önseli |
|---|---|---|---|
| rıhtım (quay) | iskele ile aynı (0.75 × uzunluk) | 0.5 | iskele formülü |
| liman / balıkçı barınağı | 0.80 | 0.6 | 3 m |
| kayalık kıyı | 0.80 (doğal kaya) | 0.1 | 2.5 m |
| dere ağzı | 0.60 | 0.15 | 1 m |
| kumsal | 0.45 | 0.2 | 1.2 m |
| kordon (taş tahkimat) | 0.70 (levrek 0.65) | OSM sokak lambası yoğunluğu, 0.2–0.85 | 2 m |

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
| Kumsal (Armutlu güneydoğusu) 5 | kumsal | Armutlu | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1392831837 |
| Kumsal (Armutlu güneydoğusu) 6 | kumsal | Armutlu | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1393123413 |
| Kumsal (Armutlu güneydoğusu) 7 | kumsal | Armutlu | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1393123413 |
| Kumsal (Armutlu güneyi) | kumsal | Armutlu | acik (yerleşime 1119 m) | way/1394208138 |
| Kumsal (Armutlu güneyi) 2 | kumsal | Armutlu | acik (yerleşime 1236 m) | way/1394208138 |
| Kumsal (Armutlu güneyi) 3 | kumsal | Armutlu | acik (yerleşime 1088 m) | way/1394523720 |
| Armutlu İskelesi | liman / balıkçı barınağı | Armutlu | kisitli_feribot (feribot iskelesi: sefer saatlerinde kısıtlı olabilir) | node/2590599404 |
| Kordon (Armutlu batısı) | kordon (taş tahkimat) | Armutlu | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1170373160 |
| Kordon (Armutlu batısı) 2 | kordon (taş tahkimat) | Armutlu | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1170373160 |
| Kordon (Armutlu batısı) 3 | kordon (taş tahkimat) | Armutlu | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1170373160 |
| Kordon (Armutlu batısı) 4 | kordon (taş tahkimat) | Armutlu | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1413355183 |
| Kordon (Armutlu güneydoğusu) | kordon (taş tahkimat) | Armutlu | acik (yerleşime 1484 m) | way/428743002 |
| Bülbül Deresi ağzı | dere ağzı | Armutlu | acik (yerleşime 1090 m) | way/253083807 |
| Kayalık kıyı (Armutlu güneydoğusu) | kayalık kıyı | Armutlu | belirsiz (kayalık: yürüyüş yolu bilinmiyor) | way/1422351411 |
| Kordon (Balıkpazarı güneybatısı) | kordon (taş tahkimat) | Balıkpazarı | acik (yerleşime 69 m) | way/1217216676 |
| Büyükkumla İskelesi | liman / balıkçı barınağı | Büyükkumla | acik (yerleşime 248 m) | node/2794622004 |
| Büyükkumla Deresi ağzı | dere ağzı | Büyükkumla | acik (yerleşime 330 m) | way/681112515 |
| Kordon (Cumhuriyet batısı) | kordon (taş tahkimat) | Cumhuriyet | acik (yerleşime 422 m) | way/1217216676 |
| Kordon (Cumhuriyet güneyi) | kordon (taş tahkimat) | Cumhuriyet | acik (yerleşime 292 m) | way/1217216676 |
| Kordon (Demirsubaşı güneybatısı) | kordon (taş tahkimat) | Demirsubaşı | acik (yerleşime 164 m) | way/1500766926 |
| Kordon (Demirsubaşı güneyi) | kordon (taş tahkimat) | Demirsubaşı | acik (yerleşime 277 m) | way/1217216668 |
| Kordon (Dr.Ziya Kaya batısı) | kordon (taş tahkimat) | Dr.Ziya Kaya | acik (yerleşime 177 m) | way/1217216668 |
| Karsak Çayı ağzı | dere ağzı | Dr.Ziya Kaya | acik (yerleşime 256 m) | way/700323582 |
| Kumsal (Fıstıklı batısı) | kumsal | Fıstıklı | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1391521782 |
| Kumsal (Fıstıklı batısı) 2 | kumsal | Fıstıklı | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1392831837 |
| Kumsal (Fıstıklı batısı) 3 | kumsal | Fıstıklı | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1414985743 |
| Kumsal (Fıstıklı güneybatısı) | kumsal | Fıstıklı | acik (yerleşime 1496 m) | way/1414985743 |
| Kumsal (Fıstıklı güneybatısı) 2 | kumsal | Fıstıklı | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1414985744 |
| Kordon (Fıstıklı batısı) | kordon (taş tahkimat) | Fıstıklı | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1445587670 |
| Fıstıklı Deresi ağzı | dere ağzı | Fıstıklı | acik (yerleşime 1487 m) | way/698849100 |
| Dere ağzı (Güzelyalı Burgaz) | dere ağzı | Güzelyalı Burgaz | acik (yerleşime 178 m) | way/1430949806 |
| Kumsal (Güzelyalı Eğitim kuzeyi) | kumsal | Güzelyalı Eğitim | acik (yerleşime 200 m) | way/665674892 |
| Kumsal (Güzelyalı Siteler kuzeyi) | kumsal | Güzelyalı Siteler | acik (yerleşime 584 m) | way/1305691028 |
| Kumsal (Güzelyalı Siteler kuzeyi) 2 | kumsal | Güzelyalı Siteler | acik (yerleşime 628 m) | way/1305691029 |
| Kumsal (Güzelyalı Yalı kuzeybatısı) | kumsal | Güzelyalı Yalı | acik (yerleşime 425 m) | way/1305691027 |
| Kumsal (Güzelyalı Yalı kuzeydoğusu) | kumsal | Güzelyalı Yalı | acik (yerleşime 165 m) | way/1305691023 |
| Kordon (Hasanbey kuzeydoğusu) | kordon (taş tahkimat) | Hasanbey | acik (yerleşime 147 m) | way/639389497 |
| Kordon (Hasanbey kuzeyi) | kordon (taş tahkimat) | Hasanbey | acik (yerleşime 219 m) | way/639389497 |
| Kordon (Hisar kuzeybatısı) | kordon (taş tahkimat) | Hisar | acik (yerleşime 226 m) | way/1336893184 |
| Kumsal (Kapaklı güneydoğusu) | kumsal | Kapaklı | acik (yerleşime 1044 m) | way/757494038 |
| Kapaklı Deresi ağzı | dere ağzı | Kapaklı | acik (yerleşime 337 m) | way/684554355 |
| Karacaali İskelesi | liman / balıkçı barınağı | Karacaali | acik (yerleşime 358 m) | node/13872728204 |
| Kordon (Kayhan güneybatısı) | kordon (taş tahkimat) | Kayhan | acik (yerleşime 136 m) | way/1217216676 |
| Kumla Deresi ağzı | dere ağzı | Kumla | acik (yerleşime 312 m) | way/1218508014 |
| Kordon (Kumsaz güneyi) | kordon (taş tahkimat) | Kumsaz | belirsiz (yerleşimden uzak (> 1,5 km)) | way/24825429 |
| Kordon (Kumsaz güneyi) 2 | kordon (taş tahkimat) | Kumsaz | belirsiz (yerleşimden uzak (> 1,5 km)) | way/24825429 |
| Kordon (Kumsaz güneyi) 3 | kordon (taş tahkimat) | Kumsaz | belirsiz (yerleşimden uzak (> 1,5 km)) | way/24825429 |
| Dere ağzı (Kumsaz) | dere ağzı | Kumsaz | acik (yerleşime 255 m) | way/253063517 |
| Kordon (Kumyaka doğusu) | kordon (taş tahkimat) | Kumyaka | belirsiz (yerleşimden uzak (> 1,5 km)) | way/534210128 |
| Kurşunlu Yat Limanı | liman / balıkçı barınağı | Kurşunlu | belirsiz (marina: giriş kısıtlı olabilir) | way/1165497962 |
| Kordon (Kurşunlu doğusu) | kordon (taş tahkimat) | Kurşunlu | belirsiz (yerleşimden uzak (> 1,5 km)) | way/24825429 |
| Kordon (Kurşunlu doğusu) 2 | kordon (taş tahkimat) | Kurşunlu | belirsiz (yerleşimden uzak (> 1,5 km)) | way/24825429 |
| Kordon (Kurşunlu doğusu) 3 | kordon (taş tahkimat) | Kurşunlu | belirsiz (yerleşimden uzak (> 1,5 km)) | way/24825429 |
| Kordon (Kurşunlu doğusu) 4 | kordon (taş tahkimat) | Kurşunlu | acik (yerleşime 1286 m) | way/24825429 |
| Kordon (Kurşunlu kuzeydoğusu) | kordon (taş tahkimat) | Kurşunlu | acik (yerleşime 788 m) | way/24825429 |
| Kordon (Kurşunlu kuzeydoğusu) 2 | kordon (taş tahkimat) | Kurşunlu | acik (yerleşime 547 m) | way/24825429 |
| Kordon (Orhaniye batısı) | kordon (taş tahkimat) | Orhaniye | acik (yerleşime 433 m) | way/1217216676 |
| Kordon (Orhaniye güneybatısı) | kordon (taş tahkimat) | Orhaniye | acik (yerleşime 208 m) | way/1336893175 |
| Kumsal (Tirilye kuzeybatısı) | kumsal | Tirilye | acik (yerleşime 155 m) | way/519554786 |
| Tirilye Limanı | liman / balıkçı barınağı | Tirilye | belirsiz (marina: giriş kısıtlı olabilir) | node/11865648199 |
| Ayı Burnu | kayalık kıyı | — | belirsiz (kayalık: yürüyüş yolu bilinmiyor) | node/11981818601 |
| Kordon (Ömerbey Mah. doğusu) | kordon (taş tahkimat) | Ömerbey Mah. | acik (yerleşime 182 m) | way/639389497 |
| Kordon (Ömerbey Mah. güneydoğusu) | kordon (taş tahkimat) | Ömerbey Mah. | acik (yerleşime 744 m) | way/1073087871 |
| Kumsal (İslamköy kuzeybatısı) | kumsal | İslamköy | belirsiz (yerleşimden uzak (> 1,5 km)) | way/479047534 |
| Kumsal (İslamköy kuzeybatısı) 2 | kumsal | İslamköy | belirsiz (yerleşimden uzak (> 1,5 km)) | way/479047534 |
| Kumsal (İslamköy kuzeybatısı) 3 | kumsal | İslamköy | belirsiz (yerleşimden uzak (> 1,5 km)) | way/479047535 |

## Erişim yasak (ticari liman / sanayi)

| Ad | OSM |
|---|---|
| Borusan Port | node/825452158, way/588510511 |
| sanayi alanı | way/131982028 |
| Gemlik Küçük Sanayi Sitesi | way/478691235 |
| sanayi alanı | way/479047503 |
| sanayi alanı | way/479047513 |
| sanayi alanı | way/479047514 |
| sanayi alanı | way/479051750 |
| T.C. Mudanya Kaymakamlığı İlçe Jandarma Komutanlığı | way/503796445 |
| Borçelik Çelik Sanayii Ticaret A.Ş | way/588510512 |
| BURSA SERBEST BÖLGE | way/597831950 |
| Togg Gemlik Kampüsü | way/888889309 |
| sanayi alanı | way/901718629 |
| Cimtas Celik İmalat Montaj ve Tesisat A.Ş. | way/1038697387 |
| Marmara Entegre Kimya Sanayi | way/1038697388 |
| sanayi alanı | way/1091677946 |
| Kar Boru Sanayi | way/1115544718 |
| Gemlik Küçük Sanayi Sitesi | way/1272209648 |
| Jandarma Komutanlığı | way/1377877328 |
| Askeri İrtibat Bürosu | way/1377878675 |
| Sahil Güvenlik Komutanlığı | way/1377879263 |
| askeri alan | way/1393123414 |
| sanayi alanı | way/1467351864 |
| sanayi alanı | way/1467351865 |
| sanayi alanı | way/1467351866 |
| sanayi alanı | way/1467351871 |
| Gemlik Askerlik Şubesi | way/1501002525 |
| Tuğgeneral Orhan Öncül Kışlası | relation/2871688 |
| sanayi alanı | relation/18096373 |

## Elenen yerler

| Neden | Sayı |
|---|---|
| kıyı çizgisine 52 m | 2 |
| ticari liman sahası | 1 |
| OSM access=no | 1 |

| Yer | Tip | Yerleşim | Neden | OSM |
|---|---|---|---|---|
| osm-node-11981834876-1 | kayalık kıyı | Armutlu | kıyı çizgisine 52 m (> 30 m): fiziksel kıyı nesnesi değil | node/11981834876 |
| osm-node-11981834876-2 | kayalık kıyı | Armutlu | kıyı çizgisine 52 m (> 30 m): fiziksel kıyı nesnesi değil | node/11981834876 |
| osm-way-479047533-1 | kumsal | İslamköy | ticari liman sahası (Borusan Port) | way/479047533 |
| osm-way-940722066-1 | kordon (taş tahkimat) | Armutlu | OSM access=no | way/940722066 |

## Kordon (taş tahkimat) — yerleşim raporu (H6)

Kıyı çizgisine ≤ 25 m paralel giden tahkimat, deniz duvarı, kordon/sahil yolu ya da yaya yolu 300–500 m parçalara bölünür.
Kumsal/kayalık üstündeki parçalar, aynı kesimin tekrarları ve erişim süzgecine (sanayi, liman, askeri, özel) takılanlar elenir.
Her parça en yakın odak yerleşime (≤ 4 km) yazılır; OSM'deki mahalle adları ayrıca verilir.
Lamba olasılığı: bölgede OSM'de hiç `highway=street_lamp` yok; parçalar kordon tip önceliğini (0,5, kanıt C) kullanır.

| Yerleşim | Mahalleler | Bulunan | Eklenen | Elenen | Tekrar | Elenme nedenleri |
|---|---|---|---|---|---|---|
| Gemlik | Balıkpazarı, Cumhuriyet, Demirsubaşı, Dr.Ziya Kaya, Hisar, Kayhan, Orhaniye | 12 | 10 | 0 | 2 | — |
| Kurşunlu | Kumsaz, Kurşunlu | 9 | 9 | 0 | 0 | — |
| Mudanya | Hasanbey, Kumyaka, Ömerbey Mah. | 5 | 5 | 0 | 0 | — |
| diğer (odak yerleşimlere > 4 km) | Armutlu, Fıstıklı | 17 | 6 | 11 | 0 | zaten kumsal/kayalık (10); OSM access=no (1) |

Kordon parçası bulunamayan odak yerleşimler: Kumla, Narlı, Umurbey, Güzelyalı — OSM'de kıyı çizgisine ≤ 25 m paralel tahkimat, deniz duvarı, sahil yolu ya da yaya yolu etiketi yok.

## Mera olmayan nesneler (G1)

Şirket şubesi, gişe, suyla teması olmayan bina/ofis/dükkân ve karadaki feribot terminali noktaları aday olamaz.

| Yer | Ad | Neden | OSM |
|---|---|---|---|
| osm-node-5069596322 | Mudanya İskelesi | feribot terminali karada (su üzerinde değil) | node/5069596322 |
| osm-node-11132493095 | Eski Turyol Armutlu Şubesi | işletme şubesi / gişe, kıyı nesnesi değil | node/11132493095 |
| osm-way-862153219 | Bursa Deniz Otobüsleri/BUDO | şirket/bina nesnesi, suyla teması yok | way/862153219 |
| osm-way-1363811911 | Mudanya Kaymakamlık Lojmanı | şirket/bina nesnesi, suyla teması yok | way/1363811911 |
| osm-way-1363811919 | Gemlik Kaymakamlık Lojmanı | şirket/bina nesnesi, suyla teması yok | way/1363811919 |
| osm-way-1391978145 | İDO Armutlu Merkez Terminali | feribot terminali karada (su üzerinde değil) | way/1391978145 |

## Aynı fiziksel nesnenin tekrarı (G1, birleştirme değil)

Liman/marina/terminal kaydı, kendi iskele/mendireği zaten mera ise ya da aynı adla (yazım farkı dahil) 500 m içinde
kayıtlıysa ayrı mera olmaz. Liman çokgeninin su alanı ≥ 1 ha ise tek bir "liman içi" kaydı kalır. Farklı yapılar ayrı kalır.

| Yer | Ad | Neden | OSM |
|---|---|---|---|
| osm-node-11450096002 | Güzelyalı Yat Limani | aynı nesnenin tekrarı: osm-way-252356832 (146 m) | node/11450096002 |
| osm-node-12451494394 | Armutlu Devlet Limanı | aynı nesnenin tekrarı: osm-way-1422122108 (66 m) | node/12451494394 |
| osm-node-3493263849 | Armutlu İhlas Tatil Köyü İskelesi | aynı nesnenin tekrarı: osm-way-1170373161 (0 m) | node/3493263849 |

## Neden Karacaali ve Büyükkumla iskeleleri listede yoktu?

İkisi de OpenStreetMap'te iskele *yolu* (`man_made=pier`) olarak değil, adı "… İskelesi" olan tek bir **nokta**
(`leisure=marina`) olarak çizilmiş. Harita etiket katmanı adlı liman/marina noktalarını gösterdiği için haritada
göründüler; mera listesi ise yalnız `man_made=pier|breakwater|groyne` **yollarından** üretiliyordu (uç noktası ve
uzunluk için çizgi gerekir). Envanter nokta ve alan nesnelerini de alır; ikisi artık mera.

## Bilinen yerler (kullanıcı listesi)

- Narlı: yakında OSM'de fiziksel kıyı nesnesi yok; otomatik eklenmedi (haritadan elle eklenebilir)
- Kumyaka: yakında OSM'de fiziksel kıyı nesnesi yok; otomatik eklenmedi (haritadan elle eklenebilir)
- Eşkel: OSM'de yerleşim noktası yok
- **Kurşunlu:** 0 mevcut mera, 7 aday (≤ 2,5 km). osm-way-1165497962 Kurşunlu Yat Limanı (liman / balıkçı barınağı); osm-way-24825429-4 Kordon (Kurşunlu doğusu) (kordon (taş tahkimat)); osm-way-24825429-5 Kordon (Kurşunlu doğusu) 2 (kordon (taş tahkimat)); osm-way-24825429-6 Kordon (Kurşunlu doğusu) 3 (kordon (taş tahkimat)); osm-way-24825429-7 Kordon (Kurşunlu doğusu) 4 (kordon (taş tahkimat)); osm-way-24825429-8 Kordon (Kurşunlu kuzeydoğusu) (kordon (taş tahkimat))
- **Gemlik:** 1 mevcut mera, 11 aday (≤ 2,5 km). osm-way-1217216668-1 Kordon (Dr.Ziya Kaya batısı) (kordon (taş tahkimat)); osm-way-1217216668-2 Kordon (Demirsubaşı güneyi) (kordon (taş tahkimat)); osm-way-1217216676-1 Kordon (Cumhuriyet batısı) (kordon (taş tahkimat)); osm-way-1217216676-2 Kordon (Cumhuriyet güneyi) (kordon (taş tahkimat)); osm-way-1217216676-3 Kordon (Orhaniye batısı) (kordon (taş tahkimat)); osm-way-1217216676-6 Kordon (Kayhan güneybatısı) (kordon (taş tahkimat))
- **Karacaali:** 0 mevcut mera, 3 aday (≤ 2,5 km). osm-node-13872728204 Karacaali İskelesi (liman / balıkçı barınağı); osm-node-2794622004 Büyükkumla İskelesi (liman / balıkçı barınağı); osm-way-681112515 Büyükkumla Deresi ağzı (dere ağzı)
- **Büyükkumla:** 1 mevcut mera, 4 aday (≤ 2,5 km). osm-node-13872728204 Karacaali İskelesi (liman / balıkçı barınağı); osm-node-2794622004 Büyükkumla İskelesi (liman / balıkçı barınağı); osm-way-1218508014 Kumla Deresi ağzı (dere ağzı); osm-way-681112515 Büyükkumla Deresi ağzı (dere ağzı)
- **Narlı:** 0 mevcut mera, 0 aday (≤ 2,5 km). 
- **Mudanya:** 1 mevcut mera, 4 aday (≤ 2,5 km). osm-way-1073087871-1 Kordon (Ömerbey Mah. güneydoğusu) (kordon (taş tahkimat)); osm-way-639389497-1 Kordon (Ömerbey Mah. doğusu) (kordon (taş tahkimat)); osm-way-639389497-2 Kordon (Hasanbey kuzeydoğusu) (kordon (taş tahkimat)); osm-way-639389497-3 Kordon (Hasanbey kuzeyi) (kordon (taş tahkimat))
- **Kumyaka:** 1 mevcut mera, 2 aday (≤ 2,5 km). osm-node-11865648199 Tirilye Limanı (liman / balıkçı barınağı); osm-way-534210128-1 Kordon (Kumyaka doğusu) (kordon (taş tahkimat))
- **Eşkel:** OSM'de yerleşim noktası yok.
