# L1 — Mendirekleri üste taşıyan bileşenler (ablasyon, 7 Kas 21:00 yerel)

Yöntem (`explainAll`, `score-job --ablate`):
- Her sürücü için, meranın puanından bu sürücünün değerini sırayla diğer meralardan alarak hesaplanan puanların ortalaması çıkarılır.
- Hava ve saat aynıdır; sonuç puan farkıdır.
- Ham veri: `l1-ablation.json`.

| Mera | Puan | Yapı tipi | Lamba | Derinlik | Taban | Maruziyet | Kullanılan derinlik (kaynak) | DTM 200 m / maks 100 m | Lamba 0,3 → 0,5 |
|---|---|---|---|---|---|---|---|---|---|
| Armutlu Devlet Limanı – uzun batı mendireği | 76,5 | +9,8 | +5,9 | 0 | +0,2 | +1,6 | 2,9 m (yapı uzunluğundan tahmin) | 0,6 / 0 m | 70,1 → 76,5 |
| Armutlu Devlet Limanı – doğu mendireği | 76,3 | +9,8 | +5,9 | 0 | +0,2 | +1,7 | 1,8 m (tahmin) | 0,8 / 0 m | 69,9 → 76,3 |
| Güzelyalı Yat Limanı – doğu mendireği | 75,1 | +9,8 | +5,9 | 0 | +0,2 | −0,6 | 3,0 m (tahmin) | 1,8 / 0,3 m | 68,7 → 75,1 |
| Güzelyalı Yat Limanı – batı mendireği | 75,1 | +9,8 | +5,9 | 0 | +0,2 | −0,6 | 2,3 m (tahmin) | 3,7 / 0,9 m | 68,7 → 75,1 |
| Karacaali İskelesi (karşılaştırma) | 74,8 | +8,1 | +5,9 | 0 | +0,6 | +1,1 | 2,1 m (tahmin) | 0 / 0 m | 68,4 → 74,8 |

## Sonuç
- **"Derin" iddiası desteklenmiyor.**
  - Derinlik bileşeninin katkısı 0'dır.
  - Kullanılan derinlik yapı uzunluğundan tahmin (1,8–3 m).
  - EMODnet enterpolasyonu 0–3,7 m gösteriyor; ölçüm yok.
- **"Korunaklı" iddiası Güzelyalı için yanlış.** Maruziyet −0,6, yani diğer meralardan biraz daha açık. Armutlu'da +1,6–2 (küçük).
- **Mendirekleri üste taşıyan iki şey de varsayımdır:**
  - yapı tipi tercihi (mendirek 0,85, iskele 0,75; kanıt C), +9,8 puan;
  - K2'de lamba önselinin 0,3'ten 0,5'e çıkması, bu mendireklerde +6,4 puan.
- Kart ve ana ekrandaki "Öne çıkaran" metni bundan sonra gerçek en büyük katkıyı, puanını ve kanıt türünü söyler. Örnek: "Öne çıkaran (+9,8 puan): mendirek tipi (tip tercihi varsayım, kanıt C; OSM)". "Derin" ya da "korunaklı" sıfatı kullanılmaz; maruziyet "rüzgara daha az açık" diye yazılır.
