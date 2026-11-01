# Levrek v1 modeli (G4 tasarım → H3 uygulama, `packages/scoring/src/v2/levrek.ts`)

İstavrit v2 HSI iskeleti (docs/MODEL.md) aynen kullanılır, parametreler türe özgü. Kaynaklar `RESEARCH.md` (L1–L22), veri `DATA-AUDIT.md`, takım `TACKLE.md`. Taslak hesap ve duyarlılık: `analysis/levrek_draft.py` → `SENSITIVITY.md` (mock hava).

## 1. Genel yapı

```
puan(m, t) = ölçek( HSI_s(m) · HSI_d(m, t) )            güvenlik kapısı ayrı: tavan 30
HSI = exp( Σ wᵢ · ln cᵢ / Σ wᵢ ),  cᵢ ∈ [0.05, 1]          ağırlıklı geometrik ortalama
ölçek(r) = clip( 8 + 84 · (ln r − ln r_kötü) / (ln r_ideal − ln r_kötü), 0, 100 )
```

İstavritten farklar:
- ışık (mevcut iskele aydınlatması) etkisi **orta** (H3 kararı; aşağıda);
- bulanıklık terimi **ters yönlü**: orta bulanıklık iyi;
- fırtına sonrası bonusu;
- dalga terimi "sörf hattı" optimumlu;
- mevsim tepesi kışta;
- dere ağzında yağış terimi.

## 2. Statik: HSI_s = geo( yapı^0.7, taban^0.3 )

| Tip | yapı | Dayanak | Kanıt |
|---|---|---|---|
| kayalık kıyı | 0.85 | L1 (Karadeniz'de kayalık yerler yıl boyu) | A (nitel) / C (değer) |
| dere ağzı | 0.85 | L5, L8, L12, L13 | B (yön) / C (değer) |
| mendirek | 0.75 | balıkçı bilgisi (kaya dolgu, akıntı kenarı) | C |
| mahmuz | 0.70 | mendirekle benzer, kısa | C |
| kumsal (sörf hattı) | 0.60 | balıkçı bilgisi; dalga terimiyle yükselir | C |
| iskele | 0.55 | C | C |
| rıhtım / elle eklenen | 0.50–0.55 | C | C |
| liman içi | 0.45 | sakin, berrak su | C |

Taban: kaya 1.0, karışık 0.85, kum 0.7, çamur 0.45, bilinmiyor 0.7 (C). Derinlik terimi yok: levrek sığ kıyıda da avlanır (C).

## 3. Dinamik: HSI_d = geo( diel^0.25, mevsim^0.20, bulanıklık^0.20, dalga^0.15, sıcaklık^0.10, dere^0.05, basınç^0.05 )

```
gece_ağırlığı = σ(−(log10 ortam lüksü − 0)/0.4)                                       istavritteki ışık modeli
diel        = clip( karışım + 0.6 · G(güneş; −3°, 4°) · (1 − karışım) )
karışım     = gece_ağırlığı · min(1, 0.70 + 0.15 · lamba) + (1 − gece_ağırlığı) · 0.30   lamba: 1/0, bilinmiyorsa olasılıkla karışım
mevsim(g)   = clip( 0.35 + 0.60 · Gd(g; 20, 45) + 0.35 · Gd(g; 300, 30) )            Gd: dairesel Gauss, gün
T           = 0.6 · min(1, yağış48/15 mm) + 0.4 · min(1, dalga/1.5 m)                 bulanıklık vekili (istavritteki ile aynı)
bulanıklık  = 0.45 + 0.55 · G(T; 0.45, 0.28)                                           orta bulanık en iyi
              × 1.25  [maks_dalga48 ≥ 1.0 m ve dalga ≤ 0.7 · maks_dalga48]             fırtına ertesi (yatışma)
dalga       = 0.35 + 0.65 · G(dalga · maruziyet; 0.6 m, 0.5 m)                         maruziyet = 1 − e^(−ortalama fetch / 4 km)
sıcaklık    = 1 − 0.6 · σ( (düşüş48 − 1.0 °C) · 3 / 1.5 )   × 0.6 [SST < 9 °C]
dere        = 0.5 + 0.5 · min(1, yağış72 / 20 mm)   (yalnız dere ağzı; diğerleri 0.6)
basınç      = istavritteki terim (C, en düşük ağırlık)
kapı        : dalga ≥ 1.6 m ve maruz kıyı → puan ≤ 30
```

## 4. Parametre tablosu

| Parametre | Değer | Birim | Kanıt | Dayanak |
|---|---|---|---|---|
| w_struct / w_substrate | 0.7 / 0.3 | - | C | — |
| w_diel | 0.25 | - | C | L20 (lab, gece yem yakalama), balıkçı bilgisi |
| day_floor (öğle tabanı) | 0.30 | - | C | — |
| twilight_c / twilight_w | −3 / 4 | ° | C | istavrit R7 yapısı; levrek için C |
| l_night (gece platosu) | 0.70 | - | C | lamba orta etkiyle 0,85'e çıkar |
| l_lamp_gain | 0.15 | - | C | **H3: orta.** Balıkçı bilgisi: levrek gece iskele/liman aydınlatmasının ışık–gölge sınırında yem balığı avlar. İstavritteki gibi plankton toplayan ana etken değil. Kendi ışığınla balık toplamak yasak (md. 8/8); yalnız mevcut aydınlatma |
| w_season | 0.20 | - | C | — |
| winter_doy / winter_w | 20 / 45 | gün | B (konum) | L22 (Ocak–Haziran üreme), L2/L3/L5 (kış üreme alanları) |
| winter_amp | 0.60 | - | C | — |
| autumn_doy / w / amp | 300 / 30 / 0.35 | gün, - | C | sonbahar beslenmesi, balıkçı bilgisi |
| season_base | 0.35 | - | C | kısmi göç: bir kısım yıl boyu kıyıda (L2, L4) |
| w_turb | 0.20 | - | C | — |
| turb_opt / turb_w / turb_floor | 0.45 / 0.28 / 0.45 | - | C | nicel kaynak bulunamadı |
| storm_m / settle / post_storm | 1.0 m / 0.7 / ×1.25 | m, -, - | C | balıkçı bilgisi |
| w_wave | 0.15 | - | C | — |
| wave_opt / wave_w | 0.6 / 0.5 | m | C | sörf hattı, balıkçı bilgisi |
| w_sst | 0.10 | - | C | — |
| sst_drop_tol / scale | 1.0 / 1.5 | °C/48 sa | C | ani soğuma; nicel kaynak bulunamadı |
| sst_floor | 9 | °C | B | L22 (üreme > 9 °C) |
| w_river / river_mm | 0.05 / 20 | -, mm/72 sa | B (yön) / C (değer) | L13 (nehir akışı ↔ yavru bolluğu) |
| w_press | 0.05 | - | C | — |
| gate_wave | 1.6 | m | C | güvenlik |

**Dağılım:**
- 34 skaler parametre ve 14 tip/taban değeri (`analysis/levrek_draft.py` `P`).
- Değer düzeyinde A 0, B 3 (`winter_doy`, `winter_w`, `sst_floor`), geri kalan 31 skaler ve 14 tablo değeri C.
- Yalnız yön kanıtı olanlar: kayalık tercihi A (L1, nitel), dere ağzı ve yağış B (L5, L8, L13).

## 5. Yön testleri (H3: gerçek motorla, `packages/scoring/test/v2/levrek.test.ts`; G4 taslağı `SENSITIVITY.md`)

| # | Test | Taslak sonucu |
|---|---|---|
| 1 | Fırtına ertesi bulanık su > berrak sakin su (kayalık, gece) | 83 > 76 |
| 2 | Gece ve alacakaranlık > öğle | 79 (alacakaranlık), 76 (gece) > 62 (öğle) |
| 3 | Yağış sonrası dere ağzı > açık kumsal | 84 > 69 |
| 4 | Kış ani soğuma (−3 °C/48 sa, 8,5 °C) puanı düşürür | 72 < 76 |
| 5 | Fırtına sırasında maruz mera güvenlik kapısında | 30 (kapı) |
| 6 | Aynı koşulda aydınlatmalı iskele > aydınlatmasız iskele; fark istavrittekinden küçük (orta etki) | H3 testi geçti |

Altı test gerçek motorla her `npm test`'te çalışır. Parametreler `LEVREK_PARAMS` (43 parametre: A 0, B 3, C 40); /model/ sayfası tabloyu oradan üretir.

## 6. Kalibrasyon
- İstavritteki yöntem (MODEL.md §8a, R21): adet ~ Poisson/NB, offset log(aktif saat × kamış).
- Levrek seyrek av olduğu için **sıfır av oranı yüksek** olacak (L1: kıyı avında ~%0,1).
- Sıfırla şişmiş model gerekebilir (ZIP/ZINB); karar n ≥ 30 levrek seansında verilir.
- Taban oran önseli: İrlanda 0,52–0,78 levrek/olta-saat (L19). Bu yalnız ölçek fikri; Marmara için çok yüksek olabilir.
- Kapı (SPECIES-ROADMAP): en az 10 levrek seansı ya da kullanıcı onayı, sonra "deneysel" rozetiyle açılır.
