# Levrek — veri katmanları denetimi (G4)

Hangi veri katmanı levrek için istavritten fazla değer taşır ve açık veriyle elde edilebilir mi? Mevcut boru hattı: Open-Meteo hava ve deniz, Copernicus Marine (Karadeniz/Marmara 500 m), EMODnet DTM, OSM, EUSeaMap.

| Katman | Levrek için neden | Kaynak | Lisans | Çözünürlük / sıklık | Durum | Kullanılabilirlik |
|---|---|---|---|---|---|---|
| Dere ağzı konumları | Yavru alanı, yağış sonrası besin akışı (L5, L8, L13) | OSM `waterway=river\|stream` (envanter, 8 dere ağzı merası) | ODbL | nokta | **var** | Hemen |
| Yağış 48/72 sa | Bulanıklık ve dere akışı vekili | Open-Meteo (ICON/ECMWF) `precipitation` | CC BY 4.0 | saatlik, ~2–11 km | **var** (rain48) | Hemen; 72 sa toplamı score job'a eklenir |
| Nehir debisi | Dere/nehir ağzında taze su ve bulanıklık | Open-Meteo Flood API (GloFAS v4) `river_discharge` | CC BY 4.0 | günlük, ~5 km | yok | Büyük dereler (Kocadere vb.) için denenebilir. Küçük derelerde GloFAS ağı yetersiz olabilir, doğrulanmalı |
| Bulanıklık (uydu) | Doğrudan bulanıklık; vekilin doğrulaması | Copernicus Marine okyanus rengi, Karadeniz L3/L4 (Kd490, SPM, CHL) | Copernicus Marine lisansı (ücretsiz) | günlük, ~300 m–1 km; bulut boşlukları | yok | Doğrulama için (haftalık). Gerçek zamanlı puana bulut boşlukları yüzünden uygun değil |
| Bulanıklık vekili (yağış + dalga) | Fırtına ertesi bulanık su | türetilmiş (istavritteki terim) | — | saatlik | **var** | Hemen; yön ters (orta bulanık iyi) |
| Dalga yüksekliği ve yönü, swell | Sörf hattı, fırtına ve yatışma, güvenlik | Open-Meteo Marine `wave_height`, `wave_direction`, `swell_wave_*` | CC BY 4.0 | saatlik, ~5 km | **var** | Hemen; 48 sa maksimum ve yatışma oranı eklenir |
| Maruziyet gülü (fetch) | Dalganın kıyıya ulaşması | `fetch_km` (16 yön, mevcut) | türetilmiş | mera başına | **var** | Hemen |
| Su sıcaklığı ve 48 sa düşüş | Kış ani soğuma; < 9 °C | Copernicus Marine BS-PHY (mevcut), kısa normal | Copernicus | saatlik/günlük, 500 m | **var** (sstD48, sstDev) | Hemen |
| Tuzluluk | Dere ağzında tatlı su girişi (levrek toleranslı, L12) | Copernicus BS-PHY `so` | Copernicus | günlük | yok | Düşük öncelik: levrek tuzluluğa duyarsız |
| Ay evresi | Gece görünürlüğü | astro (mevcut) | — | saatlik | **var** | Hemen |
| Gelgit | Marmara mikrotidal | — | — | — | gerek yok | Değer taşımaz |
| Taban (kaya) | Kayalık tercih | EUSeaMap 2025 + saha (mevcut) | CC BY 4.0 | ~100 m | **var** | Hemen |
| Av günlüğü (levrek) | Kalibrasyon | kendi verimiz (catch_item.species = levrek) | özel | seans | **var** (çok türlü) | n ≥ 30 seans beklenir |

**Sonuç:**
- Levrek modelinin ihtiyacının çoğu mevcut katmanlarda var. Eklenecekler:
  - 72 saatlik yağış toplamı;
  - 48 saatlik dalga maksimumu ve yatışma oranı;
  - isteğe bağlı GloFAS nehir debisi.
- Uydu bulanıklığı yalnız doğrulama içindir.
- Ağır iş yine GitHub Actions'ta yapılır; Worker'a hesap konmaz.
