# PRIVACY — kişisel ve saha verisi

Repo ve av.livn.tr herkese açık. Kural: **saha verisi ve av günlüğü yalnız ADMIN_TOKEN ile okunur**; public uçlar yalnız puan, sıra, bant ve genel mera bilgisini döndürür.

| Veri | Nerede | Public? |
|---|---|---|
| Mera geometrisi, OSM adı, tür, uzunluk, erişim tahmini, DTM profili, EUSeaMap sınıfı | `data/spots.geojson`, `spots` | evet (açık veri: OSM ODbL, EMODnet) |
| Puan, sıra, %10–90 bandı, bileşen değerleri (açık veri kaynaklı olanlar) | `spot_scores_v2` | evet |
| Saha girişleri: not, fotoğraf, ölçülen derinlik, batma süresi, dip/yapı gözlemi, ziyaret tarihi | `field_obs`, `field_depth`, `field_photo` | **hayır** — yalnız `/api/admin/*` |
| Lamba durumu (saha/admin), admin notları | `spots.has_light`, `spots.notes`, `lamp_admin` | **hayır** — public uçta yalnız `lamp_known` rozeti |
| Saha kaynaklı bileşenlerin değeri ve gerekçesi | `spot_scores_v2.detail_json` | **hayır** — public detayda `null` + "saha bilgisi (yalnız yönetici görür)" |
| Av günlüğü, CSV dışa aktarma | `catch_session`, `catch_item` | **hayır** — yalnız `/api/admin/*` |
| Saatlik dondurulmuş model çıktısı | `spot_scores_v2_history` | hayır (yalnız D1; günlük ve D6 paneli admin) |
| Push abonelikleri, ntfy konu adı | `push_subscription`, repo secret | **hayır** |

**Uygulama:**
- `workers/api/src/lib/spots.ts` `publicSpot` / `adminSpot`.
- `precompute_v2.ts` `packV2` (`PRIVATE_SOURCES`, `REDACTED`).
- `reasonText`: saha kaynaklı sürücüde "değer gizli".
- `routes/public.ts`: v1 public uçları kaldırıldı.

**Test:** `workers/api/test/api.test.ts` → "privacy: public endpoints never return field values". Gizli not, ölçülen derinlik, fotoğraf, lamba durumu ve ziyaret tarihi public list/detay gövdesinde aranır.

**Yedek:** `docs/BACKUP.md` (şifreli, yalnız Actions artifact).
