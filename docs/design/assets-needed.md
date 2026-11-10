# Gereken bitmap görseller (Faz V, yön A)

Bu görselleri kullanıcı ChatGPT ile üretip projeye ekler. **Toplam 21 görsel**, beş grup:

| Grup | Adet |
|---|---|
| Tür çizimleri | 6 |
| Takım ve yem çizimleri | 9 |
| Boş durum görselleri | 3 |
| Paylaşım (OG) görseli | 1 |
| PWA uygulama simgesi | 2 |

## Kurallar
- **Yalnız bu türler bitmap olabilir.** Hepsi yukarıdaki tabloda listelendi.
- **Bitmap OLMAYACAKLAR** (SVG/kodla kalır):
  - bağlama şemaları;
  - haritalar;
  - kıyı kesitleri;
  - grafikler;
  - simge seti;
  - şematik mera görünümü.
- **Hiçbir mera için yapay görsel üretilmez.** Mera fotoğrafı yalnız gerçek ve tarihli olur (Mapillary, lisans ve atıfla). Fotoğraf yoksa OSM geometrisinden "şematik görünüm" çizilir.
- **Görselde yazı, etiket, sayı, marka veya logo olmaz.** Etiketler kodla eklenir.
- **Her görselin altında kodla "çizim" etiketi durur**, gerçek fotoğrafla karışmasın diye.
- **Yer tutucu ve otomatik kullanım.** Görseller gelene kadar bileşenler kesikli çerçeveli yer tutucu gösterir: "çizim — görsel bekleniyor" ve dosya yolu (bkz. `docs/design/mockups/dossier-tirilye-*.html`).
  - V1'de `<Illustration kind name>` bileşeni derleme anında `apps/web/public/img/**` dizinini tarar. Dosya adı eşleşirse görseli kullanır, yoksa yer tutucuyu gösterir.
- **Kabul denetimi.** Gelen her görsel iki adımda denetlenir:
  1. Otomatik ön kontrol (V1, `scripts/assets-check.mjs`): biçim, piksel ölçüsü, şeffaflık (alfa kanalı), dosya boyutu.
  2. Satırdaki kabul listesiyle gözle kontrol.
  - Uymayan görsel kullanılmaz. Hangi maddeden kaldığı raporlanır, yer tutucu kalır.
- **Biçim:** şeffaf WebP (alfa), `@2x` boyutta tek dosya. Tarayıcı CSS ile yarıya ölçekler. Ayrıca @1x üretilmez. İstisnalar OG (PNG, opak) ve PWA simgesidir (PNG).
- **Boyut sınırı:** tür ve takım görselleri ≤ 120 KB, boş durum görselleri ≤ 150 KB, OG ≤ 300 KB.

## Ortak stil ön eki (her prompt'un başına aynen eklenir)
> Temiz, sade teknik illüstrasyon; yandan profil, düz renk alanları ve çok hafif gölge, tutarlı ince koyu kontur (eşit kalınlık), ışık sol üstten. Arka plan tamamen şeffaf. Görselde hiçbir yazı, harf, sayı, etiket, marka veya logo olmasın. Fotogerçekçi değil, 3B render değil, karikatür değil. Renk paleti sınırlı: koyu mürekkep #08111a (kontur), deniz tonları #2c8f98 / #1f7380 / #134a58, gümüş-gri #b0c2cc ve #e8eff3, koyu gri #262e34, vurgu için lavanta #a48ce3 (az). Canlı turuncu, kırmızı ve sarı kullanma. Nesnenin doğal desenleri (çizgi, leke, benek) bu tonlarla ama ayırt edilir biçimde çizilsin. Nesne kadrajı yatayda %85 doldursun, kenarlarda boşluk kalsın.

## Tür çizimleri (6)
Ortak özellikler:
- Kullanıldığı yer: tür seçici, kıyı dosyası "Bu merayı tanı", Sahadayım av kaydı.
- Biçim: şeffaf WebP, **960 × 480 px (@2x)**, ekranda 480 × 240. Baş sola bakar.

| Dosya | Cevapladığı soru | ChatGPT prompt'u (Türkçe, ortak ön ekten sonra) | Kabul kontrol listesi |
|---|---|---|---|
| `apps/web/public/img/species/istavrit.webp` | "İstavrit hangisi, yakaladığım bu mu?" | Yandan görünüşte tek bir istavrit (Trachurus mediterraneus) balığı, baş solda. | ☐ yan çizgi boyunca baştan kuyruğa uzanan **kemiksi pul sırası (scute)** açıkça görülüyor ☐ yan çizgi göğüs yüzgeci hizasında belirgin şekilde **aşağı kıvrılıyor** ☐ derin **çatal kuyruk** ☐ iri göz ☐ solungaç kapağının arka üst kenarında **koyu leke** ☐ iki ayrı sırt yüzgeci ☐ gövde ince-uzun, sırtı mavi-yeşil, yanı gümüş ☐ metin/logo yok, arka plan şeffaf |
| `apps/web/public/img/species/izmarit.webp` | "İzmarit hangisi, istavritten nasıl ayırırım?" | Yandan görünüşte tek bir izmarit (Spicara maena) balığı, baş solda. | ☐ yan gövdenin ortasında, yan çizgi üzerinde **koyu dikdörtgen/oval leke** ☐ küçük, **öne uzatılabilir ağız** ☐ tek uzun sırt yüzgeci ☐ yan çizgide scute **yok** (istavritle karışmamalı) ☐ çatal kuyruk ☐ gümüş-gri gövde, sırt koyu ☐ metin/logo yok |
| `apps/web/public/img/species/levrek.webp` | "Levrek neye benzer?" | Yandan görünüşte tek bir levrek (Dicentrarchus labrax), baş solda. | ☐ **iki ayrı sırt yüzgeci**, ilki dikenli ☐ solungaç kapağında **koyu leke** ve kapakta diken ☐ gümüş yanlar, sırt gri-mavi ☐ gövdede **şerit/leke yok** (benekli levrekle karışmamalı) ☐ hafif çatal kuyruk ☐ metin/logo yok |
| `apps/web/public/img/species/lufer.webp` | "Lüfer neye benzer?" | Yandan görünüşte tek bir lüfer (Pomatomus saltatrix), baş solda, ağız hafif açık. | ☐ **mavi-yeşil sırt**, gümüş yan ☐ büyük ağız ve **belirgin sivri dişler** ☐ göğüs yüzgecinin dibinde **koyu leke** ☐ çatal kuyruk ☐ iki sırt yüzgeci (ilki kısa, dikenli) ☐ metin/logo yok |
| `apps/web/public/img/species/mirmir.webp` | "Mırmır neye benzer?" | Yandan görünüşte tek bir mırmır (Lithognathus mormyrus), baş solda. | ☐ gövdede **dikey ince koyu bantlar** (birbirine yakın, düzenli) ☐ **sivri, uzun burun** ☐ gümüş-gri gövde ☐ tek sırt yüzgeci ☐ çatal kuyruk ☐ metin/logo yok |
| `apps/web/public/img/species/kolyoz.webp` | "Kolyoz neye benzer, uskumrudan farkı ne?" | Yandan görünüşte tek bir kolyoz (Scomber colias), baş solda. | ☐ sırtta **dalgalı koyu çizgiler** ☐ karın yanlarında **koyu benekler** (uskumrudan ayıran özellik) ☐ ikinci sırt ve anüs yüzgecinin arkasında **küçük finletler** ☐ iri göz ☐ derin çatal kuyruk ☐ metin/logo yok |

## Takım ve yem çizimleri (9)
Ortak özellikler:
- Kullanıldığı yer: kıyı dosyası "Takım", Sahadayım takım kartı, takım kutusu.
- Biçim: şeffaf WebP, **640 × 640 px (@2x)**, ekranda 320 × 320. Markasız; renkler paletle sınırlı.

| Dosya | Cevapladığı soru | ChatGPT prompt'u (Türkçe, ortak ön ekten sonra) | Kabul kontrol listesi |
|---|---|---|---|
| `apps/web/public/img/tackle/jighead.webp` | "Jighead nedir, neye benzer?" | Tek bir jighead: yuvarlak kurşun başlıklı olta iğnesi, yandan, iğne ucu yukarı bakıyor. | ☐ kurşun baş **yuvarlak**, iğne gözü başın üstünden çıkıyor ☐ iğne **ince ve küçük (#8–#10 oranı)**: baş çapı iğne boyunun ~1/4'ü ☐ iğne ucu yukarı ☐ marka/renk kodu/yazı yok |
| `apps/web/public/img/tackle/silikon-igne-kuyruk.webp` | "İğne kuyruk silikon nasıl?" | Tek bir iğne kuyruklu (pin tail) yumuşak silikon yem, ~5 cm, yandan, düz. | ☐ gövde halkalı ve ince ☐ **kuyruk incelerek iğne gibi bitiyor** ☐ uzunluk/kalınlık oranı ~10:1 ☐ iğne yok (yalnız yem) ☐ yazı yok |
| `apps/web/public/img/tackle/silikon-kurek-kuyruk.webp` | "Kürek kuyruk silikon nasıl?" | Tek bir kürek kuyruklu (paddle tail) yumuşak silikon yem, ~5 cm, yandan. | ☐ kuyruk ucunda **dikey, yassı kürek** ☐ kürek gövdeye dik açıyla bağlı ☐ halkalı gövde ☐ iğne yok ☐ yazı yok |
| `apps/web/public/img/tackle/mikro-jig.webp` | "Mikro jig nedir?" | Tek bir küçük metal jig (5–10 g), ince uzun balık biçimli parlak metal gövde, üst halkasında küçük asist iğne. | ☐ **metal**, parlak, ince-uzun gövde ☐ üst halka ve **asist iğne** (kısa misinalı) ☐ boy/en oranı ~5:1 ☐ iğne gövdeden küçük ☐ yazı/marka yok |
| `apps/web/public/img/tackle/dropshot-kursun.webp` | "Dropshot kurşunu nasıl?" | Tek bir dropshot kurşunu: damla biçimli küçük kurşun, üstünde misina tutan döner klips. | ☐ **damla/silindir** biçimli kurşun ☐ üstte **döner klips** (misina sıkıştıran) ☐ iğne yok ☐ yazı yok |
| `apps/web/public/img/tackle/capari.webp` | "Çapari nedir?" | Tek bir çapari takımı dikey: bir ana misina üzerinde aralıklarla 5–6 küçük iğne, her iğnede minik tüy/balık derisi süs; uçta küçük kurşun. | ☐ **tek ana misina**, kısa köstekler ☐ **5–6 küçük iğne**, eşit aralıklı ☐ iğnelerde **minik süs** (tüy/deri) ☐ uçta küçük kurşun ☐ iğneler ana misinaya göre küçük ☐ yazı yok |
| `apps/web/public/img/bait/hamsi-parcasi.webp` | "Hamsi parçası nasıl kesilir?" | Hamsiden (Engraulis encrasicolus) kesilmiş 2–3 cm'lik bir parça, yandan; kesik yüzey görünür. | ☐ **hamsi** olduğu belli (ince gümüş gövde, sırtta koyu-mavi şerit) ☐ **2–3 cm parça**, bütün balık değil ☐ kesik yüzey açık renkli, kan/vahşet yok ☐ iğne yok ☐ yazı yok |
| `apps/web/public/img/bait/karides.webp` | "Karides yemi neye benzer?" | Tek bir küçük çiğ karides, yandan, kabuklu. | ☐ **segmentli gövde**, kuyruk yelpazesi ☐ uzun antenler ☐ boyut oranı küçük yem karidesi (iri değil) ☐ pişmiş turuncu değil, yarı saydam gri ☐ yazı yok |
| `apps/web/public/img/bait/midye.webp` | "Midye yemi nasıl?" | Tek bir açılmış midye (Mytilus galloprovincialis): koyu kabuk, içinde turuncu-krem et; yanında iğneye takılacak et parçası değil, yalnız açık midye. | ☐ **koyu mavi-siyah uzun kabuk** ☐ açık kabukta **et görünür** ☐ tek midye ☐ yazı yok |

## Boş durum görselleri (3)
Ortak özellikler:
- Biçim: şeffaf WebP, **720 × 480 px (@2x)**, ekranda 360 × 240.
- Sade, tek nesneli, küçük, dikkat dağıtmayan.

| Dosya | Ekran / bileşen | Cevapladığı soru | ChatGPT prompt'u | Kabul kontrol listesi |
|---|---|---|---|---|
| `apps/web/public/img/empty/fotograf-yok.webp` | kıyı dosyası, fotoğraf alanı (şematik görünümün yanında küçük) | "Neden fotoğraf yok?" | Boş bir fotoğraf çerçevesi ile önünde sakin bir kıyı çizgisi silüeti; çerçeve içi boş. | ☐ belirli bir yer **tanınmıyor** (mera izlenimi vermiyor) ☐ çerçeve boş ☐ yazı yok |
| `apps/web/public/img/empty/veri-yok.webp` | plan, çizelge ve harita katmanında veri gelmediğinde | "Veri neden görünmüyor?" | Boş bir çizelge kâğıdı ve üzerinde soru işaretine benzemeyen, kesik kesik bir dalga çizgisi. | ☐ grafik değerleri **yok** (sahte veri izlenimi vermez) ☐ soru işareti/yazı yok |
| `apps/web/public/img/empty/cevrimdisi.webp` | PWA çevrimdışı ekranı, Sahadayım | "İnternet yok, ne olur?" | Kıyıda bir iskele babası ve gevşek bir halat; uzakta zayıf sinyal çizgileri. | ☐ sakin, uyarı rengi yok ☐ marka/telefon modeli yok ☐ yazı yok |

## Paylaşım (OG) görseli (1)

| Dosya | Biçim | Ekran / bileşen | Cevapladığı soru | ChatGPT prompt'u | Kabul kontrol listesi |
|---|---|---|---|---|---|
| `apps/web/public/og.png` | opak PNG, **1200 × 630 px** | bağlantı paylaşım kartı. Başlık `og:title` ile verilir; görselde yazı yok. | "Bu bağlantı ne?" | Gece, sakin bir Marmara kıyısı: alçak bir iskele silüeti, iskele ucunda tek bir sokak lambası, suda hafif yansıma, uzakta koy. Koyu mürekkep mavisi gökyüzü. Sol üçte birlik alan sade kalsın. | ☐ **belirli bir gerçek mera değil**: genel kıyı, tanınabilir yer işareti yok ☐ yazı/logo yok ☐ arka plan opak, palet tonlarında ☐ sol üçte bir sade |

## PWA uygulama simgesi (2)

| Dosya | Biçim | Ekran / bileşen | Cevapladığı soru | ChatGPT prompt'u | Kabul kontrol listesi |
|---|---|---|---|---|---|
| `apps/web/public/icons/app-1024.png` | opak PNG, **1024 × 1024**. `icon-192.png`, `icon-512.png`, `apple-touch` (180) betikle türetilir. | ana ekran simgesi | "Telefonumdaki hangi uygulama?" | Kare uygulama simgesi: koyu mürekkep mavisi #08111a zemin, ortada sade beyaz-turkuaz bir iskele silüeti ve üstünde küçük bir lamba ışığı; düz, tek renk tonlarıyla, 2–3 şekil. Köşeler kare (yuvarlatmayı işletim sistemi yapar). | ☐ 48 px'e küçültüldüğünde **seçilebilir** ☐ en çok 3 şekil ☐ yazı/harf yok ☐ köşeler kare, zemin opak |
| `apps/web/public/icons/app-maskable-1024.png` | opak PNG, **1024 × 1024**, maskable | Android uyarlanır simge | aynı | Aynı simge; ana şekil merkezdeki %80'lik güvenli dairenin içinde, zemin kenarlara kadar dolu. | ☐ ana şekil merkez %80 daire içinde ☐ kenarlar zemin rengiyle dolu ☐ ilk simgeyle aynı çizim |

## Denetim kaydı
Gelen her görsel buraya bir satır olarak eklenecek: dosya, tarih, otomatik kontrol (geçti/kaldı), kontrol listesi sonucu, karar (kullanıldı / reddedildi + gerekçe).

| Dosya | Tarih | Otomatik | Kontrol listesi | Karar |
|---|---|---|---|---|
| — | — | — | — | — |
