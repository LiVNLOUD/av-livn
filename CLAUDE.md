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
npm test                    # web build + embed + scoring (%100 kapsam) + worker testleri
npm run typecheck
npm run deploy              # build + D1 migrations (remote) + wrangler deploy
cd pipeline && python3 -m venv .venv && .venv/bin/pip install -e '.[dev]' && .venv/bin/pytest
bash scripts/dns-inventory.sh   # her DNS işleminden önce, çıktıyı docs/dns-inventory.md'ye ekle
```

## Cloudflare (bulut oturumu)
- Kimlik bilgisini proxy `api.cloudflare.com`'a ekliyor. wrangler için `export CLOUDFLARE_API_TOKEN=placeholder` yeterli; gerçek değer yok, aranmaz.
- Hesap ID `workers/api/wrangler.toml` içinde (gizli değil).
- Workers Assets upload'u proxy yüzünden 401 verir. Statik site `scripts/embed-assets.mjs` ile Worker'a gömülür, `[assets]` kullanılmaz.
- Ücretsiz katman: cron hesap başına 5, cron başına CPU ~10 ms. netCDF/GDAL işleri yalnız GitHub Actions'ta (pipeline/) çalışır.
- Overpass API'ye konteynerden erişilemiyor. OSM çekimi Actions'ta yapılır.

## Kesin kurallar
- livn.tr ana sitesini (Pages `livn`, `@` ve `www` CNAME), MX/TXT kayıtlarını ve `livn.tr/win` Page Rule'unu bozma. DNS işleminden önce envanter al.
- Secret değerlerini yazdırma, loglama, commit'leme (`.dev.vars`, `.env*` gitignore'da).
- Ruflo veya benzeri ağır orkestrasyon katmanı kurma.
- Puanlama motoru saf fonksiyon kalır ve %100 kapsamı korur (vitest eşiği).
- Atıflar footer'da: Open-Meteo (CC BY 4.0) + DWD, Copernicus Marine, EMODnet, © OpenStreetMap katkıcıları.

## Skill'ler
`.claude/skills/`: frontend-design, webapp-testing (anthropics/skills); test-driven-development, systematic-debugging, verification-before-completion (obra/superpowers). Kaynaklar: `.claude/skills/SOURCES.md`.
