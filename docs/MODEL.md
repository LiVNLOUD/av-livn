# MODEL — İstavrit v2: Habitat Uygunluk İndeksi (HSI)

Durum: **tasarım (Bölüm A)**. Canlıda v1.1 çalışıyor (`docs/archive/SCORING-v1.md`). Taslak hesap `analysis/v2_model.py` + `analysis/v2_draft.py` (numpy, üretime bağlı değil); B1'de `packages/scoring`'e TypeScript olarak taşınır.

Kaynak numaraları (R1…R18) `docs/RESEARCH.md`; veri kararları `docs/DATA-AUDIT.md`.

## 1. Genel yapı

```
puan(m, t) = 100 · HSI_s(m) · HSI_d(m, t)          güvenlik kapısı ayrı (v1'deki gibi tavan 30, puana karışmaz)

HSI = exp( Σ wᵢ · ln cᵢ / Σ wᵢ )                    ağırlıklı geometrik ortalama, her cᵢ ∈ [0.05, 1]
```

- **Geometrik ortalama:** bir bileşen kötüyse puanı aşağı çeker, ama tek başına sıfırlamaz (taban 0.05). v1'deki doğrusal toplamın "iyi bileşenler kötüyü telafi eder" kusurunu giderir.
- **Eğri tipi:** her eğri sürekli (logistik `σ(x) = 1/(1+e^−x)`, Gauss ya da `1/(1+x²)`). Basamak fonksiyonu yok.
- **v1'den farkı:** statik terim meraları ayırır. Diel etki bir çarpan merdiveni değil, iki kolun sürekli karışımı.

## 2. Statik bileşenler: HSI_s(m)

```
HSI_s = geo( c_yapı ^ w_struct(0.75),  c_taban ^ w_substrate(0.25) )
```

| Bileşen | Denklem | Girdi | Öncelik zinciri |
|---|---|---|---|
| **Yapı** `c_yapı` | `S_tür · (0.4 + 0.6 · (1 − e^(−L / 0.15 km)))`; S_iskele 0.75, S_mendirek 0.85 | OSM yapı türü, uzunluk L | saha formu > OSM |
| **Taban** `c_taban` | `g · v(sınıf) + (1 − g) · 0.75`; v: ince çamur 0.70, kumlu çamur 0.75, çamurlu kum 0.80, kum 0.80, iri 0.90, kaya 0.95; g = güven ağırlığı (0→0.2, 1→0.4, 2→0.6, 3→0.8) | EUSeaMap 2025 + güven rasterı | saha (çoklu seçim) > EUSeaMap |
| **Derinlik (atış mesafesi)** `c_derinlik` | `d_atış = 0.4 · d̂(0–50 m) + 0.6 · d̂(50–150 m)`; `d̂ = w · d_DTM + (1 − w) · d_önsel`, w = 0.3 (DTM enterpolasyonlu), 0.9 (ölçüm); `c = 0.05 + 0.95 · σ((d_atış − 3.5) / 1.2)` | DTM bandı, yapı önseli | saha derinlik çiftleri > DTM (CDI) > önsel > DTM (GEBCO) |
| **Derinlik önseli** | iskele `1 + 4 · (1 − e^(−L/250))`, mendirek `2 + 4 · (1 − e^(−L/400))`; feribot iskelesi `≥ 5 m` | L | (C; DATA-AUDIT §1 feribot testi) |
| **Maruziyet gülü** | `E(θ) = F(θ) / (F(θ) + 3 km)`; F = 16 yön fetch | OSM land polygons (vektör) | — |
| **Lamba** | üç durum, §4 | saha formu | saha > önsel |
| **access** | puana girmez; kartta gösterilir: `açık` / `kısıtlı olabilir (feribot)` (#4, #15) / `belirsiz` (#10) | admin | — |

**Notlar:**
- Derinlik HSI_s'e değil, **gündüz koluna** girer (§3): gece lambaya gelen balık yüzeyde, gündüz derinlik belirleyici. Böylece çift sayım yok.
- Maruziyet gülü statik bir veridir, puana rüzgar ve dalga yönüyle dinamik olarak girer (§3).

## 3. Dinamik bileşenler: HSI_d(m, t)

```
HSI_d = geo( diel^0.40, mevsim^0.20, rüzgar_dalga^0.15, su^0.08, bulanıklık^0.09, basınç^0.04, akıntı^0.04 )
```

### 3.1 Ortam ışığı indeksi (bulut dahil)

```
E_güneş = max( 1.3·10⁵ · sin(h☉)⁺ ,  10^(−3 + 6.3 · σ((h☉ + 3) / 2.2)) )     lux; alacakaranlık düzgün geçiş
E_ay    = 0.25 · f_ay · sin(h☾)⁺                                            dolunay ≈ 0.25 lux
A_bulut = 1 − 0.75 · (N / 100)^3.4                                          Kasten & Czeplak 1980 (R17)
log E   = log₁₀( (E_güneş + E_ay) · A_bulut + 10⁻³ )
```

**Bulut kapalılığı modele girer:**
- Gündüz: kapalı hava ışığı ~4 kat azaltır, gündüz kolunu yumuşatır.
- Gece: ay ışığını keser, lamba kontrastını artırır.
- Arayüzdeki "puanı etkilemez" etiketi B5/B6'da kaldırılır.

### 3.2 Diel iki kol

```
w_gece  = σ( −(log E − 0) / 0.4 )                                   ~1 lux'ta kollar yer değiştirir
kol_gece (lamba var) = 0.10 + 0.90 · σ( (log₁₀ 20 − log E − 1.5) / 0.5 )   lamba/ortam kontrastı
kol_gece (lamba yok) = 0.10 + 0.15 · clip((log E + 3) / 3, 0, 1)            yalnız ay ışığı
kol_gündüz = c_derinlik ^ (1 + 0.8 · clip((log E − 3) / 2.2, 0, 1))         parlak öğlede sığ mera daha çok kaybeder
karışım = w_gece · kol_gece + (1 − w_gece) · kol_gündüz
T       = exp( −½ · ((h☉ + 3°) / 3.5°)² )                                   alacakaranlık kıyıya yaklaşma tepesi
diel    = karışım + 0.35 · T · (1 − karışım)
```

**Mekanizma:**
- Gece av zooplankton yüzeye çıkar (*C. euxinus* DVM, R12). İstavritin Marmara diyeti misid, öfozid ve kopepod (R3). Lamba hem avı hem balığı toplar.
- Ay ve bulut lamba kontrastını değiştirir.
- Gündüz balık derinde, mera ancak atış mesafesinde derinlik varsa iyi.
- Alacakaranlık geçişi her iki kol için de sürekli.

### 3.3 Su sıcaklığı: yalnız değişim hızı

```
ΔT₄₈ = T(t) − T(t − 48 sa)                         Copernicus mrm-500m, 0–20 m ortalaması (B2); taslakta Open-Meteo SST (mock)
c_su = exp( −½ · (min(0, ΔT₄₈ + 0.5) / 1.5)² )      ani soğuma (upwelling, kuzeyli) cezalanır; ısınma nötr
```

- **Sabit 14–20 °C hedefi kaldırıldı.** *T. trachurus*'un 16–21 °C bandı aktarılmadı: tür farkı var, Marmara yüzeyi yıl içinde 6–27 °C arası değişiyor ve tür yıl boyu bulunuyor (R3).
- **Sapma terimi yok:** Gemlik Körfezi'ni kapsayan bir klimatoloji yok (DATA-AUDIT §4: BS multiyear 0 hücre, SST L4 0 hücre, ERA5 çok kaba).
- **B2 seçeneği:** mrm-500m P1D arşivinden (2021-11 →) gün-of-yıl normali kurulursa, `exp(−½ (ΔT_normal / 2)²)` terimi bayrakla ve ağırlık ≤ 0.04 ile eklenebilir.

### 3.4 Fenoloji (sürekli, gün-of-yıl, dairesel)

```
mevsim(g) = clip( 0.30 + 0.45 · G(g; 210, 45) + 0.70 · G(g; 285, 35) )        G = dairesel Gauss
```

- **Üreme tepesi Temmuz sonu:** Mayıs–Ağustos yayılımlı, ~6 günde bir yumurtlama (R1, R2).
- **Sonbahar beslenme tepesi Ekim ortası:** beslenme yoğunluğu en yüksek sonbaharda, en düşük kışın (R3).
- **Kış tabanı 0.30.**
- **Konumlar A, genlikler C.** R3'te yaz örneği yok; Temmuz–Eylül farkı bu yüzden ölçülü tutuldu.

### 3.5 Rüzgar ve dalga × maruziyet gülü

```
U   = max(rüzgar, 0.7 · hamle)                    km/sa
x   = (U / 30)² · E(θ_rüzgar) + (Hs · E(θ_dalga) / 1.0 m)²
c_rd = 1 / (1 + x²)
```

- Kıyıya vuran rüzgar yalnız o yöndeki fetch açıksa cezalanır.
- Korunaklı mera (E ≈ 0) fırtınada da iyi kalır (yön testi 3).
- Hs, Open-Meteo Marine'in kaba ızgarasından gelir ve E ile meraya ölçeklenir.

### 3.6 Bulanıklık vekili, basınç, akıntı

```
τ        = 1 − exp( −(R₄₈ / 15 mm + Hs·E / 1.5 m) )     c_bulanık = 1 − 0.5 · τ     (görsel avcı, yön R11; büyüklük C)
c_basınç = 1 − 0.2 · σ( (|Δp₃| − 3 hPa) / 1 )            kanıt bulunamadı → en düşük ağırlık
c_akıntı = 0.7 + 0.3 · σ( (v − 0.05 m/s) / 0.03 )        durgun suda hafif düşüş (C)
```

## 4. Lamba: üç durum (var / yok / bilinmiyor)

```
puan(bilinmiyor) = 100 · HSI_s · [ p · HSI_d(lamba var) + (1 − p) · HSI_d(lamba yok) ]
```

- **"Bilinmiyor" asla "yok" gibi işlenmez.** F1.1'deki "bilinmeyen = lambasız" kararının yerini alır.
- **Ay terimi de karışımın içinde:** ay ışığı lambalı kolda kontrastı azaltır, lambasız kolda ışık sağlar.
- **Monte Carlo:** lamba her çekimde `Bernoulli(p)` senaryosu olarak çekilir. Senaryo farkı %10–90 bandını genişletir (yön testi 4: bilinmiyor 55.8, var 52.1, yok 45.2 puan genişlik).
- **Önsel p (C):**
  - yolcu ve feribot iskelesi 0.85: gece seferi ve yanaşma aydınlatması varsayımı (#4 Mudanya, #15 İDO)
  - diğer iskele 0.50
  - mendirek ve mahmuz 0.30
- **Lamba rengi** (beyaz/sarı/LED) formda kaydedilir. v2'de parametre değil: R8 juvenil *T. trachurus*, tank deneyi. Veri birikince değerlendirilir.

## 5. Parametre tablosu

`analysis/v2_model.py` → `PARAMS`. Monte Carlo σ kanıt düzeyine göre: A 0.10, B 0.25, C 0.50 (log-normal çarpan; açı ve eşik parametrelerinde toplamsal).

| Parametre | Değer | Birim | Kanıt | MC σ (log) | Kaynak |
|---|---|---|---|---|---|
| `night_theta` | 0 | log10 lux | C | 0.5 | R7 |
| `night_slope` | 0.4 | log10 lux | C | 0.5 | R7 |
| `lamp_lux` | 20 | lux | C | 0.5 | R8,R12 |
| `contrast_mid` | 1.5 | log10 | C | 0.5 | R8 |
| `contrast_slope` | 0.5 | log10 | C | 0.5 | R8 |
| `dark_base` | 0.1 | - | C | 0.5 | R7 |
| `moon_gain` | 0.15 | - | C | 0.5 | R7 |
| `twilight_centre` | -3 | deg | C | 0.5 | R7 |
| `twilight_width` | 3.5 | deg | C | 0.5 | R7 |
| `twilight_gain` | 0.35 | - | C | 0.5 | R7 |
| `bright_k` | 0.8 | - | C | 0.5 | R10 |
| `struct_pier` | 0.75 | - | C | 0.5 | — |
| `struct_breakwater` | 0.85 | - | C | 0.5 | — |
| `struct_len_km` | 0.15 | km | C | 0.5 | — |
| `depth_mid` | 3.5 | m | C | 0.5 | R10 |
| `depth_slope` | 1.2 | m | C | 0.5 | R10 |
| `dtm_weight_interp` | 0.3 | - | C | 0.5 | DATA-AUDIT |
| `fetch_ref_km` | 3 | km | C | 0.5 | — |
| `wind_ref_kmh` | 30 | km/sa | C | 0.5 | — |
| `wave_ref_m` | 1 | m | C | 0.5 | — |
| `turb_rain_mm` | 15 | mm/48 sa | C | 0.5 | R11 |
| `turb_wave_m` | 1.5 | m | C | 0.5 | R11 |
| `turb_max_loss` | 0.5 | - | C | 0.5 | R11 |
| `sst_drop_tol` | 0.5 | °C/48 sa | C | 0.5 | — |
| `sst_drop_scale` | 1.5 | °C/48 sa | C | 0.5 | — |
| `press_rate` | 3 | hPa/3 sa | C | 0.5 | — |
| `press_loss` | 0.2 | - | C | 0.5 | — |
| `season_base` | 0.3 | - | C | 0.5 | R3 |
| `season_spawn_amp` | 0.45 | - | C | 0.5 | R1,R2 |
| `season_spawn_doy` | 210 | gün | A | 0.1 | R1,R2 |
| `season_spawn_w` | 45 | gün | A | 0.1 | R1,R2 |
| `season_autumn_amp` | 0.7 | - | C | 0.5 | R3 |
| `season_autumn_doy` | 285 | gün | A | 0.1 | R3 |
| `season_autumn_w` | 35 | gün | B | 0.25 | R3 |
| `w_diel` | 0.4 | - | C | 0.5 | — |
| `w_season` | 0.2 | - | C | 0.5 | — |
| `w_wind` | 0.15 | - | C | 0.5 | — |
| `w_sst` | 0.08 | - | C | 0.5 | — |
| `w_turb` | 0.09 | - | C | 0.5 | — |
| `w_press` | 0.04 | - | C | 0.5 | — |
| `w_current` | 0.04 | - | C | 0.5 | — |
| `w_struct` | 0.75 | - | C | 0.5 | — |
| `w_substrate` | 0.25 | - | C | 0.5 | — |

**Dağılım:** 42 parametre; A 3, B 1, C 38. Model ağırlıkla C düzeyinde. Bu yüzden kalibrasyon planı (§8) zorunlu.

## 6. Belirsizlik: Monte Carlo %10–90 bandı
- **Çekim sayısı:** N = 200 (B1'de 500).
- **Her çekimde:** tüm parametreler kanıt düzeyine göre ölçeklenir; bilinmeyen lamba Bernoulli senaryosu olarak çekilir.
- **Kartta:** beklenen puan + %10–90 bandı (B4).
- **Taslakta ortalama bant genişliği 47.7 puan.** Bu, C-ağırlıklı modelin dürüst belirsizliği; saha formu ve av günlüğüyle daralması beklenir.

## 6a. Ölçek kalibrasyonu (B1)

```
ham   = HSI_s · HSI_d                                    (0.05² … 1; geometrik ortalamaların çarpımı → log ölçeği doğal)
puan  = clip( 8 + 84 · (ln ham − ln r_kötü) / (ln r_ideal − ln r_kötü), 0, 100 )
```

**Çapalar:** iki belgelenmiş referans senaryonun varsayılan parametrelerle hesaplanan ham değeri. Uydurma yok; ağırlıklara dokunulmadı.

| Senaryo | Tanım | Ham | Puan |
|---|---|---|---|
| İdeal (`IDEAL_SPOT/WEATHER`) | 600 m mendirek, kaya + midyeli (saha), atışta 7–12 m (saha), lamba var, korunaklı, aysız açık gece, Ekim ortası, sakin, kararlı | 0.859 | 92 |
| En kötü (`WORST_SPOT/WEATHER`) | 15 m iskele, çamur, 0.3–0.8 m, lamba yok, tam açık, Şubat öğlesi, kıyıya 45 km/sa + 2 m dalga, 40 mm yağış, −3 °C/48 sa soğuma | 0.050 | 8 |

- Dönüşüm monoton: tüm sıralamalar ve yön testleri korunur.
- Monte Carlo çekimlerine de aynı dönüşüm uygulanır.
- **Birim testi** (`packages/scoring/test/v2/model.test.ts`): ideal ≥ 85, en kötü ≤ 15, ideale yakın varyantlar ≥ 75–80, en kötüye yakın ≤ 20; 5 yön testi dönüşüm sonrası.

## 6b. Bileşen kaynağı (B1)

Her bileşen değeriyle birlikte bir **kaynak** döner (UI rozeti):

| Kaynak | Ne zaman |
|---|---|
| `saha` | saha formu (derinlik, taban, yapı, lamba) |
| `Copernicus` | su sıcaklığı/akıntı Copernicus'tan (B2), kısa normal sapması |
| `EUSeaMap` | taban sınıfı, güvenle ağırlıklı |
| `DTM-ölçüm` | DTM hücresi ölçüm (CDI) kaynaklı — bu bbox'ta meralarda yok |
| `yapı-uzunluğu-tahmini` | derinlik: DTM enterpolasyonlu veya yok → yapı türü/uzunluğu önseli baskın |
| `önsel` | lamba bilinmiyor (önsel olasılık), mevsim eğrisi, taban bilinmiyor |
| `OSM` | yapı türü ve uzunluğu |
| `Open-Meteo` | rüzgar, dalga, yağış, basınç (Copernicus yoksa su/akıntı) |
| `astronomi` | güneş/ay konumu |

## 6c. Saha düzenlemesinden sonra yeniden puanlama (C3)

- Worker'da anında nokta puanı ölçüldü (Workers Observability, canlı): POST 42 ms, PATCH 24 ms, DELETE 27 ms CPU. Ücretsiz katmanın ~10 ms sınırını aştığı için `meta.rescore_mode = 'deferred'` (migration 0009).
- Düzenleme Worker'da yalnız kaydedilir ve `pending_rescore`'a yazılır.
- `score.yml` 15 dakikada bir (`:08`, `:38`, `:53`; saatlik `:23` aynen) bekleyen varsa Monte Carlo dahil tam v2 çalıştırır; yoksa hemen çıkar.
- Form "Puan en geç 20 dakika içinde güncellenecek" der.

## 7. Duyarlılık analizi: v1 ve v2, 16 mera × 72 sa

**Kurulum:**
- Girdi anlık görüntüsü 2026-10-30T17:10Z, `analysis/data/v2_inputs.json`.
- v1: canlı `spot_scores`.
- Hava: D1 `forecast_snapshots` (Open-Meteo).
- Deniz: Open-Meteo Marine.
- **Copernicus mock:** su sıcaklığı ve akıntı, Open-Meteo Marine'in deniz noktasındaki değeri.
- Deterministik (seed 7). Çalıştırma: `python analysis/v2_draft.py run`. Figür: `docs/audit/v2_sensitivity.png`.

| Ölçüt | v1.1 (canlı) | v2 taslak |
|---|---|---|
| Meralar arası std, saat ortalaması | 0.06 | 11.62 |
| Meralar arası std, en düşük saat | 0.0 | 8.73 |
| std > 8 olan saat payı | %0.0 | %100.0 |
| Gece: ortalama / meralar arası std / aralık | 70.0 / 0.13 / 66.4–70.1 | 45.5 / 9.12 / 28.4–67.4 |
| Alacakaranlık: ortalama / meralar arası std / aralık | 56.1 / 0.0 / 49.1–70.1 | 49.2 / 10.07 / 27.5–73.8 |
| Gündüz: ortalama / meralar arası std / aralık | 23.4 / 0.0 / 23.4–23.4 | 39.5 / 14.84 / 12.1–71.6 |
| Plato (ardışık aynı saat payı, 0.1'e yuvarlı) | 0.809 | 0.136 |
| Farklı değer sayısı (16 × 72) | 12 | 418 |
| %10–90 bant genişliği (ortalama) | — | 47.7 |

**Kabul:**
- ✅ Meralar arası std > 8: tüm saatlerde; en düşük saat 8.73.
- ✅ Gündüz puanı meraya göre değişiyor: gündüz std 14.8 (v1'de 0).
- ✅ Plato yok: v1 %81, v2 %13.6. Kalan %13.6 rüzgarsız ve aysız gece saatleri; fiziksel olarak da değişmeyen koşullar.

**Yön testleri:**

| Test | Beklenen | Değerler | Sonuç |
|---|---|---|---|
| 1 | aynı mera (lamba var): gece > alacakaranlık > gündüz | [64.5, 59.3, 51.5] | ✅ geçti |
| 2 | gündüz: derin+yapılı (osm-way-252356832) > sığ kumsal (sentetik 15 m iskele, 1 m) | [66.8, 12.6] | ✅ geçti |
| 3 | GB 35 km/sa + 1 m dalga: maruz (osm-way-1170373161, fetch 23.15 km) < korunaklı (osm-way-479047532, 0.03 km); habitat eşitlendi | [35.1, 45.6] | ✅ geçti |
| 4 | lamba bilinmiyor: puan var/yok arasında, %10–90 bandı ikisinden geniş | {"night_unknown_yes_no": [45.9, 64.5, 27.3], "band_width_unknown_yes_no": [55.8, 52.1, 45.2]} | ✅ geçti |
| 5 | mevsim: Eylül (üreme sonrası beslenme) > Temmuz (üreme zirvesi), R3/R1 | [55.1, 52.1] | ✅ geçti |

**Yayılım nereden geliyor (ablasyon, saat ortalaması meralar arası std):**

| Ablasyon | Std |
|---|---|
| Tam model | 11.62 |
| Lamba önselleri eşit (0.5) | 9.40 |
| Yapı eşit (L = 200 m, iskele; derinlik önselini de eşitler) | 4.91 |
| Derinlik eşit | 2.46 |
| Fetch eşit | 11.64 (sakin havada etkisiz; fırtınada test 3) |
| Tüm statik eşit | 0.21 |

**Yorum:**
- Yayılım gürültüden değil, belgelenmiş statik farklardan geliyor (tüm statik eşitlenince std 0.21).
- Ama bu farkların çoğu **C düzeyinde önseller:** yapı uzunluğu → derinlik önseli, ve lamba önseli. DTM katkısı küçük, çünkü DTM ağırlığı 0.3 ve değerlerin çoğu 0.
- Sıralamanın sahada doğrulanması B5 saha formunun birinci işi.

**Mera bazında** (taslak, ortalama):

| Mera | Yapı | Taban | Derinlik c (m) | HSI_s | Lamba önseli | v1 ort. | v2 ort. | v2 gündüz | v2 gece | %10–90 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 İskele (Kapaklı) | 0.68 | 0.72 | 0.39 (2.8) | 0.69 | 0.5 | 48.9 | 45.6 | 39.9 | 49.0 | 19.7–71.7 |
| 2 İskele (Armutlu) | 0.51 | 0.75 | 0.21 (1.6) | 0.56 | 0.5 | 48.8 | 32.7 | 23.1 | 39.3 | 14.4–57.1 |
| 3 Küçükkumla İskelesi | 0.56 | 0.72 | 0.24 (1.8) | 0.59 | 0.5 | 48.9 | 35.5 | 25.9 | 42.0 | 15.4–60.4 |
| 4 Mudanya İskelesi | 0.71 | 0.72 | 0.53 (3.5) | 0.71 | 0.85 | 48.9 | 56.6 | 48.7 | 62.4 | 24.7–76.2 |
| 5 Mendirek (Armutlu) | 0.52 | 0.75 | 0.24 (1.8) | 0.57 | 0.3 | 48.9 | 30.8 | 24.8 | 34.2 | 15.8–57.7 |
| 6 Mendirek (Armutlu) | 0.61 | 0.75 | 0.42 (3.0) | 0.64 | 0.3 | 48.9 | 39.4 | 38.6 | 38.8 | 19.6–68.4 |
| 7 Mendirek (Armutlu) | 0.85 | 0.75 | 0.61 (3.9) | 0.82 | 0.3 | 48.9 | 55.6 | 60.7 | 50.0 | 26.8–79.9 |
| 8 İskele (Fıstıklı) | 0.62 | 0.75 | 0.72 (4.5) | 0.65 | 0.5 | 48.9 | 49.3 | 52.4 | 45.9 | 21.2–74.8 |
| 9 Mendirek (Armutlu) | 0.78 | 0.75 | 0.40 (2.9) | 0.77 | 0.3 | 48.8 | 46.7 | 44.9 | 46.6 | 23.0–72.6 |
| 10 Petek Sitesi İskele | 0.52 | 0.72 | 0.28 (2.1) | 0.56 | 0.5 | 48.9 | 34.4 | 26.8 | 39.4 | 15.0–58.6 |
| 11 Mendirek (Güzelyalı Burgaz) | 0.85 | 0.75 | 0.74 (4.7) | 0.82 | 0.3 | 48.9 | 58.8 | 67.9 | 50.0 | 28.8–82.0 |
| 12 Mendirek (Güzelyalı Burgaz) | 0.72 | 0.75 | 0.34 (2.5) | 0.73 | 0.3 | 48.9 | 42.6 | 39.1 | 43.8 | 20.9–69.6 |
| 13 İskele (İslamköy) | 0.35 | 0.75 | 0.15 (1.0) | 0.42 | 0.5 | 48.9 | 23.3 | 14.3 | 29.5 | 10.7–41.6 |
| 14 İskele (Tirilye) | 0.54 | 0.72 | 0.24 (1.8) | 0.58 | 0.5 | 48.7 | 34.4 | 25.5 | 40.4 | 14.9–58.0 |
| 15 İDO Güzelyalı Feribot İskelesi | 0.75 | 0.75 | 0.64 (4.1) | 0.75 | 0.85 | 48.9 | 62.2 | 56.9 | 65.9 | 27.3–81.1 |
| 16 İskele (Demirsubaşı) | 0.71 | 0.72 | 0.43 (3.0) | 0.71 | 0.5 | 48.9 | 47.7 | 43.1 | 50.2 | 20.4–72.6 |

- Sıralamanın üstünde uzun mendirekler (Burgaz #11, Armutlu #7) ve feribot iskeleleri (İDO #15, Mudanya #4).
- Altında kısa ve sığ iskeleler (İslamköy #13, 16 m).
- Bu, yapı ve önsel varsayımlarının doğrudan sonucu.

## 8. Kalibrasyon planı

**Önseller kanıt düzeyine göre:**
- Her parametre `log θ ~ Normal(log θ₀, σ_düzey)`; σ: A 0.10, B 0.25, C 0.50.
- Açı ve eşik parametreleri toplamsal Normal.
- Ağırlıklar Dirichlet (yoğunlaşma A 200, B 50, C 10).

**Av günlüğü:**
- Kayıt: mera, başlangıç–bitiş, yöntem (LRF), adet (**sıfır av dahil**), boy (opsiyonel).
- Olabilirlik:
  ```
  adet ~ Poisson( süre_sa · λ₀ · (puan/100)^β )      β > 0, λ₀ bireysel/ekipman tabanı (rastgele etki)
  sıfır av: P(0) = exp(−süre_sa · λ₀ · (puan/100)^β)  → bilgi taşır, atılmaz
  ```
- **Güncelleme:** haftalık Actions işi. Önce Laplace yaklaşımı (MAP + Hessian); kayıt > 200 olunca SMC/MCMC. Sonuç yeni parametre dosyası + model sürümü.
- **Sapma kontrolü:** kalibre parametre önsel bandının dışına çıkarsa MODEL.md'de işaretlenir ve kaynak tekrar okunur.

**Kaba örneklem hesabı** (Poisson, olay oranı ~1 balık/sa, α 0.05, güç 0.8, log-oran etkisi δ):

| Parametre grubu | Beklenen etki (log-oran) | Gereken seans (yaklaşık) | Not |
|---|---|---|---|
| Lamba var/yok (gece) | δ ≈ 0.8 | ~40 gece seansı (her koldan 20) | Saha formu lamba alanı önce dolmalı |
| Diel (gece / alacakaranlık / gündüz) | δ ≈ 0.5 | ~100 seans, üç faza dağılmış | |
| Mera statik (yapı, derinlik) | δ ≈ 0.4 mera başı | 16 merada ~10'ar seans, ~160 | En pahalı grup; önce saha ölçümüyle önsel daraltılır |
| Rüzgar × maruziyet | δ ≈ 0.5 | ~60 seans, rüzgarlı günlerden ≥ 20 | Rüzgarlı gün seyrek |
| Mevsim (fenoloji genlikleri) | δ ≈ 0.4 | ≥ 2 mevsim boyunca ~150 seans | 1 yıldan önce güncellenmez |
| Su sıcaklığı hızı, bulanıklık | δ ≈ 0.3 | ~250 seans | İkinci yıl |
| Basınç, akıntı | etki belirsiz | > 300 | Yalnız sıfıra çekme testi |

Kaba formül: `n ≈ (z₀.₉₇₅ + z₀.₈)² / (δ² · λ̄ · süre)` grup başına (λ̄ · süre ≈ 2 balık/seans).

## 9. Saha formu (A4; B5'te uygulanır)

**Mobil tek el yerleşimi, tek sütun:**

```
┌──────────────────────────────┐
│ Mera: İskele (Fıstıklı)  [⌖] │  konum: GPS ya da haritadan
├──────────────────────────────┤
│ Dip tipi (çoklu)             │
│ [kum][çakıl][kaya][midyeli]  │
│ [yosunlu][çamur]             │
│ Yapı  (•) iskele ayağı       │
│       ( ) mendirek taşı      │
│       ( ) doğal kaya         │
│ Lamba (•) var ( ) yok ( ) ?  │
│   renk [beyaz][sarı][LED]    │
│ Derinlik  [+ mesafe/derinlik]│  ör. 10 m → 3.5 m, 30 m → 6 m
│ Erişim (•) açık ( ) kısıtlı  │
│        ( ) belirsiz          │
│ Not [..................]     │
│ Foto [📷] (opsiyonel)        │
│        [ Kaydet ]            │  başparmak bölgesinde
└──────────────────────────────┘
```

**D1 taslağı:**

```sql
CREATE TABLE field_obs (
  id TEXT PRIMARY KEY, spot_id TEXT NOT NULL REFERENCES spots(id), observed_at TEXT NOT NULL,
  substrate TEXT,              -- JSON dizi: ["kaya","midyeli"]
  structure TEXT CHECK (structure IN ('iskele','mendirek','dogal_kaya')),
  has_light INTEGER,           -- 1 / 0 / NULL (bilinmiyor)
  light_color TEXT CHECK (light_color IN ('beyaz','sari','led')),
  access TEXT CHECK (access IN ('acik','kisitli_feribot','belirsiz')),
  note TEXT, photo_key TEXT,   -- foto: static asset değil; B5'te boyut sınırı ile D1 dışında karar verilir
  created_by TEXT NOT NULL
);
CREATE TABLE field_depth (obs_id TEXT NOT NULL REFERENCES field_obs(id), distance_m REAL NOT NULL, depth_m REAL NOT NULL);
CREATE TABLE catch_log (id TEXT PRIMARY KEY, spot_id TEXT NOT NULL, start_at TEXT NOT NULL, end_at TEXT NOT NULL,
  method TEXT, count INTEGER NOT NULL, lengths_cm TEXT, model_version TEXT, score_at_start REAL);
```

**Puana etkisi** (öncelik zinciri):
- **Taban:** saha > EUSeaMap (güvenle) > önsel.
- **Derinlik:** saha çiftleri (w = 0.95) > DTM CDI (0.9) > yapı önseli > DTM GEBCO (0.3).
- **Lamba:** saha durumu, önseli bastırır.
- **Yapı:** saha türü OSM türünü bastırır.
- Her alan kaynağıyla birlikte saklanır; kartta "saha / EUSeaMap / DTM / önsel" etiketi gösterilir.

## 9a. Batma süresinden derinlik (B5)

- **Ölçüm:** jighead suya değdiği andan misina gevşeyene kadar saniye; jighead gramajı ve atış mesafesi.
- **Önsel batma hızı:** `v₀(g) = 0.25 · √g m/s` (jighead + küçük silikon; balıkçı kuralı, kanıt C, ±%40). 2 g → 0.35 m/s, 4 g → 0.50 m/s.
- **Kalibrasyon:** aynı merada kurşunla dikine ölçüm varsa, ±15 m mesafedeki her batma ölçümü için `k = derinlik_dikine / (v₀ · t)`. Mera katsayısı `k` = medyan.
  - Belirsizlik: `σ_rel = √(sd(k)/k)² + 0.10²` (zamanlama hatası %10); tek çiftte sd(k)/k = 0.15.
- **Derinlik:** `d = k · v₀(g) · t` (kalibresizse k = 1, σ = %40).
- **Model ağırlığı:** dikine 0.95, kalibre batma 0.90, kalibresiz batma 0.70 (kalan pay yapı önseli).
- **Varsayım:** jighead serbest düşüşe yakın batar (gergin misinada sarkaç etkisi süreyi uzatır → derinliği fazla tahmin). Kalibrasyon bu sistematik hatayı da emer.

## 10. Referans projeler (kod kopyalanmadı)

| Proje | Lisans | İncelenen | Alınan | Alınmayan ve neden |
|---|---|---|---|---|
| [sjwasko/fishin](https://github.com/sjwasko/fishin) | MIT | `astro.py`: skyfield + JPL DE421 efemeris; solunar major ±1.5 sa (ay transit), minor ±1 sa (ay doğuş/batış); `phase_score = |cos(faz)|` | Fikir: güneş ve ay konumunu gerçek efemerisle hesaplamak (v2 zaten suncalc kullanıyor; taslak düşük hassasiyetli formül). | Solunar pencereleri ve yeni/dolunay = iyi skoru: istavrit için kaynak yok (RESEARCH). v2'de ay yalnız ışık kaynağı olarak girer. |
| [akt/SGFishing](https://github.com/akt/SGFishing) | **Lisans dosyası yok** (tüm hakları saklı varsayılır) | `FishingScoreService.calculateScore`: solunar 25 + gelgit 15 + basınç trendi 15 + hava 15 + rüzgar 10 + dalga 10 + PSI 10 = 100; basamaklı eşikler; API yedek zinciri | Yalnız mimari fikir: bileşen dökümü ve veri kaynağı yedek zinciri (v1'de zaten var). | Kod ve eşikler: lisans yok; ayrıca doğrusal toplam + basamak, v1'in kusurunun aynısı. Düşen basınç = iyi varsayımı kaynaksız. |
| [TheWillMiller/tide-wise](https://github.com/TheWillMiller/tide-wise) | MIT | `tidewise-card.js`: güvenlik riskini (rip current) mevcut saatin puanına **tavan** olarak uyguluyor, gelecek pencereleri global olarak düzleştirmiyor; bileşen dökümü ve "neden" metni | İlke: güvenlik kapısı yalnız etkilenen saatlere tavan uygular, gelecek saatleri düzleştirmez (v2 güvenlik kapısı saat bazlı kalır). "Neden" metni fikri kart v2'de. | Kod; tür modları (flounder, redfish) ABD kıyı türleri. |

## 11. Gösterim kuralları (B3/B4/B6)

**Renk bantları** (kalibre 0–100 ölçeği; `packages/scoring/src/v2/display.ts`):

| Bant | Puan | Renk |
|---|---|---|
| iyi | ≥ 65 | yeşil |
| orta | 40–65 | turuncu |
| zayıf | < 40 | kırmızı |
| veri yok | – | gri |

- Bileşen çubukları ve koşullar paneli 0–1 bileşen değerini kullanır (≥ 0.75 iyi, ≥ 0.40 orta).
- Harita işaretleri, liste ve kart aynı `bandV2` fonksiyonunu kullanır.

**Sıra mı puan mı:** %10–90 bandı **30 puandan genişse** (`RANK_FIRST_WIDTH`) kartta büyük gösterim sıradır ("Bu saatte 16 mera içinde 3."); puan ve bant ikincil satırda. Band daraldıkça puan öne çıkar. Gerekçe: model C ağırlıklı; mutlak puanın belirsizliği büyük, meralar arası sıralama ise ortak hava girdileri nedeniyle daha kararlı.

**Derinlik kaynağı metni:** saha ölçümü varsa "saha ölçümü (tarih)", yoksa "tahmini — yapı uzunluğundan, saha ölçümü yok". Kaynak saha değilse ve gece kolu ağırlığı < 0.5 ise (gündüz) kartta "gündüz puanı doğrulanmamış derinliğe dayanıyor" notu.

**Koşullar paneli:** v2 dinamik bileşenleri; bulut artık puanı etkiler (ışık indeksi). Lamba üç durumlu: var / yok / bilinmiyor (önsel olasılık %).

**Harita:** OpenFreeMap altlık (Türkçe ad), OSM kara poligonu (vektör kıyı), EMODnet DTM bantları kenarda soldurulur, enterpolasyonlu (GEBCO dolgusu) alan taralı. Yakın işaretler zoom'a göre halka üzerine yayılır, ince çizgi gerçek konuma gider; kümeleme/birleştirme yok.
