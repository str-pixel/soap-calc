import {
  CITRIC_ACID_MOLAR_MASS,
  KOH_MOLAR_MASS,
  NAOH_MOLAR_MASS,
} from './molar-masses.js';

export type AdditiveStage = 'lye' | 'oils' | 'trace' | 'top' | 'after_cook';

/** Structurally identical to web's ProcessId ('cp' | 'hp' | 'ls'), defined locally so core
 * owns no import from packages/web. Web's ProcessId is assignable to this type. */
export type AdditiveProcess = 'cp' | 'hp' | 'ls';

/** Per-process correction to an entry's typical range and/or default stage. Base fields
 * hold the CP-audited values; an override carries only what differs for that process. */
export type AdditiveProcessOverride = {
  typicalLow?: number;
  typicalHigh?: number;
  defaultStage?: AdditiveStage;
  /** Overrides the entry's dose basis for this process (e.g. LS doses fragrance and
   * pearlizer as % of the finished solution). REPLACES the base value. */
  doseBasis?: DoseBasis;
  /** Replaces (not appends to) the base hazards for this process — e.g. salt's
   * "crumbly bar" tag is meaningless in LS, where the risk is the salt curve. */
  hazards?: string[];
};

export type AdditiveCatalogEntry = {
  id: string;
  name: string;
  typicalLow: number;
  typicalHigh: number;
  defaultStage: AdditiveStage;
  /** Processes this additive is offered for; absent = all processes. */
  processes?: AdditiveProcess[];
  /** Per-process corrections (see AdditiveProcessOverride). Resolve with
   * effectiveCatalogEntry — never read typicalLow/High/defaultStage directly when a
   * process is in hand. */
  processOverrides?: Partial<Record<AdditiveProcess, AdditiveProcessOverride>>;
  /** Short behavior-only hazard/caution tags shown next to the additive (e.g. "can seize").
   * No source or dose-specific claim — just the known failure mode. */
  hazards?: string[];
  /** Unit for typicalLow/typicalHigh (default 'percent'). Entries whose guidance is
   * parts-per-thousand MUST say so, or the UI renders a ppt range with a % sign —
   * a 10× dose overstatement. */
  doseUnit?: DoseUnit;
  /** Default dose basis a catalog pick seeds (absent = 'oil'). 'solution' is LS-only by
   * data invariant — the finished solution exists only for LS. */
  doseBasis?: DoseBasis;
  /** Acid additives: grams of PURE alkali consumed per gram of additive — identical in
   * meaning to AlternativeLiquidPreset.lyeNeutralization. The calc compensates
   * automatically (extraLyeForAcid, applied per line by the web dose resolver) so the
   * stated superfat survives. CP/HP only — LS deliberately never compensates. */
  lyeNeutralization?: { naohPerGram: number; kohPerGram: number };
};

/** Citric acid (anhydrous) — triprotic; moles of acid per gram. Shares molar-masses.ts
 * with neutralization.ts (the LS after-cook path), so the two can no longer drift. */
const CITRIC_MOL_PER_GRAM = 1 / CITRIC_ACID_MOLAR_MASS;

export const ADDITIVE_CATALOG: readonly AdditiveCatalogEntry[] = [
  {
    // Table sugar and other sugar sources (honey, molasses, milks). Sorbitol is its own
    // entry below — it carries a higher typical range. (id stays 'sugar-sorbitol' so
    // recipes saved before the split still resolve.)
    id: 'sugar-sorbitol',
    name: 'Sugar',
    typicalLow: 0.5,
    typicalHigh: 2,
    defaultStage: 'trace',
    hazards: ['can tunnel/overheat'],
    processOverrides: {
      // An HP cook tolerates (and typically uses) more sugar than a CP mold; stage unchanged.
      hp: { typicalLow: 1, typicalHigh: 5 },
      // LS doses sugar like HP but prefers the oils over the lye water (less browning).
      ls: { typicalLow: 1, typicalHigh: 5, defaultStage: 'oils' },
    },
  },
  {
    // Glycerin — LS solvent and saponification/dilution accelerant, dosed into the lye
    // solution as % of oils (source envelope 1–25%; 20–25% is the typical high-temp
    // no-paste dose). The other mode — swapping 1–2 parts of the lye-solution water for
    // glycerin — is the 'glycerin' split-liquid preset, not this entry. Excluded from the
    // high_total_additives sum (a 20%+ solvent dose is deliberate, not an extras load).
    // Solvent effect: expect less dilution water — glycerin_solvent_dilution advises; no
    // numeric model exists.
    //
    // LS-ONLY IS DELIBERATE (researched 2026-07-27; pinned by test). Bar soap already
    // makes its own glycerin — 0.77 g per g NaOH, ~7–12% of the finished bar — and adding
    // more gives a soft, sticky bar that dissolves faster in use. Neither the CP nor the HP
    // source doses it: CP never treats it as an additive at all, and HP names it once as a
    // "soap solvent" but doses only sugar, then elsewhere recommends AGAINST glycerin for
    // hot process. The substantial added-glycerin percentages found in the wild (~15–20%,
    // or Failor's 50–60% soap : 40–50% solvent) belong to TRANSPARENT / melt-and-pour soap
    // — a process this app does not model (no alcohol, no sucrose solution). Adding a
    // CP/HP entry would advertise an LS dose for a different craft.
    id: 'glycerin',
    name: 'Glycerin',
    typicalLow: 20,
    typicalHigh: 25,
    defaultStage: 'lye',
    processes: ['ls'],
  },
  {
    // Sorbitol — sugar alcohol with a stronger lather effect than sucrose; same overheat
    // behavior as other sugars. The CP usage-rates passage is explicit that sorbitol takes
    // "the same suggested usage rates as sugar" (author-tested at 4% CP — the family
    // ceiling, not the typical range), so this entry mirrors the sugar entry per process.
    // A general-chapter 1–5% figure was previously mistaken for the CP range — it belongs
    // to HP/LS, whose sources both give 1–5.
    id: 'sorbitol',
    name: 'Sorbitol',
    typicalLow: 0.5,
    typicalHigh: 2,
    defaultStage: 'trace',
    hazards: ['can tunnel/overheat'],
    processOverrides: {
      hp: { typicalLow: 1, typicalHigh: 5 },
      ls: { typicalLow: 1, typicalHigh: 5 },
    },
  },
  {
    id: 'chelator',
    name: 'Chelator (citrate, gluconate)',
    typicalLow: 1,
    typicalHigh: 1,
    defaultStage: 'lye',
  },
  {
    // Acid form of the citrate chelator: dissolved in the lye water it reacts with the
    // alkali to form citrate in situ. Consumes lye — compensated automatically for any
    // stage EXCEPT after_cook (see calculateAdditives): post-cook acid neutralizes
    // existing soap/lye and must never be compensated. That stage rule is what keeps the
    // LS lye-excess neutralization workflow (an after-cook citric dose) uncompensated
    // while allowing the LS in-lye chelator route. Does not lower finished-soap pH; copy
    // must never imply it does.
    id: 'citric-acid',
    name: 'Citric acid (anhydrous)',
    typicalLow: 1,
    typicalHigh: 2,
    defaultStage: 'lye',
    processOverrides: {
      // LS chelator route: citric into the lye solution makes potassium citrate in situ,
      // at a wider dose than the CP/HP water-conditioning dose.
      ls: { typicalLow: 1, typicalHigh: 3 },
    },
    lyeNeutralization: {
      naohPerGram: 3 * CITRIC_MOL_PER_GRAM * NAOH_MOLAR_MASS,
      kohPerGram: 3 * CITRIC_MOL_PER_GRAM * KOH_MOLAR_MASS,
    },
  },
  {
    id: 'cetyl-alcohol',
    name: 'Cetyl alcohol',
    typicalLow: 1,
    typicalHigh: 3,
    defaultStage: 'trace',
  },
  {
    id: 'charcoal',
    name: 'Charcoal',
    typicalLow: 0.1,
    typicalHigh: 2,
    defaultStage: 'oils',
  },
  {
    id: 'oatmeal',
    name: 'Oatmeal',
    typicalLow: 0.1,
    typicalHigh: 4,
    defaultStage: 'trace',
  },
  {
    // Honey is a sugar source — same overheat/tunnel behavior as table sugar.
    id: 'honey',
    name: 'Honey',
    typicalLow: 1,
    typicalHigh: 1,
    defaultStage: 'trace',
    hazards: ['can tunnel/overheat'],
  },
  {
    id: 'fragrance',
    name: 'Fragrance / essential oil',
    typicalLow: 2,
    typicalHigh: 6,
    defaultStage: 'trace',
    processOverrides: {
      // LS doses fragrance as a concentration in the finished solution, 3% max — well
      // below bar-soap oil-weight percentages.
      ls: { typicalLow: 0.5, typicalHigh: 3, doseBasis: 'solution' },
    },
  },
  {
    // Jojoba is deliberately NOT in this catalog: it belongs in the saponified oil blend
    // (it is in the oils database, and the jojoba_superfat_note insight still covers it),
    // not dosed outside the lye math. Legacy saved lines with catalogId 'jojoba' load as
    // custom rows (normalizeAdditiveLine clears unknown catalog ids).
    id: 'clay',
    name: 'Clay (bentonite, kaolin)',
    typicalLow: 0.1,
    typicalHigh: 2,
    defaultStage: 'oils',
  },
  {
    // Table salt (NaCl) as a hardener, dissolved in the lye water. Kept low: past ~1%
    // of oil weight it starts to thicken/seize the batch rather than just harden it.
    // (id stays 'salt' so recipes saved before the rename/split still resolve.)
    //
    // ONE entry covers every usable salt on purpose: sea, pink Himalayan and black lava
    // salt are all sodium chloride with trace minerals, so they need no separate entry
    // and no different math — no salt consumes alkali or carries a SAP value, unlike an
    // ACID that becomes a salt in the lye (citric → citrate; see lyeNeutralization).
    // Magnesium-bearing salts are the exception and are deliberately absent: they wreck
    // soap rather than harden it (magnesium_salt_scum insight warns on them by name).
    id: 'salt',
    name: 'Table salt (NaCl)',
    typicalLow: 0.05,
    typicalHigh: 1,
    defaultStage: 'lye',
    hazards: ['can make the bar crumbly'],
    processOverrides: {
      // The LS start-of-cook dose (3–8% of oils ≈ 0.5–3% of the final solution at ~35%
      // concentration) suppresses the paste phase; past the salt curve more salt THINS.
      // The bar-crumble tag is meaningless in LS, so the hazard is replaced per-process.
      ls: {
        typicalLow: 3,
        typicalHigh: 8,
        hazards: ['past the salt curve more salt thins, not thickens'],
      },
    },
  },
  {
    // Sodium lactate — humectant + hardener, water-soluble, added to the lye water.
    // Higher dose range than table salt; it hardens the bar without the seize risk.
    id: 'sodium-lactate',
    name: 'Sodium lactate',
    typicalLow: 0.5,
    typicalHigh: 2,
    defaultStage: 'lye',
    processOverrides: {
      // HP doses it harder and later: into the batter after a very thick trace (before the
      // expansion phase), where it keeps the cook fluid and hardens the finished bar.
      hp: { typicalLow: 3, typicalHigh: 4, defaultStage: 'trace' },
      // LS runs it harder still, typically into the oils before the lye goes in; the
      // source envelope is 1–10% of oils (liquid form, ~60–70% solution).
      ls: { typicalLow: 3, typicalHigh: 5, defaultStage: 'oils' },
    },
  },
  {
    // Hydrolyzed silk — dissolved into the lye water, reported to add slip/sheen to lather.
    id: 'silk',
    name: 'Silk (hydrolyzed)',
    typicalLow: 0.25,
    typicalHigh: 1,
    defaultStage: 'lye',
  },
  {
    // EDTA — synthetic chelator, added to the lye water alongside/instead of citrate.
    id: 'edta',
    name: 'EDTA',
    typicalLow: 0.1,
    typicalHigh: 0.5,
    defaultStage: 'lye',
  },
  {
    // Titanium dioxide — mineral whitener, dispersed into the oils before mixing.
    id: 'titanium-dioxide',
    name: 'Titanium dioxide',
    typicalLow: 0.1,
    typicalHigh: 1,
    defaultStage: 'oils',
    hazards: ['can glycerin-river at high water'],
  },
  {
    // Eugenol — clove-derived aromatic used as a trace accelerant; dosed in parts-per-thousand,
    // well below fragrance-oil percentages. Added to the heated oils so it reacts with the lye
    // from the start (as an accelerant it does nothing added at trace).
    id: 'eugenol',
    name: 'Eugenol',
    typicalLow: 1,
    typicalHigh: 3,
    doseUnit: 'ppt',
    defaultStage: 'oils',
    hazards: ['can seize'],
  },
  {
    // Loofah — fibrous exfoliant, ground and blended into the oils.
    id: 'loofah',
    name: 'Loofah',
    typicalLow: 0.1,
    typicalHigh: 0.3,
    defaultStage: 'oils',
  },
  {
    // Free fatty acids (stearic, lauric, myristic) are deliberately NOT in this catalog:
    // they saponify, so dosing them outside the lye math builds hidden superfat (5-8% of
    // oils is a typical fluid-HP stearic dose — that much unsaponified acid undercuts the
    // hardening it was added for). They live in the oils database (stearic-acid,
    // lauric-acid, myristic-acid) with SAP values. Legacy saved lines with catalogId
    // 'stearic'/'lauric' load as custom rows (normalizeAdditiveLine clears unknown ids —
    // same path as the removed 'jojoba' entry).
    //
    // Finished soap — the lye-neutral HP/LS trace accelerant / emulsion stabilizer:
    // grated bar or liquid soap melted into the hot oils. Already saponified, so unlike
    // the free fatty acids it genuinely takes no lye. LS uses it identically (into the
    // hot oils); the LS source doses it in absolute ounces — the % range carries over
    // from the HP use of the same technique.
    id: 'finished-soap',
    name: 'Finished soap (grated or liquid)',
    typicalLow: 0.05,
    typicalHigh: 1,
    defaultStage: 'oils',
    processes: ['hp', 'ls'],
  },
  {
    // Yogurt — stirred in after cook/dilution in fluid HP; its water content deducts from
    // the recipe's lye water, so it is dosed after the cook rather than into the oils/lye.
    id: 'yogurt',
    name: 'Yogurt',
    typicalLow: 2,
    typicalHigh: 5,
    defaultStage: 'after_cook',
    processes: ['hp'],
  },
  {
    // Guar gum — LS-only thickener, dispersed into diluted liquid soap after cook/dilution
    // (never into the concentrated paste). Salt thickens LS only up to a point and thins
    // past it (see the ls_salt_thickening insight); guar/HEC are the standalone thickeners.
    id: 'guar',
    name: 'Guar gum',
    typicalLow: 0.5,
    typicalHigh: 1,
    defaultStage: 'after_cook',
    processes: ['ls'],
  },
  {
    // Hydroxyethylcellulose (HEC) — LS-only thickener, same after-dilution dosing as guar.
    id: 'hec',
    name: 'Hydroxyethylcellulose (HEC)',
    typicalLow: 0.5,
    typicalHigh: 1,
    defaultStage: 'after_cook',
    processes: ['ls'],
  },
  {
    // Pearlizer (glycol stearate/distearate) — melted flakes, dosed as % of the finished
    // solution; some products go in at trace, most after cook/dilution.
    id: 'pearlizer',
    name: 'Pearlizer (glycol stearate)',
    typicalLow: 2,
    typicalHigh: 10,
    defaultStage: 'after_cook',
    doseBasis: 'solution',
    processes: ['ls'],
  },
  {
    // Water-dispersible shea — self-emulsifying emollient/opacifier, % of the finished
    // solution, after dilution.
    id: 'wd-shea',
    name: 'Water-dispersible shea',
    typicalLow: 1,
    typicalHigh: 25,
    defaultStage: 'after_cook',
    doseBasis: 'solution',
    processes: ['ls'],
  },
] as const;

/** Entries offered for a given process: unscoped entries (no `processes`) apply to all
 * processes; scoped entries apply only when `process` is in their `processes` list. */
/** Whether this additive is offered under `process`. The SINGLE source of truth for
 * offered-ness — the picker, the dose computation and the stray-line notice all read it.
 * When only the picker knew, a line for a withheld additive kept resolving grams and adding
 * batch weight under a process that does not offer it. Mirrors
 * isAlternativeLiquidOfferedFor. */
export function isAdditiveOfferedFor(
  entry: AdditiveCatalogEntry,
  process: AdditiveProcess,
): boolean {
  return !entry.processes || entry.processes.includes(process);
}

export function catalogEntriesForProcess(
  process: AdditiveProcess,
): readonly AdditiveCatalogEntry[] {
  return ADDITIVE_CATALOG.filter((entry) => isAdditiveOfferedFor(entry, process));
}

export const LATHER_SUPPORT_PACK = [
  { catalogId: 'sugar-sorbitol', percentOfOil: 1, stage: 'trace' as const },
  { catalogId: 'chelator', percentOfOil: 1, stage: 'lye' as const },
  { catalogId: 'cetyl-alcohol', percentOfOil: 1, stage: 'trace' as const },
] as const;

export function catalogEntryById(id: string): AdditiveCatalogEntry | undefined {
  return ADDITIVE_CATALOG.find((entry) => entry.id === id);
}

/** The entry as it applies under `process`: override fields win, base fields fill the
 * rest. Returns the entry object unchanged when the process has no override. */
export function effectiveCatalogEntry(
  entry: AdditiveCatalogEntry,
  process: AdditiveProcess,
): AdditiveCatalogEntry {
  const override = entry.processOverrides?.[process];
  return override ? { ...entry, ...override } : entry;
}

/** Grams from % of total oil weight. Returns null when percent is invalid.
 * Thin alias over gramsFromDose (percent unit) — single source of truth for the math.
 * Kept as a readable name for split-liquid / post-cook-superfat, which are always % of oil. */
export function gramsFromPercentOfOil(
  totalOilGrams: number,
  percentOfOil: number,
): number | null {
  return gramsFromDose(totalOilGrams, percentOfOil, 'percent');
}

/** Parse a %-of-oil string (0–100). Thin alias over parseDoseAmount (percent unit). */
export function parsePercentOfOil(value: string): number | null {
  return parseDoseAmount(value, 'percent');
}

export type DoseUnit = 'percent' | 'ppt';
export type DoseBasis = 'oil' | 'batch' | 'solution';

/** Validate a dose amount for its unit. Percent caps at 100, ppt at 1000 (both = 100% of basis).
 * Returns the numeric amount, or null when empty/negative/non-finite/over the ceiling. */
export function parseDoseAmount(value: string, unit: DoseUnit): number | null {
  if (value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  const ceiling = unit === 'ppt' ? 1000 : 100;
  if (n > ceiling) return null;
  return n;
}

/** Grams from a dose amount against a basis weight. percent = amount/100, ppt = amount/1000. */
export function gramsFromDose(
  basisWeightGrams: number,
  amount: number,
  unit: DoseUnit,
): number | null {
  if (!Number.isFinite(basisWeightGrams) || basisWeightGrams < 0) return null;
  if (!Number.isFinite(amount) || amount < 0) return null;
  const divisor = unit === 'ppt' ? 1000 : 100;
  return (basisWeightGrams * amount) / divisor;
}

export const ADDITIVE_STAGE_LABELS: Record<AdditiveStage, string> = {
  lye: 'In lye water',
  oils: 'With oils',
  trace: 'At trace',
  top: 'On top',
  after_cook: 'After cook',
};

export const MAX_RECIPE_ADDITIVES = 50;
export const MAX_ADDITIVE_NAME_LENGTH = 120;
