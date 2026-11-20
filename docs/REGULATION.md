# Mevzuat (D9 mevzuat kısmı — tasarım ve kaynak notu)

**Kaynak:** 6/2 Numaralı Amatör Amaçlı Su Ürünlerinin Avcılığının Düzenlenmesi Hakkında Tebliğ (Tebliğ No: 2024/21), Resmî Gazete 11.08.2024, sayı 32629. Dönem: 01.09.2024–31.08.2028. Değişiklikler: Tebliğ No 2025/12 (RG 16.04.2025) ve **Tebliğ No 2026/26 (RG 16.09.2026, sayı 33372, yayımı tarihinde yürürlükte)**. Metin: [lexpera](https://www.lexpera.com.tr/resmi-gazete/metin/6-2-numarali-amator-amacli-su-urunleri-avciliginin-duzenlenmesi-hakkinda-teblig-no-2024-21-32629). Bu sayfa hukuki danışmanlık değildir. Tebliğin güncel hâli esastır.

## 2026/26 değişikliği (okuma 2026-11-20; RG PDF'i OCR ile, `tur` dil paketi)
| Madde | Değişiklik | Uygulamaya etkisi |
|---|---|---|
| 1 | md. 4(4): 15 yaşını dolduranlara veli/vasi onayıyla Amatör Balıkçı Belgesi | yok |
| 2 | Çizelge 1 (tamamen yasak türler) yeniden düzenlendi | bizim türlerimiz listede yok |
| 3 | Çizelge 6 ilk satır yasak dönemi 15 Nisan–15 Temmuz | yok |
| 4 | md. 13(14): yüzen adalara çıkılarak avcılık yasak | yok (kıyı meraları) |
| **5** | **Çizelge 7: "İstavrit, İstavrit (karagöz)" 13 cm → 12 cm**; dil yasak dönemi 1 Şubat–14 Mart; lagos satırı | **istavrit asgari boyu 12 cm** (`packages/scoring/src/regulation.ts`) |
| 6 | md. 16(7)–(8): 1 Eylül 2027'den itibaren amatör gemi ruhsat tezkeresi; mavi yüzgeçli orkinos izni | yok (kıyıdan av) |
| 7 | md. 17: 1915 Çanakkale Köprüsü alanı yeni koordinatlar, Kemer Üç Adalar; md. 17(6) İstanbul ve Çanakkale Boğazı trafik ayırım şeridinde avcılık yasak | bbox dışında |
| 9 | Yayımı tarihinde yürürlüğe girer | 16.09.2026 |

- md. 15(4) (5 kg / 4 kg) bu değişiklikte **değişmedi**.

## Günlük miktar ve boy ölçümü — birebir metin (okuma 2026-11-20, V2.9)
Kaynak: 6/2 Tebliğ (2024/21), RG 11.08.2024 sayı 32629. Metin, Lexpera "Resmî Gazete metin" sayfasından alındı; Resmî Gazete sayfasına konteynerden erişilemedi.

**md. 15(4):**
> "(4) Kg cinsinden limit verilen türlerde, avlanılan tür tek veya karışık olsun 5 kg'ı geçemez. Kg cinsinden sınırlama getirilen türlerde, tek bireyin 5 kg'ı geçmesi halinde, bu birey yasal limitler dâhilinde kabul edilir. Avlanan balıklardan en büyüğünün hariç tutulduğu durumda, geri kalan balıkların toplam ağırlığının 4 kg'ı geçmemesi halinde, avlanan balıklar alıkonulabilir miktar dâhiline kabul edilir."

**md. 15(5) (ilk cümle):**
> "(5) Alıkonulabilir miktar, her türün ayrı ayrı alıkonulacağı miktar olmayıp, av günü sayısına bakılmaksızın bir amatör balıkçının beraberinde götürebileceği toplam balık miktarıdır."

**md. 3(1)(f), boy ölçümü:**
> "f) Balık boyu (Toplam boy): Ölçülen metoda göre toplam boy veya çatal boy olarak yapılan balık boyu ölçümünü, tam boy; ağzı kapalı iken balık başının ön ucu ile kuyruk yüzgecinin en uzun ışınının bitim noktası arasındaki izdüşüm uzunluğunu; çatal boy; alt çene ucu ile kuyruk yüzgecinin çatalı arasındaki uzunluğu,"

Notlar:
- **5/2'deki istisna 6/2'de de var.** "tek bireyin 5 kg'ı geçmesi halinde, bu birey yasal limitler dâhilinde kabul edilir" cümlesi 6/2 md. 15(4)'te, aynı hükmün içsu karşılığı md. 11(4)'te geçiyor. 5/2 (2020/21) metnini ayrıca açamadım (RG 22.08.2020 sayfası bulunamadı), bu yüzden iki metni yan yana karşılaştırmadım.
- **Uygulamanın okuması (`regulation.ts` `bagCheck`):**
  - toplam ≤ 5 kg ise yasal (1. cümle);
  - toplam > 5 kg ise en büyük balık hariç kalan ≤ 4 kg olduğunda yasal (3. cümle; tek balığın 5 kg'ı geçmesi bunun özel hâli, 2. cümle);
  - "aşıldı" yalnız toplam > 5 **ve** kalan > 4 olduğunda gösterilir;
  - hesap kişi başına yapılır (md. 15(5)), kullanıcının girdiği ağırlıkla; boydan ağırlık tahmini yapılmaz.
- Önceki sürüm "kalan > 4"ü tek başına aşım sayıyordu; bu yanlıştı ve düzeltildi.
- **Boy:** çizelgedeki sınırlar, yıldızlı satırlar (çatal boy) dışında tam boydur. Sahadayım boy sorusu bu tanımı kısaca gösterir.

## Metinden doğrulanan kurallar (2026-10-31 okuması)
| Konu | Kural | Madde |
|---|---|---|
| **Işık** | Balığı cezbetmek için **her türlü ışık kullanımı yasak**. Teknede/kıyıda güvenlik amaçlı aydınlatma en çok 50 W. | 8(8) |
| Günlük miktar (kg ile sınırlı türler) | Kişi başı tek ya da karışık tür toplam **5 kg**. En büyük balık çıkarıldığında kalan 4 kg'ı geçemez. | 15(4) |
| Adet ile sınırlı türler | Kg sınırı uygulanmaz; adet sınırı Çizelge 7'de (bizim türlerin hiçbiri adetli değil). | 15(3) |
| Boy toleransı | Boy sınırlı türlerde %5 tolerans. | 15(2) |
| Olta sayısı (deniz) | Kişi başı en çok 4 olta, olta başına en çok 6 iğne + bir çapari (en çok 15 iğne). | 16(3) |
| Yüzme alanı | 01 Nisan–15 Kasım: sahilden 200 m'yi geçmeyen, şamandıralarla çevrilmiş yüzme alanları içinde avcılık yasak (birebir metin aşağıda). | 16(5) |
| Marmara'da yasak alanlar | Yalova İDO iskelesi önü; Osmangazi Köprüsü ±500 m; 1915 Çanakkale Köprüsü çevresi. Gemlik Körfezi için metinde ayrı madde yok. | 17(1) k, l, m |
| Zıpkın | Gün batımı–doğumu arası yasak; 01.01.2026'dan itibaren amatör balıkçı belgesi gerekir. | 16(4)a, 2025/12 |

## Asgari boy ve miktar (Çizelge 7 — "Denizlerde avlanabilecek türler", md. 15)
Kaynak: RG 11.08.2024/32629, [20240811-4.htm](https://www.resmigazete.gov.tr/eskiler/2024/08/20240811-4.htm). Çizelge 7, sayfada iki görüntü olarak yer alıyor (`image024.gif` ve devamı `image016.gif`). Metin katmanı olmadığı için görüntüden okundu: Tesseract `tur` OCR'ı ve satır satır görsel kontrol (2026-10-31). Ek PDF (`20240811-4-1.pdf`, 18 sayfa) yalnız haritalardır. 16.04.2025 değişikliği (2025/12) Çizelge 7'yi değiştirmiyor; yalnız md. 16(4)ç zıpkın belgesi ve md. 17 alan yasakları değişti.

| Tür (SPECIES-ROADMAP sırası) | Latince (çizelgedeki) | Asgari boy | Miktar | Zaman yasağı |
|---|---|---|---|---|
| **İstavrit, İstavrit (karagöz)** | *Trachurus trachurus*, *T. mediterraneus* | **12 cm** (2026/26; önceden 13 cm) | kg | — |
| Levrek | *Dicentrarchus labrax* | 25 cm | kg | — |
| Lüfer (çinekop dahil) | *Pomatomus saltatrix* | 18 cm | kg | — |
| Mırmır | çizelgede yok → "Diğer türler" | sınır yok | kg | — |
| **İzmarit** | çizelgede yok (*Spicara* satırı yok; 2026-11-20'de görüntüden yeniden okundu) → "Diğer türler" | **sınır yok** | kg | — |
| Karagöz (sparid) | *Diplodus vulgaris* | 18 cm | kg | — |
| Kolyoz | *Scomber japonicus* | 18 cm | kg | — |
| (ilgili diğerleri) Sargos 21 cm, Çipura 20 cm, Mezgit 13 cm, Uskumru 20 cm, Palamut 25 cm (1 Nis–14 Ağu yasak) | | | | |

- "kg" = md. 15(4): kişi başı toplam 5 kg (en büyük balık hariç 4 kg). Boy toleransı %5 (md. 15(2)).
- **Boy ölçümü:** Çizelge 7 dipnotu yalnız yıldızlı satırlar (kılıç, mavi yüzgeçli orkinos) için "çatal boy" der. Diğer türlerde ölçüm biçimi tanımlar maddesinden okunmadı. Tam boy tanımı md. 3(1)(f)'den birebir okundu (yukarıda); Sahadayım boy sorusu bu tanımı gösterir.
- İstavrit değeri 2026/26 ile **12 cm** oldu (önceki uygulama 13 cm). Tek kaynak `packages/scoring/src/regulation.ts`; motor, worker ve web oradan okur. Av günlüğü ve Sahadayım uyarı tablosu (`LEGAL_MIN_CM`) Çizelge 7'den genişletildi: istavrit 13, levrek 25, lüfer 18, kolyoz 18, karagöz 18, sargos 21, çipura 20, mezgit 13 cm.
- "Karagöz" adı karışıktır: çizelgede hem *T. mediterraneus* ("İstavrit (karagöz)", 13 cm) hem *Diplodus vulgaris* ("Karagöz", 18 cm) var. Av günlüğünde "karagöz" sparid kabul edilir.

## Kumsal / yüzme alanı kuralı (md. 16(5), birebir)
> "(5) 1 Nisan - 15 Kasım tarihleri arasındaki dönemde, sahilden itibaren uzaklığı 200 metreyi geçmeyen, şamandıralarla çevrilmiş yüzme alanları içinde su ürünleri avcılığı yasaktır."

**Kapsam:** Yasak, **şamandıralarla çevrilmiş** yüzme alanları içinde geçerlidir; kıyı boyunca genel bir 200 m yasağı değildir. Uygulama bunu kumsal tipindeki meralarda tarih aralığında rozet olarak gösterir ("Yüzme alanı: 1 Nis–15 Kas avcılık yasak"). Kumsalda şamandıralı alan olup olmadığını bilmiyoruz: rozet uyarıdır, kesin yasak bilgisi değildir (**doğrulanmalı**: merada şamandıra var mı). Önceki sürümdeki "ve kıyıdan 200 m içinde" ifadesi yanlış okumaydı; düzeltildi.

## Işık (md. 8(8), birebir)
> "(8) Amatör balıkçılıkta avlanma amaçlı her türlü ışık kullanımı yasaktır. Ancak, can ve mal güvenliği açısından 50 watt'ı geçmemek koşuluyla gemi içerisinde ve kıyıda aydınlatma amaçlı kullanılan ışık bu kapsamda değerlendirilmez."

## Uygulamaya etkisi
1. **Lamba bileşeni:** Model, iskele/liman/sokak lambası gibi **mevcut aydınlatmayı** puanlar. Kendi ışığınızla balık toplamak yasaktır (8(8)).
   - Kartta ve TACKLE.md'de kalıcı not: "Mevcut aydınlatma; kendi ışığınızla balık toplamak yasak."
   - Sahadayım'daki kırmızı gece modu ekran ışığıdır; cezbetme amaçlı değildir.
2. **Asgari boy uyarısı:** Av günlüğü ve Sahadayım'da boy girildiğinde tür başına (`LEGAL_MIN_CM`, Çizelge 7) gösterilir; kayıt engellenmez ("denize geri bırakın").
3. **Günlük 5 kg (V2.9):** md. 15(4) kişi başıdır, tek ya da karışık tür toplamına uygulanır (kg ile sınırlı türler; bizim türlerin hepsi). `bagCheck` (regulation.ts), yukarıdaki birebir metne göre:
   - **"aşıldı":** toplam > 5 kg **ve** en büyük balık hariç kalan > 4 kg;
   - **bilgi satırı:** yasal sınırdayken toplam ≥ 4 kg ya da kalan ≥ 3,5 kg; yasal bir eşik değildir.
   - **Ağırlık:** kullanıcının girdiği ağırlıkla hesaplanır. Kişi sayısına bölünür. Boydan ağırlık tahmini (W = a·Lᵇ) kaynaklı a, b olmadan **yapılmaz**.
   - İzmarit kg toplamına dahildir ("Diğer türler", kg).
4. **Yüzme alanı (01.04–15.11):** Kumsal tipindeki meralar bu dönemde listede, kartta ve ısı haritasında rozet taşır: "Şamandıralı yüzme alanında avcılık yasak (1 Nis–15 Kas)". Şamandıra haritası yok; uyarı tip ve tarih bazında (E7).
5. **Yasak alanlar:** Marmara'daki üç alan bbox dışında. Bbox genişlerse `forbidden.geojson`'a "mevzuat" kaynağıyla eklenir.
6. **Ticari limanlar** (Gemport, Borusan, Roda): mevzuattan değil, liman güvenliği ve özel mülk nedeniyle "erişim yasak" katmanında. D1'de aday üretilmez.

## Bakım
- Tebliğ 31.08.2028'de biter. Yeni tebliğ yayımlanınca bu sayfa ve `LEGAL_MIN_CM` güncellenir.
- Kaynak: RG ve Tarım ve Orman Bakanlığı BSGM duyuruları; içerik kopyalanmaz, madde ve sayı ile atıf yapılır.
