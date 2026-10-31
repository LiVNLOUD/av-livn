# Mevzuat (D9 mevzuat kısmı — tasarım ve kaynak notu)

**Kaynak:** 6/2 Numaralı Amatör Amaçlı Su Ürünlerinin Avcılığının Düzenlenmesi Hakkında Tebliğ (Tebliğ No: 2024/21), Resmî Gazete 11.08.2024, sayı 32629. Dönem: 01.09.2024–31.08.2028. Değişiklik: Tebliğ No 2025/12, RG 16.04.2025. Metin: [lexpera](https://www.lexpera.com.tr/resmi-gazete/metin/6-2-numarali-amator-amacli-su-urunleri-avciliginin-duzenlenmesi-hakkinda-teblig-no-2024-21-32629). Bu sayfa hukuki danışmanlık değildir. Tebliğin güncel hâli esastır.

## Metinden doğrulanan kurallar (2026-10-31 okuması)
| Konu | Kural | Madde |
|---|---|---|
| **Işık** | Balığı cezbetmek için **her türlü ışık kullanımı yasak**. Teknede/kıyıda güvenlik amaçlı aydınlatma en çok 50 W. | 8(8) |
| Günlük miktar (kg ile sınırlı türler) | Kişi başı tek ya da karışık tür toplam **5 kg**. En büyük balık çıkarıldığında kalan 4 kg'ı geçemez. | 15(4) |
| Adet ile sınırlı türler | Kg sınırı uygulanmaz; adet sınırı Çizelge 7'de. Denizde adetli türlerin toplamı da sınırlı (metinde 3). | 15(3), 11(5) |
| Boy toleransı | Boy sınırlı türlerde %5 tolerans. | 15(2) |
| Olta sayısı (deniz) | Kişi başı en çok 4 olta, olta başına en çok 6 iğne + bir çapari (en çok 15 iğne). | 16(3) |
| Yüzme alanı | 01 Nisan–15 Kasım: şamandıralı yüzme alanlarında ve kıyıdan 200 m içinde avcılık yasak. | 16(5) |
| Marmara'da yasak alanlar | Yalova İDO iskelesi önü; Osmangazi Köprüsü ±500 m; 1915 Çanakkale Köprüsü çevresi. Gemlik Körfezi için metinde ayrı madde yok. | 17(1) k, l, m |
| Zıpkın | Gün batımı–doğumu arası yasak; 01.01.2026'dan itibaren amatör balıkçı belgesi gerekir. | 16(4)a, 2025/12 |

**Doğrulanamayan:** Tür bazında asgari boylar ve adet sınırları (Çizelge 7). Tablolar metinde görsel olduğu için okunamadı. Kodda istavrit için **13 cm** uyarısı var (`workers/api/src/routes/catch.ts` `LEGAL_MIN_CM`). Bu değer Çizelge 7'den doğrulanmalı. Lüfer, kolyoz, levrek ve diğerleri tür eklendiğinde (SPECIES-ROADMAP.md) aynı tablodan alınır. Tahminle değer yazılmaz.

## Uygulamaya etkisi
1. **Lamba bileşeni:** Model, iskele/liman/sokak lambası gibi **mevcut aydınlatmayı** puanlar. Kendi ışığınızla balık toplamak yasaktır (8(8)).
   - Kartta ve TACKLE.md'de kalıcı not: "Mevcut aydınlatma; kendi ışığınızla balık toplamak yasak."
   - Sahadayım'daki kırmızı gece modu ekran ışığıdır; cezbetme amaçlı değildir.
2. **13 cm uyarısı:** Av günlüğü ve Sahadayım'da boy girildiğinde gösterilir; kayıt engellenmez ("denize geri bırakın"). Çizelge 7 doğrulanınca değer güncellenir; tür başına `LEGAL_MIN_CM` tablosu.
3. **Günlük 5 kg:** Av günlüğünde gün toplamı ~5 kg'a yaklaşınca uyarı (tasarım). İstavrit ortalama ağırlığı boydan hesaplanır: W = a·L^b, a ve b literatürden; kanıt C.
4. **200 m / yüzme alanı (01.04–15.11):** Kumsal adayları (D1) bu dönemde kartta uyarı taşır: "Yüzme alanında ve kıyıdan 200 m içinde avcılık yasak (01.04–15.11)". Yasak bölge haritası yok; uyarı tip bazında.
5. **Yasak alanlar:** Marmara'daki üç alan bbox dışında. Bbox genişlerse `forbidden.geojson`'a "mevzuat" kaynağıyla eklenir.
6. **Ticari limanlar** (Gemport, Borusan, Roda): mevzuattan değil, liman güvenliği ve özel mülk nedeniyle "erişim yasak" katmanında. D1'de aday üretilmez.

## Bakım
- Tebliğ 31.08.2028'de biter. Yeni tebliğ yayımlanınca bu sayfa ve `LEGAL_MIN_CM` güncellenir.
- Kaynak: RG ve Tarım ve Orman Bakanlığı BSGM duyuruları; içerik kopyalanmaz, madde ve sayı ile atıf yapılır.
