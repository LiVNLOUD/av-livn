# Takım ve yöntem önerisi (D3 tasarım → F0 uygulama → G2 düzeltme)

Amaç: kartta, o saatin koşullarına göre **hangi kamış, hangi jighead, hangi silikon** sorusuna kısa bir öneri. Öneri puanı değiştirmez. Kurallar sezgiseldir (kanıt C) ve av günlüğündeki yöntem alanlarıyla (jighead g, iğne no, silikon boyu/rengi, lamba altı) kalibre edilir.

## Kullanıcının takım profilleri
| Profil | Kamış | Makine | Ana misina | Leader | Kullanım alanı |
|---|---|---|---|---|---|
| **LRF** | Ares Blue Porter AJ-S 6.3 (≈ 190 cm, ultra hafif, solid tip) | Vanford FA C2000S | Gosen PE 0.2 | FC 0.8–1.2 numara (≈3–5 lb, 60–100 cm) | 0,6–5 g jighead, iskele/mendirek dibi ve iskelenin mevcut aydınlatması, rüzgar ≤ ~20 km/sa |
| **Spin** | Bassterra XT+ 274 cm | Nasci FD C3000 HG | Kairiki 8 (PE ≈ 0.6–0.8 varsayımı) | Daiwa Prorex FC | 5–15 g jig/kaşık, sabiki, uzun atış; rüzgar ve akıntı fazla, derin uç, kayalık |

Profil verisi `data/tackle.yaml` (ileride): `{id, ad, atış ağırlığı min–max g, misina PE, leader lb, max rüzgar km/sa}`. Kartta seçilen profil localStorage'da hatırlanır.

## Kurallar (girdiler model çıktısında zaten var)
Girdiler: yakın-uç derinliği (DTM/saha, 0–50 ve 50–150 m), akıntı (Copernicus 1–5 m, m/s), rüzgar ve hamle (km/sa), uca göre rüzgar yönü (maruziyet), ışık (ortam lüksü + iskelenin mevcut aydınlatması olasılığı), bulanıklık terimi (yağış/dalga), su sıcaklığı.

**Birim kuralı (G2):** misina kalınlığı Japon numarası ya da PE ile yazılır; lb yalnız yaklaşık değer olarak parantez içinde ("FC 0.8–1.2 numara (≈3–5 lb)"). Hız km/sa. `unitIssues()` (packages/scoring) her takım metnini ve yöneticinin girdiği profili denetler; hatalı birimli profil kaydedilmez.

**Hedef derinlik — modelin diel koluyla aynı (G2)**
- Gece (lamba altı ya da karanlık): su ortası–yüzey, hedef `min(1,5 m; 0,3 × derinlik)`, saydırma kısa (2–4 s). Gece istavrit ışığa ve planktona yükselir; modelin gece kolu.
- Alacakaranlık: orta su, hedef `0,5 × derinlik`; modelin alacakaranlık tepesi.
- Gündüz: dibe yakın, hedef = derinlik; saydırma dip derinliğine göre. Modelin gündüz kolu derinlik ister.

**Jighead (G2)**
- Varsayılan **sabit (mafsalsız) ajing kafası**. Mafsallı yalnız dip hedefinde (gündüz) ya da kayalık merada, sakin suda (akıntı < 0,15 m/s, yan rüzgar < 10 km/sa).
- Gereken ağırlık = `(0,8 + 0,2 × hedef derinlik) × (1 + 2 × akıntı m/s)`; yan rüzgar ≥ 15 km/sa → +0,5 g, ≥ 25 km/sa → +1 g. Gece sakin suda sonuç 0,8–1,5 g.
- Piyasadaki en yakın boya yuvarlanır: 0,6 / 0,8 / 1 / 1,2 / 1,5 / 2 / 2,5 / 3 / 4 / 5 g.
- **Spin'e geçiş:** gereken ağırlık LRF üst sınırını (5 g) aşarsa ya da hamle LRF profilinin sınırını (25 km/sa) geçerse. Spin ağırlığı gereken ağırlığın tam gram yuvarlaması, 5–20 g.

**İğne no (G2, kanıt A)**
- Varsayılan **#8**. Bedel açık yazılır:
  - **#8:** daha seçici, yasal boy (13 cm) üstü oranı yüksek, daha az vuruş.
  - **#10:** daha çok vuruş, 13 cm altı oranı yüksek, geri bırakma gerekir.
- Dayanak: R19 — Peksu M., Uzer U., Yıldız T., Ayaz A., Karakulak F.S. (2020). J. Appl. Ichthyol. 36(6):893–900. Modal yakalanma boyu #8'de 17,7 cm, #10'da 13,4 cm. Atıf metni RESEARCH.md künyesiyle testle eşlenir.

**Silikon boyu ve rengi**
- İskelenin mevcut aydınlatması altında, gece, berrak su: 1,5–2" şeffaf, simli, beyaz-glow; boy 3–5 cm.
- Karanlık, iskele aydınlatması yok: siluet için koyu (siyah, mor), fosforlu (glow) boyalı silikon ve yavaş düşüş. Glow, ışık kaynağı değil boyadır; onu şarj etmek için suya fener tutulmaz (md. 8/8 yorumu **doğrulanmalı**).
- Gün doğumu/batımı: doğal (şeffaf-yeşil, kırmızı benekli).
- Bulanık su (bulanıklık terimi < 0,8): parlak (chartreuse, pembe-glow), bir boy büyük.
- Soğuk su (< 12 °C) ya da düşük aktivite: küçük (≤ 1,5") ve yavaş aksiyon.

**Teknik**
- İskelenin aydınlatması altında: ışık-gölge sınırına at, düşüşte bekle (balıklar düşüşte vurur), kısa twitch + 2–3 s duruş.
- Açık suda/gündüz: dibe indir, 3–4 sarım + duruş; derin uçta Spin ile sabiki dikine.
- Akıntıda: akıntıya karşı at, serbest sürüklenme.

## Örnek senaryolar (G2, test olarak sabit: `packages/scoring/test/tackle.test.ts`)
Ortak girdiler: derinlik 4 m, akıntı 0,05 m/s, rüzgar 8 km/sa, hamle 12, yan rüzgar 4, berrak su, lamba olasılığı 0,9.

| Senaryo | Değişen girdi | Takım | Jighead | Hedef | Saydırma | Renk |
|---|---|---|---|---|---|---|
| Gece, sakin, lambalı iskele | — | LRF | 1,2 g sabit | yüzeye yakın | 3 s | şeffaf-simli |
| Gece, 25 km/sa yan rüzgar, hamle 30 | rüzgar 25, hamle 30, yan 25 | Spin (hamle > 25) | 5 g sabit | yüzeye yakın | 2 s | şeffaf-simli |
| Gece, 25 km/sa yan rüzgar, hamle 25 içinde | rüzgar 22, hamle 25, yan 25 | LRF | 2 g sabit | yüzeye yakın | 2 s | şeffaf-simli |
| Gündüz, derin mendirek, sakin | derinlik 10 m, güneş 35° | LRF | 3 g mafsallı | dibe yakın | 16 s | doğal |
| Alacakaranlık, akıntılı burun | kayalık, 6 m, akıntı 0,3 m/s | LRF | 2 g sabit | orta su | 6 s | doğal |
| 6 g gerektiren durum | gündüz, 12 m, akıntı 0,4 m/s | Spin (5 g sınırı aşıldı) | 6 g sabit | dibe yakın | 13 s | doğal |

## Mevzuat (6/2 Tebliğ md. 8/8, REGULATION.md)
Öneri kutusu ve Sahadayım hiçbir zaman yapay ışık, lamba götürme, su altı ışığı, LED'li/ışıklı yem ya da feneri suya tutma önermez. "Işık" girdisi yalnız iskelenin **mevcut** aydınlatmasıdır. Kafa lambası yalnız güvenlik ve düğüm için, suya tutulmadan kullanılır. Güvenlik aydınlatması en çok 50 W'tır.

## Kart tasarımı (mera kartında, seçili saatin altında tek kutu)
```
Önerilen takım · LRF            [profil değiştir ▾]
1,5 g jighead · #8 iğne · 2" şeffaf-simli
Neden: uçta ~3,5 m, akıntı zayıf, iskelenin aydınlatması büyük olasılıkla var
Teknik: iskele ışığının sınırına at, düşüşte bekle
```
- Tek satır neden, en çok 2 sürücü (ana sıra nedeni gibi ablasyonla: girdiyi tipik değere çekince öneri değişiyor mu).
- Güvenlik kapısı açıkken kutu gizlenir; yalnız uyarı gösterilir.
- Kanıt rozeti "C — sezgisel; av günlüğüyle kalibre ediliyor".

## Kalibrasyon
- Av günlüğünde yöntem alanları dolu seanslardan verim (adet/saat/kamış) yöntem × koşul.
- n ≥ 20 seans olmadan kural değiştirilmez.
- D6 paneline "yöntem" ekseni eklenir.

## Uygulama notu (sonraki faz)
- Kod yeri: `packages/scoring/src/tackle.ts`, saf ve %100 test.
- Girdi: `V2Hour` bileşenleri + mera derinliği + profil.
- Öneri hesabı Worker'a değil puanlama işine konur. Liste JSON'una öneri kimliği eklenir; metni web tarafı üretir.
