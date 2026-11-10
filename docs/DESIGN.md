# Tasarım özeti (Faz E)

**Konu ve iş:** Gece LRF avcısı için, Gemlik–Mudanya kıyısında "nereye, ne zaman" kararı. Ekranlar: geniş masaüstü (planlama), telefon (iskelede, karanlıkta). Kimlik zaten var ve korunuyor: gece denizi zemin, tek vurgu "sodyum lamba" turuncusu. Akılda kalan tek öğe **mera × saat ısı haritası**: bir gelgit tablosu gibi okunan, gece bantlı, puan renkli ızgara. Geri kalan her şey sessiz.

## Renk (değişmedi, tokenlar `global.css :root`)
| Token | Hex | Rol |
|---|---|---|
| `--sea` | #0e1c27 | sayfa zemini |
| `--deep` | #0a151e | kuyu: girdi, ısı haritası zemini, çekmece |
| `--swell` | #1b2e3b | çizgi, ayraç, pasif kenar |
| `--foam` | #dbe6ea | birincil metin |
| `--mist` | #8ba2ad | ikincil metin |
| `--sodium` | #f5a83c | tek vurgu: birincil eylem, seçili durum, "şimdi" çizgisi |
| `--good/--warn/--bad` | #5fd08a / #f0a35e / #ff7a6b | puan bantları; ısı haritasında sürekli ölçek bunlardan oklab karışımla |

## Tipografi
Tek aile: Bricolage Grotesque Variable (optik boyut açık). Başlıklar dar genişlik (`font-stretch: 80%`), gövde normal. Tüm sayılar `tabular-nums`. **Altı boyut, rem:**

| Token | rem / px | Satır yüksekliği | Kullanım |
|---|---|---|---|
| `--fs-1` | 0.75 / 12 | 1.4 | rozet, eksen, dipnot |
| `--fs-2` | 0.875 / 14 | 1.45 | ikincil metin, form etiketi, tablo |
| `--fs-3` | 1 / 16 | 1.5 | gövde, buton |
| `--fs-4` | 1.25 / 20 | 1.3 | bölüm başlığı, kart başlığı |
| `--fs-5` | 1.75 / 28 | 1.15 | sayfa başlığı (dar ekran), büyük puan |
| `--fs-6` | 2.5 / 40 | 1.05 | sayfa başlığı (geniş ekran) |

Büyük harf etiket, eğik vurgu, tek kelime renklendirme yok.

## Boşluk ve grid
Boşluk ölçeği `--s1..--s7` = 4/8/12/16/24/32/48 px. Tek grid: CSS grid, bölgeler `grid-template-areas` ile; aralık `--s4`, sayfa kenarı `--s4` (dar) / `--s6` (geniş). Paragraf metni en çok 68ch; liste, harita, ısı haritası tam genişlik.

## Yerleşim (ana sayfa) — Faz M
Ana ekran her genişlikte **av planı**dır. Isı haritası ve tüm meralar ayrı sekmededir.
```
sekmeler: [ Plan ] [ Saat çizelgesi ] [ Tüm meralar ]            Tür ▾
≥1200:  Plan:        [ plan ~%60 (içerik ≤ 1180 px) ][ kompakt harita ~%40 ][ kart 420 (çekmece) ]
        Saat çizelg. [ en iyi pencereler + ısı haritası, tam genişlik       ][ kart 420 ]
        Tüm meralar  [ liste (≤ 900 px)                ][ harita            ][ kart 420 ]
768–1199: aynı sütunlar, kart = alt panel
<768:     tek sütun, harita yok (Harita sekmesi); tür seçimi başlık çubuğunda
```
**Ana öneri kartı beş soruyu sırayla cevaplar.** Her sorunun etiketi üstte, cevabı altta ve büyük puntoyla:
1. Bugün gitmeye değer mi?
2. Nereye, ne zaman?
3. Ne ile başla? (tek satır, markasız takım sınıfı)
4. Neden? (2–3 madde, günlük dil)
5. Ne kadar güvenilir? (Düşük / Orta / Yüksek + tek cümle)

Güven kuralı (L1 ablasyonu): öneriyi en çok yukarı taşıyan etken varsayımsa (kanıt C, önsel ya da ölçüm olmayan tahmin), güven **Düşük** olur ve gerekçe günlük dille söylenir.

Teknik ayrıntılar yalnız "Neden? Ayrıntılar" çekmecesindedir: puan, bant, ilk 3 payı, kanıt harfi, takım gerekçesi, kaynakça. Eşdeğer seçenekler ana ekranda "İki/Üç yer de aynı derecede iyi görünüyor; model birini öne çıkaramıyor." diye yazılır; ziyaretçi birini seçer ve kart o yer için cevap verir. Ana öneri dışında en çok 2 kompakt alternatif gösterilir.

**Metin kuralı:** etiket–değer sütunu 280 px'ten dar olmaz. Dar alanda etiket üstte, değer altta durur (`scripts/e2e.mjs` denetler). **5 saniye testi:** 3440, 1920, 1440, 768 ve 390 px'te beş cevap kaydırmadan ilk ekranda görünür (e2e).

**Menü:** ziyaretçi için Plan, Harita, Model. Sahadayım, Günlük, Ayarlar, Adaylar ve Panel yalnız yönetici anahtarı cihazdayken görünür. Ayarlar → Takımım ziyaretçiye açıktır: plan kartındaki "Kendi takımını gir" bağlantısı ve sayfa altındaki bağlantı oraya gider.

**Faz O:**
- **Plan bölgesi:** ana kart en çok 720 px. Plan bölgesi 1100 px'i geçince yanına bir sütun açılır: seçili meranın 24 saatlik şeridi, takım görseli ve en çok 2 alternatif kart. Dar ekranda bunlar kartın altına iner.
- **Saat çizelgesi şeridi:** saate dokununca kart o saate geçer.
- **Gösterilen saat:** harita işaretleri, liste ve ısı haritası planın saatini gösterir. Üstteki çubukta "Gösterilen saat: … · şimdiye dön" yazar; 768–1199 px'te çubuk haritanın üstündedir, telefonda plan sekmesinde gizlidir.
- **"Şimdi" satırı:** önerilen saat şimdi değilse kart şimdinin neden farklı olduğunu tek satırda söyler, örneğin güvenlik tavanı ve ne zaman yatışacağı.
- **Güvenlik rozeti:** tavan yüzünden düşük kalan puan her yerde "güvenlik" rozeti ya da koyu kırmızı işaretle gösterilir.
- **Meraya git (tek yol):** plan seçeneği, harita, liste ve ısı haritası hep aynı davranır: harita zoom 15,5'e yumuşak geçer ve merayı halkayla gösterir. Her mera tek etiket alır; seçili olanın etiketi turuncudur.
- **Tüm meralar:** ≥ 1200 px'te tablo, liste bölgesinin tamamını kullanır. Sütunlar: Mera (en geniş, tek satır, taşarsa … ve ipucu), Tip, "Puan (bugün 18:00)", En iyi saat, Erişim (kısa rozet: Marina/Feribot/Belirsiz/Açık, ipucunda açıklama), Güven. Güven sütunu yalnız satırlar arasında fark varsa görünür, yoksa tablonun üstünde tek not satırı. Puan, en iyi saat ve ad başlıkları sıralar. Hiçbir hücre 2 satırı geçmez (e2e).
- **Isı haritası:** "şimdi" etiketi saat satırındadır; çakışan saat etiketi gösterilmez.

**Harita (M3):** liman, sanayi ve askeri alanlar kırmızı taralı alan ve lejantla gösterilir, metin etiketi yoktur. Uzak zoom'da (< 12) yalnız yerleşim rozetleri görünür. Önerilen mera her zoomda turuncu halka ve adıyla işaretlidir; harita ona ortalanır.

**Harita sekmesi (Faz P, Windy.com'dan esinlenen kalıplar, kendi açık verimizle; Windy embed/API kullanılmaz):**
- **Saat kaydırıcısı:** haritanın altında 72 saat. Gün ayraçları ve adları, koyu gece bandı (güneş −6°'nin altında), turuncu "şimdi" çizgisi. Kaydırınca mera işaretleri, hava katmanları ve mera glifleri o saate geçer; adres çubuğundaki `?t=` güncellenir. Plan kartındaki "haritada aç" bağlantısı kaydırıcıyı önerilen saatte ve merada açar.
- **Katman seçici:** Puan (varsayılan), Rüzgar, Dalga, Akıntı, Su sıcaklığı, Yağış, Bulut; haritanın üstünde tek satır hap düğmeler (telefonda yana kayar). Seçili katmanın lejantı sağ altta: renk çubuğu, uç değerler, ne olduğu, kaynak.
- **Renk alanları:** kaba model ızgarası (0,1°; akıntı 500 m) tek piksel = tek nokta, doğrusal yeniden örneklemeyle yumuşak; uydurma ayrıntı yok. Deniz alanları kara maskesinin altında. Yağış ve bulut sıfırda saydam; yağış lejantı "tahmin, radar değil", bulut lejantı gece ay ışığı ve ortam karanlığı notunu taşır.
- **Parçacıklar:** rüzgar ve akıntıda 2D canvas üzerinde akış çizgileri (kütüphanesiz). Telefonda ~300, geniş ekranda en çok 1400. WebGL yoksa harita zaten kapalı, katmanlar sessizce kapanır. `prefers-reduced-motion` açıkken yalnız renk alanı.
- **Mera glifleri (zoom ≥ 14):** diskin altında tek küçük etiket. İçinde (gerekirse) güvenlik üçgeni, yağış damlası (≥ 0,1 mm/sa), rüzgarın gittiği yöne ok ve hız. Etiketler glifin yolundan çekilir; glifler üst üste binmez.

**Mera kartı — saatlik tahmin tablosu (P4):** 3 saatte bir sütun, gün başlıkları. Satırlar: Puan, Güvenlik, Rüzgar (hücre altında modellerin aralık çubuğu), Hamle, Yön, Dalga, Yağış, Bulut, Su, Akıntı, Ay. Rüzgar/hamle hücreleri 5 basamaklı renkte (<12, <20, <30, <40, ≥40 km/sa). Gece sütunları koyu. İlk sütun sabit, tablo yana kayar.

## Bileşenler (her biri tek tanım, `global.css`)
- `.btn` birincil (sodyum dolgu, koyu metin), `.btn.secondary` (şeffaf, `--swell` kenar, `--foam` metin), `.btn.small` (32 px). Yükseklik 40 px (dokunmatik 44 px'e `.btn.touch`). Hepsi `inline-flex; align-items: center`.
- `.link`: metin bağlantısı, altı çizili `--mist`, hover `--foam`.
- `.badge`: 12 px, hap şekli, kenar rengi anlamı taşır (`.badge.warn`, `.badge.legal`, `.badge.assume`).
- `.card`: `--deep` zemin, 1 px `--swell` kenar, 12 px yarıçap, iç boşluk `--s4`. Kart eylemleri `.actions`: tek satır, `align-items: center`, `gap: --s2`, aynı yükseklik.
- Başlık menüsü: Plan, Harita, Model; yönetici anahtarı cihazdaysa Sahadayım, Günlük, Ayarlar, Adaylar, Panel.

## İlkeler
0. Yatay kaydırma yok (Q4): hiçbir sayfa ya da panel yana kaymaz. İstisna ısı haritası ve tahmin tablosu; ikisinde de ilk sütun sabit. `body` tek sütun `minmax(0, 1fr)`; mera kartı çekmecesi 420–480 px, içerik kapsayıcısına göre (başlık `clamp()`, takım kutusu 480 px altında tek sütun, grafikler `viewBox` ile %100). e2e akış 8 bunu 7 genişlikte denetler.
1. Ana görsel av planıdır (M1); ısı haritası ikincil sekmededir. Renk yalnız puan anlamına gelir, süs yok.
2. Belirsizlik görünür: bant genişse hücre taralı/soluk; "varsayıma dayanıyor" rozeti.
3. Karanlıkta okunur: ≥ 4.5:1 kontrast, 44 px dokunma hedefi, hareket yalnız kullanıcı eylemine yanıt (parçacıklar yalnız Rüzgar/Akıntı katmanı seçilince; azaltılmış hareket tercihinde kapalı).

## Faz V görsel dil (V0a taslağı — "Bursa kıyıları için bir deniz atlası ve av kokpiti")
Kaynak: `docs/REVISION-V.md` (D1–D9 düzeltmeleri geçerli). Belirteçler `apps/web/src/styles/tokens-v.css`; V1'de sayfalara bağlanacak, şimdilik yalnız maketlerde kullanılıyor.
- **İki tema.** Koyu "gece": mürekkep mavisi zemin, `--ink-0..3` kart katmanları ton farkıyla ayrılır. Açık "atlas": kâğıt harita zemini; koyu temanın tersi değil, ayrı tasarlandı.
- **Deniz ve kara.** Deniz petrol → turkuaz, 5 derinlik tonu: 0–2, 2–5, 5–10, 10–30, >30 m, ayrıca açık deniz. Kara sessiz ama sudan ayırt edilir.
- **Renk rolleri ayrı.**
  - `--act`: tek eylem rengi.
  - `--sel`: seçim/odak halkası; dolgu değildir.
  - `--warn` (amber): yalnız uyarı (düşük güven, eksik veri, erişim bilinmiyor).
  - `--danger`: yalnız güvenlik (hamle/dalga sınırı).
  - **Uygunluk puanı** `--fit-0..4`: tek tonlu lavanta açıklık rampası. Amber/kırmızı yok, denizden ayrı, renk körü güvenli. Sınırlar <30, 30–45, 45–60, 60–75, ≥75 ve zaman boyunca sabit (D2).
- **Kanıt dili.** Ölçüm düz/kalın, model ince, uzaktan gözlem noktalı, varsayım kesikli ve soluk taralı. Doku yalnız harita, kesit ve etiketlerde kullanılır; kart zemininde kullanılmaz.
- **Ölçekler.** Altı yazı boyutu + `--num-l` / `--num-xl`. Bricolage'da `tabular-nums` ölçüldü ve çalışıyor (`docs/design/v0-findings.md`).
- **Grafik ve dokunma boyutları.** Zaman çizelgesi ana satır 30 px, ikincil 18 px. İşaret 22 px, seçili 30 px. Dokunma hedefi 44 px; Sahadayım'da 56 px.
- **Hareket.** 150–220 ms ve yalnız seçime tepki olarak. `prefers-reduced-motion` açıkken 0.
- **Kontrast.** `node docs/design/contrast.mjs` → `docs/design/contrast.md`: 66 çiftin hepsi AA.
- **Simgeler (V0b'de yeniden kuruldu).** `apps/web/src/icons/` (32 adet), SVG + `currentColor`, bitmap yok.
  - Temel: **Tabler Icons 3.51.0 (MIT)**, 19 simge. Yalnız kullanılanlar kopyalandı; paket bağımlılık değil. Lisans: `apps/web/src/icons/LICENSE-tabler.txt`. Her simgenin kaynağı `icons.json`'da (`source`).
  - Özel çizim (13): iskele, mendirek, kordon, kayalık, dere ağzı, lamba, derinlik ve 6 yöntem. Tabler kurallarıyla çizildi: 24 ızgara, 2 px çizgi, yuvarlak uç/köşe, ~2 px iç boşluk. Üretici: `docs/design/build-icons.py`.
  - Etiketsiz tanıma testi (alt ajan, 16 ve 24 px): `docs/design/icon-test/results.md`. Tam tanınmayan yapı tipi ve bağlama simgeleri (mendirek, dere ağzı, LRF, dropshot, dip takımı, çapari) **yalnız metin etiketiyle** kullanılır.
  - Eski set reddedildi; karşılaştırma için: `docs/design/mockups/icons-v0-rejected/`.
- **Gerçek veri / eğitim çizimi ayrımı.**
  - Haritalar OSM kıyısı + sitenin EMODnet türevi `bathy.pmtiles`'ından çizilir. Rakamlar tarihli canlı API anlık görüntüsünden gelir (`docs/design/build-mockup-data.py`).
  - Bugünkü veride olmayan durumlar "örnek durum — bugünkü veride yok" şeridinde gösterilir.
  - Takım düzeni gibi çizimler "eğitim çizimi" diye etiketlenir.
- **Bileşen → kullanıcı sorusu** (maketlerde "Sorular" düğmesiyle açılır):

  | Bileşen | Cevapladığı soru |
  |---|---|
  | Üst şerit | Hangi tür, kıyı, saat aralığı? |
  | Karar cümlesi | Gitmeye değer mi, ne kadar eminim? |
  | Seçili mera | Nereye, hangi saatlerde? |
  | Koşul özeti | O saatte hava/deniz nasıl, rüzgar kıyıya göre nereden? |
  | Üç güven | Hava mı, mera bilgisi mi, av kaydı mı eksik? |
  | Başlangıç önerisi | Elimdeki takımla nasıl başlarım? |
  | Zaman çizelgesi | Hangi saatlerde koşullar ve uygunluk uyuşuyor? |
  | Eşdeğer seçenekler | Yakın puanlı yerler erişim, rüzgar ve veri bakımından nasıl ayrışıyor? |
  | Durum şeridi | Bir şey ters ya da eksikse hemen fark eder miyim? |
  | Lejant | Renkler ne demek, hangi saat? |
  | Katman çipleri | Haritada neyi görmek istiyorum? |
- **Ana ekran: yön A "Atlas" seçildi (10 Kasım).** B reddedildi; maketleri "reddedildi" bandıyla duruyor (`shots/rejected/`).
- **Ana ekran kompozisyonları (V0a).** A "Atlas": tam ekran harita, kayan karar paneli, altta çizelge ve seçenekler. B "Kokpit": solda karar, çizelge ve seçenekler; sağda harita.
  - Dosyalar: `docs/design/mockups/home-{a,b}-*.html`; üretici `docs/design/build-mockups.py`; ekran görüntüleri `docs/design/mockups/shots/`.
  - 390 px ilk ekranda yalnız karar ve küçük koşul özeti var (D9). Harita ve çizelge tek dokunuşla açılır: A'da itilen ekran, B'de alt sekmeler.
- **Kıyı dosyası ve Sahadayım (V0b, yön A).** `docs/design/mockups/dossier-*.html`, `sahadayim-*.html`; üretici `docs/design/build-v0b.py`, veri `build-mockup-data.py --dossier`.
  - Kıyı dosyası, harita üstünde sağ çekmece olarak açılır. Fotoğraf yalnız gerçek ve tarihli Mapillary görüntüsüdür; kanıt zinciri ayrı alanlarda gösterilir. Fotoğraf yoksa OSM geometrisinden "şematik görünüm" çizilir.
  - Lamba dili üç durumludur. Kesitte DTM tahmini kesikli bant olarak, saha kaydı ise ayrı nokta olarak çizilir; kaynaklar çelişirse ortalaması alınmaz, çelişki gösterilir.
  - Sahadayım plan ekranından ayrıdır: büyük saat, 72 px düğmeler (≥ 56 px kuralı), eğitim çizimi bağlama düzeni. Gecede kısık renkler, hareket yok. Mevzuat rakamları doğrulanana kadar yalnız yer tutucu olarak gösterilir.
- **Bitmap görseller:** yalnız `docs/design/assets-needed.md` listesindekiler (21 görsel: tür, takım/yem, boş durum, OG, PWA simgesi), altında "çizim" etiketiyle. Mera için yapay görsel üretilmez.
