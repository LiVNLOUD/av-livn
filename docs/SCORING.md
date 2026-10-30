# Puanlama v1 (kural tabanlı)

Motor: `packages/scoring` (saf TypeScript, yan etkisiz, %100 birim test kapsamı zorunlu).
Tür profilleri: `data/species/*.yaml`. Saat dilimi: Europe/Istanbul (sabit UTC+3).

## Formül

```
ham    = Σ (ağırlık_i × bileşen_i) / Σ ağırlık_i(verisi olan)   × 100
puan   = güvenlik_kapısı ? min(ham, 30) : ham
```

- Her bileşen `[0,1]` arası bir değer, ağırlık, katkı (`ağırlık × değer`) ve Türkçe bir gerekçe döndürür.
- **Eksik veri:** bileşen `value = null` döner ve ağırlığı paydadan düşülür (yeniden normalize edilir). Yanıtta `missing` listesi olur. Arayüz bunu "veri yok" olarak gösterir.
- Ağırlık toplamı 100 olmak zorunda değildir, motor normalize eder.

## Güvenlik kapısı
Hamle > **40 km/sa** veya dalga > **1.2 m** → puan tavanı **30** ve uyarı (`warnings[]`). Eşikler tür dosyasındaki `safety` bölümünden gelir.

## İstavrit bileşenleri (ağırlık)

| Anahtar | Ağırlık | Hesap |
|---|---|---|
| `gece_isik_penceresi` | 25 | Pencere: gün batımı + 1 sa → 00:00 (yerel) = 1.0. Gün batımı → +1 sa arası 0 → 1 doğrusal artar. 00:00 → şafak 0.5. Gündüz 0.1. Lamba çarpanı: `has_light` true 1.0 · bilinmiyor 0.75 · false 0.5 |
| `ruzgar_dalga_kiyiya_gore` | 20 | `onshore = cos(rüzgarın geldiği yön − kıyı normali)`. Kıyı normali denize bakan yöndür, yani +1 rüzgar denizden kıyıya eser. **Kıyıya vuran:** `1 − onshore × clamp((w − 10)/25)`. **Karadan/yan:** w ≤ 20 km/sa → 1, sonra 40 km/sa'de 0.5'e iner. Dalga çarpanı: ≤0.3 m 1.0 → 0.6 m 0.7 → 1.2 m 0 (doğrusal). Sonuç `rüzgar × dalga` |
| `su_sicakligi_ve_3g_trend` | 15 | Seviye: 14–20 °C → 1, aralığın 4 °C dışında 0. Trend: `|SST_şimdi − SST_72sa önce|` ≤ 0.5 °C → 1, ≥ 2 °C → 0. Değer `0.7·seviye + 0.3·trend`. Trend verisi yoksa yalnız seviye |
| `basinc_trendi_3_6s` | 10 | `r = ortalama(Δp_3sa/3, Δp_6sa/6)` hPa/sa. −0.5…+0.3 → 1 (stabil/yavaş düşüş). Yükselişte +1.5'te 0'a, düşüşte −2.0'de 0.3'e iner |
| `ay_evresi` | 10 | `1 − aydınlanma × (ay ufkun üstündeyse 1, değilse 0.4)` (suncalc). Lamba altı avda karanlık gece iyidir |
| `akinti` | 10 | m/s: < 0.05 → 0.3…1 (durgun cezalı), 0.05–0.25 → 1, 0.25 → 0.6 arası 1 → 0, > 0.6 → 0 |
| `mevsim_katsayisi` | 10 | Aylık tablo: Oca 0.6 · Şub 0.4 · Mar 0.4 · Nis 0.6 · May 0.8 · Haz 0.6 · Tem 0.6 · Ağu 0.6 · Eyl 0.8 · Eki 1.0 · Kas 1.0 · Ara 0.8 |

## Girdiler
Saatlik seri (Open-Meteo Forecast + Marine, `sea_probe` noktasından), mera (`shore_normal_deg`, `has_light`, lat/lon), zaman ve tür profili. F3'ten itibaren SST trendi ve akıntı için CMEMS Marmara 500 m günlük verisi tercih edilir.

## Kalibrasyon (F5)
≥100 av kaydında bileşen değerleri ile "av oldu/olmadı" (veya adet) arasında lojistik regresyon kurulur, kural tabanlı puanla AUC karşılaştırılır. Önerilen ağırlıklar rapor olarak sunulur, otomatik uygulanmaz.
