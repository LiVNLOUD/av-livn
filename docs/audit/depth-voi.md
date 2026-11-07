# R1 — Derinlik bilgisinin değeri (her aktif mera)

Hesap: 2026-11-07T21:51Z; `score-job --dry-run --depth-voi`. Ham veri: `depth-voi.json`. Motor saf ve Monte Carlo'suz; tür istavrit.

Yöntem:
- Her merada atış mesafesi derinliği (0–150 m) sırayla 1, 2, 3, 4, 6, 8, 10 m'ye sabitlenir; diğer meralar ve hava aynı kalır.
- Ölçülenler:
  - 72 saatin en iyi (güvenlik tavanı dışı) puanı ve meralar arası sırası;
  - 72 saatin ilk 3'üne girip girmemesi;
  - bu geceki plan ilk 3'ü (bugün 03:00Z'ye kadar);
  - en iyi saatteki takım önerisi (profil, gram, hedef su katmanı).

## Ana bulgu
- **Bu gecenin planı derinlikten etkilenmiyor:** 119 meranın hiçbiri ilk 3'e girip çıkmıyor.
  - Modelde derinlik yalnız gündüz koluna girer (MODEL.md §3). Gece lambaya gelen balık yüzeyde; gece önerisini lamba ve yapı belirler.
- **Gündüz saatlerini içeren 72 saatlik sıralama derinliğe çok duyarlı.**
  - 61 merada derinlik 1 m ile 10 m arasında değişince mera 72 saatin ilk 3'üne girip çıkıyor.
  - Sıra aralığı medyanı 33 basamak; puan aralığı en çok 12,8 puan.
- Kullanılan derinlik 119/119 merada yapı boyundan tahmin (ölçüm değil).
- Takım önerisi derinliğe göre değişiyor: en iyi saatteki takım, mera başına medyan 5 farklı öneri.

## Öncelikli meralar (ilk 10)
Sıralama: 72 saatin ilk 3'üne girip çıkma, sonra sıra aralığı, sonra takım değişimi.

| # | Mera | Şu an kullanılan derinlik | 72 sa en iyi puan (1 → 10 m) | Sıra aralığı | 72 sa ilk 3 | Takım önerisi |
|---|---|---|---|---|---|---|
| 1 | Kordon (Eşkel kuzeybatısı) | 1,4 m (yapı boyundan tahmin) | 72,5 → 82 | 1–60 | 8–10 m'de girer | 6 farklı |
| 2 | Kordon (Hasanbey kuzeyi) | 1,4 m (yapı boyundan tahmin) | 72,5 → 82 | 1–60 | 6–10 m'de girer | 5 farklı |
| 3 | Kordon (Hasanbey kuzeydoğusu) | 1,6 m (yapı boyundan tahmin) | 72,6 → 82,1 | 1–59 | 6–10 m'de girer | 5 farklı |
| 4 | Kordon (Kumyaka doğusu) | 3 m (yapı boyundan tahmin) | 72,7 → 82,5 | 1–58 | 6–10 m'de girer | 6 farklı |
| 5 | Kordon (Ömerbey Mah. doğusu) | 1,4 m (yapı boyundan tahmin) | 73,1 → 82,5 | 1–58 | 6–10 m'de girer | 5 farklı |
| 6 | Kordon (Ömerbey Mah. güneydoğusu) | 1,4 m (yapı boyundan tahmin) | 73,2 → 82,6 | 1–57 | 6–10 m'de girer | 5 farklı |
| 7 | Kordon (Dr.Ziya Kaya batısı) | 1,4 m (yapı boyundan tahmin) | 73,8 → 82,3 | 1–54 | 6–10 m'de girer | 7 farklı |
| 8 | Kordon (Hisar kuzeybatısı) | 1,4 m (yapı boyundan tahmin) | 73,8 → 82,3 | 1–54 | 6–10 m'de girer | 7 farklı |
| 9 | Kordon (Kumsaz güneyi) | 1,5 m (yapı boyundan tahmin) | 73,8 → 82,6 | 1–54 | 6–10 m'de girer | 5 farklı |
| 10 | Kordon (Cumhuriyet güneyi) | 1,4 m (yapı boyundan tahmin) | 73,9 → 82,6 | 1–50 | 6–10 m'de girer | 6 farklı |

## Tüm meralar

| # | Mera | Kullanılan derinlik | Puan aralığı | Sıra aralığı | 72 sa ilk 3 | Takım |
|---|---|---|---|---|---|---|
| 1 | Kordon (Eşkel kuzeybatısı) | 1,4 m (yapı boyundan tahmin) | 9,5 | 1–60 | 8–10 m | 6 |
| 2 | Kordon (Hasanbey kuzeyi) | 1,4 m (yapı boyundan tahmin) | 9,5 | 1–60 | 6–10 m | 5 |
| 3 | Kordon (Hasanbey kuzeydoğusu) | 1,6 m (yapı boyundan tahmin) | 9,5 | 1–59 | 6–10 m | 5 |
| 4 | Kordon (Kumyaka doğusu) | 3 m (yapı boyundan tahmin) | 9,8 | 1–58 | 6–10 m | 6 |
| 5 | Kordon (Ömerbey Mah. doğusu) | 1,4 m (yapı boyundan tahmin) | 9,4 | 1–58 | 6–10 m | 5 |
| 6 | Kordon (Ömerbey Mah. güneydoğusu) | 1,4 m (yapı boyundan tahmin) | 9,4 | 1–57 | 6–10 m | 5 |
| 7 | Kordon (Dr.Ziya Kaya batısı) | 1,4 m (yapı boyundan tahmin) | 8,5 | 1–54 | 6–10 m | 7 |
| 8 | Kordon (Hisar kuzeybatısı) | 1,4 m (yapı boyundan tahmin) | 8,5 | 1–54 | 6–10 m | 7 |
| 9 | Kordon (Kumsaz güneyi) | 1,5 m (yapı boyundan tahmin) | 8,8 | 1–54 | 6–10 m | 5 |
| 10 | Kordon (Cumhuriyet güneyi) | 1,4 m (yapı boyundan tahmin) | 8,7 | 1–50 | 6–10 m | 6 |
| 11 | Kordon (Orhaniye batısı) | 1,4 m (yapı boyundan tahmin) | 8,7 | 1–50 | 6–10 m | 6 |
| 12 | Kordon (Orhaniye güneybatısı) | 1,4 m (yapı boyundan tahmin) | 8,7 | 1–50 | 6–10 m | 6 |
| 13 | Kordon (Kurşunlu doğusu, Gemlik) | 1,4 m (yapı boyundan tahmin) | 8,7 | 1–50 | 6–10 m | 4 |
| 14 | Kordon (Demirsubaşı güneyi) | 1,4 m (yapı boyundan tahmin) | 8,5 | 1–45 | 6–10 m | 7 |
| 15 | Kordon (Kayhan güneybatısı) | 1,4 m (yapı boyundan tahmin) | 8,5 | 1–45 | 6–10 m | 7 |
| 16 | Kordon (Balıkpazarı güneybatısı) | 1,4 m (yapı boyundan tahmin) | 8,5 | 1–45 | 6–10 m | 7 |
| 17 | Kordon (Demirsubaşı güneybatısı) | 1,4 m (yapı boyundan tahmin) | 8,5 | 1–45 | 6–10 m | 7 |
| 18 | Kordon (Armutlu batısı) 2 | 1,6 m (yapı boyundan tahmin) | 8,8 | 1–45 | 6–10 m | 6 |
| 19 | Kordon (Kurşunlu doğusu, Gemlik) 6 | 1,5 m (yapı boyundan tahmin) | 8,6 | 1–43 | 6–10 m | 6 |
| 20 | Kordon (Cumhuriyet batısı) | 1,4 m (yapı boyundan tahmin) | 8,6 | 1–43 | 6–10 m | 5 |
| 21 | Kordon (Armutlu batısı) | 2 m (yapı boyundan tahmin) | 8,8 | 1–42 | 6–10 m | 6 |
| 22 | Kordon (Armutlu batısı) 3 | 1,4 m (yapı boyundan tahmin) | 8,8 | 1–41 | 6–10 m | 5 |
| 23 | Ayı Burnu | 2,3 m (yapı boyundan tahmin) | 11,6 | 1–40 | 4–10 m | 5 |
| 24 | Kordon (Armutlu güneydoğusu) | 1,4 m (yapı boyundan tahmin) | 8,8 | 1–38 | 6–10 m | 5 |
| 25 | Kordon (Kurşunlu doğusu, Gemlik) 5 | 1,4 m (yapı boyundan tahmin) | 8,7 | 1–38 | 6–10 m | 5 |
| 26 | Kordon (Armutlu batısı) 4 | 1,6 m (yapı boyundan tahmin) | 8,9 | 1–38 | 6–10 m | 4 |
| 27 | Petek Sitesi İskele | 2,9 m (yapı boyundan tahmin) | 9,8 | 1–37 | 6–10 m | 6 |
| 28 | Kordon (Fıstıklı batısı) | 1,4 m (yapı boyundan tahmin) | 8,9 | 1–37 | 6–10 m | 5 |
| 29 | Kayalık kıyı (Armutlu güneydoğusu) | 1,8 m (yapı boyundan tahmin) | 12,4 | 1–37 | 4–10 m | 4 |
| 30 | Mudanya İskelesi | 3,5 m (yapı boyundan tahmin) | 9,4 | 1–36 | 6–10 m | 5 |
| 31 | Tirilye İskelesi | 1,6 m (yapı boyundan tahmin) | 9,1 | 1–35 | 6–10 m | 5 |
| 32 | Kordon (Kumsaz güneyi) 2 | 1,4 m (yapı boyundan tahmin) | 6,9 | 1–33 | 6–10 m | 5 |
| 33 | Kordon (Kumsaz güneyi) 3 | 1,5 m (yapı boyundan tahmin) | 6,9 | 1–33 | 6–10 m | 5 |
| 34 | Kordon (Kurşunlu doğusu, Gemlik) 4 | 1,5 m (yapı boyundan tahmin) | 6,8 | 1–31 | 6–10 m | 5 |
| 35 | Kordon (Kurşunlu doğusu, Gemlik) 2 | 1,5 m (yapı boyundan tahmin) | 6,8 | 1–31 | 6–10 m | 4 |
| 36 | Armutlu İskelesi (Armutlu batısı) | 1,4 m (yapı boyundan tahmin) | 8,8 | 1–30 | 6–10 m | 6 |
| 37 | Kapaklı İskelesi (Kapaklı güneyi) | 2,8 m (yapı boyundan tahmin) | 8,8 | 1–29 | 4–10 m | 5 |
| 38 | Küçükkumla İskelesi | 1,4 m (yapı boyundan tahmin) | 8,6 | 1–27 | 6–10 m | 5 |
| 39 | Kordon (Kurşunlu doğusu, Gemlik) 3 | 1,6 m (yapı boyundan tahmin) | 6,8 | 1–27 | 6–10 m | 4 |
| 40 | İDO Güzelyalı Feribot İskelesi | 3,7 m (yapı boyundan tahmin) | 8,7 | 1–26 | 6–10 m | 6 |
| 41 | Fıstıklı İskelesi (Fıstıklı güneybatısı) | 4,1 m (yapı boyundan tahmin) | 8,8 | 1–26 | 4–10 m | 5 |
| 42 | İskele (İslamköy) | 1,3 m (yapı boyundan tahmin) | 8,6 | 1–26 | 6–10 m | 5 |
| 43 | Tirilye Limanı | 2,5 m (yapı boyundan tahmin) | 9,1 | 1–22 | 4–10 m | 6 |
| 44 | Kurşunlu (Karacabey) – orta doğu mendireği | 2 m (yapı boyundan tahmin) | 9,9 | 1–21 | 4–10 m | 4 |
| 45 | Demirsubaşı İskelesi | 2,2 m (yapı boyundan tahmin) | 6,7 | 1–20 | 6–10 m | 6 |
| 46 | Kurşunlu (Karacabey) – kısa doğu mendireği | 2 m (yapı boyundan tahmin) | 9,8 | 1–19 | 4–10 m | 4 |
| 47 | Kurşunlu (Karacabey) – uzun doğu mendireği | 1,9 m (yapı boyundan tahmin) | 9,8 | 1–18 | 4–10 m | 4 |
| 48 | Kurşunlu (Karacabey) – kısa batı mendireği | 1,9 m (yapı boyundan tahmin) | 9,7 | 1–14 | 4–10 m | 5 |
| 49 | Kurşunlu (Karacabey) – uzun batı mendireği | 2 m (yapı boyundan tahmin) | 9,7 | 1–14 | 4–10 m | 5 |
| 50 | Kurşunlu (Karacabey) – orta batı mendireği | 2 m (yapı boyundan tahmin) | 9,7 | 1–14 | 4–10 m | 5 |
| 51 | Kurşunlu Yat Limanı | 2,5 m (yapı boyundan tahmin) | 8,7 | 1–12 | 4–10 m | 5 |
| 52 | Güzelyalı Yat Limanı – liman içi | 2,1 m (yapı boyundan tahmin) | 8,7 | 1–12 | 4–10 m | 4 |
| 53 | Büyükkumla İskelesi | 2,1 m (yapı boyundan tahmin) | 8,6 | 1–10 | 4–10 m | 6 |
| 54 | Armutlu İskelesi | 2,1 m (yapı boyundan tahmin) | 8,8 | 1–10 | 4–10 m | 5 |
| 55 | Karacaali İskelesi | 2,1 m (yapı boyundan tahmin) | 8,7 | 1–9 | 4–10 m | 5 |
| 56 | Güzelyalı Yat Limanı – doğu mendireği | 3 m (yapı boyundan tahmin) | 8,7 | 1–7 | 3–10 m | 6 |
| 57 | Güzelyalı Yat Limanı – batı mendireği | 2,3 m (yapı boyundan tahmin) | 8,8 | 1–7 | 3–10 m | 4 |
| 58 | Armutlu Devlet Limanı – kısa batı mendireği | 2 m (yapı boyundan tahmin) | 8,8 | 1–5 | 3–10 m | 6 |
| 59 | Armutlu Devlet Limanı – doğu mendireği | 1,8 m (yapı boyundan tahmin) | 8,8 | 1–5 | 3–10 m | 5 |
| 60 | Armutlu Devlet Limanı – orta batı mendireği | 2,4 m (yapı boyundan tahmin) | 8,8 | 1–4 | 3–10 m | 5 |
| 61 | Armutlu Devlet Limanı – uzun batı mendireği | 2,9 m (yapı boyundan tahmin) | 8,8 | 1–3 | 3–10 m | 5 |
| 62 | Bülbül Deresi ağzı | 0,7 m (yapı boyundan tahmin) | 12,8 | 9–69 | — | 6 |
| 63 | Simav Çayı ağzı | 0,7 m (yapı boyundan tahmin) | 12 | 9–65 | — | 5 |
| 64 | Fıstıklı Deresi ağzı | 0,7 m (yapı boyundan tahmin) | 12,3 | 9–64 | — | 5 |
| 65 | Dere ağzı (Kumsaz) | 0,9 m (yapı boyundan tahmin) | 12 | 10–65 | — | 5 |
| 66 | Kumla Deresi ağzı | 0,7 m (yapı boyundan tahmin) | 11,8 | 9–64 | — | 5 |
| 67 | Dere ağzı (Güzelyalı Burgaz) | 0,8 m (yapı boyundan tahmin) | 12 | 9–63 | — | 5 |
| 68 | Büyükkumla Deresi ağzı | 0,8 m (yapı boyundan tahmin) | 11,8 | 9–63 | — | 5 |
| 69 | Kapaklı Deresi ağzı | 1 m (yapı boyundan tahmin) | 11,7 | 9–62 | — | 5 |
| 70 | Dere ağzı (Kurşunlu, Karacabey) | 0,7 m (yapı boyundan tahmin) | 12,4 | 18–71 | — | 4 |
| 71 | Kumsal 4 | 0,8 m (yapı boyundan tahmin) | 12,4 | 62–113 | — | 5 |
| 72 | Kumsal (Kurşunlu doğusu, Karacabey) | 0,8 m (yapı boyundan tahmin) | 12,3 | 62–113 | — | 5 |
| 73 | Kumsal (Kurşunlu doğusu, Karacabey) 2 | 0,8 m (yapı boyundan tahmin) | 12,2 | 62–113 | — | 5 |
| 74 | Kumsal (Bayramdere kuzeybatısı) | 0,9 m (yapı boyundan tahmin) | 12,2 | 62–113 | — | 5 |
| 75 | Kumsal | 0,9 m (yapı boyundan tahmin) | 12,2 | 62–113 | — | 5 |
| 76 | Karsak Çayı ağzı | 0,7 m (yapı boyundan tahmin) | 11,4 | 14–64 | — | 5 |
| 77 | Kumsal 3 | 0,8 m (yapı boyundan tahmin) | 12,4 | 62–111 | — | 5 |
| 78 | Dere ağzı (Bayramdere) | 0,7 m (yapı boyundan tahmin) | 12,1 | 22–71 | — | 5 |
| 79 | Kumsal 2 | 0,9 m (yapı boyundan tahmin) | 12 | 62–111 | — | 5 |
| 80 | Kumsal (Eşkel kuzeybatısı) | 0,8 m (yapı boyundan tahmin) | 11,9 | 62–103 | — | 5 |
| 81 | Kumsal (Eşkel batısı) | 0,8 m (yapı boyundan tahmin) | 11,9 | 62–103 | — | 5 |
| 82 | Kumsal (Sahil batısı) | 0,9 m (yapı boyundan tahmin) | 12 | 62–101 | — | 5 |
| 83 | Kumsal (Eğerce doğusu) | 0,9 m (yapı boyundan tahmin) | 12 | 62–101 | — | 5 |
| 84 | Kumsal (Eğerce doğusu) 2 | 0,9 m (yapı boyundan tahmin) | 12 | 62–101 | — | 5 |
| 85 | Kumsal (Sahil doğusu) | 0,9 m (yapı boyundan tahmin) | 11,9 | 62–101 | — | 5 |
| 86 | Kumsal (Güzelyalı Yalı kuzeydoğusu) | 0,9 m (yapı boyundan tahmin) | 12,1 | 62–98 | — | 5 |
| 87 | Kumsal (Güzelyalı Yalı kuzeybatısı) | 0,9 m (yapı boyundan tahmin) | 12,1 | 62–98 | — | 5 |
| 88 | Kumsal (Eşkel batısı) 2 | 0,8 m (yapı boyundan tahmin) | 12 | 62–98 | — | 5 |
| 89 | Kumsal (Güzelyalı Siteler kuzeyi) | 0,8 m (yapı boyundan tahmin) | 12 | 62–95 | — | 5 |
| 90 | Kumsal (Güzelyalı Siteler kuzeyi) 2 | 0,8 m (yapı boyundan tahmin) | 12 | 62–95 | — | 5 |
| 91 | Kumsal (Armutlu güneyi) 3 | 0,8 m (yapı boyundan tahmin) | 12,7 | 62–89 | — | 6 |
| 92 | Kumsal (Mesudiye kuzeyi) | 0,9 m (yapı boyundan tahmin) | 12 | 62–89 | — | 5 |
| 93 | Kumsal (Fıstıklı batısı) 3 | 0,8 m (yapı boyundan tahmin) | 12,4 | 62–86 | — | 5 |
| 94 | Kumsal (Mesudiye kuzeyi) 4 | 0,8 m (yapı boyundan tahmin) | 12 | 62–86 | — | 5 |
| 95 | Kumsal (Mesudiye kuzeyi) 2 | 0,8 m (yapı boyundan tahmin) | 11,9 | 62–86 | — | 5 |
| 96 | Kumsal (Mesudiye kuzeyi) 3 | 0,8 m (yapı boyundan tahmin) | 11,9 | 62–86 | — | 5 |
| 97 | Kumsal (Sahil kuzeybatısı) | 0,9 m (yapı boyundan tahmin) | 11,9 | 62–86 | — | 4 |
| 98 | Kumsal (Armutlu güneydoğusu) | 0,8 m (yapı boyundan tahmin) | 12,5 | 62–85 | — | 5 |
| 99 | Kumsal (Armutlu güneydoğusu) 6 | 0,8 m (yapı boyundan tahmin) | 12,5 | 62–85 | — | 5 |
| 100 | Kumsal (Armutlu güneydoğusu) 7 | 0,8 m (yapı boyundan tahmin) | 12,5 | 62–85 | — | 5 |
| 101 | Kumsal (Fıstıklı batısı) | 0,8 m (yapı boyundan tahmin) | 12,6 | 62–84 | — | 5 |
| 102 | Kumsal (Armutlu güneydoğusu) 2 | 0,8 m (yapı boyundan tahmin) | 12,4 | 62–84 | — | 5 |
| 103 | Kumsal (Fıstıklı güneybatısı) | 1,5 m (yapı boyundan tahmin) | 12,3 | 62–84 | — | 5 |
| 104 | Kumsal (Armutlu güneybatısı) | 0,8 m (yapı boyundan tahmin) | 12,6 | 62–84 | — | 4 |
| 105 | Kumsal (Armutlu güneybatısı) 2 | 0,8 m (yapı boyundan tahmin) | 12,6 | 62–84 | — | 4 |
| 106 | Kumsal (Armutlu güneybatısı) 3 | 0,9 m (yapı boyundan tahmin) | 12,6 | 62–84 | — | 4 |
| 107 | Kumsal (Fıstıklı güneybatısı) 2 | 0,8 m (yapı boyundan tahmin) | 12,3 | 62–82 | — | 5 |
| 108 | Kumsal (Tirilye kuzeybatısı) | 0,9 m (yapı boyundan tahmin) | 11,7 | 62–82 | — | 5 |
| 109 | Kumsal (Armutlu güneyi) 2 | 0,8 m (yapı boyundan tahmin) | 12,4 | 62–82 | — | 4 |
| 110 | Kumsal (Armutlu güneyi) | 1,2 m (yapı boyundan tahmin) | 12,4 | 62–81 | — | 4 |
| 111 | Kumsal (Armutlu güneydoğusu) 3 | 0,8 m (yapı boyundan tahmin) | 12,4 | 62–78 | — | 5 |
| 112 | Kumsal (Armutlu güneydoğusu) 4 | 0,8 m (yapı boyundan tahmin) | 12,4 | 62–78 | — | 5 |
| 113 | Kumsal (Güzelyalı Eğitim kuzeyi) | 1 m (yapı boyundan tahmin) | 11,8 | 62–78 | — | 5 |
| 114 | Kumsal (Kapaklı güneydoğusu) | 0,8 m (yapı boyundan tahmin) | 11,7 | 62–78 | — | 4 |
| 115 | Kumsal (Armutlu güneydoğusu) 5 | 0,8 m (yapı boyundan tahmin) | 12,4 | 62–77 | — | 5 |
| 116 | Kumsal (Fıstıklı batısı) 2 | 0,8 m (yapı boyundan tahmin) | 12,4 | 62–77 | — | 5 |
| 117 | Kumsal (İslamköy kuzeybatısı) 2 | 0,9 m (yapı boyundan tahmin) | 11,4 | 62–74 | — | 5 |
| 118 | Kumsal (İslamköy kuzeybatısı) 3 | 0,8 m (yapı boyundan tahmin) | 11,4 | 62–74 | — | 5 |
| 119 | Kumsal (İslamköy kuzeybatısı) | 1 m (yapı boyundan tahmin) | 6,7 | 62–73 | — | 4 |

## Sınırlar
- Tek bir hava durumu (hesap anı) için; başka günlerde sıra farklı olabilir.
- "İlk 3" sunucunun plan adaylarının sadeleştirilmiş hali: en iyi saat puanı. Pencere süresi ve eşdeğerlik kuralı burada yok.
- Derinlik sabitleme saha ölçümü gibi yapılır (her 25 m'de çift). Gerçek ölçüm tek noktada kalırsa etkisi daha küçük olur.
