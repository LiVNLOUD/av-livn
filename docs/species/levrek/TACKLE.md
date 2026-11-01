# Levrek — takım ve yem kuralları (G4 tasarım → H3 uygulama, `tackleLevrek()`)

İstavrit takım kutusuyla aynı yapı: satır başına değer, kısa neden, kanıt rozeti. **Asgari boy 25 cm** (6/2 Tebliğ Çizelge 7; REGULATION.md), altındaki denize geri bırakılır. Işıkla balık toplamak yasak (md. 8/8); kendi ışığınla yem/balık toplama önerilmez.

## Takımlar (kullanıcının setleri)
| Profil | Kamış / makine | Misina | Atış | Ne zaman |
|---|---|---|---|---|
| **Spin** (ana) | Bassterra XT+ 274 cm, Nasci FD C3000 HG | Kairiki 8 (PE ≈ 0.8 numara varsayımı) + Daiwa Prorex FC | 6–32 g | Kayalık, dere ağzı, kumsal sörf hattı, mendirek; rüzgar/dalga varken |
| **LRF ile hafif levrek** | Ares Blue Porter AJ-S 6.3, Vanford FA C2000S | Gosen PE 0.2 + FC 0.8–1.2 numara (≈3–5 lb) | ≤ 5 g | Sakin liman içi/iskele, küçük levrek; büyük balıkta kopma riski. FC'yi 1.5–2 numaraya (≈6–8 lb) çıkarmak önerilir |

## Yem türleri
- **Silikon kum balığı / shad** (7–12 cm), jighead 7–21 g: dipte ve orta suda. Fırtına sonrası bulanıkta en güvenilir seçim (C).
- **Minnow** (yüzer/batar, 9–14 cm): sığ kayalık ve sörf hattında, alacakaranlık ve gece yavaş sarım (C).
- **Metal jig** (15–30 g): derin mendirek ucu, uzun atış, akıntı. Gündüz (C).
- **Yüzey yemi** (pencil/popper): sakin alacakaranlık, sığ kayalık (C).

## Kurallar (koşul → öneri; tümü C, av günlüğüyle kalibre edilecek)
- **Takım:** varsayılan spin. Dalga < 0,3 m, rüzgar < 15 km/sa ve liman içi/iskele hedefi varsa LRF hafif levrek.
- **Ağırlık:**
  - Kıyıdan atış mesafesi ve dalga belirler: dalga < 0,5 m → 7–12 g; 0,5–1 m → 12–21 g; > 1 m (güvenliyse) → 21–32 g.
  - Akıntı ≥ 0,25 m/s → bir kademe ağır.
- **Renk:**
  - Bulanık (bulanıklık vekili ≥ 0,4): chartreuse, beyaz, parlak sırt.
  - Berrak gece: koyu siluet (siyah/mor). Alacakaranlık: doğal (gümüş, sardalya).
  - Gündüz berrak: doğal ve ince profil.
- **Boy:** kış ve soğuk suda küçük-orta (7–9 cm) ve yavaş; fırtına ertesi bulanıkta büyük ve titreşimli (10–12 cm shad, kürek kuyruk).
- **Teknik:**
  - Fırtına ertesi: köpük hattına ve dalga kırılımının arkasına at; yavaş, dibe yakın sarım.
  - Dere ağzında: akıntıyla sürükle, tatlı-tuzlu su sınırı.
  - Gece: yavaş, düzgün sarım (yem yakalama görsel ve zor, L20).
- **Yasal:** "yasal asgari boy: 25 cm" satırı her zaman görünür (A, Çizelge 7). Ölçü cetveli önerisi.

## Örnek senaryolar (H3, test olarak sabit: `packages/scoring/test/tackle.test.ts`)
Ortak: derinlik 4 m, akıntı 0,05 m/s, rüzgar 8 km/sa, hamle 12, berrak su, dalga 0,3 m, kayalık, lamba olasılığı 0,2.

| Senaryo | Takım | Ağırlık | Yem | Renk |
|---|---|---|---|---|
| Fırtına ertesi bulanık gece, kayalık (dalga 0,8) | Spin | 14 g | silikon shad 10–12 cm | chartreuse / beyaz |
| Sakin berrak gece, lambalı iskele (3 m, dalga 0,15) | LRF (hafif levrek) | 3 g | LRF shad 5–7 cm | beyaz-gümüş (ışık–gölge sınırı) |
| Yağış sonrası alacakaranlık, dere ağzı | Spin | 10 g | silikon shad 10–12 cm (akıntıyla sürükle) | chartreuse / beyaz |
| Gündüz, derin mendirek (9 m), akıntı 0,3 | Spin | 28 g | metal jig 28 g | doğal, ince profil |
| Kış ani soğuma gecesi, kumsal | Spin | 14 g | minnow 7–9 cm | koyu siluet |
| Alacakaranlık, sığ berrak kayalık | Spin | 14 g | minnow 9–12 cm | doğal gümüş |

Değişmezler (test):
- Spin her zaman 6–32 g.
- LRF ≤ 5 g yalnız sakin (dalga < 0,3 m), sığ (≤ 4 m) ve korunaklı tiplerde (iskele, liman, rıhtım, kordon).
- Yasal asgari boy 25 cm satırı her zaman var (A).
- Hiçbir satır ışık götürmeyi önermez.

## Uygulama notu
- Fonksiyon `packages/scoring/src/tackle.ts` içine tür parametresiyle eklenir (`tackle(input, profiles, species)`).
- Birim denetimi (`unitIssues`) ve senaryo tablosu testleri istavritteki gibi kurulur.
- Satırlar: takım, ağırlık + jighead/yem tipi, yem boyu/profil, renk, teknik, yasal 25 cm.
