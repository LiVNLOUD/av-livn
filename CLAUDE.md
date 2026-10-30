# av-livn — Claude için çalışma notları

Bursa (Gemlik–Mudanya) LRF av puanlama PWA'sı, av.livn.tr. Mimari: `docs/ARCHITECTURE.md`; puanlama: `docs/SCORING.md`; fazlar: `docs/ROADMAP.md`; durum: `PROGRESS.md`.

## Dil
- Kullanıcıya Türkçe yanıt ver. Arayüz metinleri Türkçe.
- Kod, değişken adları, commit mesajları İngilizce. Tür bileşen anahtarları (`gece_isik_penceresi` vb.) SCORING.md ile aynı kalır.

## Faz kapısı
Her faz sonunda: testler yeşil, deploy canlı, PROGRESS.md güncel, 5 satırlık rapor. Kullanıcı "devam" demeden sonraki faza geçme.

## Komutlar
```bash
npm install                 # Node 22
npm test                    # web build + scoring (%100 kapsam) + worker testleri
npm run typecheck
cd pipeline && python3 -m venv .venv && .venv/bin/pip install -e '.[dev]' && .venv/bin/pytest
bash scripts/dns-inventory.sh   # her DNS işleminden önce, çıktıyı docs/dns-inventory.md'ye ekle
bash scripts/smoke.sh           # canlı: av.livn.tr + livn.tr, www, /win 301
# Lokal UI: yerel D1'e örnek veri + wrangler dev + 390 px Playwright
cd workers/api && wrangler d1 migrations apply av-livn --local && cd ../..
node scripts/dev-seed.mjs > /tmp/dev.sql && (cd workers/api && wrangler d1 execute av-livn --local --file /tmp/dev.sql)
(cd workers/api && wrangler dev --local --test-scheduled --var ADMIN_TOKEN:dev-token)   # ayrı terminal
# cron tetikle: curl -X POST 'localhost:8787/cdn-cgi/local/explorer/api/local/scheduled?worker=av-livn' -d '{"cron":"9 * * * *"}'
node scripts/ui-smoke.mjs http://localhost:8787 docs/screenshots
```

## Cloudflare (bulut oturumu)
- Kimlik bilgisini proxy `api.cloudflare.com`'a ekliyor. wrangler için `export CLOUDFLARE_API_TOKEN=placeholder` yeterli; gerçek değer yok, aranmaz.
- **Oturumdan `wrangler deploy` YAPMA.** Deploy yalnız GitHub Actions'tan (`deploy.yml`, main'e push) yapılır. Oturumda wrangler sadece `d1 migrations apply/execute`, `d1 ... --command` okuma, `tail` ve lokal `wrangler dev` için kullanılır.
- Deploy sonrası `bash scripts/smoke.sh` (av.livn.tr + livn.tr, www, /win).
- R2 kullanılmaz: PMTiles static asset, oşinografi özetleri D1'de.
- Copernicus kimliği yalnız Actions secrets'ta. Oturumda yok; F3 kodu mock veriyle test edilir.
- Ücretsiz katman: cron hesap başına 5 (4'ü kullanılıyor: `src/cron.ts` CRON_FETCH/CRON_SCORE, `wrangler.toml` ile aynı olmalı), çağrı başına CPU ~10 ms. Puanlar cron'da önceden hesaplanır; API yalnız okur. netCDF/GDAL işleri yalnız GitHub Actions'ta (pipeline/) çalışır.
- Overpass API'ye konteynerden erişilemiyor. OSM çekimi Actions'ta yapılır (`geodata.yml`).
- Tür profilleri `data/species/*.yaml`; değiştirince `npm run species -w packages/scoring` (senkron testi var).
- Birim: km/sa (Türkçe "km/s" saniye demektir).

## Kesin kurallar
- livn.tr ana sitesini (Pages `livn`, `@` ve `www` CNAME), MX/TXT kayıtlarını ve `livn.tr/win` Page Rule'unu bozma. DNS işleminden önce envanter al.
- Secret değerlerini yazdırma, loglama, commit'leme (`.dev.vars`, `.env*` gitignore'da).
- Ruflo veya benzeri ağır orkestrasyon katmanı kurma.
- Puanlama motoru saf fonksiyon kalır ve %100 kapsamı korur (vitest eşiği).
- Atıflar footer'da: Open-Meteo (CC BY 4.0) + DWD, Copernicus Marine, EMODnet, © OpenStreetMap katkıcıları.

## Skill'ler
`.claude/skills/`: frontend-design, webapp-testing (anthropics/skills); test-driven-development, systematic-debugging, verification-before-completion (obra/superpowers). Kaynaklar: `.claude/skills/SOURCES.md`.
