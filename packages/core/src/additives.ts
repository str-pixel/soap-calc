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
  /** Stages this additive may be dosed at IN THIS PROCESS, replacing the entry's own list.
   * The sanctioned moment is process-specific — fragrance goes in at trace in a bar and
   * after dilution in liquid soap — so an entry-level list could only ever be right for one
   * of them. Same rule as the entry-level field: set it where a stage would be WRONG, not
   * merely unusual. A saved line sitting outside the list still renders (the panel's
   * mismatched-select guard), so narrowing this never re-stages an existing recipe. */
  stages?: AdditiveStage[];
};

export type AdditiveCatalogEntry = {
  id: string;
  name: string;
  typicalLow: number;
  typicalHigh: number;
  defaultStage: AdditiveStage;
  /** Processes this additive is offered for; absent = all processes. */
  processes?: AdditiveProcess[];
  /** Stages this additive may be dosed at; absent = every stage the process offers. Set
   * it only where a stage would be WRONG rather than merely unusual — the panel drops
   * the others from the picker, so a restriction here is a claim that the additive does
   * not belong in the batch at that moment. A line already saved at a stage outside the
   * list still renders it (the panel's mismatched-select guard), so restricting an entry
   * never silently re-stages an existing recipe. */
  stages?: AdditiveStage[];
  /** Per-process corrections (see AdditiveProcessOverride). Resolve with
   * effectiveCatalogEntry — never read typicalLow/High/defaultStage directly when a
   * process is in hand. */
  processOverrides?: Partial<Record<AdditiveProcess, AdditiveProcessOverride>>;
  /** Short behavior-only hazard/caution tags shown next to the additive (e.g. "can seize").
   * No source or dose-specific claim — just the known failure mode. */
  hazards?: string[];
  /** One entry-specific paragraph shown under the row: what this additive does at the
   * stage it is dosed at, or where its OTHER route lives when the app splits one
   * ingredient across two controls. The app's own words — never reference prose. */
  note?: string;
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
    // LS sanctions the lye solution or the oils, before dilution (LS:1069).
    id: 'sugar-sorbitol',
    name: 'Sugar',
    typicalLow: 0.5,
    typicalHigh: 2,
    defaultStage: 'trace',
    hazards: ['can tunnel/overheat'],
    processOverrides: {
      // An HP cook tolerates (and typically uses) more sugar than a CP mold; stage unchanged.
      hp: { typicalLow: 1, typicalHigh: 5 },
      // LS gives every sugar FORM one rate — table sugar, honey, molasses, sorbitol — at
      // 1–6% of total oil weight, into the lye solution or the oils and before dilution
      // (LS:1069); sorbitol and honey below carry the identical range for that reason.
      // The stage is the sharper claim: the 30-HTLS chapter puts sugar directly in the
      // oils rather than the lye solution, since a hot lye solution is what browns it
      // (LS:2667) — and 3–5% is that chapter's own practice, a point inside this range
      // rather than a competing one. The 5% ceiling this carried matched neither
      // statement; it was HP's.
      ls: { typicalLow: 1, typicalHigh: 6, defaultStage: 'oils', stages: ['lye', 'oils'] },
    },
    note:
      'Dissolve it first; it can join either the lye water or the oils, so long as it goes in before dilution. Fresh lye and heat darken sugar, so the identical dose can finish anywhere from cream to caramel; liquid soap sends it to the oils for exactly that reason, since the lye solution is the hotter, harsher route.',
  },
  {
    // Glycerin, AFTER DILUTION ONLY. The source gives four timings — in the lye solution
    // as a % of oils, as 1–2 parts of the lye solution in place of water, into the oils,
    // and after the cook (LS:2597, LS:2602, LS:3023, LS:3028) — and the app splits them
    // across two controls by what each one does to the arithmetic:
    //
    //   Before/during the cook  → the 'glycerin' SPLIT-LIQUID preset. It is part of the
    //     lye solution: its mass joins the paste and comes off the dilution water, which
    //     is the accounting the source prescribes (LS:2693, LS:2697, LS:3280). Measured:
    //     200 g entered there takes the water to pour from 2506 g to 2306 g.
    //   After the cook → THIS entry. Nothing is left to saponify and there is no lye
    //     water for it to be part of, so its mass simply lands in the bottle and the
    //     water to pour is unchanged — which is what an additive line already does.
    //
    // One ingredient, two non-overlapping routes, split by when it goes in. Dosing it
    // here at the lye-phase 20–25% would have claimed a solvent load this stage cannot
    // deliver (LS:2597 is explicit that glycerin at the dilution step does not affect
    // saponification), so the range is the source's general envelope instead, 1–25%.
    //
    // NOT MODELLED: glycerin poured as part of the DILUTION LIQUID, where it would take
    // the place of some water rather than add to it. `note` says so rather than pretend.
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
    typicalLow: 1,
    typicalHigh: 25,
    defaultStage: 'after_cook',
    stages: ['after_cook'],
    processes: ['ls'],
    note: 'Here it works as emollient and humectant only — too late to speed the cook or the dilution. For the cook, add it with the liquids instead: swapping part of the lye water for it puts its weight in the paste and takes it off the dilution water. This line adds to the bottle rather than replacing water, so if you meant it as part of your dilution liquid, pour that much less.',
  },
  {
    // Sorbitol — sugar alcohol with a stronger lather effect than sucrose; same overheat
    // behavior as other sugars. The CP usage-rates passage is explicit that sorbitol takes
    // "the same suggested usage rates as sugar" (author-tested at 4% CP — the family
    // ceiling, not the typical range), so this entry mirrors the sugar entry per process.
    // A general-chapter 1–5% figure was previously mistaken for the CP range — it belongs
    // to HP/LS, whose sources both give 1–5.
    // LS sanctions the lye solution or the oils, before dilution (LS:1069).
    id: 'sorbitol',
    name: 'Sorbitol',
    typicalLow: 0.5,
    typicalHigh: 2,
    defaultStage: 'trace',
    hazards: ['can tunnel/overheat'],
    processOverrides: {
      hp: { typicalLow: 1, typicalHigh: 5 },
      // LS names sorbitol among the sugar forms it doses together — 1–6% of total oil
      // weight, into the lye solution or the oils, and before the dilution step
      // (LS:1069). Trace was the CP stage inherited; LS puts its sugars in early.
      ls: { typicalLow: 1, typicalHigh: 6, defaultStage: 'oils', stages: ['lye', 'oils'] },
    },
    note:
      'A sugar alcohol, dosed and timed like the other sugars: into the lye solution or the oils, before dilution. It dissolves readily.',
  },
  {
    // LS sanctions the lye solution, where the citrate forms (LS:3037).
    id: 'chelator',
    name: 'Chelator (citrate, gluconate)',
    typicalLow: 1,
    typicalHigh: 1,
    defaultStage: 'lye',
    processOverrides: {
      // LS gives the citrate route a range rather than CP's single point: 1–2% of total
      // oil weight into the lye solution (LS:3037). Other chelators are left to their
      // supplier's own rate there, which is why only this range moves.
      ls: { typicalLow: 1, typicalHigh: 2, stages: ['lye'] },
    },
    note:
      'Stirred into the lye solution. In hard water the dissolved metals are what turn soap into scum and speed rancidity; this binds them so they cannot. Citrate and gluconate are the common forms — if you are starting from citric acid, use that entry instead, since the alkali has to convert it first.',
  },
  {
    // Acid form of the citrate chelator: dissolved in the lye water it reacts with the
    // alkali to form citrate in situ. Consumes lye — compensated automatically for any
    // stage EXCEPT after_cook (see calculateAdditives): post-cook acid neutralizes
    // existing soap/lye and must never be compensated. That stage rule is what keeps the
    // LS lye-excess neutralization workflow (an after-cook citric dose) uncompensated
    // while allowing the LS in-lye chelator route. Does not lower finished-soap pH; copy
    // must never imply it does.
    // LS sanctions the lye solution for the chelator route (LS:3037), or after the cook, which is the lye-excess neutralization this app models separately.
    id: 'citric-acid',
    name: 'Citric acid (anhydrous)',
    typicalLow: 1,
    typicalHigh: 2,
    defaultStage: 'lye',
    processOverrides: {
      // LS chelator route: citric into the lye solution makes potassium citrate in situ,
      // at 1–2% of total oil weight (LS:3037). The 3% ceiling this carried, and the
      // "wider than CP/HP" claim with it, matched nothing in the source — the LS figure
      // is the same 1–2% the base holds, stated here so the LS voice is explicit rather
      // than inherited by accident.
      ls: { typicalLow: 1, typicalHigh: 2, stages: ['lye', 'after_cook'] },
    },
    lyeNeutralization: {
      naohPerGram: 3 * CITRIC_MOL_PER_GRAM * NAOH_MOLAR_MASS,
      kohPerGram: 3 * CITRIC_MOL_PER_GRAM * KOH_MOLAR_MASS,
    },
    note:
      'Goes into the lye solution, where the alkali turns it into citrate — the citrate is the chelator, not the acid. It consumes some of that alkali on the way and the calculator has already replaced it, so the superfat you asked for is the one you get. It will not bring a finished soap\'s pH down — nothing at this dose will.',
  },
  {
    // CP/HP ONLY. The LS text never names it — one of just two entries in this catalog
    // that the liquid-soap source is silent on (titanium dioxide is the other), verified
    // with a corrected search after an earlier one returned false zeros. Everything it
    // does name for liquid soap it frames as water-soluble or water-dispersible, because
    // that is what a clear, stable solution tolerates: the thickeners it gives are salt,
    // guar and HEC (LS:3101, LS_full_text p.449), and where an oil-side ingredient is
    // wanted it reaches for the water-dispersible form (turkey red, LS:1260; WD shea,
    // LS:3030). A fatty alcohol dosed at trace is neither, and its 1–3% at trace here is
    // pure CP inheritance — the class of default this audit exists to remove. Offering it
    // in LS was never a decision anyone made.
    id: 'cetyl-alcohol',
    name: 'Cetyl alcohol',
    typicalLow: 1,
    typicalHigh: 3,
    defaultStage: 'trace',
    processes: ['cp', 'hp'],
  },
  {
    // Oils stage per LS:2991 (see the clay entry below — one line covers both).
    // LS sanctions the oils, right at the start (LS:2991).
    id: 'charcoal',
    processOverrides: { ls: { stages: ['oils'] } },
    name: 'Charcoal',
    typicalLow: 0.1,
    typicalHigh: 2,
    defaultStage: 'oils',
    note:
      'Stir it through the oils right at the start, so it is thoroughly wetted before the cook. It never dissolves: in a thin soap it drifts to the bottom over time, and a thicker one holds it up longer. Its own opacity hides any settling that does happen.',
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
    // LS sanctions the lye solution or the oils, before dilution (LS:1069).
    id: 'honey',
    name: 'Honey',
    typicalLow: 1,
    typicalHigh: 1,
    defaultStage: 'trace',
    hazards: ['can tunnel/overheat'],
    processOverrides: {
      // LS doses every sugar form alike — table sugar, honey, molasses — at 1–6% of total
      // oil weight, into the lye solution or the oils, before dilution (LS:1069). This
      // entry had no LS voice at all and was serving CP's single-point 1%.
      ls: { typicalLow: 1, typicalHigh: 6, defaultStage: 'oils', stages: ['lye', 'oils'] },
    },
    note:
      'Honey is mostly sugar in water, so treat it as one of the sugars: in before any dilution. It browns in fresh lye and can push a batch hotter, so the oils are the gentler route.',
  },
  {
    // LS sanctions after the cook, into diluted soap (LS:2950, LS:3363).
    id: 'fragrance',
    name: 'Fragrance / essential oil',
    typicalLow: 2,
    typicalHigh: 6,
    defaultStage: 'trace',
    processOverrides: {
      // LS doses fragrance as a concentration in the finished solution, 3% max — well
      // below bar-soap oil-weight percentages. A solution basis presupposes a solution:
      // that mass does not exist until after dilution, so the stage must move to
      // after_cook alongside it — CP/HP's trace stage would price the dose against soap
      // that isn't there yet. All four LS procedures (CPLS, LTLS, HTLS, 30-minute HTLS)
      // place fragrance after the soap reaches its finished, diluted consistency, because
      // these oils separate and cloud the soap if added earlier (LS:2164, 2288, 2520, 2878;
      // clouding risk noted at LS:2953).
      ls: { typicalLow: 0.5, typicalHigh: 3, doseBasis: 'solution', defaultStage: 'after_cook', stages: ['after_cook'] },
    },
    note:
      'Dosed against the finished, diluted soap rather than the oil weight — a bottle of liquid soap is mostly water, so an oil-weight percentage would badly overshoot. It goes in once the cook is over, to soap already diluted and cooled. Liquid soap carries far less scent than a bar needs. Your supplier\'s skin-safe limit overrides this range.',
  },
  {
    // Jojoba is deliberately NOT in this catalog: it belongs in the saponified oil blend
    // (it is in the oils database, and the jojoba_superfat_note insight still covers it),
    // not dosed outside the lye math. Legacy saved lines with catalogId 'jojoba' load as
    // custom rows (normalizeAdditiveLine clears unknown catalog ids).
    // The oils stage is SOURCED, not inherited: LS asks for adsorptive/absorptive
    // additives — clays and charcoal alike — to go into the oils at the very start of the
    // process (LS:2991), which is what the base stage already does, so no LS override is
    // needed. Charcoal's entry above answers to the same line.
    // LS sanctions the oils, right at the start (LS:2991).
    id: 'clay',
    processOverrides: { ls: { stages: ['oils'] } },
    name: 'Clay (bentonite, kaolin)',
    typicalLow: 0.1,
    typicalHigh: 2,
    defaultStage: 'oils',
    note:
      'Into the oils right at the start, like charcoal — these powders adsorb rather than dissolve, and wetting them early is what keeps them evenly spread. A thicker soap suspends them longer; in a thin one they settle out with time.',
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
    // LS sanctions the lye water or the oils for the cook (LS:2630), or after dilution when it is used to thicken (LS:3091).
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
      ls: { typicalLow: 3,
        typicalHigh: 8,
        hazards: ['past the salt curve more salt thins, not thickens'], stages: ['lye', 'oils', 'after_cook'] },
    },
    note:
      'Dissolve it first — in the lye water before the alkali goes in, or into the oils. To thicken soap that is already diluted, make a solution of roughly one part salt to two parts water and stir it in a little at a time, watching as you go: every recipe has its own turning point, and past it more salt thins the soap rather than thickening it.',
  },
  {
    // Sodium lactate — humectant + hardener, water-soluble, added to the lye water.
    // Higher dose range than table salt; it hardens the bar without the seize risk.
    // LS sanctions the lye solution, the oils, or the dilution water (LS:3019).
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
      ls: { typicalLow: 3, typicalHigh: 5, defaultStage: 'oils', stages: ['lye', 'oils', 'after_cook'] },
    },
    note:
      'Usually sold as a liquid at around 60% strength or better, and the percentages here assume that liquid rather than the dry powder — check what your bottle actually is. It can join the lye water, or go straight into the oils.',
  },
  {
    // Hydrolyzed silk — dissolved into the lye water, reported to add slip/sheen to lather.
    //
    // DELIBERATELY BELOW the LS source's own figure, which is why this carries no LS
    // override. That source puts supplier rates "often 1–5%" and adds silk to the lye
    // solution, but warns in the same breath that too high a concentration streaks, that
    // these proteins can cloud the soap, and that a VERY SMALL amount is what gives the
    // silky feel (LS:3060). 0.25–1% is that caution expressed as a range; the 1–5% is a
    // generic supplier envelope the source qualifies rather than endorses for liquid soap.
    // Do not "correct" this upward to 1–5 without answering the streaking clause.
    // LS sanctions the lye solution (LS:3060), or after dilution as amino acids (LS:3347).
    id: 'silk',
    processOverrides: { ls: { stages: ['lye', 'after_cook'] } },
    name: 'Silk (hydrolyzed)',
    typicalLow: 0.25,
    typicalHigh: 1,
    defaultStage: 'lye',
    note:
      'Buy a water-soluble grade and dissolve it into the lye water. Keep the amount small — these proteins can cloud a soap you wanted clear, and too much leaves streaks. If clarity matters, prove it on a small batch first.',
  },
  {
    // EDTA — synthetic chelator, added to the lye water alongside/instead of citrate.
    // This range doses for hard-water chelation/scum control, not the DOS-preventing
    // minimum: a craft source's "0.5% of the total CURED soap weight" converts to about
    // 0.62% of oil (cured soap outweighs the oils it came from — oils + lye, less cure
    // evaporation, run roughly 1.25x the oil weight), landing just above this range's top
    // end, so the figure here is not overstated against that source. The same oxidation
    // experiment behind the bht/roe entries above rated EDTA its single most potent
    // anti-DOS preservative, effective down to 0.3 ppt (0.03% of oil) and recommending
    // 0.5 ppt (0.05% of oil) on its own — an order of magnitude below this range. Both
    // figures are legitimate: chelating out hard-water metals (this entry's job) wants
    // noticeably more EDTA than the minimum dose that, alone, stops orange spots.
    //
    // No LS figure to answer to, and deliberately so: the LS text names EDTA among the
    // common chelators but sends every chelator other than the in-lye citrate route to
    // its own supplier's rate (LS:3037). The range here is that supplier envelope.
    id: 'edta',
    name: 'EDTA',
    typicalLow: 0.1,
    typicalHigh: 0.5,
    defaultStage: 'lye',
    note:
      'A chelator for hard water, like citrate. No liquid-soap figure of its own appears in the sources behind this app — the guidance there is to follow your supplier\'s stated rate, and the range shown is the ordinary cosmetic envelope rather than a measured recommendation.',
  },
  {
    // BHT — antioxidant, NOT a preservative: it slows the oxidation of unsaponified oil
    // (rancidity / DOS), which is a fat problem, not a microbial one. Bar soap needs it
    // as much as liquid soap does; the study behind this dose was run on CP bars.
    // Dose is the experiment's own recommendation: 1 ppt of oil weight = 0.1%. It was
    // still effective at 0.7 ppt. Three craft books print "1%" — 10x this, above typical
    // cosmetic use — which is why the figure here is the tested one. (The experiment's
    // 0.7 ppt "still effective" figure was measured with BHT added to the LYE, not the
    // oil, so it is not a lower bound for this oil-stage entry.)
    id: 'bht',
    name: 'BHT (antioxidant)',
    typicalLow: 0.1,
    typicalHigh: 0.1,
    defaultStage: 'oils',
    note:
      'An antioxidant, not a preservative: it slows the oxidation that turns leftover oil rancid and spots the soap, and does nothing whatever about microbes. This dose is the one an antioxidant trial actually measured; several craft books print ten times it, which is above normal cosmetic use.',
  },
  {
    // Rosemary oleoresin extract — the natural-route antioxidant. Rosmarinic acid is the
    // active fraction, so the effective dose depends on the extract's strength: the
    // experiment found 1.2 ppt of rosmarinic acid needed to push the induction period
    // past its 300-hour limit (1 ppt of oil weight = 0.1%, so 1.2 ppt = 0.12%), and
    // recommends 1–2 ppt of a HIGH-rosmarinic ROE by weight (= 0.1–0.2% of oil weight).
    id: 'roe',
    name: 'ROE (rosemary oleoresin)',
    typicalLow: 0.1,
    typicalHigh: 0.2,
    defaultStage: 'oils',
    note:
      'Rosemary extract, doing the same job as BHT — slowing rancidity in the oil that never became soap. It is not a preservative and will not hold back microbial growth.',
  },
  {
    // Titanium dioxide — mineral whitener, dispersed into the oils before mixing.
    // CP/HP ONLY, for the same reason as cetyl alcohol: absent from the LS text entirely.
    // Note this is NOT "insoluble powders are wrong in liquid soap" — the source
    // explicitly sanctions charcoal and clays there, into the oils at the very start, and
    // says a more viscous solution slows their settling (LS:2991). It is narrower than
    // that: those two earned their LS place from the source, and this one has nothing
    // behind it but the CP colorant range. Its glycerin-river hazard is a MOLD-phase
    // failure that cannot happen in a diluted soap, which is the tell.
    id: 'titanium-dioxide',
    name: 'Titanium dioxide',
    typicalLow: 0.1,
    typicalHigh: 1,
    defaultStage: 'oils',
    hazards: ['can glycerin-river at high water'],
    processes: ['cp', 'hp'],
  },
  {
    // Eugenol — clove-derived aromatic used as a trace accelerant; dosed in parts-per-thousand,
    // well below fragrance-oil percentages. Added to the heated oils so it reacts with the lye
    // from the start (as an accelerant it does nothing added at trace).
    // LS sanctions the warmed oils, where it reacts on contact (LS:2572).
    id: 'eugenol',
    processOverrides: { ls: { stages: ['oils'] } },
    name: 'Eugenol',
    typicalLow: 1,
    typicalHigh: 3,
    doseUnit: 'ppt',
    defaultStage: 'oils',
    hazards: ['can seize'],
    note:
      'Clove or cinnamon oil, and note the unit: this one is measured in parts per thousand of your oils, not percent. Stir it into the warmed oils. It reacts with the alkali on contact, which is what speeds the emulsion — and why, at this dose, it will not scent the finished soap.',
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
    // LS sanctions the hot oils, as an emulsion seed (LS:2559).
    id: 'finished-soap',
    name: 'Finished soap (grated or liquid)',
    typicalLow: 0.05,
    typicalHigh: 1,
    defaultStage: 'oils',
    processes: ['hp', 'ls'],
    processOverrides: {
      // DERIVED, and deliberately so: LS gives this one as an absolute — roughly a
      // quarter to half an ounce of liquid soap into the heated oils (LS:2559) — against
      // the 16 oz total oil weight every worked recipe in that book formulates on
      // (LS:2090, LS:2739). That is 1.5–3% of oil weight, thirty times the 0.05% floor
      // this was serving LS from the HP seed-soap range. Recorded as a derivation rather
      // than a quotation: the source states the ounces, the percentage is ours.
      ls: { typicalLow: 1.5, typicalHigh: 3, stages: ['oils'] },
    },
    note:
      'A little soap you have already made, stirred into the hot oils to give the new emulsion something to build on. Liquid soap or a grated bar both work. Expect some bubbling or foaming when it goes in; that is normal.',
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
    // Solution-based like the other after-cook entries: the source doses it as a
    // concentration in the diluted, cooled soap, which is the mass it has to thicken. On the
    // oil basis the dose would shrink as the recipe is diluted further — backwards, since a
    // thinner solution needs MORE gum, not less.
    id: 'guar',
    // One sanctioned moment: hydrated, then worked into diluted and cooled soap (LS:3101).
    stages: ['after_cook'],
    name: 'Guar gum',
    typicalLow: 0.5,
    typicalHigh: 1,
    defaultStage: 'after_cook',
    doseBasis: 'solution',
    processes: ['ls'],
    note:
      'Hydrate it before it touches the soap: stir it into about its own weight of glycerin and leave it ten minutes or so, then work that slurry into diluted, cooled soap in small additions. Added dry it clumps.',
  },
  {
    // Hydroxyethylcellulose (HEC) — LS-only thickener, same after-dilution dosing as guar
    // (including the solution basis).
    //
    // SOURCED: 0.5–1%, added after the final dilution AND cooling. That passage lives only
    // in the raw extraction, not the cleaned reading text (LS_full_text.txt p.449), so a
    // search of the reading text alone reports HEC absent — it is not. The same page names
    // Crothix and xanthan gum as further thickeners but gives them no dose, which is why
    // neither is offered here.
    id: 'hec',
    // One sanctioned moment: added after the final dilution and cooling
    // (LS_full_text p.449).
    stages: ['after_cook'],
    name: 'Hydroxyethylcellulose (HEC)',
    typicalLow: 0.5,
    typicalHigh: 1,
    defaultStage: 'after_cook',
    doseBasis: 'solution',
    processes: ['ls'],
    note:
      'Hydrate it first, in stages: mix it into glycerin until it is fully wetted, rest it five to ten minutes, then let it down with water — roughly one part powder to three of glycerin and three of water — and stir that into diluted, cooled soap a little at a time. It hydrates faster in warmth and in alkali.',
  },
  {
    // Pearlizer (glycol stearate/distearate) — melted flakes, dosed as % of the finished
    // solution; some products go in at trace, most after cook/dilution.
    //
    // SOURCED, and the range is the source's own: the LS text puts pearlizing agents in at
    // 2–10% of the total liquid soap solution, melted first (LS:3000). Its section is
    // titled "Pearlizing Agent" and it spells the compound "glycerol stearate", which is
    // why a search for "glycol stearate" or "pearlizer" finds nothing — a naming trap this
    // audit fell into once already. The 2–10% and the solution basis below are that line.
    id: 'pearlizer',
    // One sanctioned moment: melted, then stirred into diluted soap (LS:3000).
    stages: ['after_cook'],
    name: 'Pearlizer (glycol stearate)',
    typicalLow: 2,
    typicalHigh: 10,
    defaultStage: 'after_cook',
    doseBasis: 'solution',
    processes: ['ls'],
    note:
      'Comes as white flakes and has to be melted before it goes into the soap. Beyond the pearly sheen it lends a little opacity, body and conditioning feel. Dosed against the finished solution, and added once the soap is diluted.',
  },
  {
    // Water-dispersible shea — self-emulsifying emollient/opacifier, % of the finished
    // solution, after dilution.
    id: 'wd-shea',
    // One sanctioned moment: added after dilution (LS:3030).
    stages: ['after_cook'],
    name: 'Water-dispersible shea',
    typicalLow: 1,
    typicalHigh: 25,
    defaultStage: 'after_cook',
    doseBasis: 'solution',
    processes: ['ls'],
    note:
      'The water-dispersible grade, not ordinary shea butter — that is the entire point: it blends into diluted soap instead of floating as a separate layer. Add it after dilution, and dose it against the finished solution.',
  },
  {
    // Sulfonated castor oil — the one oil that disperses in water, so it conditions a
    // finished liquid soap without the separation an ordinary oil would cause. Added
    // after dilution, as % of the finished solution. It carries a light red-orange colour
    // and a faint own odour; both show at the top of the range.
    id: 'turkey-red-castor',
    // One sanctioned moment: added after dilution; it is not saponifiable (LS:1260).
    stages: ['after_cook'],
    name: 'Turkey red castor oil',
    typicalLow: 1,
    typicalHigh: 5,
    defaultStage: 'after_cook',
    doseBasis: 'solution',
    processes: ['ls'],
    note:
      'Sulfated castor oil, which disperses through water rather than sitting on top of it, so it can go into finished soap without separating or layering. It is not saponifiable, so add it after dilution: it stays an oil instead of becoming more soap.',
  },
  {
    // Polysorbate 80 — the LS post-cook-superfat emulsifier: warmed and premixed 1:1 with
    // the PCSF oil so the oil stays suspended instead of separating. Dosed as % of oils to
    // mirror the PCSF percent it pairs with (1:1), typically 1–3%.
    id: 'polysorbate-80',
    // One sanctioned moment: premixed with the post-cook superfat oil it emulsifies (LS:1276).
    stages: ['after_cook'],
    name: 'Polysorbate 80',
    typicalLow: 1,
    typicalHigh: 3,
    defaultStage: 'after_cook',
    processes: ['ls'],
    note:
      'The emulsifier that keeps a post-cook superfat from separating back out. Match it to the oil by weight, one to one, warm the two together and mix them before that blend goes into the soap.',
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

/**
 * A one-press starting set for lather. It names WHAT to add and HOW MUCH, and deliberately
 * does NOT name a stage: each ingredient is staged by its own per-process default, resolved
 * through effectiveCatalogEntry at apply time.
 *
 * It used to carry a hardcoded stage per item, which happened to equal the CP default for
 * all three — so the pack agreed with the catalog in cold process and quietly disagreed with
 * it everywhere an override existed. In liquid soap that meant the pack dropped sugar at
 * trace while the LS catalog stages it into the oils, since a hot lye solution is what
 * browns it (LS:2667, LS:1069) — the one path that bypassed the per-process audit.
 *
 * 1% clears every process's typical range for all three (LS: sugar 1–6, chelator 1–2, cetyl
 * alcohol 1–3), so the dose stays one number.
 */
export const LATHER_SUPPORT_PACK = [
  { catalogId: 'sugar-sorbitol', percentOfOil: 1 },
  { catalogId: 'chelator', percentOfOil: 1 },
  { catalogId: 'cetyl-alcohol', percentOfOil: 1 },
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
