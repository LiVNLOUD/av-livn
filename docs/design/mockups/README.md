# Faz V maketleri

Hepsi statik HTML. Uygulamayla gönderilmez. Sağ alttaki "Sorular" düğmesi, her görselin hangi kullanıcı sorusunu cevapladığını gösterir.

**Seçilen yön: A "Atlas"** (10 Kasım).

| Dosya | Ne |
|---|---|
| `home-a-desktop(.light).html`, `home-a-mobile(-detail)(-light).html` | Ana ekran A: masaüstü 1440, 390 ilk ekran ve ayrıntı; koyu ve açık tema |
| `dossier-kordon-*.html` | Kıyı dosyası, **fotoğraflı**: Kordon (Ömerbey Mah. güneydoğusu), Mapillary 21.07.2024 |
| `dossier-tirilye-*.html` | Kıyı dosyası, **fotoğrafsız**: Tirilye İskelesi, OSM'den şematik görünüm, 8 Kasım saha derinliği |
| `sahadayim-gunduz.html`, `sahadayim-gece.html` | Sahadayım, 390 px |
| `icons.html` | Simge seti (Tabler temelli, V0b) |
| `home-b-*.html` | **Reddedildi**: B "Kokpit", yalnız karşılaştırma için |
| `icons-v0-rejected/` | **Reddedildi**: V0a simge seti |

**Ekran görüntüleri:** `shots/` klasöründe (`deviceScaleFactor` 2); reddedilenler `shots/rejected/` altında.

**Üreticiler:**
- `../build-mockup-data.py`: veri (pipeline venv);
- `../build-mockups.py`: ana ekranlar;
- `../build-v0b.py`: kıyı dosyası ve Sahadayım;
- `../build-icons.py`: simgeler.
