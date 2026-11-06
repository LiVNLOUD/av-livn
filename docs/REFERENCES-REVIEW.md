# Referans incelemesi (I8) — sunum fikirleri, doğruluk iddiaları değil

2026-11-06 itibarıyla açık sayfalardan okundu.
- Okunamayan ya da doğrulanamayan yer "doğrulanmadı" diye işaretlidir.
- Hiçbir ürün Bursa'da tahmin başarısı doğrulanmış bir model olarak alınmadı.
- Yıldız sayısı ve pazarlama cümlesi doğruluk kanıtı sayılmadı.
- Zaten kullandığımız altyapılar (MapLibre, SunCalc, Open-Meteo) "yeni" diye sunulmadı.

## Ürünler

| Ürün | Ne gösteriyor (sunum) | Kendi iddiası | Bağımsız değerlendirme | Bizim için |
|---|---|---|---|---|
| **Fishbrain** | Günlük "BiteTime": tür için en yüksek etkinlik saatleri. Bir saate dokununca 1–10 "BiteScore". Saatlik hava çizelgesi. Gelgit ve ay aynı ekranda. ([özellik sayfası](https://fishbrain.com/features/fishing-forecasts)) | Girdiler: "balık biyolojisi, resmi kurumlar, hava servisleri ve topluluk". "En doğru tahmin" diyor ama yöntem, metrik ya da çalışma vermiyor. Av günlüklerinin BiteTime'a girdiği yazmıyor. ([aynı sayfa](https://fishbrain.com/features/fishing-forecasts), [ana sayfa](https://fishbrain.com/)) | Ana sayfadaki övgüler satıcının seçtiği yorumlar. Bağımsız yorum toplanmadı (doğrulanmadı). | **Alınan:** tür → saat → eylem sırası, tek sayı yerine "en iyi saat" vurgusu (I9 planı bunu yapıyor). **Alınmayan:** 1–10 ölçeği. Bizim puanımız ideal senaryoya göre yer; yakalama olasılığı gibi okunmasın diye ölçek değişmedi, anlamı ana ekranda yazıyor. |
| **Windy.com** (Windy.app değil) | Nokta tahmininde rüzgar meteogramı ve "Compare" tablosu: ECMWF, GFS, ICON, Meteoblue yan yana. Bölgesel model seçenekleri var. Saat adımı 3 sa; sonradan 1 sa seçeneği eklendiği bildiriliyor. ([topluluk: Compare](https://community.windy.com/topic/26304/understanding-the-compare-forecast-feature-in-windy-com), [neden karşılaştırmalı](https://community.windy.com/topic/8972/why-compare-forecast-models), [meteogram](https://community.windy.com/topic/30236/meteogram-when-comparing-forecasts)) | Resmi yardım sayfası JavaScript nedeniyle okunamadı (doğrulanmadı). | Topluluk, modellerin uyuşmasını güven, ayrışmasını temkin işareti sayıyor. Compare meteogramının kaldırıldığı da yazılmış (güncel durumu doğrulanmadı). | **Alınan:** iki satırlı gün/saat başlığı ve saat şeridi (H5). Belirsizliği "modeller ayrışıyor" mantığıyla göstermek: bizde parametre bandı ve "ilk 3'te" payı. **Not:** biz yalnız ICON'a (Open-Meteo) dayanıyoruz. İkinci bir model eklemek (ör. ECMWF IFS) tahmin hatasını da gösterir; ücretsiz katman ve çağrı sayısıyla birlikte ayrı karar konusu. |
| **Navionics (Garmin)** | SonarChart: kullanıcı sonar kayıtlarından günlük üretilen derinlik katmanı. "Community Edits": batık, engel, şamandıra işaretleri. ([SuperyachtNews](https://superyachtnews.com/fleet/navionics_sonarcharts_communitysourcing_navigational_chart_updates), [Marine Link](https://www.marinelink.com/news/sonarcharts-navionics385909.aspx)) | Topluluk verisi diğer katkılarla çapraz denetleniyor; hatalar doğru veriyle sönüyor (satıcı iddiası). | Saha testinde kendi ölçümünün SonarChart'tan farklı çıktığı ([Louisiana Sportsman](https://www.louisianasportsman.com/?p=56113)); taranmamış kanalın boş göründüğü ([Digital Yacht](https://digitalyacht.net/sonar-server-live-demo/)); gelgit yüksekliğinin işlemede etkisi ([Yachting Monthly](https://www.pressreader.com/uk/yachting-monthly/20160601/283218737377406)). | **Alınan:** ölçülmüş / enterpolasyon / bölgesel sınıfı haritada ayrı gösterme ilkesi (G5, I5). **Alınmayan:** veri çekme (kural: Navionics/Garmin verisi otomatik çekilmez). Kendi saha ölçümlerimiz (`/saha/`) aynı "topluluk sonarı" fikrinin tek kişilik ve denetlenebilir hali. |

## Açık kaynak repolar

| Repo | Lisans | Ne yapıyor | Veri | Bilimsel dayanak | Bizim için |
|---|---|---|---|---|---|
| [sjwasko/fishin](https://github.com/sjwasko/fishin) | MIT | Terminalde "en iyi av saatleri": solunar, gelgit, hava | NOAA CO-OPS gelgit, Open-Meteo, Nominatim, JPL DE421 efemeris | Ağırlıklar listelenmiş, kaynak gösterilmiyor | Solunar ağırlığı gibi kanıtsız terimler eklenmedi. Ay bizde yalnız ışık (lux) etkisi olarak var. |
| [akt/SGFishing](https://github.com/akt/SGFishing) | lisans dosyası görünmüyor | Singapur av rehberi; 7 faktörden 0–100 puan | data.gov.sg, Open-Meteo (+Marine), TideCheck, StormGlass, WorldTides | Puan ağırlıkları kaynaksız | Lisans yok → kod alınamaz. Toplamalı puan yapısı bizim geometrik ortalama + güvenlik kapısı + kanıt etiketli yaklaşımımızdan zayıf. |
| [TheWillMiller/tide-wise](https://github.com/TheWillMiller/tide-wise) | MIT | Home Assistant kartı: NOAA gelgit ve "bite-window" puanı | NOAA CO-OPS, CHS/DFO, UKHO, NWS | README puanı "yalnız tavsiye" diye tanımlıyor; "erken beta" | Dürüst etiketleme örneği. Bizde de puanın anlamı ve sınırları ana ekranda. Marmara'da gelgit çok küçük; kullanılmadı. |

Son commit tarihleri sayfa metninde görünmedi (doğrulanmadı). tide-wise sayfasının bir kısmı kesik okundu.

## Sonuç
Bu ürünlerin hiçbiri tahmin doğruluğunu ölçülebilir biçimde göstermiyor. Bizim fark yaratacağımız yer:
- ileriye dönük dondurulmuş tahmin (I6);
- zaman bölmeli kalibrasyon;
- kanıt sınıfı ayrımı (I4).

Sunumda alınanlar: saat → mera → takım sırası ve belirsizliğin model ayrışması gibi gösterilmesi.
