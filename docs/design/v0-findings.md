# Faz V0 — bilinen sorunların doğrulaması (10 Kasım 2026)

Ölçüm: `scripts/v-audit.mjs` (canlı av.livn.tr, 08:38 UTC, başsız Chromium). Ek parçacık görünürlük ölçümü ayrıca yapıldı. Ham çıktı yanında, `v0-audit.json`.

Etiketler:
- **[canlı]** canlıda ölçüldü;
- **[kod]** kodda görüldü;
- **[test]** test edilmesi gerekiyor.

## Doğrulananlar

1. **Rüzgar katmanında çizim görünmüyor — [canlı].**
   - Canvas var (1440×836) ve sayılan çizilmiş piksel 2 sn'de 47 bin, 4 sn'de 95 bin. Bu ilk bakışta "çiziyor" gibi görünüyor.
   - Ama 3. saniyede görünürlük dağılımı: alfa 1–31: 68 943; alfa 32–95: 2 020; alfa 96–191: **55**; alfa ≥ 192: **0** (1,2 milyon pikselde).
   - Ekran görüntüsünde akış çizgisi görünmüyor.
   - Kullanıcının "0 piksel" ölçümüyle aynı sonuç: görünür çizim yok. "Hiç çizmiyor" değil; "görünmeyecek kadar soluk çiziyor".
   - **[kod]** Olası neden: sakin rüzgarda (bugün 1–24 km/sa) kare başına adım piksel altında kalıyor (`k = 0.00004·0.22·2^(12−zoom)`); kısa çizgiler kenar yumuşatmayla siliniyor. Her kare ×0,86 soldurma birikmeyi önlüyor.
   - Bu sayım yalnız "çizim çalışıyor mu" kontrolüdür; hava verisinin güncelliğine kanıt sayılmaz (D1).
2. **Rüzgar ızgarası — [canlı].**
   - 7 × 12 = 84 hücre, 0,1°; derleme 08:08 UTC, 72 saat.
   - Şu anki rüzgar 1–24 km/sa; skala 0–65 km/sa sabit. 72 saatlik aralık 0–42 km/sa, p90 28 km/sa: bugünkü değerler skalanın alt %37'sinde.
   - **[kod]** Rampa 0 km/sa'da saydam, 8 km/sa'da %55 opak. Sakin saatlerde alan koyu batimetri üstünde neredeyse görünmüyor (ekran görüntüsü). Kullanıcının bulgusu doğrulandı.
   - D2 gereği skala sabit kalacak; görünürlük renk/opaklık ve taban harita nötrleşmesiyle çözülecek (V1).
3. **Lejant varsayılan açık — [canlı].**
   - /harita/ 1920 px'te açık, haritanın %9,9'u; 1440 px'te açık, %16,1'i.
   - 390 px'te kapalı (yalnız başlık, %1,1).
   - Kullanıcının "%25" ölçümü daha büyük olabilir (lejant uzun metinle büyüyor); yön doğru.
4. **Zaman kaydırıcısı — [canlı] kısmen doğru.**
   - Hava katmanı açıkken kaydırıcı katman görüntüsünü değiştiriyor (+12 sa sonra görüntü farklı, 3 genişlikte de).
   - Varsayılan "Puan" katmanında ise yalnız mera işaretleri değişiyor.
   - Kullanıcı varsayılanı gördüyse gözlem doğru; davranış "yalnız rozet" değil, ama varsayılan görünümde öyle algılanıyor.
5. **Haritanın açılış süresi — [canlı].**
   - /harita/ işaretler hazır: 1920 → 2,5 sn, 1440 → 2,2 sn, 390 → 1,9 sn (masaüstü ağı).
   - Orta seviye mobil (4× CPU, yavaş 4G 1,6 Mbit/150 ms, sıcak önbellek): **7,8 sn**.
   - Kullanıcının "4–5 sn boş" gözlemiyle tutarlı; mobil ağda daha kötü.
6. **D8 aşamaları, şimdiki durum ("önce") — [canlı]:**

   | Profil | Önbellek | (1) iskelet (FCP) | (2) karar kartı | (3) harita etkileşimli |
   |---|---|---|---|---|
   | Masaüstü 1440 | soğuk | 308 ms | 793 ms | 2166 ms |
   | Masaüstü 1440 | sıcak | 268 ms | 487 ms | 1280 ms |
   | Orta mobil 390 (4× CPU, yavaş 4G) | soğuk | 592 ms | 1773 ms | ana sayfada harita yok |
   | Orta mobil 390 | sıcak | 344 ms | 796 ms | /harita/ 7769 ms |

   Mobil soğuk önbellekte karar kartı 1,5 sn hedefini aşıyor (1,77 sn).
7. **"Evet" + "Güven: Düşük" birlikte — [canlı].**
   - Ölçüm anında kart: karar **"Evet"**, güven **"Düşük"**. Ana gerekçe "İskele: model bu yer tipini avantajlı sayıyor (tip tercihi varsayım…)".
   - **[kod]** Karar `todayStrong`'a göre (`index.astro`); güvene bakmıyor.
8. **Lamba dili — [canlı].**
   - Mera ayrıntısındaki gerekçelerde "iskele aydınlatması olasılığı **0,50** (varsayım, kanıt yok)" 337 kez geçiyor. Ayrıca 0,60 (masa başı) 116 kez, 0,10 70 kez.
   - Ölçülmüş yüzde izlenimi veriyor. **[kod]** `precompute_v2.ts` `reasonText`.
9. **Takım önerisi yalnız suni yem — [kod].**
   - `packages/scoring/src/tackle.ts`: profil LRF/spin; çıktı jighead (sabit/mafsallı), silikon boyu/rengi, metal jig.
   - Doğal yem, dropshot, dip takımı, şamandıra ve çapari yok.
   - 8 Kasım saha gözlemi (D5: kontrollü karşılaştırma değil) henüz bir kayıt olarak yok.
10. **Derinlik — [kod + rapor].**
    - 119/119 merada kullanılan derinlik "yapı boyundan tahmin" (`docs/audit/depth-voi.md`).
    - ATL24 kapsamı: 129 granül, kutuda 0 foton, en yakın 375 km (`atl24-coverage.md`).
    - SDB reddedildi (`sdb-validation.md`).
    - Mapillary: 90 mera döneminde 22 merada görüntü (`mapillary-review.md`); 119 envanterle karşılaştırma V4'te.

## Yazı tipi: hizalı rakamlar — [canlı]
- Bricolage Grotesque Variable, 40 px:
  - `tabular-nums` açıkken "1111" = "0000" = "7777" = 96,33 px (eşit);
  - varsayılan ve `proportional-nums` ile 49,1 / 104,5 / 83,0 px (eşit değil).
- `tnum` özelliği çalışıyor; ek yazı tipi **gerekmiyor**. `global.css` zaten `:root`'ta `tabular-nums` kullanıyor.
- Font dosyasının OpenType özellik listesi okunamadı (WOFF2 için brotli modülü yok). Davranış ölçümü yeterli kanıt sayıldı.

## Önceden düzeltilmiş, yeniden "sorun" sayılmayanlar
- Yatay taşma (Q4): e2e akış 8 ile 7 genişlikte denetleniyor.
- Plan kartı süresi (Q2): masaüstü canlı medyan 0,8–1,0 sn.
- Bayatlık (Q1, izleme): Cloudflare birincil tetik; uyarı yok.
- 390 px kaydırıcı etiket çakışması (P/Q3).
