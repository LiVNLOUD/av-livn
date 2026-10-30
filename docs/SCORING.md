# Puanlama v1.1 (kural tabanlı)

> **Arayüz v2 kullanıyor** (B4/B6). Güncel model: [`docs/MODEL.md`](MODEL.md). v1.1 hâlâ hesaplanıyor ve `/api/spots` (model parametresi olmadan) üzerinden okunabilir; arşiv: [`docs/archive/SCORING-v1.md`](archive/SCORING-v1.md).

Motor: `packages/scoring` (saf TypeScript, yan etkisiz, %100 birim test kapsamı zorunlu).
Tür profilleri: `data/species/*.yaml` → `npm run species -w packages/scoring`. Saat dilimi: Europe/Istanbul (sabit UTC+3).

## Formül

```
ham    = Σ (ağırlık_i × bileşen_i) / Σ ağırlık_i(verisi olan) × 100
puan   = ham × gece_carpani
puan   = güvenlik_kapısı ? min(puan, 30) : puan
```

- Her bileşen `[0,1]` arası bir değer, ağırlık, katkı (`ağırlık × değer`) ve Türkçe bir gerekçe döndürür. Çarpanlar `multipliers[]` içinde ayrıca döner (`gece_carpani`: değer, faz, gerekçe).
- **Eksik veri:** bileşen `value = null` döner ve ağırlığı paydadan düşülür. Yanıttaki `missing` listesi bunu gösterir.
- Tavan, çarpandan **sonra** uygulanır.

## Gece çarpanı (`gece_carpani`)
Lamba altı av gece yapıldığı için gece/gündüz ayrımı toplama katılmaz, puanı çarpar.

| Faz | Zaman (yerel güneş saatleri, suncalc) | Lambalı | Lambasız / bilinmiyor |
|---|---|---|---|
| Tam gece | gün batımı +45 dk → gün doğumu −60 dk | ×1.00 | ×0.75 |
| Alacakaranlık | gün batımı −30…+45 dk, gün doğumu −60…+15 dk | ×0.70 | ×0.525 |
| Gündüz | kalan | ×0.25 | ×0.25 |

- Lamba bilgisi bilinmeyen mera **lambasız sayılır** (temkinli). Admin formundan "lamba var" işaretlenince çarpan yükselir.
- Sonuç: en iyi koşullarda bile gündüz puanı ≤ 25 olur.
- Parametreler profildeki `night_multiplier` bölümünden gelir.

## Güvenlik kapısı
Hamle > **40 km/sa** veya dalga > **1.2 m** → puan tavanı **30** ve uyarı (`warnings[]`). Eşikler profildeki `safety` bölümünden gelir.

## İstavrit bileşenleri (ağırlık, toplam 100)

| Anahtar | Ağırlık | Hesap (eşikler `params`'tan) |
|---|---|---|
| `ruzgar_dalga_kiyiya_gore` | 27 | `onshore = cos(rüzgarın geldiği yön − kıyı normali)`. Kıyı normali denize bakan yöndür; +1 denizden kıyıya esen rüzgar demektir.<br>**Kıyıya vuran:** `1 − onshore × clamp((w − 10)/25)`.<br>**Karadan/yan:** w ≤ 20 km/sa → 1, 40 km/sa'da 0.5'e iner.<br>**Dalga çarpanı:** ≤0.3 m 1.0 → 0.6 m 0.7 → 1.2 m 0.<br>Sonuç `rüzgar × dalga`. |
| `su_sicakligi_ve_3g_trend` | 20 | **Seviye:** 14–20 °C → 1, aralığın 4 °C dışında 0.<br>**Eğilim:** `|Δ 72 sa|` ≤ 0.5 °C → 1, ≥ 2 °C → 0.<br>Değer `0.7·seviye + 0.3·eğilim`. |
| `basinc_trendi_3_6s` | 13 | `r = ortalama(Δp_3sa/3, Δp_6sa/6)` hPa/sa.<br>−0.5…+0.3 → 1. Yükselişte +1.5'te 0'a iner, düşüşte −2.0'de 0.3'e iner. |
| `ay_evresi` | 13 | **Lambalı mera:** `1 − aydınlanma × (ay ufkun üstündeyse 1, değilse 0.4)`.<br>**Lambasız/bilinmeyen mera:** sabit **0.5** (nötr, kalibrasyona kadar). |
| `akinti` | 13 | m/s: < 0.05 → 0.3…1 (durgun cezalı); 0.05–0.25 → 1; 0.25 → 0.6 arası 1 → 0; > 0.6 → 0. |
| `mevsim_katsayisi` | 14 | Aylık tablo: Oca 0.6 · Şub 0.4 · Mar 0.4 · Nis 0.6 · May 0.8 · Haz 0.6 · Tem 0.6 · Ağu 0.6 · Eyl 0.8 · Eki 1.0 · Kas 1.0 · Ara 0.8 |

## Koşul uygunluğu (arayüz renkleri)
`conditionsAt()` her koşul için 0..1 bir uygunluk değeri döndürür. Değerler puanın kullandığı fonksiyonların aynısıyla ve tür profilinin eşikleriyle hesaplanır; arayüzde ayrı bir eşik tanımlanmaz.

| Bant | Uygunluk | Gösterim |
|---|---|---|
| Uygun | ≥ 0.75 | yeşil + ✓ |
| Sınırda | 0.40–0.75 | turuncu + ~ |
| Uygun değil | < 0.40 | kırmızı + ✕ |
| Puanı etkilemiyor / veri yok | — | gri |

| Koşul | Kaynak |
|---|---|
| Rüzgar | `windValue` (hız + kıyıya göre yön) |
| Hamle | < `gust_ok_kmh` (25) → 1; `safety.gust_kmh_max` (40) altı → 0.5; ≥ 40 → 0 |
| Dalga | `waveValue` |
| Su | `su_sicakligi_ve_3g_trend` bileşeninin değeri + 3 günlük eğilim oku |
| Basınç | `pressureValue` + eğilim oku ve hPa/sa |
| Akıntı | `currentValue` |
| Ay | `moonValue` (yalnız lambalı mera; lambasızda gri "nötr") |
| Gece çarpanı | çarpanın kendisi |
| Hava sıcaklığı, bulut | modelde yok → gri "Puanı etkilemez" |

## Girdiler ve hesaplama yeri
- **Girdiler:** saatlik seri (Open-Meteo Forecast + Marine, `sea_probe` noktasından), mera (`shore_normal_deg`, `has_light`, lat/lon), zaman ve tür profili. F3'ten itibaren SST eğilimi ve akıntı için CMEMS Marmara 500 m günlük verisi tercih edilecek.
- **Hesaplama yeri:** puanlar ve koşullar saatlik GitHub Actions işinde önceden hesaplanır (`score.yml`, `spot_scores` tablosu). API yalnız okur.

## Kalibrasyon (F5)
≥100 av kaydında bileşen değerleri ile "av oldu/olmadı" (veya adet) arasında lojistik regresyon kurulur ve kural tabanlı puanla AUC karşılaştırılır. Önerilen ağırlıklar rapor olarak sunulur, otomatik uygulanmaz.
