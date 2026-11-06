# Takım ve yöntem önerisi (D3 tasarım → F0 uygulama → G2 düzeltme)

Amaç: kartta, o saatin koşullarına göre **hangi kamış, hangi jighead, hangi silikon** sorusuna kısa bir öneri. Öneri puanı değiştirmez. Kurallar sezgiseldir (kanıt C) ve av günlüğündeki yöntem alanlarıyla (jighead g, iğne no, silikon boyu/rengi, lamba altı) kalibre edilir.

## Takım sınıfları (M2: markadan bağımsız)
Herkese açık öneri genel takım sınıflarını kullanır; marka ya da model adı geçmez (`DEFAULT_PROFILES`, `TACKLE_CLASSES`, packages/scoring).

| Sınıf | Atış ağırlığı | İp + lider (genel ölçü) | Kullanım |
|---|---|---|---|
| **Ultra hafif / LRF** | 0,5–5 g | PE 0.2–0.4 + ≈3–5 lb florokarbon lider | iskele ve mendirek dibi, iskelenin mevcut aydınlatması, rüzgar ≤ ~20 km/sa |
| **Hafif spin** | 3–15 g | PE 0.4–0.8 + ≈6–8 lb florokarbon lider | istavritte 6–10 g mikro metal jig ya da ağır jighead; derin uç, güçlü akıntı |
| **Spin** | 6–30 g | PE 0.6–1.0 + ≈8–12 lb florokarbon lider | levrek; dalga ve uzun atış |

Motor iki set kullanır: hafif (LRF) ve ağır (spin). Ağır set önerilen ağırlık 15 g'a kadarsa "Hafif spin", üstündeyse "Spin" diye adlandırılır.

**Kişisel takım isteğe bağlıdır ve cihazda kalır.** Ayarlar → Takımım'a girilir; tarayıcıda `localStorage` `av-livn-my-tackle` anahtarında saklanır ve sunucuya gönderilmez. İki set girilebilir: hafif ve ağır, her biri atış aralığı, ip ve lider. Girilen set motorda genel sınıfın yerine geçer; ağırlık kendi aralığında sınırlanır ve kartta "senin takımına göre" yazar.

M2 öncesinde yöneticinin kişisel seti sunucuda (`meta.tackle_profiles`) tutuluyordu ve `/api/tackle` bu seti herkese döndürüyordu. Artık:
- `/api/tackle` yalnız genel sınıfları döndürür;
- kişisel set yalnız `ADMIN_TOKEN` ile okunur (`GET /api/admin/tackle`);
- Ayarlar → Takımım → "Sunucudaki profilimi bu cihaza taşı" seti kaybetmeden cihaza aktarır.

## Kurallar (girdiler model çıktısında zaten var)
Girdiler: yakın-uç derinliği (DTM/saha, 0–50 ve 50–150 m), akıntı (Copernicus 1–5 m, m/s), rüzgar ve hamle (km/sa), uca göre rüzgar yönü (maruziyet), ışık (ortam lüksü + iskelenin mevcut aydınlatması olasılığı), bulanıklık terimi (yağış/dalga), su sıcaklığı.

**Birim kuralı (G2):** misina kalınlığı Japon numarası ya da PE ile yazılır; lb yalnız yaklaşık değer olarak parantez içinde ("FC 0.8–1.2 numara (≈3–5 lb)"). Hız km/sa. `unitIssues()` (packages/scoring) her takım metnini ve yöneticinin girdiği profili denetler; hatalı birimli profil kaydedilmez.

**Hedef derinlik — modelin diel koluyla aynı (G2)**
- Gece (lamba altı ya da karanlık): su ortası–yüzey, hedef `min(1,5 m; 0,3 × derinlik)`, saydırma kısa (2–4 s). Gece istavrit ışığa ve planktona yükselir; modelin gece kolu.
- Alacakaranlık: orta su, hedef `0,5 × derinlik`; modelin alacakaranlık tepesi.
- Gündüz: dibe yakın, hedef = derinlik; saydırma dip derinliğine göre. Modelin gündüz kolu derinlik ister.

**Jighead (G2)**
- Varsayılan **sabit (mafsalsız) ajing kafası**. Mafsallı yalnız dip hedefinde (gündüz) ya da kayalık merada, sakin suda (akıntı < 0,15 m/s, yan rüzgar < 10 km/sa).
- Gereken ağırlık = `(0,8 + 0,2 × hedef derinlik) × (1 + 2 × akıntı m/s) + 0,12 × max(0, yan rüzgar − 10 km/sa) + 0,04 × max(0, hamle − 20 km/sa)`. Gece sakin suda sonuç 0,8–1,5 g.
- Piyasadaki en yakın boya yuvarlanır: 0,6 / 0,8 / 1 / 1,2 / 1,5 / 2 / 2,5 / 3 / 4 / 5 g.
- **Takım geçişi yalnız gramaja göre (H1):**
  - LRF 5 g'a kadar.
  - 5–6 g arası LRF 5 g kalır, saydırma uzar.
  - Spin YALNIZ ≥ 6 g gerektiğinde; spin setinin alt sınırı 6 g, "spin + < 6 g" testle yasak.
- **Hamle takımı değiştirmez:** profil sınırını (25 km/sa) aşınca not eklenir, ör. "hamle 30 km/sa: atışta misinayı elle frenle, rüzgara yan at". Güvenlik kapısı ayrı.
- **İstavritte spin:**
  - 6–10 g mikro metal jig (derin uç, akıntıda dikine) ya da 6–7 g ağır jighead.
  - Gerekçe: spin kamışı 6 g altında atamaz; istavrit ağzı küçük olduğu için 10 g üstü önerilmez ("koşul istavrit için zor").

**İğne no (G2, kanıt A)**
- Varsayılan **#8**. Bedel açık yazılır:
  - **#8:** daha seçici, yasal boy (13 cm) üstü oranı yüksek, daha az vuruş.
  - **#10:** daha çok vuruş, 13 cm altı oranı yüksek, geri bırakma gerekir.
- Dayanak: R19b — Peksu M., Uzer U., Yıldız T., Ayaz A., Karakulak F.S. (2020). J. Appl. Ichthyol. 36(6):893–900. Modal yakalanma boyu #8'de 17,7 cm, #10'da 13,4 cm; bu seçicilik **çapari (el oltası) iğnelerinde** ölçüldü. LRF jighead'e aktarımdır (kanıt C), LRF için doğrulanmadı. Aynı çalışmanın LRF'ye ait ölçümleri ayrı satırdır (R19): CPUE 1,295 kg/10 iğne/saat, boy 9–16 cm. Atıf metni RESEARCH.md künyesiyle testle eşlenir.

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

## Örnek senaryolar (H1, test olarak sabit: `packages/scoring/test/tackle.test.ts`)
Ortak girdiler: derinlik 4 m, akıntı 0,05 m/s, rüzgar 8 km/sa, hamle 12, yan rüzgar 4, berrak su, lamba olasılığı 0,9.

| Senaryo | Değişen girdi | Takım | Jighead | Hedef | Saydırma | Renk |
|---|---|---|---|---|---|---|
| Gece, sakin, lambalı iskele | — | LRF | 1,2 g sabit | yüzeye yakın | 3–5 s | şeffaf-simli |
| Gece, 25 km/sa yan rüzgar, hamle 30 | rüzgar 25, hamle 30, yan 25 | LRF (+ atış notu) | 3 g sabit | yüzeye yakın | 2–5 s | şeffaf-simli |
| Gündüz, derin mendirek, sakin | derinlik 10 m, güneş 35° | LRF | 3 g mafsallı | dibe yakın | 16–38 s | doğal |
| Alacakaranlık, akıntılı burun | kayalık, 6 m, akıntı 0,3 m/s | LRF | 2 g sabit | orta su | 6–14 s | doğal |
| 5–6 g arası | gündüz, 12 m, akıntı 0,3 m/s | LRF (sınırda; toplam ≈ 5,5 g uyarısı) | 5 g sabit | dibe yakın | 15–36 s | doğal |
| 6 g gerektiren | gündüz, 12 m, akıntı 0,45 m/s | Spin | 6 g ağır jighead / mikro jig | dibe yakın | 14–33 s | doğal |
| 8 g gerektiren | gündüz, 14 m, akıntı 0,6 m/s | Spin | 8 g mikro metal jig | dibe yakın | 14–33 s | doğal |

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

## I7 — saydırma ve atış ağırlığı
- Tek batış modeli: `v2/sink.ts` v₀ = 0,25·√g m/s (kanıt C, ±%40). Saha formundaki kalibrasyon (k) varsa onunla çarpılır.
- Kesin saniye yerine aralık verilir (±%40 hız belirsizliği). Akıntı, misina ve silikon süreyi değiştirir.
- Yerinde kontrol: misina gevşediği an dip; sayıyı bir kez dipte doğrula.
- Kamış uygunluğu toplam atış ağırlığıyla bakılır: jighead + silikon (≈ 0,1 g/cm). LRF üst sınırı aşılırsa uyarı yazılır.
- Profiller (marka, misina) yalnız kayıtlı profilden gelir; kayıtlı olmayan kalınlık tahmin edilmez.
