# D7 bölgesel bolluk ve D8 müsilaj/denizanası uyarısı (tasarım, kod yok)

## D7 — Bölgesel bolluk sinyali
**Soru:** Bu hafta Marmara güneyinde istavrit "var mı"? Habitat puanı yerin uygunluğunu söyler, balığın bölgede olup olmadığını söylemez. Bu yüzden ayrı ve haftalık bir bolluk sinyali gerekir.

**Kaynaklar (yalnız sayı, içerik kopyalanmaz):**
| Kaynak | Ne alınır | Erişim kuralı |
|---|---|---|
| Bursa Büyükşehir Belediyesi su ürünleri hali günlük fiyat/miktar listesi | istavrit (ve kolyoz, lüfer) günlük **giriş miktarı** (kg) ve fiyat | Önce `robots.txt` ve kullanım şartları okunur. İzin yoksa ya da açık veri değilse çekilmez; kullanıcı elle girer. Günde 1 istek, kimlikli User-Agent. |
| İBB / İstanbul su ürünleri hali (karşılaştırma) | aynı | aynı kurallar |
| Kooperatif / BSGM duyuruları, yerel haber | "istavrit bolluğu", av yasağı başlangıç/bitişi gibi olay ve tarihler | Yalnız başlık + tarih + bağlantı. Metin kopyalanmaz; elle onaylanan olay listesi `data/abundance/events.yaml`. |
| Av günlüğü (kendi) | haftalık ortalama adet/saat/kamış | zaten var |

**Model:**
- Haftalık bolluk indeksi B ∈ [0, 1] hesaplanır:
  - Hal giriş miktarının son 4 yılın aynı haftasına göre yüzdelik değeri.
  - Bu değer ticari av çabasına ve havaya bağlıdır: fırtınalı haftada gemi çıkmaz, giriş düşer. Bu yüzden rüzgar haftasıyla düzeltilir.
- B, puanın içine **katılmaz**. Kartta ve ana sayfada ayrı bir satır olarak gösterilir: "Bölgesel bolluk: yüksek / normal / düşük (hal verisi, kanıt C)".
- Av günlüğünde n ≥ 30 seans birikince ancak "B, verimle ilişkili mi?" testi yapılır (D6 paneline eksen olarak). İlişki varsa mevsim terimine çarpan olarak eklenmesi önerilir; karar kullanıcıda.

**Uygulama:**
- `pipeline/av_pipeline/abundance/` ve aylık `abundance.yml`.
- D1 tablosu `abundance_weekly(week, species, kg, price, pct, source)`.
- Public: yalnız sınıf (yüksek/normal/düşük). Ham hal verisi lisansına göre.

## D8 — Müsilaj ve denizanası uyarısı
**Soru:** Merada müsilaj (deniz salyası) ya da yoğun denizanası var mı? İkisi de LRF'yi pratikte bitirir: misina ve jighead kirlenir, istavrit dağılır.

**Veri:**
| Kaynak | Ölçüm | Çözünürlük | Not |
|---|---|---|---|
| Sentinel-2 L2A (Planetary Computer, anonim) | Müsilaj: yüzey yansıması. FAI (Floating Algae Index) ve B04/B05/B06 kırmızı-kenar; 2021 Marmara salgını için yayımlanmış eşikler (literatürden doğrulanacak) | 10–20 m, ~5 günde bir, bulut < %30 | Kıyıya yakın tekne/köpük yanlış pozitif verir; 2+ ardışık sahne şartı |
| Sentinel-3 OLCI (Copernicus Marine OC ürünü, mevcut hesap) | Klorofil-a anomalisi; MCI | 300 m, günlük | Müsilaj öncesi uyarı (fitoplankton patlaması) |
| Copernicus Marine Karadeniz/Marmara SST | sıcaklık anomalisi (müsilaj sıcak + durgun suda artar) | 500 m, saatlik | zaten var (F3) |
| Denizanası | Uydu ile güvenilir değil | — | Saha formuna "denizanası: yok / az / çok" alanı (saha kaynaklı, yalnız admin), bildirime kaynak |

**Model:**
- Mera başına "su yüzeyi riski": yok / izle / yüksek.
  - **izle:** klorofil anomalisi > 2σ ya da FAI eşik üstü, tek sahne.
  - **yüksek:** FAI eşik üstü ≥ 2 ardışık sahne ve uç ≤ 2 km.
- Kartta uyarı satırı. **Yüksek** olduğunda güvenlik kapısı gibi değil, "pratik uyarı" olarak puan × 0,6 önerisi (kullanıcı onayıyla).
- Bildirim (D9): "Müsilaj: favori meranızda yüksek" türü eklenebilir; varsayılan kapalı.

**Doğrulama:**
- 2021 Haziran Marmara müsilaj olayı geriye dönük çalıştırılır. Gemlik ve Mudanya kıyısında tespit tarihleri haberlerle karşılaştırılır (yalnız tarih).
- Yanlış pozitif oranı raporlanır. Eşikler buna göre sabitlenir, kanıt B/C.

**Uygulama:**
- `pipeline/av_pipeline/desk/sentinel2.py` altyapısı yeniden kullanılır (sahne arama, SCL maskesi).
- Haftada iki çalışma (`surface.yml`); D1 `surface_risk(spot_id, date, level, source_json)`.
- Public: seviye (yok/izle/yüksek) ve kaynak adı.
