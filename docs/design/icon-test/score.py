"""Score the blind icon test: guesses (roundN/<set>-<size>.json) × keys (keys/rN-<set>-<size>.json) × answers.json
(written before the test). Substring matching, then the hand overrides below (each with its reason). Writes results.md."""
import json
from pathlib import Path

D = Path(__file__).parent
A = json.loads((D / "answers.json").read_text())
LABEL = {k: v["label"] for k, v in json.loads((D / "../../../apps/web/src/icons/icons.json").read_text()).items()}
RUNS = [(1, "old", 16), (1, "old", 24), (1, "new", 16), (1, "new", 24), (2, "new", 16), (2, "new", 24), (3, "new", 16), (3, "new", 24), (4, "new", 16), (4, "new", 24)]
# (round, set, size, icon) -> (verdict, reason)
OVERRIDE = {
    (1, "old", 24, "liman"): ("yanlış", "'catch report' — 'port' alt dizesi yanlış eşleşmişti"),
    (1, "old", 24, "mendirek"): ("yanlış", "'pier / jetty' — iskele ile karıştı"),
    (1, "new", 24, "mikro-jig"): ("kısmi", "'soft lure' — yem dendi ama metal jig değil"),
    (2, "new", 24, "dip-takimi"): ("doğru", "'bottom fishing (surfcasting)' — dip avı kavramı doğru"),
    (2, "new", 24, "mikro-jig"): ("kısmi", "'satellite or lure?' — kararsız"),
    (4, "new", 24, "kordon"): ("doğru", "'wall / concrete quay' — rıhtım/taş duvar kavramı doğru"),
    (4, "new", 24, "dere-agzi"): ("kısmi", "'curved shoreline / cove / channel' — su yolu görülmüş, dere ağzı değil"),
}
SYM = {"doğru": "✓", "kısmi": "~", "yanlış": "✗"}


def verdict(r, s, z, name, guess):
    if (r, s, z, name) in OVERRIDE:
        return OVERRIDE[(r, s, z, name)]
    g = guess.lower()
    if any(a.lower() in g for a in A[name]["accept"]):
        return "doğru", ""
    if any(a.lower() in g for a in A[name]["partial"]):
        return "kısmi", ""
    return "yanlış", ""


res = {}
for r, s, z in RUNS:
    key = json.loads((D / f"keys/r{r}-{s}-{z}.json").read_text())
    g = json.loads((D / f"round{r}/{s}-{z}.json").read_text())
    for num, name in key.items():
        res[(r, s, z, name)] = (*verdict(r, s, z, name, g[num]["guess"]), g[num]["guess"])

out = ["# Simge tanıma testi (etiketsiz, alt ajan)", "",
       "Yöntem:",
       "- Her set × boyut için ayrı, işi yapmamış taze bir alt ajan simgeleri numaralı ve karışık sırada gördü (gerçek boyut + 4× piksel büyütme). Etiket ve aday listesi verilmedi; yalnız \"Türkçe kıyı balıkçılığı uygulaması\" bağlamı verildi.",
       "- Doğru cevaplar ve kabul edilen eş anlamlılar testten **önce** `answers.json`'a yazıldı. Puanlama alt dize eşleşmesi + aşağıdaki gerekçeli elle düzeltmeler (`score.py`).",
       "- Sayfalar `sheets-r1/` (eski ve yeni), `sheets-r2/`, `sheets-r3/` (yeni); numara → simge anahtarları `keys/`; ham tahminler `round*/`.",
       "- ✓ doğru, ~ kısmi (yalnız aile, ör. 'olta iğnesi'), ✗ yanlış. Yeniden çizimler: R2'de 7, R3'te 8, R4'te 1 simge (dere ağzı) (`build-icons.py` yorumlarında gerekçe).", ""]
hdr = "| Simge | Eski 16 | Eski 24 | Yeni R1 16 | Yeni R1 24 | Yeni R2 16 | Yeni R2 24 | Yeni R3 16 | Yeni R3 24 | Yeni R4 16 | Yeni R4 24 |"
out += [hdr, "|" + "---|" * 11]
tot = {k: 0 for k in RUNS}
for name in A:
    if name.startswith("_"):
        continue
    cells = []
    for k in RUNS:
        v, why, g = res[(*k, name)]
        tot[k] += v == "doğru"
        cells.append(f"{SYM[v]} {g[:38]}")
    out.append(f"| {LABEL[name]} | " + " | ".join(cells) + " |")
out.append("| **Doğru (32'de)** | " + " | ".join(f"**{tot[k]}**" for k in RUNS) + " |")
out += ["", "Elle düzeltmeler:"] + [f"- R{r} {s} {z} px, {LABEL[n]}: {v} — {why}" for (r, s, z, n), (v, why) in OVERRIDE.items()]
final_bad = [n for n in A if not n.startswith("_") and any(res[(4, "new", z, n)][0] != "doğru" for z in (16, 24))]
out += ["", "## Sonuç",
        f"- Eski set: 16 px'te {tot[(1, 'old', 16)]}/32, 24 px'te {tot[(1, 'old', 24)]}/32 doğru. Yeni set R3: 16 px'te {tot[(3, 'new', 16)]}/32, 24 px'te {tot[(3, 'new', 24)]}/32; son hal (R4): 16 px'te {tot[(4, 'new', 16)]}/32, 24 px'te {tot[(4, 'new', 24)]}/32.",
        "- R3→R4 arasında yalnız dere ağzı değişti; mendirek aynı çizimle R3'te doğru, R4'te kısmi ('dalgalı kayalar') okundu. Bu, tek katılımcılı testin değişkenliğidir; sonuçlar kesin oran değil, yön göstergesidir.",
        "- Dört turdan sonra hâlâ tam tanınmayanlar: " + ", ".join(LABEL[n] for n in final_bad) + ".",
        "- Mendirek ve dere ağzı yapı tipi, diğerleri takım/yöntem bağlama simgeleri. Hepsi arayüzde **yalnız metin etiketiyle birlikte** kullanılacaklar, tek başına (etiketsiz) kullanılmayacaklar. Bağlama yöntemlerinin asıl anlatımı V2'deki takım sahnesinin büyük bağlama çizimleriyle yapılacak. Mendirek ve dere ağzı haritada ve listede her zaman adıyla birlikte görünür.",
        "- LRF simgesi 'olta iğnesi' diye okunuyor (kurşun başlık seçilemiyor). Kabul edilebilir ama ayırt edici değil; aynı kural uygulanır."]
(D / "results.md").write_text("\n".join(out) + "\n")
print("\n".join(out[-6:]))
