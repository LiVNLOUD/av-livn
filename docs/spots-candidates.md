# Otomatik eklenen meralar (F1)

Otomatik üretilir: `python -m av_pipeline.spots.inventory build` (geodata.yml). Onay adımı yok: kontrollerden geçen
her yer doğrudan aktif mera olur ve v2 modelle puanlanır; kartta "otomatik eklendi — sahada doğrulanmadı" yazar.
Yönetici bir merayı herkesten gizleyebilir ve `/admin/` "Gizlenenler" listesinden geri alabilir. Kaynak © OpenStreetMap katkıcıları (ODbL).

**Kontroller:** a) OSM nesnesi kıyı çizgisine ≤ 30 m; b) `access=private|no`, askeri alan, sanayi alanı, ticari liman ve
yönetici yasak alanları içinde değil; c) kumsala md. 16/5 tarihli uyarı rozeti (kesin yasak değil); d) 150 m içindeki aynı
tip meralar ayrı kalır, birbirine "yakın mera" bağlantısı alır. Yalnız aynı noktanın kopyası (≤ 25 m) atılır.
G1: liman/marina çokgeni kenarına göre ölçülür; çokgensiz liman noktası suyun üzerindeyse havza ortası sayılır (≤ 150 m).

**Eklenen: 44 mera.** Elenen: 3. Ticari liman (erişim yasak katmanı): 28.

| Tip | Eklenen |
|---|---|
| kumsal | 28 |
| dere ağzı | 8 |
| liman / balıkçı barınağı | 6 |
| kayalık kıyı | 2 |

| Yerleşim | Eklenen |
|---|---|
| Armutlu | 16 |
| Fıstıklı | 6 |
| İslamköy | 3 |
| Büyükkumla | 2 |
| Güzelyalı Burgaz | 2 |
| Güzelyalı Siteler | 2 |
| Güzelyalı Yalı | 2 |
| Kapaklı | 2 |
| Tirilye | 2 |
| Dr.Ziya Kaya | 1 |
| Güzelyalı Eğitim | 1 |
| Karacaali | 1 |
| Kumla | 1 |
| Kumsaz | 1 |
| Kurşunlu | 1 |
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
| Bülbül Deresi ağzı | dere ağzı | Armutlu | acik (yerleşime 1090 m) | way/253083807 |
| Kayalık kıyı (Armutlu güneydoğusu) | kayalık kıyı | Armutlu | belirsiz (kayalık: yürüyüş yolu bilinmiyor) | way/1422351411 |
| Büyükkumla İskelesi | liman / balıkçı barınağı | Büyükkumla | acik (yerleşime 248 m) | node/2794622004 |
| Büyükkumla Deresi ağzı | dere ağzı | Büyükkumla | acik (yerleşime 330 m) | way/681112515 |
| Karsak Çayı ağzı | dere ağzı | Dr.Ziya Kaya | acik (yerleşime 256 m) | way/700323582 |
| Kumsal (Fıstıklı batısı) | kumsal | Fıstıklı | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1391521782 |
| Kumsal (Fıstıklı batısı) 2 | kumsal | Fıstıklı | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1392831837 |
| Kumsal (Fıstıklı batısı) 3 | kumsal | Fıstıklı | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1414985743 |
| Kumsal (Fıstıklı güneybatısı) | kumsal | Fıstıklı | acik (yerleşime 1496 m) | way/1414985743 |
| Kumsal (Fıstıklı güneybatısı) 2 | kumsal | Fıstıklı | belirsiz (yerleşimden uzak (> 1,5 km)) | way/1414985744 |
| Fıstıklı Deresi ağzı | dere ağzı | Fıstıklı | acik (yerleşime 1487 m) | way/698849100 |
| Güzelyalı Yat Limanı – liman içi | liman / balıkçı barınağı | Güzelyalı Burgaz | belirsiz (marina: giriş kısıtlı olabilir) | way/1552615726 |
| Dere ağzı (Güzelyalı Burgaz) | dere ağzı | Güzelyalı Burgaz | acik (yerleşime 178 m) | way/1430949806 |
| Kumsal (Güzelyalı Eğitim kuzeyi) | kumsal | Güzelyalı Eğitim | acik (yerleşime 200 m) | way/665674892 |
| Kumsal (Güzelyalı Siteler kuzeyi) | kumsal | Güzelyalı Siteler | acik (yerleşime 584 m) | way/1305691028 |
| Kumsal (Güzelyalı Siteler kuzeyi) 2 | kumsal | Güzelyalı Siteler | acik (yerleşime 628 m) | way/1305691029 |
| Kumsal (Güzelyalı Yalı kuzeybatısı) | kumsal | Güzelyalı Yalı | acik (yerleşime 425 m) | way/1305691027 |
| Kumsal (Güzelyalı Yalı kuzeydoğusu) | kumsal | Güzelyalı Yalı | acik (yerleşime 165 m) | way/1305691023 |
| Kumsal (Kapaklı güneydoğusu) | kumsal | Kapaklı | acik (yerleşime 1044 m) | way/757494038 |
| Kapaklı Deresi ağzı | dere ağzı | Kapaklı | acik (yerleşime 337 m) | way/684554355 |
| Karacaali İskelesi | liman / balıkçı barınağı | Karacaali | acik (yerleşime 358 m) | node/13872728204 |
| Kumla Deresi ağzı | dere ağzı | Kumla | acik (yerleşime 312 m) | way/1218508014 |
| Dere ağzı (Kumsaz) | dere ağzı | Kumsaz | acik (yerleşime 255 m) | way/253063517 |
| Kurşunlu Yat Limanı | liman / balıkçı barınağı | Kurşunlu | belirsiz (marina: giriş kısıtlı olabilir) | way/1165497962 |
| Kumsal (Tirilye kuzeybatısı) | kumsal | Tirilye | acik (yerleşime 155 m) | way/519554786 |
| Tirilye Limanı | liman / balıkçı barınağı | Tirilye | belirsiz (marina: giriş kısıtlı olabilir) | node/11865648199 |
| Ayı Burnu | kayalık kıyı | — | belirsiz (kayalık: yürüyüş yolu bilinmiyor) | node/11981818601 |
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

| Yer | Tip | Yerleşim | Neden | OSM |
|---|---|---|---|---|
| osm-node-11981834876-1 | kayalık kıyı | Armutlu | kıyı çizgisine 52 m (> 30 m): fiziksel kıyı nesnesi değil | node/11981834876 |
| osm-node-11981834876-2 | kayalık kıyı | Armutlu | kıyı çizgisine 52 m (> 30 m): fiziksel kıyı nesnesi değil | node/11981834876 |
| osm-way-479047533-1 | kumsal | İslamköy | ticari liman sahası (Borusan Port) | way/479047533 |

## Kordon (taş tahkimat) — yerleşim raporu (H6)

Kıyı çizgisine ≤ 25 m paralel giden tahkimat, deniz duvarı, kordon/sahil yolu ya da yaya yolu 300–500 m parçalara bölünür.
Kumsal/kayalık üstündeki parçalar, aynı kesimin tekrarları ve erişim süzgecine (sanayi, liman, askeri, özel) takılanlar elenir.
Her parça en yakın odak yerleşime (≤ 4 km) yazılır; OSM'deki mahalle adları ayrıca verilir.
Lamba olasılığı: bölgede OSM'de hiç `highway=street_lamp` yok; parçalar kordon tip önceliğini (0,5, kanıt C) kullanır.

| Yerleşim | Mahalleler | Bulunan | Eklenen | Elenen | Tekrar | Elenme nedenleri |
|---|---|---|---|---|---|---|

Kordon parçası bulunamayan odak yerleşimler: Gemlik, Kumla, Kurşunlu, Narlı, Umurbey, Mudanya, Güzelyalı — OSM'de kıyı çizgisine ≤ 25 m paralel tahkimat, deniz duvarı, sahil yolu ya da yaya yolu etiketi yok.

## Mera olmayan nesneler (G1)

Şirket şubesi, gişe, suyla teması olmayan bina/ofis/dükkân ve karadaki feribot terminali noktaları aday olamaz.

| Yer | Ad | Neden | OSM |
|---|---|---|---|
| osm-node-5069596322 | Mudanya İskelesi | feribot terminali karada (su üzerinde değil) | node/5069596322 |
| osm-node-11132493095 | Eski Turyol Armutlu Şubesi | işletme şubesi / gişe, kıyı nesnesi değil | node/11132493095 |
| osm-way-862153219 | Bursa Deniz Otobüsleri/BUDO | şirket/bina nesnesi, suyla teması yok | way/862153219 |
| osm-way-1391978145 | İDO Armutlu Merkez Terminali | feribot terminali karada (su üzerinde değil) | way/1391978145 |

## Aynı fiziksel nesnenin tekrarı (G1, birleştirme değil)

Liman/marina/terminal kaydı, kendi iskele/mendireği zaten mera ise ya da aynı adla (yazım farkı dahil) 500 m içinde
kayıtlıysa ayrı mera olmaz. Liman çokgeninin su alanı ≥ 1 ha ise tek bir "liman içi" kaydı kalır. Farklı yapılar ayrı kalır.

| Yer | Ad | Neden | OSM |
|---|---|---|---|
| osm-node-11450096002 | Güzelyalı Yat Limani | aynı nesnenin tekrarı: osm-way-1552615726 (Güzelyalı Yat Limanı) | node/11450096002 |
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
- **Kurşunlu:** 0 mevcut mera, 1 aday (≤ 2,5 km). osm-way-1165497962 Kurşunlu Yat Limanı (liman / balıkçı barınağı)
- **Gemlik:** 1 mevcut mera, 1 aday (≤ 2,5 km). osm-way-700323582 Karsak Çayı ağzı (dere ağzı)
- **Karacaali:** 0 mevcut mera, 3 aday (≤ 2,5 km). osm-node-13872728204 Karacaali İskelesi (liman / balıkçı barınağı); osm-node-2794622004 Büyükkumla İskelesi (liman / balıkçı barınağı); osm-way-681112515 Büyükkumla Deresi ağzı (dere ağzı)
- **Büyükkumla:** 1 mevcut mera, 4 aday (≤ 2,5 km). osm-node-13872728204 Karacaali İskelesi (liman / balıkçı barınağı); osm-node-2794622004 Büyükkumla İskelesi (liman / balıkçı barınağı); osm-way-1218508014 Kumla Deresi ağzı (dere ağzı); osm-way-681112515 Büyükkumla Deresi ağzı (dere ağzı)
- **Narlı:** 0 mevcut mera, 0 aday (≤ 2,5 km). 
- **Mudanya:** 1 mevcut mera, 0 aday (≤ 2,5 km). 
- **Kumyaka:** 1 mevcut mera, 1 aday (≤ 2,5 km). osm-node-11865648199 Tirilye Limanı (liman / balıkçı barınağı)
- **Eşkel:** OSM'de yerleşim noktası yok.
