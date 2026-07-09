# Soap Calc — Multi-Process Build Roadmap

> **One calculator, three processes.** The plan to grow Soap Calc from a cold-process bar tool
> into one calculator spanning **cold process (CP)**, **hot process (HP)**, and **liquid soap (LS)**,
> grounded in deep per-process research with every number fact-checked, framed around a single
> organizing idea: a **process selector** on a shared lye engine.

- **3** processes unified on one engine — CP · HP · LS
- **88** numeric claims fact-checked across the three processes
- **0** fabrications shipped (1 caught in review, excluded)
- **4** build phases, foundation first

Interactive version (private artifact): <https://claude.ai/code/artifact/4f2d7614-4015-4c49-b679-9409d570054e>

---

## The organizing idea — a process selector

All three processes share the existing lye engine — it already does NaOH, KOH, and dual lye with a
90% KOH purity factor. What differs per process is the *defaults and the finishing step*. A single
process selector sets them; everything downstream keys off it.

| Process | Lye | Heat | Superfat | Water | Finish |
|---|---|---|---|---|---|
| **Cold-process bar** | NaOH | none | ~5% in-lye | 33–38% | cure 4–6 wk |
| **Hot-process bar** (LTHP · HTHP · fluid HP) | NaOH | 120–215 °F | cook 2–3% + PCSF 5–8% | 28–40% | usable at unmold; cure 3–8 wk |
| **Liquid soap** (CPLS · low/high-temp · 30-min) | KOH / dual | none–215 °F | 1–3% | cook 25–60%, then dilute | dilute + preserve; sequester 1–4 wk |

**Legend** — status: `Shared` (serves all three) · `New` (new capability) · `Refine` (adjust existing).
Process tags: `CP` · `HP` · `LS`. Nothing here is built yet; the lye engine's NaOH/KOH/dual + 90% KOH
purity already exist and are reused throughout.

---

## Build roadmap

Phases are a build order, not a wish list. Phase 0 is shared plumbing that unlocks HP and LS at once;
later phases layer per-process capability on top.

### Phase 0 — Shared foundation

Build once; CP, HP, and LS all depend on these. Highest leverage.

- **Process selector** · `Shared` · CP HP LS — Pick CP-bar · HP (LTHP/HTHP/fluid) · LS (CPLS/low/high/30-min). Sets lye type, superfat default, water mode/band, temperatures, cure/sequester.
- **After-cook / after-dilution additive stage** · `Shared` · HP LS — A 5th stage beyond `lye/oils/trace/top`. HP adds PCSF oil, heat-sensitive fragrance, milk, colorants after the cook; LS adds fragrance, dyes, turkey-red castor, preservative after dilution.
- **Two-part superfat** · `Shared` · HP LS — Split into **cook SF** (in-lye, reduces lye) + **post-cook SF** (added after, no lye effect). HP PCSF 5–8% · LS turkey-red 1–5% · total = cook + post-cook. Lets the user choose the exact superfat oil.
- **Additive basis + units** · `Shared` · LS HP — Dose additives as % of oil *or* % of finished batch/solution (LS preservatives, pearlizer, shea are solution-based). Add a `ppt` unit for micro-doses (eugenol 1–3 ppt).
- **Process-aware defaults engine** · `Shared` · CP HP LS — One place mapping process → default superfat, water band, temperature targets, cure/sequester. Every guardrail and hint reads from it.

### Phase 1 — Per-process core

- **Dilution calculator** · `New` · LS — The #1 LS feature. `anhydrous = oils + lye` · `solution = anhydrous ÷ soap%` · `water = solution × water%` · `dilution water = total water − cook water`. Glycerin 0.55 g/g KOH, 0.77 g/g NaOH.
- **Post-cook superfat (PCSF) module** · `New` · HP — The #1 HP feature. Cook SF 2–3% in the calc; `PCSF weight = PCSF% × total oil`, added after cook, no lye. Append vs subtract method. High-PUFA PCSF → DOS; prefer coconut/olive/almond/cocoa/shea + antioxidant.
- **LS superfat guardrail + lye-excess neutralization** · `New` · LS — 1–3% superfat; >3% clouds/separates. Support lye-excess, then neutralize (citric acid 1:4 with hot water) to pH 9–10.5. Never acidify to lower a neutral soap's pH.
- **Trace-speed indicator** · `New` · CP — Aggregate saturated %, ricinoleic/castor, sugar additives (accelerate) vs unsaturated (slow) into one fast↔slow readout with a tip.
- **Property-score exceptions layer** · `New` · CP HP — Soften false alarms: castile reads ~0 cleansing yet cures fine; high-coconut + high-superfat isn't drying. "All soap cleans."
- **Process-aware cure estimate + water-loss** · `New` · CP HP — CP 4–6 wk min; at ≤30% water HTHP 3–4 vs CP 6–8; fluid HP 38% ~6 wk; HP usable at unmold. Water loss over cure: CP ~15%, LTHP ~9%, HTHP ~6% → cured/label weight.
- **Two-tier water coaching + soap-concentration targets** · `Refine` · CP HP LS — CP/HP: low 20–28% / high 32–40%, >38–40% rivers. LS targets: coconut ≤40% soap, castile ~25%, blends 25–35%.
- **Superfat + PUFA bands** · `Refine` · CP — 5% common, 3–30% usable; PUFA cap 15–20% → superfat 3–5% when high.

### Phase 2 — Additives, guardrails & quality

- **Fluid-HP additive set** · `New` · HP — stearic/lauric 5–8% (as oils) · sodium lactate 3–4% · salt 0.05–1% · yogurt 2–5% · sugar 1–5% · eugenol 1–3 ppt. Salt/SL suppress the thick middle phase. Yogurt >5% deducts from water.
- **Thickeners (LS-only) + salt curve** · `New` · LS — salt (non-monotonic curve — thickens then thins; won't thicken coconut-heavy) · guar 0.5–1% · HEC 0.5–1%. Needs a non-linear model, not % of oil.
- **Preservative advisory (LS)** · `New` · LS — Diluted LS needs a broad-spectrum, high-pH-stable preservative (water activity ~0.98 vs bar ~0.66–0.76). **Percentages are supplier-sourced only** — none in the references.
- **LS quality remap + dual-lye recommender** · `New` · LS — Cleansing = solubility (not harshness); castor gives no lather in LS. Suggest NaOH share from the fatty-acid profile (≤15% P+S → 0–20%; >75% coconut → ~30%).
- **CP additive corrections + new additives** · `Refine` · CP — Sugar 0.5–2% (not 1–5%); split sorbitol; clay floor 0.1%; magnesium-salt caution. Add sodium lactate, silk, EDTA, titanium dioxide, eugenol, loofah.
- **Additive hazard tags + sugar aggregator** · `New` · CP HP LS — Eugenol → seize; sugar/wax → tunnels/volcano; excess salt → crumble; TiO₂ + high water → rivers. Sum all sugar sources against one ceiling.

### Phase 3 — Guidance & polish

- **Troubleshooting panels (per process)** · `New` · CP HP LS — CP: soda ash, gel, volcano, DOS. HP: won't-gel → switch to LTHP, crumbly (over-mix), lye-heavy (pH >11 — stated outright in HP). LS: cloud-on-cooling, snot/jello, anhydrous top layer.
- **Temperature model + cook stages** · `New` · CP HP LS — CP soaping temp; HP LTHP 120–160 °F, HTHP 215 °F, ceiling 240 °F; cook stages trace→applesauce→expansion→mashed→gel/neat; don't mix past neat / >5 min.
- **Yield outputs** · `Refine` · CP HP LS — Mold sizer + cured weight (CP/HP; add cylinder πr²h); finished volume + "bottles filled" (LS). HTHP vessel-size guard ≥2× (≥3× coconut-heavy).
- **CP extras** · `New` · CP — PPO/tsp→%TOW converter (4.1 g/tsp, 453.592 g/lb); vanillin field → browning prediction; antioxidants (Vit E, ROE, 1% BHT + 1% sodium citrate); myth-busters.

---

## Do not ship

Verified present in the source, but the numbers are not usable:

- **CP** — Calculated "soap pH" and eutectic Krafft temperatures: the references' own simplified models, not sound chemistry. (The lauric+oleic synergy hint already ships, qualitatively.)
- **LS · HP** — Preservative percentages: the references give none; must come from the supplier. Ship "verify with supplier" placeholders only.
- **LS** — Per-product concentration ranges (dish/baby/hand): use the point examples, not broadened ranges.
- **HP** — The "0.25–0.50 oz colorant water" figure: fabricated by extraction, caught in review, excluded. The real rule: small dispersion water isn't counted unless large.

---

## Verified constants (single source of truth)

Every figure the roadmap relies on, grouped by scope, with its fact-check verdict. Use this table —
not the prose — when writing code. `Src` cites the process + page where each was confirmed.

### Shared engine

| Constant | Value | Verdict | Src |
|---|---|---|---|
| KOH purity | 90% default (already in app) | Confirmed | LS 258 |
| KOH ↔ NaOH weight | × 1.40 (56.1 / 40) | Confirmed | LS 177 |
| Dual-lye ratios | LS 80/20 KOH/NaOH · bar 95/5 NaOH/KOH · shave 50/50 | Confirmed | LS 86 |
| Quality ranges (all 3) | H 30–60 · Cl 8–20 · Co 44–69 · Bu 14–46 · Cr 16–48 | Confirmed | CP 404 · HP 133 |
| Anti-DOS combo | 1% BHT + 1% sodium citrate | Confirmed | CP 163 |

### Cold process

| Constant | Value | Verdict | Src |
|---|---|---|---|
| Water tiers | low 20–28% · high 32–40% · >38% rivers | Confirmed | CP 238 |
| Superfat / PUFA | 5% common, 3–30%; PUFA cap 15–20% → SF 3–5% | Confirmed | CP 161/191 |
| Sugar / conversions | 0.5–2% (max 4%) · 4.1 g/tsp · 453.592 g/lb | Confirmed | CP 308 |
| Mold / cure | density 0.92 · cylinder πr²h · cure 4 wk min | Confirmed | CP 433/560 |

### Hot process

| Constant | Value | Verdict | Src |
|---|---|---|---|
| Post-cook superfat | cook 2–3% (in calc) + PCSF 5–8% (not in calc) | Confirmed | HP 171 |
| Process temps | LTHP 120–160 °F · HTHP 215 °F/102 °C · ceiling 240 °F | Confirmed | HP 326 |
| HTHP suitability | 40–60% saturated · hardness 40–60 | Confirmed | HP 332 |
| Cure + water-loss | HTHP 3–4 · CP 6–8 wk (same recipe, ≤30% water) · fluid HP 38% ~6 wk; loss 15/9/6% | Confirmed | HP 449 |
| Water split | 28% in lye + 10% after cook = 38% | Confirmed | HP 335 |
| Fluid additives | stearic 5–8% · SL 3–4% · yogurt 2–5% · eugenol 1–3 ppt | Confirmed | HP 346 |
| Relaxed caps | castor 10–15% · shea 30–40% | Confirmed | HP 252 |

### Liquid soap

| Constant | Value | Verdict | Src |
|---|---|---|---|
| Dilution | anhydrous = oils + lye; solution = anhydrous ÷ soap% | Confirmed | LS 252 |
| Glycerin factors | 0.55 g/g KOH · 0.77 g/g NaOH | Confirmed | LS 250 |
| Soap concentration | coconut ≤40% · castile ~25% · blends 25–35% | Partial (point examples) | LS 234 |
| LS superfat / pH | 1–3% · finished pH 9–10.5 · neutralize citric 1:4 | Confirmed | LS 186 |
| Cook water range | 25–60% / 1:1–5:1 · default 38% | Confirmed | LS 224 |
| Thickeners | salt curve · guar 0.5–1% · HEC 0.5–1% | Confirmed | LS 447 |
| Water activity | bar ~0.66–0.76 (safe) · diluted LS ~0.98 (needs preserve) | Confirmed | LS 465 |

---

## Provenance & anonymity

**Provenance.** Compiled via five-angle parallel study of each process, then adversarial verification
of every numeric claim — 88 claim-checks total (CP 33 · LS 33 · HP 22). One fabricated figure was
caught in review and excluded; nothing unverified reaches this roadmap. Per-oil composition tables
were confirmed to duplicate the existing oils database — no oil-data work is proposed.

**Anonymity.** Numbers, ratios, and generic technique only — no title, author, publisher, purchaser,
recipe names, or paraphrased prose. In the product, cite behavior (e.g. "liquid-soap superfat above
typical range"), never a source. This supersedes the standalone cold-process spec, which remains
valid for CP detail.
