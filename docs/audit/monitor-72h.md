# İzleme raporu, 72 saat (2026-11-04 20:55Z – 2026-11-07 20:55Z)

Betik: `staleness-audit.py monitor-72h-runs.json 2026-11-07T20:55:00Z 72`. Veri: GitHub Actions score.yml çalışmaları (200 kayıt) ve D1 `observations` / `meta`; hepsi salt okunur.

## Hava çekimi (Cloudflare cron `7 * * * *`)
- 73 saatin 73'ünde kayıt var; atlanan saat yok.
- Aralık medyanı 60 dk, en uzunu 60 dk.
- Son çekim 20:07:32Z, iki istek de HTTP 200.

## Puanlama (puan yazan çalışmalar, ≥ 90 sn)
- **72 saat:** 61 yazım. Aralık medyanı 9 dk, en uzunu **510 dk** (gece, düzeltmeden önce).
- **Düzeltmeden sonra** (2026-11-07 15:54Z'den beri, ~5 sa): 15 yazım. Aralık medyanı 10 dk, en uzunu **60 dk**; her saatte en az bir yazım var.

## Bayatlık uyarısı (MODEL.md §18: kullanılan hava ya da puan > 2 sa)
| Dönem | Bölüm | Toplam süre | En kötü yaş |
|---|---|---|---|
| 72 saat | 15 | 2638 dk (~44 sa) | 536 dk |
| Düzeltmeden önce | 15 | 2638 dk | 536 dk |
| Düzeltmeden sonra (~5 sa) | **0** | 0 | 62 dk |

"Düzeltmeden sonra" dönemi henüz kısa. Bir sonraki izlemede `meta.score_dispatch_log` kaydıyla günlerce ölçülecek.

## GitHub zamanlanmış çalışmalar
- 288 beklenen yuva içinde 23 başladı: **%8,0**. Beklenen yuvalar saatte :08, :23, :38 ve :53.
- Yuvalara göre: :38 → 8, :08 → 6, :23 → 5, :53 → 4.
- Sonuç: GitHub zamanlayıcısı bu repo için güvenilir bir saat değil. Cloudflare tetiği birincil yapıldı, GitHub zamanlaması yalnız yedek olarak kaldı (`docs/ARCHITECTURE.md` → Tetikler).

## Cloudflare tetiği (Worker → score.yml dispatch)
- **5 kez devreye girdi**, hepsinin sebebi `new weather`: 16:07, 17:07, 18:07, 19:07, 20:07.
  - Son ikisi `meta.score_dispatch_log` kaydında (Q deploy'undan beri).
  - İlk üçü çalışma listesinden çıkarım (aynı kullanıcı, :07 dakikası).
- `stale weather` ve `stale scores` sebepleri 72 saatte hiç gerekmedi.
- `score_guard_last` (20:07:32Z): `reason: new weather`, `dispatched`, `alert: ok`, `token: true`. Puan 19:56Z, en yeni çekim 20:07Z.
- Diğer dispatch'ler: 42 deploy kaynaklı; 5 elle başlatılmış; 1 kuru test (#199, 11-07 14:07).
- Kuru test kodu bu izlemeyle kaldırıldı. D1'de `meta.score_dispatch_test` satırı zararsız bir kalıntı olarak duruyor.

## Varsayımlar
- ≥ 90 sn süren başarılı çalışmanın puan yazdığı varsayıldı; kısa olanlar "nothing new" ya da "--pending" çıkışı.
- Çekim dakikası (:07:32) yalnız en yeni çekim için kayıtlı; diğerleri için cron zamanı varsayıldı.
- Cloudflare tetik çalışmalarını elle olanlardan ayırmak için 2026-11-07 15:54Z öncesinde kayıt yok; o dönemde çalışma listesinden çıkarım yapıldı.
