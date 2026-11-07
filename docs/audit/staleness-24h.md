# Bayatlık uyarısı: son 24 saat (6 Kas 15:51Z → 7 Kas 15:51Z)

Kaynaklar:
- GitHub Actions score.yml çalışmaları. D1'e yazan çalışmalar başarılı ve ~1 dk'dan uzun olanlar; kısa "nothing to rescore" ve kuru çalışmalar sayılmadı.
- D1 `observations` tablosu: son 40 saatin her saatinde 53 hücre, yani Worker'ın :07 hava çekimi hiç atlanmadı.
- `om_last_run`: hata yok.

Yeniden kurulum `staleness-24h.py` ile yapıldı. Her dakika için kullanılan çekim yaşı ve puan yaşı hesaplandı. Puan, yazan çalışmanın bitişinde güncellenir; kullandığı hava, başlangıcından önceki son :07 çekimidir.

| Kural | Uyarı bölümü | Toplam süre | En büyük yaş |
|---|---|---|---|
| N5: çekim ya da puan > 2 sa (7 Kas ~10:16Z'den beri canlı) | **7** | 725 dk (~12 sa) | 339 dk |
| Önceki: yalnız puan > 2 sa | 6 | 482 dk (~8 sa) | 292 dk |

N5 bölümleri: 6 Kas 16:08–18:06, 19:08–22:08; 7 Kas 01:08–01:24, 04:08–07:48, 09:08–10:20, 12:08–13:50, 15:08–15:25.

## Kök neden
- Hava çekimi Cloudflare'de, her saat; atlanmıyor.
- Puanlama GitHub zamanlayıcısında ve tetikler sık atlanıyor:
  - 24 saatte zamanlanmış yazan çalışma yalnız 6 kez geldi;
  - aralar 2–5 saat.
- Yedek tetik puan 75 dk'yı geçmeden çalışmıyor. GH_DISPATCH_TOKEN 7 Kas 13:47Z'de eklendi; bu pencerede hiç gerçek dispatch olmadı.
- Puanlar, çalıştıkları andaki çekimi kullanıyor. Çekim puandan 0–60 dk daha eski olduğu için uyarı çoğunlukla çekim yaşından çıkıyor; her bölüm :08'de başlıyor.

## Düzeltme ve beklenen sıklık
- Worker cron her saatlik çekimden sonra, puanlar o çekimden eskiyse puanlamayı hemen tetikliyor ("new weather"; en çok 30 dk'da bir).
- Gözlenen gecikme: dispatch → başlama ~3 sn, çalışma 2–3 dk.
- Böylece kullanılan çekim yaşı en çok ~63 dk olur; uyarı eşiği 120 dk.
- **Beklenen: günde 0 uyarı.** Uyarı ancak bir saatlik çekim ya da dispatch başarısız olursa çıkar; tek bir kaçırılan saat yaşı ~123 dk'ya, yani birkaç dakikalık uyarıya çıkarır.
- Model üretim zamanı kuralı (MODEL.md §18) yalnız Open-Meteo modeli olağan aralığının 2 katı kadar gecikirse uyarır. ICON-EU 3 saatte bir güncellenir, sınır 6 saat; normal işleyişte uyarı beklenmez.
