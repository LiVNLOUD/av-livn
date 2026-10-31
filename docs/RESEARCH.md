# RESEARCH — İstavrit (*Trachurus mediterraneus*) v2 model literatürü

Durum: v2 Bölüm A, 2026-10-30. Hedef: `docs/MODEL.md`'deki her parametrenin dayanağını ve kanıt düzeyini göstermek.

## Kanıt düzeyleri
| Düzey | Tanım |
|---|---|
| **A** | Marmara veya Karadeniz *T. mediterraneus*, hakemli yayın |
| **B** | Aynı tür başka bölgede, ya da aynı cins (*T. trachurus*) |
| **C** | Balıkçı bilgisi, başka taksondan aktarım, fiziksel sezgisel kural |

**Erişim sütunu:**
- **tam metin:** PDF veya HTML okundu.
- **özet:** yalnız özet okundu.
- **künye:** yalnız başlık ve künye doğrulandı (Crossref); içerik okunmadı. Künye düzeyindeki kaynaklar modelde **parametre dayanağı olarak kullanılmaz**, yalnız Bölüm B'de okunacaklar listesindedir.

**Erişim engelleri (oturumdan):**
- ResearchGate 403, Google Scholar 429, OpenAlex 429.
- Springer ve Elsevier makale sayfaları bot korumalı.
- Semantic Scholar hız sınırlı.
- Crossref ve DergiPark açık.

## Kaynak tablosu

| # | Künye | DOI / URL | Bölge | Tür | Yöntem | Bulgu | Modele etkisi | Düzey | Erişim |
|---|---|---|---|---|---|---|---|---|---|
| R1 | Demirel N., Yüksek A. (2013). Reproductive biology of *T. mediterraneus*: a detailed study for the Marmara–Black Sea stock. *J. Mar. Biol. Assoc. UK* 93(2):357–364 | [10.1017/S0025315412001014](https://doi.org/10.1017/S0025315412001014) | Marmara | *T. mediterraneus* | Gonad histolojisi, GSI | Üreme Mayıs–Eylül, zirve Temmuz–Ağustos; L50 ≈ 12.2–12.5 cm | Fenoloji: üreme tepesinin konumu (`season_spawn_doy` ≈ 210. gün, genişlik ≈ 45 gün) | A | özet |
| R2 | Demirel N., Yüksek A. (2013). Spawning frequency of *T. mediterraneus* in the Sea of Marmara. *Turk. J. Fish. Aquat. Sci.* 13(3):441–446 | [10.4194/1303-2712-v13_3_06](https://doi.org/10.4194/1303-2712-v13_3_06) | Marmara | *T. mediterraneus* | Postovulatuar folikül | Yumurtlama oranı %16.3; dişi ~6 günde bir, Mayıs–Ağustos 2009'da ~20 kez yumurtluyor | Üreme dönemi uzun ve sürekli: kısa bir sivri tepe değil, geniş Gauss | A | özet (TR) |
| R3 | Koç H.T., Erdoğan Z. (2019). Feeding habits of the Mediterranean horse mackerel. *Nat. Eng. Sci.* 4(3):182–193 | [10.28978/nesciences.567123](https://doi.org/10.28978/nesciences.567123) | Bandırma Körfezi (Marmara) | *T. mediterraneus* | Mide içeriği, 2013–2015, n = 90; sonbahar, kış, ilkbahar | Av: kopepod, kladoser, öfozid, misid, amfipod, dekapod, balık yumurtası. Beslenme yoğunluğu **en düşük kışın, en yüksek sonbaharda**. Öfozidler kış ve ilkbaharda baskın. Marmara yüzey suyu mevsimsel 6–27 °C. **Yaz örneği yok.** | Fenoloji: sonbahar tepesi (`season_autumn_doy` ≈ 285. gün), kış tabanı. Ayrıca gece misid/öfozid avı ışık mekanizmasını destekler (av türleri gece göç eden zooplankton). | A | tam metin |
| R4 | Torcu Koç H., Erdoğan Z. (2019). Marmara Denizi, Bandırma Körfezi sarıkuyruk istavrit… *BAÜ Fen Bil. Enst. Derg.* 21(1):265–277 | [10.25092/baunfbed.546640](https://doi.org/10.25092/baunfbed.546640) | Bandırma Körfezi | *T. mediterraneus* | — | İçerik okunmadı | Yok (Bölüm B okuma listesi) | A | künye |
| R5 | Melnikova E.B., Kuz'minova N.S. (2020). Growth of horse mackerel populations in the western parts of the Black, Marmara, and Aegean seas. *Fish. Aquat. Life* 28:11–17 | [10.2478/aopf-2020-0002](https://doi.org/10.2478/aopf-2020-0002) | Batı Karadeniz, Marmara, Ege | *T. mediterraneus* | Büyüme modeli | Karadeniz biyokütle artışı Marmara ve Ege'den yüksek | Doğrudan parametre yok; Marmara ve Karadeniz stok bağlantısı bağlam bilgisi | A | özet |
| R6 | Mel'nikova E.B. vd. (2023). Changes in the reproductive period of Mediterranean horse mackerel and blunt-snouted mullet… *Thalassas* | [10.1007/s41208-023-00568-z](https://doi.org/10.1007/s41208-023-00568-z) | Karadeniz | *T. mediterraneus* | — | İçerik okunmadı (Springer erişimi engelli) | Yok; SST–üreme ilişkisi için Bölüm B okuma listesi | A | künye |
| R7 | Arndt E., Evans J. (2022). Diel activity of littoral and epipelagic teleost fishes in the Mediterranean Sea. *Rev. Fish Biol. Fish.* 32:497–519 | [10.1007/s11160-022-09697-9](https://doi.org/10.1007/s11160-022-09697-9) | Akdeniz | Çok tür (derleme) | Derleme | Özet erişilemedi | Diel kol yapısı ve alacakaranlık tepesi **bu kaynağa dayandırılmadı**; parametreler C. Bölüm B'de okunup B'ye yükseltilebilir. | (B adayı) | künye |
| R8 | Sardo G., Okpala C.O.R., Geraci M.L., Fiorentino F. vd. (2020). The effects of different artificial light wavelengths on some behavioural features of juvenile pelagic Atlantic horse mackerel. *Acta Ichthyol. Piscat.* 50(1):85–92 | [10.3750/aiep/02709](https://doi.org/10.3750/aiep/02709) | Akdeniz (tank) | *T. trachurus* juvenil | Akvaryum fototaksis, 6 renk | Mavi ışık çekti, beyaz ışık bir kısmını itti; mor ve kırmızı zayıf | Lamba rengi saha formunda kaydedilir; renk etkisi v2'de parametre değil (juvenil + tank), C notu | B | özet |
| R9 | Rumolo P. vd. (2017). Linking spatial distribution and feeding behavior of Atlantic horse mackerel (*T. trachurus*) in the Strait of Sicily. *J. Sea Res.* 121:47–58 | [10.1016/j.seares.2017.01.002](https://doi.org/10.1016/j.seares.2017.01.002) | Sicilya Boğazı | *T. trachurus* | İzotop + dağılım | Beslenme, av dağılımını belirleyen çevresel etkenlere bağlı (Semantic Scholar TLDR) | Yapı ve av (prey) bağı için genel destek; parametre değeri yok | B | özet (TLDR) |
| R10 | Erbay M., Şahin C. (2022). An acoustic survey in the southeastern Black Sea in the assessment of *T. mediterraneus*. *Thalassas* 38:1345–1355 | [10.1007/s41208-022-00418-4](https://doi.org/10.1007/s41208-022-00418-4) | GD Karadeniz | *T. mediterraneus* | Akustik | İçerik okunmadı | Derinlik ve gündüz dağılımı için Bölüm B okuma listesi; `depth_mid` C | A | künye |
| R11 | Utne A.C.W. (1997). The effect of turbidity and illumination on the reaction distance and search time of the marine planktivore *Gobiusculus flavescens*. *J. Fish Biol.* 50:926–938 | [10.1111/j.1095-8649.1997.tb01619.x](https://doi.org/10.1111/j.1095-8649.1997.tb01619.x) | Norveç (lab) | *G. flavescens* (başka takson) | Deney | Bulanıklık görsel planktivorda tepki mesafesini düşürür (başlıktan; özet erişilemedi) | Bulanıklık vekili yalnız yönü belirler, büyüklüğü C | C | künye |
| R12 | Beşiktepe Ş., Kideyş A.E., Ünsal M. (1998). In situ grazing pressure and diel vertical migration of female *Calanus euxinus* in the Black Sea. *Hydrobiologia* 363:323–332 | [10.1023/A:1003142209456](https://doi.org/10.1023/A:1003142209456) | GB Karadeniz | *C. euxinus* (av türü) | 30 sa ve 21 sa istasyon örneklemesi, Nisan ve Eylül 1995 | Kopepod gece yüzeye çıkıp beslenme yapıyor (DVM) | Gece kolunun mekanizması: gece av yüzeyde, lamba avı toplar; parametre değeri yok | C (mekanizma) | özet |
| R13 | Yankova M. (2013). Population dynamics of horse mackerel (*T. m. ponticus*) in the Bulgarian Black Sea coast. *ISRN Zoology* 2013:127287 | [10.1155/2013/127287](https://doi.org/10.1155/2013/127287) | Bulgaristan | *T. mediterraneus* | Popülasyon dinamiği | — | Doğrudan parametre yok | A | künye |
| R14 | Betti F. vd. (2024). Opportunistic feeding behaviour of *T. mediterraneus*. *Mar. Biodiv.* | [10.1007/s12526-024-01441-9](https://doi.org/10.1007/s12526-024-01441-9) | Akdeniz | *T. mediterraneus* | — | İçerik okunmadı | Bölüm B okuma listesi | B | künye |
| R15 | Dürrani Ö., Seyhan K. (2024). Stock identification… *Estuar. Coast. Shelf Sci.* | [10.1016/j.ecss.2024.108687](https://doi.org/10.1016/j.ecss.2024.108687) | Karadeniz | *T. mediterraneus* | Stok ayrımı | İçerik okunmadı | Kışlama göçü için Bölüm B okuma listesi | A | künye |
| R16 | Paun C. vd. (2020). Variations in growth and reproduction measurements of *T. mediterraneus* from the Romanian Black Sea coast. *AgroLife Sci. J.* 9:212–218 | [10.17930/AGL2020227](https://doi.org/10.17930/AGL2020227) | Romanya | *T. mediterraneus* | Haziran–Kasım örneklemesi, n = 563 | Boy, ağırlık, yaş; yıllar ve aylar arası fark | Romanya kıyısında da sezon Haziran–Kasım; diyet–sıcaklık verisi **yok** | A | özet |
| R17 | Kasten F., Czeplak G. (1980). Solar and terrestrial radiation dependent on the amount and type of cloud. *Solar Energy* 24:177–189 | [10.1016/0038-092X(80)90391-6](https://doi.org/10.1016/0038-092X(80)90391-6) | — | Fizik | Ölçüm regresyonu | Işınım ≈ açık gök × (1 − 0.75·(N/8)^3.4) | Ortam ışığı indeksinde bulut zayıflatması | fizik | künye + formül (yaygın kullanım) |
| R18 | Donchik I. vd. (2026). Biology of *T. mediterraneus* off the coast of Crimea. *TrJFAS* 26 | [10.4194/trjfas29817](https://doi.org/10.4194/trjfas29817) | Kırım | *T. mediterraneus* | — | İçerik okunmadı | Bölüm B okuma listesi | A | künye |
| R19 | Peksu M., Uzer U., Yıldız T., Ayaz A., Karakulak F.S. (2020). Hook selectivity and catch efficiency in two sport fishing sectors in the Strait of Istanbul, Turkey: Classic handline fishing and Light Rock Fishing (LRF). *J. Appl. Ichthyol.* 36(6):893–900. Türkçe tez sürümü: "Amatör olta balıkçılığında çapari ve hafif olta takımlarının (LRF) av etkinliğinin karşılaştırılması" (YÖK Açık Bilim 20.500.12812/146015) | [10.1111/jai.14140](https://doi.org/10.1111/jai.14140) | İstanbul Boğazı | *T. mediterraneus* (%89,6), *Scorpaena porcus* (%5,12) | Aylık deneme avcılığı Eylül 2014 – Eylül 2015; bir çapari ve bir LRF takımı; çaparide 6, 8, 10 no iğne; seçicilik SELECT, log-normal | LRF CPUE 1,295 kg/10 iğne/saat (en yüksek). Boy: LRF 9–16 cm, çapari 6,1–19 cm. Modal yakalanma boyu (makale özeti) #10: 13,4 cm (yayılım 3,58), #8: 17,7 cm (yayılım 4,74). Kullanıcının aktardığı tez değerleri #10: 12,97 cm, #8: 17,16 cm (tez metnine oturumdan erişilemedi; iki sürüm arasındaki fark yöntem/örneklem farkı olabilir). Saat ve istasyon bilgisi özette yok | Takım kutusu (F0): varsayılan **#8** iğne; #10'un modal boyu yasal 13 cm sınırında, küçük balık oranı yüksek. Not: iğne numaraları çapari iğneleri; LRF jighead iğnesine aktarım varsayım | A (yerel) | özet + künye (makale); tez erişilemedi (acikbilim.yok.gov.tr 503, bağlantı yok) |
| R20 | Kökçek C.F. (2016). Su ürünlerinde fiyat – miktar ilişkisi: İstanbul Su Ürünleri Halinde bir araştırma. Yüksek lisans tezi, Marmara Üniversitesi (açık erişim) | [openaccess.marmara.edu.tr](https://openaccess.marmara.edu.tr/entities/publication/c8e67bc7-25f6-46da-9aa5-355c2abaf3c4) | İstanbul (Kumkapı/Gürpınar hali) | 10 tür, aralarında istavrit | 2014 yılı **haftalık** BSGM hal verisi; korelasyon analizi (SPSS) | 10 tür hal üretiminin ~%92'si. Fiyat–miktar ilişkisi çinekop, **istavrit**, çipura, mezgit, sardalya, ahtapot ve karideste anlamlı. Katsayının yönü ve büyüklüğü oturumdan okunamadı (sunucu 503) | Bolluk sinyali (D7): hal giriş miktarı haftalık ölçekte fiyatla birlikte hareket ediyor, yani **pazar sinyali olarak tutarlı**. Kıyı avıyla ilişkisi gösterilmedi; sinyal puana katılmaz, ayrı satır kalır | B (yerel, dolaylı) | künye + özet (arama sonucu); tam metin erişilemedi |
| R21 | Hoyle S.D., Campbell R.A., Ducharme-Barth N.D. vd. (2024). Catch per unit effort modelling for stock assessment: A summary of good practices. *Fisheries Research* 269:106860 | [10.1016/j.fishres.2023.106860](https://doi.org/10.1016/j.fishres.2023.106860); kabul edilmiş metin: [NOAA IR 55851](https://repository.library.noaa.gov/view/noaa/55851) | Genel | — | Derleme (16 başlıkta iyi uygulama) | CPUE standardizasyonu: GLM/GAM (log bağ), log(efor) offset, sıfır avın modelde tutulması, gözlemci/gemi rastgele etkisi, ortak değişken seçimi, mekânsal yapı, tanılama | Kalibrasyon (MODEL.md §8a, F4 `analysis/calibrate.py`): Poisson/NB GLM + log(aktif saat × kamış) offset, gözlemci tabanı, ay/bulut/bulanıklık ortak değişkenleri | yöntem | künye + özet |
| R22 | İBB Gürpınar Su Ürünleri Hali yıllık/aylık giriş tabloları (İBB Tarım ve Su Ürünleri Şube Md., İSYÖN) ve basına yansıyan özetleri | [2025 aylık tablo (PDF)](https://tarim.ibb.istanbul/img/162040532026__43661135445.pdf); [Dünya 2024 özeti](https://www.dunya.com/ekonomi/palamut-bir-kez-daha-en-cok-satan-balik-hamsiden-birinciligi-aldi-haberi-759629); [Ensonhaber 2025 özeti](https://www.ensonhaber.com/ekonomi/hamsi-2025da-palamudun-tahtina-oturdu); [Politikam Ocak 2026](https://www.politikam.com/istanbul-balik-hali-ocak-2026-istavrit-hamsi-fiyatlari) | İstanbul | istavrit (türler ayrılmadan) | Ticari giriş kaydı | İstavrit girişi 2024: 9.381 t; 2025: 8.008 t; **Ocak 2026 tek ayda 1.928 t** (ayın toplamının ~%30'u). Aylık PDF oturumdan indirilemedi (bağlantı kesildi) | Mevsim eğrisi değerlendirmesi (MODEL.md §3.4): hal girişi kışın tepe yapıyor (ticari gırgır/trol ve Karadeniz göçü), kıyı LRF avının yaz–sonbahar tepesinin tersi. **Mevsim eğrisine uydurulmadı** | C (ticari ≠ kıyı) | sayılar haber özetinden; tablo okunamadı |

## Bulunamayanlar (uydurulmadı)
- **TÜİK/BSGM aylık Marmara istavrit av serisi (F2):** bulunamadı. TÜİK Su Ürünleri İstatistikleri yalnız **yıllık** ve bölge bazında; aylık kırılım yayımlanmıyor (portalda aylık tablo doğrulanamadı). Türkiye istavrit avının ~%80'i Karadeniz'den. Yerine hal serisi (R22) değerlendirildi: ticari giriş kışın tepe yapıyor, kıyı avının mevsimini temsil etmiyor. Mevsim eğrisi değişmedi (konumlar A, genlikler C).
- **GB Karadeniz mevsimsel diyet ve beslenme stratejisi:** Crossref'te hedefli aramada bulunamadı. En yakın kaynak R3 (Marmara).
- **Romanya kıyısı diyet–sıcaklık çalışması:** bulunamadı. R16 yalnız büyüme ve üreme içeriyor.
- **Karadeniz istavritinin Marmara'ya kışlama göçü, birincil kaynak:** oturumdan doğrulanabilir bir DOI bulunamadı. Bilgi balıkçı bilgisi düzeyinde kalır (C). R15 Bölüm B'de okunacak.
- **ALAN (yapay gece ışığı) ve misid/balık çekimi, Marmara veya Karadeniz:** bulunamadı. Crossref sonuçları tatlı su ve mercan resifi çalışmaları, aktarılamaz. Lamba etkisi C; mekanizma R3 + R12.
- **Hava basıncı ve balık davranışı:** hakemli ve aktarılabilir kanıt bulunamadı. Basınç terimi C ve en düşük ağırlıkta (0.04).
- **Su sıcaklığı tercihi (Marmara *T. mediterraneus*):** sayısal tercih bandı bulunamadı. *T. trachurus*'un 16–21 °C bandı aktarılmadı (tür farkı; Marmara yüzeyi 6–27 °C arasında değişiyor ve tür yıl boyu bulunuyor, R3). Bu yüzden v1'deki sabit 14–20 °C hedefi kaldırıldı.
- **Yapay yapı (iskele, mendirek) ve *Trachurus* toplanması, sayısal etki:** bulunamadı. Yapı terimi C.

## Parametre → kaynak → kanıt özeti

| Model parametresi (MODEL.md) | Dayanak | Düzey |
|---|---|---|
| Fenoloji: üreme tepesi konumu ve genişliği | R1, R2 | A |
| Fenoloji: sonbahar beslenme tepesi konumu, kış tabanı | R3 | A (konum) / C (genlik) |
| Fenoloji genlikleri | R1–R3'ten nitel; sayısal değer yok | C |
| Diel iki kol, alacakaranlık tepesi | Mekanizma R3 + R12; derleme R7 okunamadı | C |
| Lamba etkisi, kontrast | Mekanizma R3 + R12; renk R8 | C (renk B, juvenil) |
| Lamba bilinmiyor önseli (feribot 0.85 / iskele 0.5 / mendirek 0.3) | Saha gözlemi ve yolcu iskelesi aydınlatma zorunluluğu varsayımı | C |
| Bulut → ışık | R17 | fizik |
| Ay ışığı (~0.25 lux dolunay) | Standart fotometri değeri | fizik |
| Su sıcaklığı: yalnız değişim hızı | Tercih bandı bulunamadı; DATA-AUDIT klimatoloji kararı | C |
| Bulanıklık (yağış + dalga) | R11 (yön) | C |
| Rüzgar ve dalga × maruziyet gülü | Balıkçı bilgisi, güvenlik | C |
| Yapı, taban, derinlik | Bulunamadı; R9 genel | C |
| Basınç, akıntı | Bulunamadı | C |
| Takım kutusu: iğne no (#8), LRF boy aralığı | R19 | A (yerel) |
| Takım kutusu: jighead, renk, silikon, saydırma | TACKLE.md kuralları, balıkçı bilgisi | C |
| Bolluk sinyali (D7), puana katılmaz | R20 (hal fiyat–miktar ilişkisi anlamlı), R22 (yıllık/aylık giriş) | B (yerel, dolaylı) |
| Kalibrasyon yöntemi: GLM/GAM, log(efor) offset, sıfır av, gözlemci etkisi | R21 | yöntem |
| Mevsim genlikleri: ticari seriyle uydurma | R22 değerlendirildi, uygun değil (kış tepesi) | C kaldı |

## Sayım
- **Toplam kaynak:** 22 (F2: R20 hal fiyat–miktar tezi, R21 Hoyle vd. 2024, R22 İBB hal girişleri).
  - Biyoloji, *Trachurus*: 16.
  - Mekanizma/fizik: R12, R17.
- **Kanıt düzeyi dağılımı:**
  - **A:** 11 (R1–R6, R10, R13, R15, R16, R18). Yalnız 5'inin içeriği okundu (R1, R2, R5, R16 özet; R3 tam metin).
  - **B:** 3 (R8, R9, R14). R7 B adayı (künye).
  - **C:** 2 (R11 aktarım, R12 mekanizma) + fizik 1 (R17).
- **Modelde dayanak olarak kullanılanlar:** yalnız içeriği okunanlar (R1, R2, R3, R8, R9, R12, R16, R17).
- **Parametre tablosu kanıt dağılımı** (`packages/scoring/src/v2/params.ts`, 45 parametre, F2 sonrası): A 3, B 1, C 41. F2'de yeni kaynaklar parametre **değerlerini** değiştirmedi: aylık kıyı serisi yok, hal serisi ticari ve ters mevsimli. Takım kutusunda iğne no ve yasal boy A (R19, Tebliğ). Model büyük ölçüde C düzeyinde. Bu, MODEL.md'deki kalibrasyon planının (av günlüğü) neden zorunlu olduğunun gerekçesidir.
