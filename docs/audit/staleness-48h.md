# Bayatlık denetimi, 48 saat (2026-11-05 18:52Z – 2026-11-07 18:52Z) — Faz Q1

Betik: `staleness-audit.py`. Veri: `staleness-48h-runs.json` (GitHub Actions score.yml çalışmaları) ve D1 kayıtları; hepsi salt okunur.

## Kök neden ve durum
- **Kök neden** (önceki faz): Hava her saat :07'de Cloudflare cron'uyla çekiliyor. Puanlama ise GitHub zamanlayıcısına bağlıydı ve GitHub saatlik çalışmaların çoğunu atladı. Puanlar en yeni havayla yeniden hesaplanmadı.
- **Düzeltme** 2026-11-07 15:54Z'den beri canlıda: Worker her çekimden sonra puanlamayı dispatch ediyor ("new weather").
- **Q1'de eklenenler:**
  - puanlama başlarken hava 60 dk'dan eskiyse önce taze çekilir;
  - yedek tetik hava çekimini de kapsar ("stale weather");
  - dispatch'ler kayda geçer (`meta.score_dispatch_log`).

## Hava çekimi (Cloudflare cron, :07)
- D1 `observations`: 2026-11-05 17:00Z ile 2026-11-07 18:00Z arasındaki **50 saatin 50'sinde kayıt var**. Atlanan saat yok; son çekim 18:07:32Z, iki istek de HTTP 200.
- Aralık her saat 60 dk. Dakika (:07:32) yalnız en yeni çekim için kayıtlı (`om_last_run`); diğerleri için cron zamanı varsayıldı.

## Puanlama (GitHub Actions)
- **Zamanlanmış çalışmalar:** 48 saatte 16 başladı. Beklenen 192'ydi: her saat :23'te tam çalışma, :08/:38/:53'te kısa. GitHub'ın zamanlayıcısı güvenilir değil; bu sorunun asıl kaynağı.
- **Puan yazan çalışmalar:** 50 (≥ 90 sn süren başarılı çalışmalar).
  - Ardışık iki yazım arası en az 2 dk, medyan 8 dk, en çok **510 dk**.
  - Kümeler deploy anlarında; boşluklar gece.
- **Düzeltmeden sonra** (15:54Z–18:52Z) yazımlar: 15:57, 16:10, 16:15, 16:24, 16:26, 16:47, 16:54, 17:09, 18:09. Her saatin :09'unda bir yazım var.

## Uyarı (MODEL.md §18 kuralı: kullanılan hava ya da puan > 2 sa)
Uyarı bölümleri dakika dakika yeniden kuruldu.

| Dönem | Bölüm | Toplam süre | En kötü yaş |
|---|---|---|---|
| 48 saat | 11 | 1624 dk (~27 sa) | 536 dk |
| Düzeltmeden önce | 11 | 1624 dk | 536 dk |
| Düzeltmeden sonra (~3 sa) | **0** | 0 | 62 dk |

Bölümler: 05 18:52–22:07, 05 23:08–06 02:34, 06 04:08–11:05, 12:08–13:29, 16:08–18:06, 19:08–22:08, 07 01:08–01:24, 04:08–07:48, 09:08–10:20, 12:08–13:50, 15:08–15:25.

Düzeltmeden sonraki örnek yalnız ~3 saatlik. Uzun dönem sıklığı `score_dispatch_log` kaydıyla bir sonraki denetimde ölçülecek.

## Yedek tetik (Worker → score.yml dispatch)
- **3 kez devreye girdi**, hepsi "new weather" sebebiyle: #204 16:07, #212 17:07, #213 18:07.
- Ayrıca 1 kuru test: #199 14:07 (dry_run).
- Dispatch anahtarı 2026-11-07 ~14:00'te eklendi; daha önce yedek tetik dispatch edemiyordu.
- Diğer dispatch'ler:
  - 36 deploy kaynaklı (github-actions bot);
  - 5 elle başlatılmış (#166, #175, #177, #193, #206).

Sınıflandırma çıkarımdır: aynı kullanıcı adı ve cron dakikası (:07). Bundan sonra `meta.score_dispatch_log` sebebiyle birlikte kaydediyor.

## Varsayımlar
- ≥ 90 sn süren başarılı çalışma puan yazmıştır. Kısa olanlar "--pending" ya da "nothing new" çıkışıdır; #199 kuru testtir.
- Model çalıştırma yaşı kuralı (b) geçmişe dönük kurulamadı, çünkü `weather_runs` yalnız son durumu tutuyor. Şu an: deniz `meteofrance_wave`, init 00:00Z, 12 sa aralık, sınırın altında; hava modeli tanınmadı.
- Çekim başarısızlığı kuralı (c): 48 saatte başarısız çekim yok, bu yüzden tetiklenmedi.
