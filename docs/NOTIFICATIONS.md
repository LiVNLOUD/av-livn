# Bildirimler (D9)

Bildirimleri saatlik puanlama işi gönderir (`score.yml` → `scripts/score-job.ts` → `scripts/notify-send.ts`). Worker yalnız ayarları ve abonelikleri saklar (`/api/admin/notify`, yalnız ADMIN_TOKEN ile). Kararlar `workers/api/src/lib/notify.ts` içindeki saf fonksiyonda verilir; testleri `workers/api/test/notify.test.ts`.

## Kurulum (bir kez)
GitHub → repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Ne | Nereden |
|---|---|---|
| `VAPID_PRIVATE_KEY` | Web push imza anahtarı (özel) | oturumda üretildi, size ayrı iletildi; kaybolursa yeni çift üretilir, açık anahtar `workers/api/src/lib/vapid.ts`'te değişir ve cihazlar yeniden abone olur |
| `NTFY_TOPIC` | Tahmin edilemez ntfy konu adı (yedek kanal) | oturumda üretildi (`avlivn-` + 24 rastgele karakter); asla herkese açık bir konu adı kullanmayın |

Açık VAPID anahtarı tasarım gereği herkese açıktır ve repoda durur. Özel anahtar ve konu adı yalnız Actions ortamındadır; loglara yazılmaz.

## Cihaz kurulumu
**Android (Chrome):**
1. av.livn.tr/ayarlar/ adresini açın ve yönetici anahtarıyla giriş yapın.
2. "Bu cihazda bildirimleri aç" → izin verin.
3. İsterseniz ⋮ → "Ana ekrana ekle"; bildirim bu olmadan da çalışır.

**iPhone / iPad (iOS 16.4+, Safari):**
1. Safari'de av.livn.tr'yi açın → Paylaş → **Ana Ekrana Ekle**.
2. Ana ekrandaki **av.livn simgesinden** uygulamayı açın, sonra /ayarlar/ → giriş → "Bu cihazda bildirimleri aç" → izin verin.
3. **iOS'ta web push yalnız ana ekrana eklenmiş uygulamada çalışır.** Safari sekmesinden açılan sayfa abone olamaz; sayfa bunu uyarır.

**ntfy (yedek kanal, iki platformda da):**
1. ntfy uygulamasını kurun (Android: Play Store / F-Droid; iOS: App Store).
2. "+" ile `NTFY_TOPIC` değerindeki konuya abone olun; sunucu: ntfy.sh.
3. /ayarlar/ → Kanal: "ntfy" ya da "İkisi". Konu adını bilen herkes mesajları okuyabilir; bu yüzden ad rastgeledir ve kimseyle paylaşılmaz.

## Bildirim türleri (her biri açılıp kapatılabilir)
| Tür | Ne zaman | Kural |
|---|---|---|
| Günlük özet | 17:00 (Europe/Istanbul) saatlik çalışmada | Önümüzdeki 24 saatin en iyi 3 penceresi (mera + saat aralığı + puan/sıra). Günde bir. |
| Fırsat | Her saatlik çalışmada | 12 saat içinde puanı eşiği (varsayılan 80, 50–95 ayarlanır) geçen ve bandı dar (%10–90 genişliği ≤ 30) pencere. Aynı merada çakışan bir pencere için daha önce gönderildiyse tekrar gönderilmez. |
| Güvenlik | Her saatlik çalışmada | Favori merada 12 saat içinde güvenlik kapısı (hamle/dalga) devreye girerse, mera başına günde bir. |
| Test | /ayarlar/ → "Test bildirimi gönder" | 15 dakikalık çalışmada (en geç ~15 dk) tüm yapılandırılmış kanallara gider; sonuç /ayarlar/'da görünür. |

- **Sessiz saatler** (varsayılan 23:00–07:00): test dışında hiçbir şey gönderilmez. Bekleyen fırsat/güvenlik uyarısı hâlâ geçerliyse sessiz saat bitince gider.
- **Dokununca** kart o saatte açılır: `/mera/?id=<mera>&t=<saat>`; günlük özet en iyi pencerenin kartını açar.
- Bir mesaj en az bir kanal ilettiğinde `notify_sent`'e yazılır. Secret eksikse kayıt yapılmaz; secret eklenince uyarı kaybolmaz.
- Süresi geçen abonelik (HTTP 404/410) silinir.

## Canlı test
`Actions → notify-smoke → Run workflow`:
1. Admin API ile test ister.
2. Gönderim adımını çalıştırır.
3. Sonucu okur ve mesajın ntfy sunucusuna ulaştığını sayar.

Çıktıda yalnız sayılar ve HTTP kodları görünür.
