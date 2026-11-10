# Faz V — kapsamlı ürün, arayüz ve görsel kimlik revizyonu

> Bu belge kullanıcının 10 Kasım 2026 tarihli Faz V talimatının aynen kaydıdır. Sonundaki
> "DÜZELTMELER (10 Kasım)" bölümü aynı gün eklendi. **Çakışmada DÜZELTMELER geçerlidir; V1–V4 bu
> bölüme göre uygulanır.**

---

PROGRESS.md, docs/DESIGN.md, docs/MODEL.md, docs/TACKLE.md ve docs/audit/
klasörünü oku. Faz V: kapsamlı ürün, arayüz ve görsel kimlik revizyonu. Bu
prompt'un tamamını docs/REVISION-V.md olarak kaydet. V0'dan başla; her alt
faz sonunda rapor ver ve DUR. Ben "devam" deyince sıradaki alt faza geç.

HEDEF: Bursa kıyısında nerede, ne zaman ve elimdeki hangi takım/yöntemle
başlayacağımı kolayca anlamak. Akademik rapor değil; kaynak ve belirsizlik
gerektiğinde ulaşılabilir. Site yakın çevremce de kullanılıyor.
GÖRSEL KİMLİK: "Bursa kıyıları için bir deniz atlası ve av kokpiti". Harita
merkezli; kıyıyı, suyu, saati ve takımı görerek anlaşılan bir arayüz. Birkaç
ikon, renk değişikliği ve ek kartla sınırlı bir revizyon DEĞİL.

ÇALIŞMA KURALLARI (tüm alt fazlar):
- Önce güncel kodu ve canlıyı kontrol et. Daha önce düzeltilmiş sorunu
  tekrar varmış gibi sunma. Her bulguyu "canlıda doğrulandı / kodda görüldü
  / test edilmesi gerekiyor" diye etiketle.
- Mapillary, derinlik (Faz R: ATL24/SDB), veri kapsamı ve kalibrasyon
  çalışmalarını incelemeden eksik ilan etme.
- Yeni veri kaynağı veya kütüphane eklemeden önce hangi somut eksikliği
  giderdiğini yaz.
- Mevcut işlevleri koru. Yapmadığın testi yapılmış yazma. Bilimsel doğruluk
  testlerini ve arayüz testlerini ayrı raporla.
- Görsel doğrulama "öğe var mı" değil, "görünüyor, doğru ve anlaşılıyor mu"
  sorusuyla yapılır; ölçülebilir kabul kriterleri geçerli.
- Her görsel için hangi kullanıcı sorusunu cevapladığını yaz. Dekor amacıyla
  veri yoğunluğu artırılmaz.
- Gerçek veri ile eğitim çizimi her zaman ayrı ve etiketli. Ölçülmemiş dip
  yapısı, bilinmeyen ışık yayılımı ve tahmin edilmeyen balık konumu
  gerçekmiş gibi görselleştirilmez. Fotoğrafı olmayan meraya başka yerin
  fotoğrafı konmaz.
- Eklenmeyecekler: tam ekran deniz videosu, dönen 3D balıklar, parlayan
  kartlar, süs amaçlı göstergeler, veri yokken üretilmiş 3D deniz tabanı.
- Hareket: sürekli animasyon yerine seçime anlamlı tepki veren kısa
  geçişler; prefers-reduced-motion desteklenir.
- Model katsayılarını tek seansa bakarak değiştirme.
- Yayına alma: mevcut proje talimatları ve deploy akışı geçerli.

BİLİNEN SORUNLAR (Claude canlıda ölçtü, 9 Kasım; yine de kendin doğrula):
- Harita rüzgar katmanında particles canvas'ı 0 piksel çiziyor. P
  raporundaki "60 fps" canvas'ın varlığını ölçmüş, çizimi değil.
- /api/grid/wx 7×12 = 84 hücre (0,1°). Sakin havada 0–65 km/sa skalası koyu
  batimetri üstünde görünmüyor.
- Zaman kaydırıcı yalnız mera rozetlerinin rengini değiştiriyor. Lejant
  varsayılan açık ve haritanın ~%25'ini kaplıyor. Harita 4–5 sn boş açılıyor.
- Plan kartı aynı anda büyük "Evet" ve "Güven: Düşük" gösterebiliyor.
- Lamba bilgisi "olasılık 0,50/0,60" gibi ölçülmüş yüzde izlenimi veren
  dille gösteriliyor.
- Takım önerisi yalnız suni yemden seçiyor. 8 Kasım, Tirilye İskelesi saha
  seansı: derinlik ~5 m (dropshot kurşunuyla); LRF silikonla 0 vuruş;
  dropshot + kesilmiş hamsiyle her atışta vuruş, ~6 kg istavrit + izmarit.
  Aynı yer ve saatte yöntem karşılaştırması. Sonbaharda balıkçıl beslenme
  ve Kasım hamsi göçü literatürü yöntem seçiminde hiç kullanılmamış.
- 119 meranın tamamında derinlik "yapı boyundan tahmin". ICESat-2 ATL24
  kapsamı yok, SDB reddedildi (docs/audit/atl24-coverage.md,
  sdb-validation.md). Kullanıcı saha ölçüm seferi yapmayacak.

V0 — Tasarım sistemi ve yüksek ayrıntılı örnekler (onay için DUR)
1. Görsel dil (DESIGN.md'de belgele, belirteç olarak uygula):
   - Ana zemin koyu mürekkep mavisi; kartlar arasında belirgin ton farkı.
   - Deniz: petrol mavisi, turkuaz, sınırlı sayıda derinlik tonu. Kara sade
     ve soluk.
   - Renk rolleri ayrı: tek ana eylem rengi, ayrı seçim rengi, amber yalnız
     uyarılarda. Her yeri koyu + turuncu yapma; bilgi katmanlarını ton ve
     boşlukla ayır.
   - Tipografi ölçeği, boşluk ölçeği, grafik boyutlarıyla bilgi önceliği;
     sayısal değerlerde hizalı rakamlar (tabular numerals).
   - Tek SVG simge seti, aynı çizgi kalınlığı, Türkçe etiketle desteklenir
     (rüzgar, dalga, akıntı, yağış, bulut, sıcaklık, ay, lamba, derinlik,
     güvenlik, yapı tipleri, yöntemler).
   - Dokular yalnız harita ve dip anlatımında; kart arkasında dekor yok.
   - Açık gündüz teması ayrıca tasarlanır (koyu temanın tersi değil).
2. Yüksek ayrıntılı örnek ekranlar (statik HTML/SVG, docs/design/mockups/),
   aynı tasarım sistemiyle: (a) ana ekran (masaüstü ve 390 px), (b) seçili
   mera detayı / "kıyı dosyası", (c) mobil Sahadayım (gündüz ve gece).
   Gerçekçi uzun metin, veri eksikliği, düşük güven, erişim kısıtı, güvenlik
   uyarısı ve "fotoğraf yok" durumları örneklerde gösterilsin. Her görselin
   cevapladığı kullanıcı sorusu notlu. Ekran görüntüleriyle rapor ver, DUR.

V1 — Ana ekran, harita, zaman çizelgesi ve kesinlik dili
1. Görsel hiyerarşi: Harita ana karakter. İlk ekranda hedef tür/bölge/saat
   aralığı, kanıt düzeyiyle uyumlu kısa karar, seçili mera ve av zaman
   çizelgesi. Uzun puan açıklamaları ayrıntıya. Erişim kısıtı, veri
   eksikliği ve düşük güven görünür kalsın.
2. Karar dili: Düşük güvende büyük ve koşulsuz "Evet" yok. Ör. "Denemeye
   değer görünüyor; güven düşük (çoğunlukla varsayıma dayalı)".
3. Üç ayrı güven: hava tahmini güveni (model uyumu), mera bilgisi güveni
   (kanıt türleri), av verimi doğrulaması (/api/trust-gate, şu an n=0).
   HSI puanı yakalama olasılığı gibi sunulmasın ("uygunluk puanı"). Başka
   tür/bölge/yöntem çalışmaları yerel katsayının doğrulaması sayılmasın.
   Silikon rengi ve kesin saat üstünlüğü kanıtlanmamışsa "başlangıç önerisi".
4. Eşdeğer meralar: Küçük puan farklarından kesin sıralama üretme.
   Karşılaştırma: erişim, kıyı tipi, rüzgara göre konum (karadan / denizden
   / yandan), veri kalitesi, kullanıcı cihazda başlangıç noktası girerse kuş
   uçuşu mesafe (konum sunucuya gitmez). Erişimi bilinmeyen yer açık
   erişimli gibi sunulmasın.
5. Av zaman çizelgesi (ilk ekranda, yatay, okunaklı; mevcut sayısal tablonun
   yerine): gün–gece arka plan şeridi (gün doğumu/batımı), rüzgar hız
   çizgisi + hamle bandı + yön okları, yağış sütunları, dalga çizgisi ve
   yönü, puan, güvenlik saatleri, önerilen pencere ve veri eksikleri.
   Seçili saati gösteren dikey çizgi bütün grafiklerden geçsin. Bir saate
   dokununca harita, mera kartı ve takım birlikte güncellensin.
6. Zaman bütünlüğü: Tek bir "seçili saat" durumu; harita, hava kartları,
   mera önerisi ve takım önerisi buna bağlı. Ana sayfa haritası ile tam
   harita aynı bileşen ve aynı davranış.
7. Harita görsel kimliği: kara soluk; deniz derinliğe göre sınırlı mavi
   tonlar; uygun ölçekte okunaklı eş derinlik çizgileri. Seçili meranın
   çevresinde ince vurgu, diğer işaretler geri planda. Mera işaretleri
   puan renginde + tip simgesi; güvenlik saatinde uyarı simgesi. Gece
   saatine geçilince palet yumuşakça kararsın. Yalnız doğrulanmış
   aydınlatma noktaları küçük ışık simgesiyle; su üzerinde ışık yayılım
   alanı çizilmesin.
8. Hava katmanları: Rüzgar ince akış çizgileri, akıntı kısa yön izleri
   (ikisi görsel olarak ayırt edilebilir); yağış, dalga. Particles hatasını
   düzelt. Hava katmanı açıkken taban harita nötrleşsin, batimetri dolgusu
   kapansın. Algısal olarak düzgün, verinin o anki aralığına duyarlı renk
   skalası (sakin havada da fark görünsün). Izgara ≤ 0,05° ve yumuşatılmış;
   modelin gerçek çözünürlüğü lejantta. Katman adı, birim, renk ölçeği,
   geçerli saat, kaynak ve güncelleme zamanı görünür. "Sıfır yağış",
   "veri yok", "yükleniyor" ve "hata" ayrı durumlar. Hızlı saat değişiminde
   eski ağ yanıtı yeni seçimi ezmesin. Haritada dokunulan noktanın o
   saatteki değerleri açılır kutuda. Lejant varsayılan kapalı. Yükleme
   iskeleti; ilk boyama ≤ 1,5 sn.
9. Lamba dili: Bilinmeyen aydınlatma yüzdeyle gösterilmesin. Durumlar:
   "bilinmiyor", "fotoğrafta direk görüldü, gece çalıştığı doğrulanmadı",
   "sahada doğrulandı". Model önseli yalnız "Neden? Ayrıntılar" altında,
   "varsayım" etiketiyle.
Kabul (V1, e2e'ye ekle):
- Her hava katmanı açıkken deniz alanından örneklenen piksellerin en az
  %60'ında taban haritadan ΔE ≥ 10 renk farkı (sakin hava dahil).
- Particles canvas'ında en az N çizilmiş piksel (N'yi belirle, gerekçelendir).
- Saat 12 saat ilerletilince en az bir katmanda ölçülebilir piksel değişimi.
- Hızlı saat değişimi testinde ekranda son seçimin verisi.
- WebGL yokken liste ve zaman çizelgesiyle kullanılabilir alternatif.
- Metinlerde WCAG AA kontrast.
- Mevcut testler korunuyor: 5 sn testi, taşma testi, plan ≤ 1,5 sn.
Senaryolar: yağışlı ve yağışsız, veri eksik, düşük ve yüksek rüzgar, hızlı
saat değişimi, WebGL yok, hareketi azaltma açık.

V2 — Yöntem-bağımsız takım, bağlama sahnesi ve Sahadayım
1. Yöntem havuzu: suni yem (LRF jighead + silikon, mikro jig), doğal yem
   (dropshot + yem, dip takımı, şamandıralı takım), çapari (tüylü/yemli).
   Yemler: hamsi parçası, karides, midye vb.
2. Birincil ve ikincil yöntem, gerekçe ve kanıt türüyle. Mevsim, beslenme
   literatürü ve yem balığı durumu belirlesin; sonbaharda (hamsi göçü)
   doğal yem birincil olabilir. Boğaz LRF CPUE çalışması da kanıt; karar
   tek kaynağa dayanmasın.
3. Kişisel envanter (yalnız cihazda): atar aralığı, sahip olunan jighead
   ağırlıkları, silikonlar, dropshot/kurşun ağırlıkları, iğneler, yem
   tercihi; "yalnız suni / yalnız doğal / hepsi". Elde olanlar öncelikli.
   Envanter öğeleri küçük, tutarlı, markasız ürün çizimleriyle seçilsin.
4. Bağlama ve hareket sahnesi (mevcut basit çizimin yerine): temiz teknik
   illüstrasyon. LRF için ana ip → düğüm → lider → jighead → silikon;
   dropshot, çapari ve şamandıra için kendi gerçek bağlantı düzenleri
   (yöntem değişince düzen gerçekten değişsin). Her parçaya dokununca
   Türkçe adı ve ölçüsü. İğnenin silikon içindeki yerleşimi görünsün.
   İki görünüm: "Nasıl bağlanır?" (parçalar ve bağlantılar) ve "Nasıl
   kullanılır?" (düşüş, kaldırma, bekleme, sarma kısa döngüsü; "eğitim
   animasyonu" etiketli; hareketi azaltmada durağan adımlar). Renk
   önerisinde görsel örnek + kısa gerekçe + "ekrandaki renk su altındaki
   görünüm değildir" notu.
5. Kontrollü değişiklik merdiveni: sonuç alınamazsa her adımda tek değişken
   (katman → ağırlık/saydırma → boy/profil → renk → yöntem). Ör. "15 dk
   vuruş yoksa dropshot + hamsi parçasına geç".
6. Batış saniyesi ölçülmüş derinlik gibi gösterilmesin.
7. Sahadayım — işlev: seans içinde yöntem bölümleri (her bölümün eforu,
   vuruş sayısı ve avı ayrı; sıfır av açıkça); "Vuruş aldım / Balık aldım
   / Sonuç yok" kontrolleri; tek dokunuşluk "Dip: __ m" (dropshot kurşunu
   dibe değince; kanıt "saha, av sırasında"; puanlamayı tetikler); 8 Kasım
   kaydını iki bölüme ayıran yönetici ekranı; kişi sayısı; günlük 5 kg
   sınırı uyarısı (≥ 4 kg ve > 5 kg); bölüm bazında 13 cm uyarısı; izmarit
   kayıt türü (puanlama türü değil).
8. Sahadayım — tasarım (plan ekranından tamamen ayrı): büyük saat ve seçili
   mera; tek bakışta rüzgar yönü, hamle ve yağış; kullanılan takımın büyük
   çizimi; av süresi ve son takım değişimi; gerektiğinde açılan kısa
   uygulama bilgisi. Islak elle kullanılabilir büyük düğmeler, az metin,
   yatay kaydırma yok. Gece görünümünde parlak beyaz panel ve sürekli
   hareket eden grafik yok.
9. Yöntem bazında verim özeti (vuruş/saat, adet/saat). Her yöntemde ≥ 5
   bölüm birikince birincil yöntem seçimine veriden katkı. 8 Kasım n = 1
   kanıt satırı; katsayılar değişmez.

V3 — Derinlik, veri kalitesi ve haritayla bağlantılı kesit
1. ÇED ve proje belgelerinden batimetri: iskele, mendirek, marina, balıkçı
   barınağı, sahil dolgusu ve düzenleme projeleri (Bakanlık ve il
   müdürlüğü ÇED duyuruları, proje tanıtım dosyaları, belediye ve DLH
   belgeleri). Georeferans, datum, ölçüm yılı, belge ve sayfa. Kanıt türü
   "proje batimetrisi (yıl)". İnşaat sonrası tarama veya dolgu notu.
2. Dean denge profili h = A·x^(2/3) (kordon ve taş tahkimat için ayrı, daha
   dik aralık); açıkta DTM'nin göreli güvenilir olduğu noktaya bağlı;
   Monte Carlo belirsizlik bandı. Doğrulama: ÇED noktaları ve saha kayıtları
   (Tirilye ~5 m). Doğrulama yoksa "fizik tahmini" etiketiyle, geniş bantla.
3. OpenSeaMap amatör sonar izleri, varsa ve kalite filtresiyle.
4. Toplam bağımsız nokta ≥ 30 olursa SDB'yi bunlarla kalibre edip Faz R'deki
   kabul eşiğiyle yeniden dene; değilse yalnız nokta sayısını raporla.
5. Öncelik: saha > proje batimetrisi > amatör sonar > uydu (kalibre) >
   fizik profili > DTM > yapı boyu.
6. Haritada veri kalitesi: ölçüm, model, uzaktan gözlem ve varsayım ayrı
   görsel dille. Yakınlaştırınca kaynak çözünürlüğünden fazla ayrıntı
   izlenimi yok. Doğrulanmamış yerel dip sınıfı (kum, yosun, midye)
   çizilmesin. Uydu derinliği kullanılamıyorsa bu açıkça yazsın.
7. Haritayla bağlantılı su altı kesiti: Haritada kıyıdan açığa bir doğrultu
   seçilir; altında aynı doğrultunun yan kesiti açılır: kıyı, su yüzeyi,
   bilinen dip profili; mesafe ve derinlik ölçeği; ölçülmüş bölüm düz,
   tahmin edilmiş bölüm kesikli çizgi ve bant; dip dokusu yalnız
   doğrulanmışsa; takımın çalıştırılacağı katmanı gösteren şerit. Kesit
   gerçek veriye dayanır; takım hareketi eğitim animasyonudur; ikisi
   etiketli. Batış süresinden türetilen değer ayrı ve "tahmin" etiketli.
Önce/sonra: R1 öncelikli meralarda derinlik ve gündüz sıralaması; gece
ilk 10 değişmemeli (derinlik yalnız gündüz kolunda).

V4 — Kıyı dosyası, Mapillary, liste ve son inceleme
1. Kıyı dosyası (merayı seçince açılan detay; her mera aynı metin kartı gibi
   görünmesin): üstte gerçek, tarihli mera fotoğrafı (Mapillary; lisans ve
   atıf, çekim yönü ve uzaklık; merayı gösterip göstermediği). Üzerinde
   açılıp kapatılabilen işaretler: giriş ve yürüyüş yönü, erişimi
   doğrulanmış avlanma bölümü, kıyı yapıları, doğrulanmış aydınlatma,
   fotoğrafın çekim yönü ve tarihi. Yalnız doğrulanmış bilgi işaretlenir;
   bilinmeyen işaret çizilmez, "doğrulanmadı" yazılır. Fotoğraf yoksa
   meranın gerçek OSM geometrisinden sade çizim, "şematik görünüm"
   etiketiyle. Altında "Bu merayı tanı": kıyı kesiti (V3), dip bilgisinin
   kapsamı, rüzgara açıklık gülü, kıyıya göre rüzgar ve akıntı yönü.
2. Mapillary kanıt zinciri ayrı alanlar: fotoğraf merayı gösteriyor mu,
   tarih, görülen direk/armatür, ışığın suya yönelimi, gece çalışmasının
   doğrulanıp doğrulanmadığı. Mevcut inceleme raporunu (90 mera dönemi)
   güncel 119 mera envanteriyle karşılaştır; kapsam dışı kalanları raporla.
3. Liste + harita + detay: dar kolonlarda metin kesilmesin. Ana karşılaştırma
   birkaç aday ve yakın saatlerle başlasın. Tüm meralar, uzun tahmin
   tabloları ve model bileşenleri ayrı ayrıntı görünümünde.
4. /tasarim (yalnız yönetici): tüm bileşenlerin ve durumların örnekleri.
5. Bağımsız görsel inceleme: İşi yapmamış ayrı bir alt ajan 3440, 1440 ve
   390 px ekran görüntülerini (ana ekran, harita katmanları ve zaman
   çizelgesi, kıyı dosyası, takım sahnesi, Sahadayım gündüz/gece, açık tema)
   V0'daki örneklerle ve bu belgedeki kurallarla karşılaştırarak incelesin;
   zayıf, kalabalık, okunaksız, etkisiz veya kural dışı bulduğu her şeyi
   listelesin. Listeyi düzelt, sonra raporla.

RAPOR (her alt faz sonunda): etiketli bulgular (canlıda / kodda / test
gerekli), yapılanlar, her görselin cevapladığı soru, kabul ölçümleri ve
değerleri, masaüstü ve mobil önce/sonra ekran görüntüleri, bilimsel testler
ve arayüz testleri ayrı, kalan veri boşlukları. DUR.

---

## V0 plan düzeltmeleri (10 Kasım, kullanıcı)

- Ana ekran için AYNI bilgi içeriğiyle İKİ belirgin farklı kompozisyon
  (ör. A: harita tam ekran + üstte kayan karar paneli; B: karar ve zaman
  çizelgesi solda, harita sağda). Masaüstü ve 390 px. Ben birini seçmeden
  kıyı dosyası ve Sahadayım örneklerini seçilen yöne göre tamamlama;
  önce iki ana ekran yönünü göster, DUR. Seçimden sonra (b) ve (c).
- 390 px'te ilk ekran: ana karar + küçük koşul özeti; harita ve ayrıntılı
  çizelgeye tek dokunuşla geçiş. Her grafiği ilk ekrana sıkıştırma.
- Sahadayım örneğindeki "4 kg" uyarısı "mevzuat doğrulanacak (V2)"
  etiketli yer tutucu olsun.
- Bricolage Grotesque'te tabular-nums (tnum) desteğini doğrula. Yoksa yalnız
  rakamlar için hizalı rakam destekleyen bir font öner, gerekçeyle, ekleme.
- Bulgu doğrulamasında particles piksel sayımı yalnız "çizim çalışıyor mu"
  kontrolüdür; veri güncelliği kanıtı sayılmaz.

## DÜZELTMELER (10 Kasım)

D1 (V1 kabul testleri; ΔE %60 ve "12 sa piksel değişimi" kriterleri
İPTAL): Kontrollü test verileriyle (fixture): bilinen yağış hücresi doğru
konumda; sıfır yağış şeffaf; eksik veri ayrı desenle; aynı veri → aynı
görüntü; farklı veri → beklenen katman değişimi. Katman görünürlüğü
fixture'da tanımlı eşik değerlerle test edilir. Hareketli parçacık
piksel değişimi, hava verisinin güncellendiğine kanıt sayılmaz.

D2 (renk skalası ve ızgara): Ana renk skalası zaman boyunca SABİT. İsteğe
bağlı "düşük hız ayrıntısı" görünümü, farklı ölçek kullandığı açıkça
yazılarak. Lejantta üç ayrı bilgi: kaynağın gerçek çözünürlüğü, örnekleme
aralığı, görsel yumuşatma. "≤ 0,05°" şartı İPTAL: daha sık örnekleme
ayrıntı üretmez. Lejant: küçük renk ölçeği + birim + geçerli saat her
zaman görünür; uzun açıklama açılır.

D3 (Dean profili): Yalnız yöntemin uygun olduğu kıyı tiplerinde (kumlu,
doğal, dengeye yakın kumsallar). Uygunluk ölçütlerini belgeleyip her merada
uygula. Kordon, taş tahkimat, rıhtım, taranmış liman önü, dolgu ve kayalık
kıyıda profil ÜRETME; derinlik "bilinmiyor". Monte Carlo bandı yalnız
tanımlı varsayımların yayılımını gösterir, model seçiminin doğruluğunu
değil; bu MODEL.md'de yazsın.

D4 (derinlik kaynak seçimi): Sabit kaynak sıralaması İPTAL. Kayıt bazında
kalite: yöntem, konum doğruluğu, datum, tarih, belirsizlik, sonradan kıyı
değişikliği (dolgu, tarama). Birden çok kaynak varsa belirsizlikle
ağırlıklandır ve çelişkiyi göster. "Dip: __ m" saha kaydı ham gözlem olarak
saklanır, yöntem notuyla (ör. "kurşun, misina açısı/akıntı belirsiz").
Belirsizlik atanır. Otomatik tutarlılık denetiminden (fiziksel olabilirlik,
kıyıya uzaklık, komşu kayıtlar ve diğer kaynaklarla uyum) geçerse
belirsizliğiyle hemen kullanılır; geçmezse yönetici onayına düşer.

D5 (yeterlilik eşikleri): "≥ 30 nokta" SDB için tek başına yeterlilik
değildir. Derinlik ve alan dağılımı, bağımsızlık, tarih uyumu ve su
berraklığı raporlanır; kalibrasyon ve doğrulama noktaları ayrılır.
"Her yöntemde ≥ 5 bölüm" İPTAL: aynı gecedeki bölümler bağımsız av sayılmaz.
Yöntem verimi yalnız betimleyici özet olarak gösterilir; otomatik yöntem
üstünlüğü için farklı gün ve yerlerde bağımsız seans sayısına dayanan
ölçüt öner, uygulama.
8 Kasım: "kontrollü karşılaştırma" DEĞİL, "saha gözlemi". Yöntem sırası
(önce silikon, sonra yem), süre ve olası sürü hareketi bilinmiyor.
Eksik süreleri veya bölüm başına avı tahminle doldurma; kullanıcı girecek.

D6 (yöntem önerisi): Doğal yem ve suni yem gerekçeleriyle birlikte sunulur.
"Sonbaharda hamsi göçü → doğal yem birincil" bir HİPOTEZ etiketiyle
gösterilir; göçün varlığı, o merada o saatte doğal yemin üstün olduğunu
göstermez. Öncelik iddiası kanıt türüyle birlikte. Kontrollü değişiklik
merdiveni ve "15 dk" süresi bilimsel eşik değil; kullanıcının
ayarlayabildiği "saha rehberi" olarak etiketlenir.

D7 (mevzuat): 5 kg ve 13 cm rakamlarını kodlamadan önce yürürlükteki resmî
düzenlemeden (Resmî Gazete metni, yürürlük tarihi) yeniden doğrula: tür bazlı
asgari boylar (istavrit, izmarit dahil), günlük miktar sınırının kişi
başı/tür/toplam av olarak nasıl uygulandığı, istisnalar ve ölçüm biçimi
(boy nasıl ölçülür). Karışık türlü avda uyarılar tür bazında çalışsın.
REGULATION.md güncellensin, kaynak ve tarih yazılsın. Doğrulanamayan kural
uyarı olarak kodlanmasın.

D8 (performans tanımı): "≤ 1,5 sn" ölçümü için cihaz profili (ör. orta
seviye mobil + 4G kısıtlama ve masaüstü), soğuk/sıcak önbellek ve ölçülen
aşama ayrı ayrı tanımlanır: (1) iskelet görünür, (2) karar kartı
kullanılabilir, (3) harita etkileşimli. Her biri ayrı raporlanır.

D9 (mobil yoğunluk): 390 px ilk ekranda yalnız ana karar ve küçük koşul
özeti; harita ve ayrıntılı çizelgeye tek dokunuşla geçiş.
