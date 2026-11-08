# Sentinel-2 uydu türevli batimetri (SDB) doğrulaması

Yöntem: Stumpf vd. (2003) log-oran (mavi/yeşil), ICESat-2 ATL24 ile kalibrasyon; doğrulama ATL24 geçişlerine göre gruplu 5 kat (aynı geçişin noktaları aynı katta). Copernicus Sentinel-2 L2A (Earth Search STAC).
Kabul eşiği: 0–8 m'de RMSE ≤ 1.5 m, R² ≥ 0.6, en az 30 bağımsız nokta (piksel × geçiş).

- Kullanılan berrak sahne: 0; kıyı şeridi pikseli 1395122; şeritte 0–10 m ATL24 noktası 0.
- Kalibrasyon: 0 bağımsız nokta, 0 geçiş.

**Karar: RET — modele girmez, yalnız rapor.** Neden: kalibrasyon için yetersiz ATL24 noktası (kıyı şeridinde 0–10 m'de 0 nokta, en az 30 gerekir).
