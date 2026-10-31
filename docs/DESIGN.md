# Tasarım özeti (Faz E)

**Konu ve iş:** Gece LRF avcısı için, Gemlik–Mudanya kıyısında "nereye, ne zaman" kararı. Ekranlar: geniş masaüstü (planlama), telefon (iskelede, karanlıkta). Kimlik zaten var ve korunuyor: gece denizi zemin, tek vurgu "sodyum lamba" turuncusu. Akılda kalan tek öğe **mera × saat ısı haritası**: bir gelgit tablosu gibi okunan, gece bantlı, puan renkli ızgara. Geri kalan her şey sessiz.

## Renk (değişmedi, tokenlar `global.css :root`)
| Token | Hex | Rol |
|---|---|---|
| `--sea` | #0e1c27 | sayfa zemini |
| `--deep` | #0a151e | kuyu: girdi, ısı haritası zemini, çekmece |
| `--swell` | #1b2e3b | çizgi, ayraç, pasif kenar |
| `--foam` | #dbe6ea | birincil metin |
| `--mist` | #8ba2ad | ikincil metin |
| `--sodium` | #f5a83c | tek vurgu: birincil eylem, seçili durum, "şimdi" çizgisi |
| `--good/--warn/--bad` | #5fd08a / #f0a35e / #ff7a6b | puan bantları; ısı haritasında sürekli ölçek bunlardan oklab karışımla |

## Tipografi
Tek aile: Bricolage Grotesque Variable (optik boyut açık). Başlıklar dar genişlik (`font-stretch: 80%`), gövde normal. Tüm sayılar `tabular-nums`. **Altı boyut, rem:**

| Token | rem / px | Satır yüksekliği | Kullanım |
|---|---|---|---|
| `--fs-1` | 0.75 / 12 | 1.4 | rozet, eksen, dipnot |
| `--fs-2` | 0.875 / 14 | 1.45 | ikincil metin, form etiketi, tablo |
| `--fs-3` | 1 / 16 | 1.5 | gövde, buton |
| `--fs-4` | 1.25 / 20 | 1.3 | bölüm başlığı, kart başlığı |
| `--fs-5` | 1.75 / 28 | 1.15 | sayfa başlığı (dar ekran), büyük puan |
| `--fs-6` | 2.5 / 40 | 1.05 | sayfa başlığı (geniş ekran) |

Büyük harf etiket, eğik vurgu, tek kelime renklendirme yok.

## Boşluk ve grid
Boşluk ölçeği `--s1..--s7` = 4/8/12/16/24/32/48 px. Tek grid: CSS grid, bölgeler `grid-template-areas` ile; aralık `--s4`, sayfa kenarı `--s4` (dar) / `--s6` (geniş). Paragraf metni en çok 68ch; liste, harita, ısı haritası tam genişlik.

## Yerleşim (ana sayfa)
```
≥1920:  [ pencereler 360 ][ ısı haritası 1fr ][ harita 1fr ][ kart 420 (çekmece) ]
1200–1919: [ pencereler+liste 400 ][ harita | ısı haritası (sekme) 1fr ][ kart 420 ]
768–1199:  [ liste 1fr ][ harita 1fr ]   kart = alt panel
<768:      tek sütun; alt sekme çubuğu: Liste · Harita · Sahadayım · Günlük
```
Bölgeler kendi içinde kayar; sayfa yüksekliği ≥1200 px'te görünüm penceresine sabit (100dvh − başlık). Kart çekmecesi kapalıyken harita genişler.

## Bileşenler (her biri tek tanım, `global.css`)
- `.btn` birincil (sodyum dolgu, koyu metin), `.btn.secondary` (şeffaf, `--swell` kenar, `--foam` metin), `.btn.small` (32 px). Yükseklik 40 px (dokunmatik 44 px'e `.btn.touch`). Hepsi `inline-flex; align-items: center`.
- `.link`: metin bağlantısı, altı çizili `--mist`, hover `--foam`.
- `.badge`: 12 px, hap şekli, kenar rengi anlamı taşır (`.badge.warn`, `.badge.legal`, `.badge.assume`).
- `.card`: `--deep` zemin, 1 px `--swell` kenar, 12 px yarıçap, iç boşluk `--s4`. Kart eylemleri `.actions`: tek satır, `align-items: center`, `gap: --s2`, aynı yükseklik.
- Başlık menüsü: Liste, Harita, Sahadayım, Günlük, Ayarlar; admin anahtarı cihazdaysa Adaylar, Panel.

## İlkeler
1. Isı haritası ana görsel; renk yalnız puan anlamına gelir, süs yok.
2. Belirsizlik görünür: bant genişse hücre taralı/soluk; "varsayıma dayanıyor" rozeti.
3. Karanlıkta okunur: ≥ 4.5:1 kontrast, 44 px dokunma hedefi, hareket yalnız kullanıcı eylemine yanıt.
