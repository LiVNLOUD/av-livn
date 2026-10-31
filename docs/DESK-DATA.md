# Masa başı veri (C6)

Sahaya gitmeden açık kaynaklardan toplanan lamba, dip ve derinlik bilgisi. Her bulgu `field_obs` satırıdır:
`source_kind='masabasi'`, `status='onaysiz'`, `evidence_json` = {kaynak, tarih, yöntem, güven, lisans}.
Satır kimliği `desk-<kaynak>-<mera>`; iş yeniden çalışınca değer güncellenir ama **onay durumu korunur**
(reddedilen bulgu geri gelmez). Saha formunda (`/saha/`) her bulgu onaylanır, düzeltilir ya da reddedilir.

Öncelik zinciri: saha > uzaktan gözlem > masa başı > DTM > önsel. Masa başı ağırlıkları:
lamba p 0.95; derinlik ağırlığı 0.6 (önsel 0.4); taban 0.35 (güven düşük) / 0.5 (orta).
Onay bekleyen bulgu puana girer; kartta kaynak "masa başı (onay bekliyor)" yazar. Değerin kendisi yalnız
yönetici görünümündedir (PRIVACY.md).

Kod: `pipeline/av_pipeline/desk/` — çalıştırma yalnız GitHub Actions'ta (`desk.yml`, aylık + elle).

| | Kaynak | Ne yazılır | Güven | Lisans/atıf |
|---|---|---|---|---|
| a | OSM Overpass: uç ±40 m `highway=street_lamp`, `man_made=lighthouse`, `seamark:light:*` | lamba p 0.95 | orta | ODbL, © OSM katkıcıları |
| b | Mapillary Graph API, uç ±50 m görüntü listesi | yalnız kart bağlantısı (`/tiles/mapillary.json`); otomatik tespit yok | — | CC BY-SA 4.0 |
| c | Sentinel-2 L2A (Planetary Computer STAC), son 3 yıl, bulut < %10 | taban sınıfı açık (kum) / koyu | düşük, en çok orta | Copernicus açık veri |
| d | Literatür sediment noktaları | — (bulunamadı, aşağıda) | | |
| e | ÇED / zemin etüdü | — (bulunamadı, aşağıda) | | |
| f | OpenSeaMap derinlik | — (kapsam doğrulanamadı, aşağıda) | | |

## a) OSM lamba
- Bulunursa lamba olasılığı 0.95 (masa başı). **Bulunmazsa hiçbir şey yazılmaz**: OSM'de eksik lamba yaygındır,
  "OSM'de yok" lambanın yokluğuna kanıt değildir.
- Sınırlama: sokak lambası kıyıya bakmayabilir, kapalı olabilir; deniz feneri ışığı suya yakın balığı toplamaz
  (yüksek, dönen). Bu yüzden güven "orta", saha gözlemi her zaman üstündür.

## b) Mapillary
- `MAPILLARY_TOKEN` repo secret'ı yoksa adım atlanır ve `docs/audit/desk_findings.json` bunu yazar.
- Kartta "Uzaktan gözlem için fotoğraflar" bağlantıları. Kullanıcı bakıp formda **uzaktan** kaynaklı lamba/yapı işaretler.
- Google Street View/Maps otomatik çekilmez (lisans).

## c) Sentinel-2 dip parlaklığı
Yöntem: SCL = 6 (su) pikselleri; parlaklık (B02 + B03)/2; aynı sahnede uçtan 800–1500 m açık su medyanına oran;
uç 0–150 m pikselleri; sahneler arası piksel medyanı (≥ 2 sahne). Oran ≥ 1.5 açık, ≤ 1.1 koyu, arası belirsiz.
Pikselerin ≥ %50'si aynı sınıfta değilse bulgu yazılmaz. Güven "orta" yalnız açık sınıf, ≥ 6 sahne, pay ≥ %60.

Sınırlamalar:
- 10 m piksel: iskele, gölge, tekne ve su karışır; kısa yapılarda uçta 1–3 temiz piksel kalır.
- Bulanıklık (Gemlik Körfezi'nde dere ağızları, kış yağışları) suyu parlatır → yanlış "açık".
- Dip sinyali ~5 m derinlikten sonra kaybolur: **koyu ≠ kaya**, derin su da koyu görünür. Koyu sınıf bu yüzden
  yalnız "yosunlu" (düşük güven) olarak yazılır.
- Güneş parlaması, dalga köpüğü, tekne izi; SCL bulut/gölge maskesi kusursuz değil.
- Sınıflı pikseller `apps/web/public/tiles/s2_substrate.geojson` ("Contains modified Copernicus Sentinel data").

## d) Literatür sediment noktaları — bulunamadı (meralara uygulanabilir)
- Ünlü & Alpar (2009), *Bull. Environ. Contam. Toxicol.* 83(6): 903–906, doi:10.1007/s00128-009-9803-8: 61 yüzey
  örneği, PAH odaklı; özetten tane boyu veya koordinat tablosu erişilemedi (tam metin ücretli).
- Gemlik Körfezi mikroplastik çalışması (JMO ek dosyası): S1–S3 istasyonları 32–52 m derinlikte, kıyıdan uzak;
  merada (uç ≤ 150 m, 2–10 m) kullanılamaz.
- 63 güncel örnekli foraminifer/ostrakod/mollusk çalışmasının istasyon tablosuna erişilemedi. Karot çalışmaları
  (İTÜ tezleri, 70 m+) yüzey kıyı tabanı için uygun değil.
- Sonuç: `data/desk/sediment_points.geojson` oluşturulmadı. Tam metne erişim olursa `data/desk/manual.json`'a
  künye + sayfa + sayı olarak eklenir.

## e) ÇED / zemin etüdü — bulunamadı
- Gemport, Borusan, Mudanya, Güzelyalı, Armutlu marina için çevrimiçi erişilebilir ÇED dosyasında meraya ≤ 1 km
  sayısal derinlik/zemin değeri bulunamadı. Kumyaka balıkçı barınağı imar planı açıklama raporu (ÇŞB Bursa,
  2021) onaylı hidrografik-oşinografik etüde atıf yapıyor; belge oturumdan açılamadı (HTTP 503), değer alınmadı.
- Kural: yalnız sayısal bulgu + künye + sayfa no; metin kopyalanmaz, public siteye konmaz.

## f) OpenSeaMap derinlik — kapsam doğrulanamadı
- OpenSeaMap derinlik katmanı kitle kaynaklı iz verisi + GEBCO konturlarıdır. Gemlik–Mudanya kıyısında iz
  verisi olduğuna dair kanıt bulunamadı; GEBCO çözünürlüğü (~450 m) EMODnet DTM'den kötü. Değer alınmadı.
- Navionics/Garmin/SHODB seyir haritası verisi kullanılmaz.

## Önce / sonra sıralama
`desk.yml` aynı saat ve aynı hava girdisiyle iki kez puanlar (masa başı hariç/dahil):
`docs/audit/rank_desk_compare.json`. Tablo PROGRESS.md "Bölüm C" altında.
