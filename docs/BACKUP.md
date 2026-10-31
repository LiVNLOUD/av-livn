# Yedek ve geri yükleme

**Ne yedeklenir:** yalnız sahibin verisi — `spots` (yönetici adları, lamba, notlar, durum), `field_obs`,
`field_depth`, `field_photo`, `catch_log`, `catch_session`, `catch_item`, bildirim abonelikleri ve ayarları
(`push_subscription`, `notify_settings`, `notify_sent`; tablo yoksa atlanır). Puanlar, hava, okyanus verisi
yeniden üretilebilir, yedeklenmez.

**Nasıl:** `.github/workflows/backup.yml`, her gün 01:13 UTC (04:13 TSİ).
1. `python -m av_pipeline.backup dump` D1 REST'ten JSON döker (runner'ın geçici dizinine, `umask 077`).
2. `gpg --symmetric --cipher-algo AES256`, parola `BACKUP_PASSPHRASE` repo secret'ı (log'a yazılmaz).
3. Düz metin `shred -u` ile silinir; yalnız `.json.gpg` 90 gün saklanan Actions artifact'ına yüklenir.

Repo public olduğu için artifact'ı GitHub'da oturum açmış herkes indirebilir; içerik şifreli olduğundan
okunamaz. **Repoya hiçbir zaman düz metin yedek konmaz.** Parola kaybolursa yedekler açılamaz: parolayı
bir parola yöneticisinde de saklayın.

## Kurulum (bir kez)
1. Güçlü bir parola üretin (ör. `openssl rand -base64 32`) ve parola yöneticinize kaydedin.
2. GitHub → repo → Settings → Secrets and variables → Actions → New repository secret:
   ad `BACKUP_PASSPHRASE`, değer = parola.
3. Actions → backup → Run workflow; çıktıda tablo başına satır sayıları görünür (değer değil).

## Geri yükleme
```bash
# 1) Actions → backup → istenen çalışma → Artifacts → indir, aç (av-livn-YYYYMMDDTHHMMZ.json.gpg)
gpg --batch --pinentry-mode loopback -d -o /tmp/d1.json av-livn-*.json.gpg   # parola sorar
# 2) JSON → SQL (INSERT OR REPLACE; tekrar çalıştırmak güvenli)
cd pipeline && python3 -m av_pipeline.backup restore /tmp/d1.json > /tmp/restore.sql && cd ..
# 3) Önce yerelde dene
cd workers/api && wrangler d1 migrations apply av-livn --local && wrangler d1 execute av-livn --local --file /tmp/restore.sql
# 4) Canlıya (yalnız gerçekten veri kaybı varsa)
wrangler d1 execute av-livn --remote --file /tmp/restore.sql
# 5) Düz metni sil
shred -u /tmp/d1.json /tmp/restore.sql
```
Geri yüklemeden sonra puanlar bir sonraki saatlik `score.yml` çalışmasında saha verisiyle yeniden hesaplanır.

## Test (2026-10-31)
Yerel D1 (6 mera, 2 saha girişi, 5 derinlik satırı, 1 seans, 1 av satırı) → dump → gpg AES256 (rastgele
deneme parolası) → şifreli dosyada not metni aranır: bulunmadı → çöz → `restore` SQL → boş, migration
uygulanmış yeni yerel D1 → tablo sayıları aynı (6/2/5/1/1), not metni birebir. İkinci kez çalıştırma aynı
sonucu verir (`INSERT OR REPLACE`). Birim testi: `pipeline/tests/test_backup.py` (sayfalama, tırnak, tekrar).
Canlı yedek çalışması `BACKUP_PASSPHRASE` eklendikten sonra yapılır.
