# Tür yol haritası (D4, E6'da güncellendi)

Ana sayfadaki tür seçicide yalnız **İstavrit** aktif; diğer çipler bu sırayla, pasif ve "Araştırma aşamasında" ipucuyla görünür. Yeni tür eklemek için gerekenler:
- yeni bir HSI profili (`data/species/<tür>.yaml`),
- kaynak taraması,
- av günlüğünde yeterli veri.

Puanlama motoru türden bağımsızdır. Bileşenler (ışık/diel, mevsim, rüzgar, sıcaklık, bulanıklık, yapı, taban, derinlik) aynıdır; parametreler türe özgüdür.

## Sıra (kullanıcı kararı, 2026-10-31)
Kış mevsimi önde olduğu için sıra mevsime ve kullanıcının takımlarına göre belirlendi (TACKLE.md):

| Sıra | Tür | Neden bu sırada | Takım | Mevsim (Marmara; kaynakla doğrulanacak) | Model farkı | Kanıt durumu |
|---|---|---|---|---|---|---|
| 1 | **Levrek** (*Dicentrarchus labrax*) | Kış (Ara–Mar) türü; şimdi başlayan sezonun ana hedefi. D1'deki 6 dere ağzı adayı doğrudan işe yarar. | Spin (Bassterra 274 + C3000, Kairiki 8, Prorex FC) | kış, gece ve dalga sonrası | dere ağzı + bulanıklık (+) + dalga; ışık ağırlığı ↓ | B |
| 2 | **Kalamar** | Kış gecesi; kıyıdan eging. Kullanıcının spin seti eging'e uygun. | Spin seti (2.5–3.0 egi) | kış, gece | ışık çok ağır (mevcut iskele aydınlatması; kendi ışık yasak, REGULATION.md), berrak su, taban; ayrı model | C |
| 3 | **Lüfer / çinekop** (*Pomatomus saltatrix*) | Sonbahar göçünün kuyruğu Aralık'a uzanır; boy sınırı mevzuatı var. | Spin, kaşık / rapala 10–30 g | Eyl–Ara, alacakaranlık | yem balığı (istavrit) puanı girdi; akıntı + alacakaranlık ↑ | B |
| 4 | **Mırmır / karagöz** (Sparidae) | Yıl boyu, gece; kış dip avı. | LRF ağır jighead / dip | yıl boyu, gece | kaya + dalga sonrası bulanıklık (+), 3–8 m | C |
| 5 | **Kolyoz** (*Scomber colias*) | Yaz–sonbahar; istavrite en yakın model, kışın düşük öncelik. | LRF / sabiki | yaz–sonbahar | ışık + yapı; sıcaklık tercihi yüksek | C |
| 6 | **Sarpan / izmarit** | İlkbahar–sonbahar; kışın kıyıda az. | LRF, dip | ilkbahar–sonbahar | taban ve yapı ↑, ışık ↓ | C |

Önceki sıra (D4) kolyoz → lüfer → sarpan → mırmır → levrek idi; mevsimsellik ve takım uygunluğu nedeniyle değişti.

## Bir tür eklemek için kapı
1. RESEARCH.md'de tür bölümü: en az 3 kaynak; sıcaklık, mevsim ve diel davranışı.
2. `data/species/<tür>.yaml` parametreleri, A/B/C kanıt etiketleriyle.
3. Yön testleri (istavritteki 5 testin karşılığı).
4. Av günlüğünde o türe ait en az 10 seans ya da kullanıcı onayı. Sonra tür seçicide "deneysel" rozetiyle açılır.
5. Asgari boy ve adet sınırı REGULATION.md'den (kaynak ve sayfa ile).
6. Bildirim (D9) ve pencere hesabı tür parametresiyle çalışır. `?species=` API'de hazır; şimdilik `species_not_ready` döner.

## Altyapı (bir kez)
- `spot_scores_v2.species` sütunu (şimdi tek tür). 6 tür ≈ 6× hesap; Actions'ta sorun değil.
- Av günlüğü zaten çok türlü (`catch_item.species`); verim birimi tür başına.
- Sahadayım uzun basış tür listesi bu sırayla güncellenir.
