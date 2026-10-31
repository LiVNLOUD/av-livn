# Tür yol haritası (D4 — tasarım)

Ana sayfadaki tür seçicide yalnız **İstavrit** aktif, diğerleri "yakında". Yeni tür eklemek = yeni HSI profili (`data/species/<tür>.yaml`) + kaynak taraması + av günlüğünde yeterli veri. Puanlama motoru türden bağımsızdır: bileşenler (ışık/diel, mevsim, rüzgar, sıcaklık, bulanıklık, yapı, taban, derinlik) aynı, parametreler türe özgü.

| Sıra | Tür | Yöntem (kıyı) | Mevsim (Marmara, kaynakla doğrulanacak) | Model farkı | Kanıt durumu |
|---|---|---|---|---|---|
| 1 | **Kolyoz** (*Scomber colias*) | LRF/spin, küçük kaşık, sabiki | yaz–sonbahar | istavrite yakın: ışık + yapı; sıcaklık tercihi daha yüksek | literatür sınırlı → C |
| 2 | **Lüfer / çinekop** (*Pomatomus saltatrix*) | spin, kaşık, rapala, 10–30 g | sonbahar göçü (Eyl–Ara), kıyıya alacakaranlıkta | yem balığı (istavrit) puanı girdi; akıntı + alacakaranlık ağırlığı ↑; **boy sınırı** (REGULATION.md) | B (göç zamanlaması) |
| 3 | **Sarpan / izmarit** | LRF, dip | ilkbahar–sonbahar | taban (kaya/çayır) ve yapı ağırlığı ↑, ışık ↓ | C |
| 4 | **Mırmır / karagöz** (Sparidae) | dip, LRF ağır jighead | yıl boyu, gece | kaya + dalga sonrası bulanıklık (+), derinlik 3–8 m | C |
| 5 | **Levrek** (*Dicentrarchus labrax*) | spin, gece, dere ağzı | kış (Ara–Mar) | dere ağzı + bulanıklık + dalga; **D1 dere ağzı adayları** buna hazırlık | B |
| — | Kalamar | eging | kış gece | ışık çok ağır, tamamen ayrı model | ileride |

## Bir tür eklemek için kapı
1. RESEARCH.md'de tür bölümü: en az 3 kaynak, sıcaklık/mevsim/diel davranışı.
2. `data/species/<tür>.yaml` parametreleri: A/B/C kanıt etiketleriyle.
3. Yön testleri (istavritteki 5 testin karşılığı).
4. Av günlüğünde o türe ait en az 10 seans ya da kullanıcı onayı. Tür seçicide "deneysel" rozetiyle açılır.
5. Bildirim (D9) ve ana sayfa pencere hesabı türe göre: `?species=` parametresi API'de hazır (şimdilik `species_not_ready`).

## Altyapı değişiklikleri (tür başına değil, bir kez)
- `spot_scores_v2.species` sütunu (şimdi tek tür). Saatlik iş tür sayısı × CPU: 5 tür ≈ 5× hesap; Actions'ta sorun değil.
- Av günlüğü zaten çok türlü (`catch_item.species`). Verim birimi tür başına.
- Tür seçici etkinleşince `/api/spots?species=` ve `/api/windows?species=` açılır.
