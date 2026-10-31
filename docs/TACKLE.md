# Takım ve yöntem önerisi (D3 — tasarım, kod yok)

Amaç: kartta, o saatin koşullarına göre **hangi kamış, hangi jighead, hangi silikon** sorusuna kısa bir öneri. Öneri puanı değiştirmez. Kurallar sezgiseldir (kanıt C) ve av günlüğündeki yöntem alanlarıyla (jighead g, iğne no, silikon boyu/rengi, lamba altı) kalibre edilir.

## Kullanıcının takım profilleri
| Profil | Kamış | Makine | Ana misina | Leader | Kullanım alanı |
|---|---|---|---|---|---|
| **LRF** | Ares Blue Porter AJ-S 6.3 (≈ 190 cm, ultra hafif, solid tip) | Vanford FA C2000S | Gosen PE 0.2 | FC (öneri 0.8–1.2 lb ≈ 0,10–0,13 mm, 60–100 cm) | 0,5–3 g jighead, iskele/mendirek dibi ve iskelenin mevcut aydınlatması, rüzgar ≤ ~20 km/sa |
| **Spin** | Bassterra XT+ 274 cm | Nasci FD C3000 HG | Kairiki 8 (PE ≈ 0.6–0.8 varsayımı) | Daiwa Prorex FC | 5–15 g jig/kaşık, sabiki, uzun atış; rüzgar ve akıntı fazla, derin uç, kayalık |

Profil verisi `data/tackle.yaml` (ileride): `{id, ad, atış ağırlığı min–max g, misina PE, leader lb, max rüzgar km/sa}`. Kartta seçilen profil localStorage'da hatırlanır.

## Kurallar (girdiler model çıktısında zaten var)
Girdiler: yakın-uç derinliği (DTM/saha, 0–50 ve 50–150 m), akıntı (Copernicus 1–5 m, m/s), rüzgar ve hamle (km/sa), uca göre rüzgar yönü (maruziyet), ışık (ortam lüksü + iskelenin mevcut aydınlatması olasılığı), bulanıklık terimi (yağış/dalga), su sıcaklığı.

**Profil seçimi**
- Hamle ≥ 25 km/sa ya da yan rüzgar ≥ 20 km/sa ya da akıntı ≥ 0,25 m/s ya da 50–150 m derinlik ≥ 8 m → **Spin**.
- Yoksa → **LRF**.

**Jighead ağırlığı (LRF)**: hedef, 2–4 saniyede ~1 m batış ve tabana kontrollü ulaşma.
- Taban g = 0,8 + 0,25 × derinlik(m) — örnek: 2 m → 1,3 g, 4 m → 1,8 g, 6 m → 2,3 g.
- Akıntı ×(1 + 2 × akıntı m/s); rüzgar (yan) ≥ 15 km/sa → +0,5 g.
- 0,5 g adımına yuvarla, 0,6–3 g'ye sınırla; üst sınırı aşıyorsa Spin önerilir.
- Saha formundaki **kalibre batma süresi** (C3) varsa doğrudan kullanılır: hedef derinliğe ulaşma süresi ≤ 12 s olan en hafif ağırlık.

**İğne no**
- İstavrit ağzı küçük: #10–#8 (LRF), sabikide #8–#6.
- Av günlüğünde 13 cm altı oranı yüksek merada bir no büyük önerilir (küçük balığı azaltır, D9 mevzuat).

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
