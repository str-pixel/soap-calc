/**
 * Curated fatty-acid profile backfill for oils whose legacy profile is truncated (<93% mapped)
 * or wrong. Each entry REPLACES the legacy breakdown with a single-provenance, cited profile
 * (spec Phase 5 — "apply as a replace, single provenance").
 *
 * Profiles are **normalized to 100% of total fatty acids**. Grounded: the SAP oracle is
 * normalization-invariant (mean molar mass divides by Σpct), but iodine value, INS, and every
 * property score are *absolute* sums over the profile — so a consistent ~100 scale keeps
 * backfilled oils comparable with the legacy corpus (which sums ~100). Raw source values (which
 * sum to ~95% of oil weight, the rest being the glycerol backbone) would silently under-weight
 * every backfilled oil's IV/INS/hardness/conditioning.
 *
 * Sources are public and cited (USDA FDC fdcId, or a literature DOI / PlantFAdb id) — numbers and
 * citation only, no dependency on the uncommitted archive. Shared by build-canonical (applies the
 * profile + an `fdc`/provenance source record) and validate-canonical (asserts the built value).
 * A backfill is not "done" until the profile-consistency gate is green — see the note's SAP check.
 */
export type ProfileBackfill = {
  profile: Record<string, number>;
  /** Coarse provenance category for the recorded source (full citation lives in `source`/`note`). */
  sourceType: 'fdc' | 'literature';
  /** Optional user-facing name override — for entries whose legacy name is wrong/misleading. */
  displayName?: string;
  /**
   * Set true to acknowledge an expected large property-score shift (≥ PROPERTY_SHIFT_THRESHOLD).
   * The build ERRORS on an unacknowledged large shift, so a big move is a deliberate, reviewed
   * decision (explained in `note`) rather than something that slips through silently.
   */
  acknowledgedShift?: boolean;
  source: string;
  url?: string;
  note: string;
};

/**
 * Representative coconut composition — Codex CXS 210 (coconut oil) range midpoints, normalized to
 * 100% FA (C6 caproic, ~0.3%, has no acid key and is dropped). Single source of truth reused by
 * coconut-oil-76 and the coconut-derived entries (monoi = coconut + tiare fragrance; aloe butter =
 * coconut + aloe extract), so they can't silently diverge. NOT for coconut-oil-92, which is
 * hydrogenated (IV ~3 vs this profile's ~10). FA-derived SAP ≈ 0.247 (runs ~4% below the measured
 * ~0.257 — the known lauric-oil range-midpoint effect), so consuming entries keep their measured SAP.
 */
const CODEX_COCONUT: Record<string, number> = {
  lauric: 47.6, myristic: 18.3, palmitic: 8.6, caprylic: 7.1, capric: 6.3,
  stearic: 2.9, oleic: 7.3, linoleic: 1.7, linolenic: 0.1, arachidic: 0.1, eicosenoic: 0.1,
};

/** Serenoa repens FA composition — NIST SRM 3251 (certified reference material). Shared by the
 *  fixed oil and the CO2 extract, which SRM 3251 actually measures (same material). */
const SAW_PALMETTO_FA: Record<string, number> = {
  oleic: 36.4, lauric: 27.7, myristic: 11.2, palmitic: 9, linoleic: 6.3, caprylic: 2.8,
  capric: 2.8, stearic: 1.9, linolenic: 1.3, palmitoleic: 0.3, eicosenoic: 0.2, arachidic: 0.1, behenic: 0.1,
};

export const PROFILE_BACKFILL: Record<string, ProfileBackfill> = {
  'avocado-oil': {
    profile: { oleic: 57, linoleic: 18, palmitic: 15, palmitoleic: 8, stearic: 1, linolenic: 1 },
    sourceType: 'literature',
    source:
      'Representative avocado composition — mean of four varieties (Ettinger, Fuerte, Hass, Reed) ' +
      'from "Chemical characterization of oil from four Avocado varieties cultivated in Morocco", ' +
      'OCL — Oilseeds & fats, Crops and Lipids (2021). Cross-checked against USDA FDC SR-Legacy ' +
      '(fdcId 173573), which is a high-oleic / low-palmitoleic outlier (palmitoleic 3% vs lit. 6–12%).',
    url: 'https://www.ocl-journal.org/articles/ocl/full_html/2021/01/ocl200126/ocl200126.html',
    note:
      'Legacy profile summed 92% (no palmitoleic/linolenic; palmitic 20% high). Avocado FA is highly ' +
      'cultivar-variable (palmitic 10–29%, oleic 36–74%, palmitoleic 6–12%), so a single source is ' +
      'unsafe; replaced with the peer-reviewed 4-variety mean, restoring the signature palmitoleic ' +
      '(~8%). Profile-derived SAP 0.194 agrees with stored 0.188 (−3.3%, within the gate). Property ' +
      'scores (hardness 16, conditioning 84) land between legacy (22/70) and the FDC point (12/88).',
  },

  'rapeseed-oil-canola': {
    profile: { oleic: 17, linoleic: 13, linolenic: 9, palmitic: 4, stearic: 1, erucic: 48, eicosenoic: 8 },
    sourceType: 'literature',
    displayName: 'Rapeseed Oil (high-erucic)',
    acknowledgedShift: true, // conditioning +56 is expected — restoring the truncated ~50% erucic
    source:
      'High-erucic rapeseed (HEAR). Legacy minors (oleic/linoleic/linolenic/palmitic/stearic — all ' +
      'within Codex CXS 210 high-erucic rapeseed ranges) kept; erucic (48%) and eicosenoic (8%) ' +
      'gap-filled to representative HEAR values (erucic ~46–50% per literature). Codex CXS 210, ' +
      'Standard for Named Vegetable Oils, Table 1 (rapeseed oil).',
    url: 'https://www.fao.org/4/y2774e/y2774e04.htm',
    note:
      'Identity correction: this entry (legacy displayName "Rapeseed Oil, unrefined canola") is ' +
      'high-erucic rapeseed, NOT canola — a separate canola-oil entry already exists. Its SAP 0.175 ' +
      'is the HEAR value (erucic’s high MW lowers SAP) and STAYS; the legacy profile had the ~50% ' +
      'erucic + eicosenoic truncated (sum 44%). Gap-filled to 100%; derived SAP 0.174 agrees with ' +
      'stored 0.175 (+0.6%). Property shift is conditioning +56 (erucic/eicosenoic are conditioning ' +
      'acids) — the property-shift guard flags it, correctly (restoring truncated data). Renamed to ' +
      'drop the canola misnomer.',
  },

  'mustard-oil-kachi-ghani': {
    profile: { oleic: 18, linoleic: 14, linolenic: 9, palmitic: 2, stearic: 2, erucic: 42, eicosenoic: 9, behenic: 2, arachidic: 1, myristic: 1 },
    sourceType: 'literature',
    acknowledgedShift: true, // conditioning +51 — restoring the truncated ~42% erucic
    source:
      'High-erucic mustard (Brassica juncea, kachi ghani). Present acids kept — all within Codex ' +
      'CXS 210 mustardseed ranges (verified against the FAO standard); erucic 42% + eicosenoic 9% ' +
      'gap-filled to a kachi-ghani-representative value (literature erucic 40–48%, above the Codex ' +
      'all-mustard midpoint of 36%, which understates the traditional high-erucic variety). Codex ' +
      'CXS 210 Table 1 (mustardseed oil).',
    url: 'https://www.fao.org/4/y2774e/y2774e04.htm',
    note:
      'Legacy profile summed 45% — the classic SoapCalc high-erucic truncation (erucic + eicosenoic ' +
      'dropped). Gap-filled to 100%; SAP 0.172 kept (verified/FNWL, within Codex [0.168–0.184]; ' +
      'profile-derived 0.175 agrees, −1.6%; derived IV 105 ≈ stored 101). Property shift is ' +
      'conditioning +51 (erucic/eicosenoic are conditioning acids) — flagged, acknowledged as a ' +
      'truncation restore. Two Codex minors (C20:2, C24:1, ~2%) are unmapped in our acid model.',
  },

  // ── Slice C batch 1 — literature-sourced, each cross-checked (≥2 sources), SAP kept (all within
  //    the profile-consistency gate vs the profile-derived value), citation URLs verified to resolve.
  'moringa-oil': {
    profile: { oleic: 74.4, behenic: 6.1, palmitic: 6.3, stearic: 5, arachidic: 3.3, eicosenoic: 1.8, palmitoleic: 1.4, linoleic: 0.8, linolenic: 0.5, lignoceric: 0.4, myristic: 0.1 },
    sourceType: 'literature',
    source:
      'Moringa oleifera ("ben oil") — representative composite (Leone et al. 2016, Int J Mol Sci ' +
      '17(12):2141, Table 3), cross-checked vs Anwar 2014 (J Food Sci Technol, Indian origin) and ' +
      'MDPI Foods 2024. Signature long-chain saturates (behenic ~6, arachidic ~3).',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5187941/',
    note:
      'Legacy profile summed 87% (missing behenic/arachidic/eicosenoic/palmitoleic — the moringa ' +
      'long-chain-saturate fingerprint). Gap-filled to 100%. SAP 0.195 kept (verified/FNWL; ' +
      'profile-derived 0.188 within gate, +3.7%). Property shift +7 hardness/conditioning (under ' +
      'the guard threshold). Cultivar-variable (oleic 72–79); values are a sound composite.',
  },

  'borage-oil': {
    profile: { linoleic: 36.6, oleic: 21.7, linolenic: 17.7, palmitic: 10.9, stearic: 6.1, eicosenoic: 4.1, erucic: 2.3, arachidic: 0.4, behenic: 0.2 },
    sourceType: 'literature',
    source:
      'Borago officinalis (starflower) — full GC table, PMC 12189715 (2025, Table 1), cross-checked ' +
      'vs a GLA monograph (Townsend Letter) and Alfa Chemistry SAP. GLA (C18:3 n-6, ~17%) mapped to ' +
      'the linolenic key (both C18:3, same MW — SAP/IV-equivalent).',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12189715/',
    note:
      'Legacy profile summed 82% and had linoleic 43/linolenic 5 — the ~17% GLA was mislabeled/' +
      'dropped and eicosenoic/erucic missing. Corrected to the true borage split. SAP 0.186 kept ' +
      '(verified/FNWL; profile-derived 0.191 within gate, −2.6%). Property shift +14 conditioning ' +
      '(under the guard threshold). GLA varies 17–25% by variety (does not move SAP). Unmapped ' +
      '~1.7% (nervonic C24:1, eicosadienoic C20:2 — no keys).',
  },

  'macadamia-nut-oil': {
    profile: { oleic: 59.4, palmitoleic: 19.1, palmitic: 8.6, stearic: 3.5, arachidic: 2.5, eicosenoic: 2.5, linoleic: 2, behenic: 0.9, myristic: 0.8, linolenic: 0.3, erucic: 0.3 },
    sourceType: 'literature',
    acknowledgedShift: true, // conditioning +22.6 — restoring macadamia's signature ~19% palmitoleic
    source:
      'Macadamia integrifolia — representative center of Yang et al. (15 China cultivars, PMC 8151099) ' +
      'and the widely-cited ~60% oleic / ~19% palmitoleic signature. The USDA FDC entry (~3.4% ' +
      'palmitoleic) is a confirmed outlier and was rejected — palmitoleic is macadamia’s signature.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8151099/',
    note:
      'Legacy profile summed 75% and omitted palmitoleic entirely — macadamia’s defining ~16–23% ' +
      'C16:1. Restored to 19% (cross-checked, USDA outlier rejected — the avocado lesson). SAP ' +
      '0.195 kept (verified/FNWL; profile-derived 0.194 within gate, +0.5%). Property shift is ' +
      'conditioning +22.6 (palmitoleic is a conditioning acid) — flagged, acknowledged as a ' +
      'signature restore. (macadamia-nut-butter is a distinct processed form — not backfilled here.)',
  },

  'evening-primrose-oil': {
    profile: { linoleic: 73.9, linolenic: 9.2, oleic: 7.7, palmitic: 6.3, stearic: 1.9, eicosenoic: 0.5, arachidic: 0.3, behenic: 0.1 },
    sourceType: 'literature',
    source:
      'Oenothera biennis — GC table, Timoszuk et al. 2018 (Antioxidants 7(8):108, PMC 6116039), SAP/IV ' +
      'from CIR 2017. GLA (~9%) mapped to linolenic. (A pooled CIR minor-acid table with implausible ' +
      'behenic ~8% was identified as a transcription artifact and NOT used.)',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6116039/',
    note:
      'Legacy profile summed 89% with only linoleic 80 + linolenic 9 — palmitic/stearic/oleic ' +
      'entirely missing. Gap-filled to 100%. SAP 0.188 kept (verified; profile-derived 0.192 within ' +
      'gate, −2.2%). Property shift +8.6 hardness (adds the missing C16/C18 saturates — under the ' +
      'guard threshold). GLA 7–12% by variety.',
  },

  'walnut-oil': {
    profile: { linoleic: 60, oleic: 18.5, linolenic: 11.9, palmitic: 6.5, stearic: 2.7, eicosenoic: 0.2, palmitoleic: 0.1, arachidic: 0.1 },
    sourceType: 'literature',
    source:
      'Juglans regia — USDA FoodData Central "Oil, walnut" (fdcId 171030), cross-checked vs Bulgarian ' +
      'J. Agric. Sci. (4-sample means) and Poggetti et al. 2018. NOT in Codex CXS 210 (verified — the ' +
      '2024 additions were avocado/camellia/sacha-inchi/high-oleic-soybean, not walnut).',
    url: 'http://agrojournal.org/21/03-04.pdf', // FDC web food-detail URLs 404; cite the verified cross-check PDF + fdcId 171030 in source
    note:
      'Legacy profile summed 87% and omitted linolenic — walnut carries ~12% (its drying-oil ' +
      'signature). Gap-filled to 100%. SAP 0.193 kept (verified/FNWL; profile-derived 0.192 within ' +
      'gate, +0.4%). Property shift +12.7 conditioning (under the guard threshold). Oleic/linoleic ' +
      'trade off strongly by cultivar; values are central to the common high-linoleic form.',
  },

  // ── Slice C batch 2 — literature-sourced, each verified grounded (SAP within gate vs stored,
  //    signature matches, committed URL curl-checked). SAPs kept. (coffee/cupuaçu/sea-buckthorn
  //    held from this batch — SAP-correction cases / modeled blend.)
  'karanja-oil': {
    profile: { oleic: 56.6, linoleic: 14.1, palmitic: 7.1, stearic: 6.1, behenic: 5.1, arachidic: 3, eicosenoic: 3, linolenic: 2.5, lignoceric: 1.5, myristic: 1 },
    sourceType: 'literature',
    source:
      'Pongamia pinnata (karanja) — Kesari et al. germplasm study (Physiol Mol Biol Plants, PMC4938823, ' +
      '38 accessions) + Gupta & Mitra 1953 component-acid profile (via PlantFAdb). Signature C20–C24 ' +
      'saturates (behenic ~5, arachidic ~3, lignoceric ~1.5). Karanjin (a furanoflavonoid, not a FA) excluded.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4938823/',
    note:
      'Legacy profile summed 85% (missing the behenic/arachidic/eicosenoic/lignoceric long-chain ' +
      'signature). Gap-filled to 100%. SAP 0.19 kept (verified/FNWL; profile-derived 0.188, +1.1%). ' +
      'Property shift +11.8 hardness (long-chain saturates — under the guard threshold). Highly ' +
      'provenance-variable (oleic 34–75); a genus-level representative. Caveat: eicosenoic (C20:1) ' +
      'is the least-pinned acid (sources span ~1–12%); set to a conservative 3% — SAP-invariant, ' +
      'as a C20:1↔C18:1 shuffle barely moves the mean molar mass.',
  },

  'sal-butter': {
    profile: { stearic: 43, oleic: 39.5, arachidic: 8.5, palmitic: 6.5, linoleic: 2, behenic: 0.5 },
    sourceType: 'literature',
    source:
      'Shorea robusta seed fat — Sharma et al. (PMC12757558) + US Patent 4,534,981 cosmetic ranges, ' +
      'cross-checked. Cocoa-butter-equivalent signature: high stearic ~43 + arachidic ~8.5. (A PMC ' +
      '"γ-linolenic 6.86%" reading was judged a mis-assigned arachidic peak and not used.)',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12757558/',
    note:
      'Legacy profile summed 92% (missing the ~8.5% arachidic signature). Gap-filled to 100%. SAP ' +
      '0.185 kept (profile-derived 0.189, −2.0%); IV 39 ≈ derived. Property shift +8.5 hardness ' +
      '(under the guard threshold). Stearic/arachidic vary by origin (~34–48 / ~5.5–12).',
  },

  'broccoli-seed-oil-brassica-oleracea': {
    profile: { erucic: 50.3, oleic: 14.4, linoleic: 11.3, linolenic: 9.2, eicosenoic: 7.7, palmitic: 3.6, behenic: 1, stearic: 1, arachidic: 0.8, docosadienoic: 0.5, lignoceric: 0.2 },
    sourceType: 'literature',
    source:
      'Brassica oleracea (broccoli) seed oil — high-erucic Brassica. Cold-pressed GC (PMC7907780, ' +
      'erucic 51%) + supplier specs (NHR/Nature-in-Bottle). Chose the high-erucic commercial ' +
      'consensus over a low-erucic/high-linolenic outlier study. Nervonic (C24:1, <2%) unmapped.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7907780/',
    note:
      'Legacy profile summed 88% and already had erucic 50 — only the eicosenoic (~7.7%) + minor ' +
      'C20–C24 acids were missing. Gap-filled to 100%. SAP 0.172 kept (profile-derived 0.172, −0.3%, ' +
      'near-perfect; high erucic lowers SAP). Property shift +9.4 conditioning (under threshold). ' +
      'Erucic ranges 33–51 by cultivar/extraction.',
  },

  'saw-palmetto-oil': {
    profile: SAW_PALMETTO_FA,
    sourceType: 'literature',
    source:
      'Serenoa repens — NIST SRM 3251 (certified reference material, CO2 berry extract; Schantz et al. ' +
      '2008, Anal Bioanal Chem) + commercial supplement survey (Nutrients 2013, PMC3798925). Unusual ' +
      'medium-chain (lauric/myristic) + oleic mix. FA composition is what SAP consumes (free-vs-ester ' +
      'split irrelevant). Caproic C6 (~2%) unmapped.',
    url: 'https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=902884',
    note:
      'Legacy profile summed 89% (missing caprylic/capric). Gap-filled to 100% from the NIST certified ' +
      'reference. SAP 0.22 kept (verified — the medium-chain composition genuinely gives a high SAP; ' +
      'profile-derived 0.218, +0.8%). Property shift +7 (under threshold). Oleic:lauric ratio is ' +
      'ripeness/ecotype-variable; NIST CO2 extract is the best single anchor. (saw-palmetto-extract ' +
      'shares this NIST source — a separate row.)',
  },

  'tucuma-seed-butter': {
    profile: { lauric: 47.5, myristic: 26, oleic: 11, palmitic: 6, stearic: 3, capric: 2.5, caprylic: 2, linoleic: 2 },
    sourceType: 'literature',
    source:
      'Astrocaryum vulgare / aculeatum KERNEL fat (a lauric fat like babassu/palm-kernel — NOT the ' +
      'high-oleic pulp oil). MDPI Thermo 2024 (kernel identity) + congeneric A. chambira kernel ' +
      '(Redalyc, lauric 48.6/myristic 29.8) + Bereau 2003 (A. vulgare lauric 51–52). Seed butter, ' +
      'per the catalog entry.',
    url: 'https://www.redalyc.org/journal/1799/179955075009/html/',
    note:
      'Legacy profile summed 90% (missing caprylic/capric/stearic). Gap-filled to 100%. SAP 0.238 ' +
      'kept (profile-derived 0.239, −0.3%, near-perfect for a lauric fat); IV 14 ≈ stored 13. Property ' +
      'shift +7 bubbly/cleansing (under threshold). Lauric 42–52 / myristic 26–30 by species.',
  },

  // ── Slice C SAP-correction rows — the completed profile disagreed with the stored SAP, which
  //    the profile-consistency gate flagged. cupuaçu self-corrects (profile_closest re-resolution);
  //    coffee gets a LEGACY_SAP_CORRECTIONS entry (no FNWL match).
  'coffee-bean-oil-roasted': {
    profile: { linoleic: 42.9, palmitic: 34.3, oleic: 9.4, stearic: 7.6, arachidic: 2.8, linolenic: 1.6, behenic: 0.7, lignoceric: 0.3, myristic: 0.1, palmitoleic: 0.1, eicosenoic: 0.1 },
    sourceType: 'literature',
    source:
      'Coffea arabica (roasted) — Böger et al. 2021 (Grasas y Aceites 72(1) e394, roasted arabica, ' +
      'pressed) + Raba et al. 2018 (PLoS ONE, PMC6040754, green). Roasting barely shifts the FA ' +
      'profile. Chose the linoleic-dominant consensus over a palmitic-dominant SFE variety.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6040754/',
    note:
      'Legacy profile summed 88% (missing stearic/arachidic + minors). Gap-filled to 100%. The ' +
      'stored SAP 0.18 was too low: the profile derives 0.196 (Böger measured 0.195), so SAP is ' +
      'corrected to 0.195 via LEGACY_SAP_CORRECTIONS (no FNWL match). Property shift +6 (under the ' +
      'guard threshold). Palmitic/linoleic split is variety/extraction-dependent (a palmitic-heavy ' +
      'camp exists).',
  },

  'cupuacu-butter': {
    profile: { oleic: 42, stearic: 33.3, arachidic: 10, palmitic: 8, linoleic: 3.5, behenic: 1.9, lignoceric: 0.6, linolenic: 0.3, eicosenoic: 0.3, myristic: 0.1, palmitoleic: 0.1 },
    sourceType: 'literature',
    source:
      'Theobroma grandiflorum seed fat — CIR 2017 safety assessment (Table 4) + Frontiers in ' +
      'Sustainability 2022. Cocoa-butter-alternative signature: high stearic ~33 + the unusually ' +
      'high arachidic ~10 that distinguishes it from cocoa butter (arachidic <1%). An outlier study ' +
      '(arachidic 0.29%, linolenic 11.6%) was rejected.',
    url: 'https://www.frontiersin.org/journals/sustainability/articles/10.3389/frsus.2022.682178/full',
    note:
      'Legacy profile summed 87% (missing the ~10% arachidic signature). Gap-filled to 100%. This ' +
      'AUTO-CORRECTS the SAP: the stored 0.2075 was the Phase-3 midpoint of legacy 0.192 / FNWL ' +
      '0.223 (chosen because the incomplete profile "could not judge"); now complete, the build ' +
      're-resolves via profile_closest to legacy 0.192 (nearest the profile-derived 0.188). Gate ' +
      'then −2%. Property shift +11 hardness (arachidic — under the guard threshold). Arachidic ' +
      'varies ~7–15 by genotype/ripeness.',
  },

  // ── Slice C derivatives — coconut-based products (FA = coconut; the tiare/aloe additive is not a
  //    fatty acid) and the saw-palmetto extract (= the NIST reference material). (avocado-butter and
  //    macadamia-butter are held — they're hardened/hydrogenated blends, not their base oils.)
  'saw-palmetto-extract': {
    profile: SAW_PALMETTO_FA,
    sourceType: 'literature',
    source:
      'Serenoa repens CO2 berry extract — NIST SRM 3251 (certified reference material; Schantz et al. ' +
      '2008). This entry IS the extract that SRM 3251 measures, so it uses the same profile as ' +
      'saw-palmetto-oil.',
    url: 'https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=902884',
    note:
      'Legacy profile summed 90% (missing caprylic/capric). Gap-filled to 100% from the NIST ' +
      'certified reference. SAP 0.23 kept (profile-derived 0.218, +5.4%, within gate). Property ' +
      'shift +4.5 (under the guard threshold).',
  },

  'monoi-de-tahiti-oil': {
    profile: CODEX_COCONUT,
    sourceType: 'literature',
    acknowledgedShift: true, // cleansing/bubbly +19 — restoring coconut's C8/C10 (monoi is coconut-based)
    source:
      'Monoï de Tahiti is coconut oil infused with tiare (Gardenia) flowers — the tiare is a ' +
      'fragrance, not a fatty-acid source, so the FA composition is coconut’s. Representative coconut ' +
      'profile from Codex CXS 210 (coconut oil), range midpoints normalized (C6 caproic, ~0.3%, has ' +
      'no key and is dropped).',
    url: 'https://www.fao.org/4/y2774e/y2774e04.htm',
    note:
      'Legacy profile summed 75% and omitted caprylic/capric/oleic (the C8/C10 coconut carries). ' +
      'Filled to the coconut composition. SAP 0.255 kept (verified; profile-derived 0.247, +3.3%, ' +
      'within gate — coconut FA-derived SAP runs ~4% below the measured, a known lauric-oil effect). ' +
      'Property shift is cleansing/bubbly +19 (restoring the C8/C10) — flagged, acknowledged.',
  },

  'aloe-butter': {
    profile: CODEX_COCONUT,
    sourceType: 'literature',
    acknowledgedShift: true, // cleansing/bubbly +16 — restoring coconut's C8/C10 (aloe butter is coconut-based)
    source:
      'Aloe butter is coconut oil with aloe vera extract, solidified — the aloe extract is a minor ' +
      'non-fatty-acid additive, so the FA composition is coconut’s. Representative coconut profile ' +
      'from Codex CXS 210 (coconut oil), range midpoints normalized (C6 dropped, no key).',
    url: 'https://www.fao.org/4/y2774e/y2774e04.htm',
    note:
      'Legacy profile summed 83% and omitted caprylic/capric (coconut’s C8/C10). Filled to the ' +
      'coconut composition. SAP 0.24 kept (profile-derived 0.247, −2.8%, within gate). Property ' +
      'shift is cleansing/bubbly +16 (restoring the C8/C10) — flagged, acknowledged. Derived/blend ' +
      'product; the coconut FA is representative, not a measured aloe-butter lot.',
  },

  'coconut-oil-76': {
    profile: CODEX_COCONUT,
    sourceType: 'literature',
    source:
      'Codex CXS 210 coconut oil (range midpoints, normalized) — shared CODEX_COCONUT constant. ' +
      'Restores the caprylic (C8, ~7%) + capric (C10, ~6%) that coconut carries but the legacy ' +
      'profile truncated.',
    url: 'https://www.fao.org/4/y2774e/y2774e04.htm',
    note:
      'GOLDEN-SAP oil — stored 0.258 KEPT (verified; the golden-SAP validator still passes). ' +
      'Profile-derived 0.247 is within the gate (+4.5%, the known lauric-oil FA-vs-measured gap); ' +
      'derived IV 10 matches stored 10. Legacy profile summed 89%, omitting C8/C10; adding them ' +
      'raises cleansing/bubbly +12.3 (coconut’s well-known high cleansing partly comes from C8/C10, ' +
      'which our property model counts) — under the guard threshold. NOTE this is a high-visibility ' +
      'change: coconut is in most recipes, so its cleansing/bubbly bars move up. coconut-oil-92 ' +
      '(hydrogenated, IV 3) is NOT given this profile — it needs a hydrogenated-coconut source.',
  },

  'palm-kernel-oil': {
    profile: {
      lauric: 48.2, myristic: 16.2, oleic: 15.3, palmitic: 8.4, caprylic: 3.3, capric: 3.4,
      stearic: 2.5, linoleic: 2.3, linolenic: 0.4,
    },
    sourceType: 'literature',
    source:
      'Ang, Liu & Huang (eds.), Asian Foods (1999) representative palm-kernel-oil profile — every ' +
      'acid falls inside the Codex CXS 210 range for palm kernel oil (cross-checked). Restores the ' +
      'caprylic (C8, ~3.3%) + capric (C10, ~3.4%) that PKO carries but the legacy profile dropped.',
    url: 'https://www.fao.org/input/download/standards/336/CXS_210e_2015.pdf',
    note:
      'CONSISTENCY backfill (not a truncation flag): legacy summed exactly 93.0% — it passes the ' +
      '93% completeness gate yet OMITS PKO’s real C8/C10, so the completeness test never surfaced ' +
      'it. Clean gap-fill: stored lauric 49 / myristic 16 already match Codex/Ang (~48/~16, NOT ' +
      'inflated), so this only ADDS the dropped C8/C10. SAP resolution unchanged — profile-derived ' +
      'rises 0.2335→0.2375 but still resolves closest to legacy 0.247 (vs FNWL 0.203), which is ' +
      'kept; derived IV 19 ≈ stored 20. Cleansing/bubbly +6.1 (C8/C10 entering the cleansing set), ' +
      'under the guard threshold. Contrast babassu-oil, whose stored lauric/myristic ARE inflated ' +
      '(needs a full reprofile, not a gap-fill) — held for its own row.',
  },

  // Keyed by baseSlug (pre-rename legacy slug), which build-canonical indexes — emitted id is pracaxi-seed-oil.
  'pracaxi-seed-oil-hair-conditioner': {
    profile: {
      oleic: 50.5, behenic: 18, lignoceric: 11.5, linoleic: 11.5, stearic: 2.9, palmitic: 1.9,
      arachidic: 1.8, erucic: 0.8, linolenic: 0.4, lauric: 0.3, myristic: 0.3, palmitoleic: 0.1,
    },
    sourceType: 'literature',
    acknowledgedShift: true, // hardness +31 / longevity +32 — restoring the truncated ~31% long-chain saturateds (C22:0/C24:0)
    source:
      'Pentaclethra macroloba — representative of two peer-reviewed 2023 sources: Silva et al., ' +
      'Plants (MDPI) PMC10058800 (literature ranges) and PMC10701076 Table 3 (three Pará wild ' +
      'populations). Behenic (C22:0) ~18% and lignoceric (C24:0) ~11.5% are pracaxi’s signature — ' +
      'both MAJOR acids (the two sources agree tightly on C24:0 ~10–12%). Arachidic 12.3% (one ' +
      'review’s upper bound) rejected as an outlier (true ~1.8%)',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10058800/',
    note:
      'FULL REPLACE — legacy profile summed only 54%, missing pracaxi’s entire long-chain saturated ' +
      'fraction (behenic 18 + lignoceric 11.5 + arachidic 1.8 ≈ 31%); it kept only oleic 44 + traces, ' +
      'so derived chemistry couldn’t even resolve (<93% mapped). Stored SAP 0.175 KEPT — profile-' +
      'derived 0.178 agrees (+1.7%, within gate; the heavy C22/C24 load lowers SAP, matching supplier ' +
      '175–195 mg KOH/g); derived IV 68 EXACTLY matches stored 68 (a supplier "90–105" figure is ' +
      'rejected as inconsistent with ~50% oleic). Property shift hardness +31 / longevity +32 / ' +
      'conditioning +15 is acknowledged: restoring ~31% hardness/longevity acids (arachidic/behenic/' +
      'lignoceric — the acids this arc added to properties.ts) is the whole point. This is the oil ' +
      'the Slice A lignoceric (C24:0) key was built for.',
  },

  'babassu-oil': {
    profile: {
      lauric: 47.4, myristic: 15.6, oleic: 11.4, palmitic: 8, caprylic: 6.2, capric: 5.8,
      stearic: 3.2, linoleic: 1.9, linolenic: 0.3, arachidic: 0.1, palmitoleic: 0.1,
    },
    sourceType: 'literature',
    source:
      'Attalea speciosa (babassu) — Melo et al. 2019 (PMC6930611, cold-pressed Brazilian babassu, ' +
      '21 FAs) as primary, cross-checked vs Jackson & Wardin 1944 (JAOCS) and the Codex CXS 210 ' +
      'ranges. Restores caprylic (C8, ~6%) + capric (C10, ~6%) and corrects the legacy lauric/' +
      'myristic (50/20), which were inflated above the cited ~47/~16. Ferreira 2012 (PMC3347479) ' +
      'rejected as a short-chain outlier (caprylic 9.2 / capric 9.6 / lauric 54.7)',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6930611/',
    note:
      'Full reprofile — legacy summed 95%, carried no C8/C10, and inflated lauric/myristic (50/20 vs ' +
      'cited ~47/~16). SAP 0.251 KEPT (FNWL measured, retained as primary): the now-complete profile ' +
      'derives 0.2432, within the gate at −3.1% of FNWL, so the measured value stands and is NOT ' +
      're-resolved (verified against the build — babassu’s FNWL match is inside the gate, so unlike ' +
      'cupuaçu the profile does not re-pick a different stored SAP). Derived IV 15 ≈ stored 15. ' +
      'Property shift is hardness −10.7 (correcting the inflated lauric/myristic — babassu stays a hard ' +
      'oil at ~74), bubbly/cleansing +5 from the restored C8/C10; max 10.7 is under the guard, no ' +
      'acknowledgment. Removed from the LAURIC_OILS_MISSING_MCT guard allowlist.',
  },

  'murumuru-butter': {
    profile: {
      lauric: 47, myristic: 28, oleic: 9.5, palmitic: 7, linoleic: 3, stearic: 2.6,
      caprylic: 1.5, capric: 1.3, arachidic: 0.1,
    },
    sourceType: 'literature',
    source:
      'Astrocaryum murumuru seed butter — CIR 2017 safety assessment (Int J Toxicol 36(3S), Table 4) ' +
      'plus the widely-republished reference profile, cross-checked: both give lauric ~47–49 with the ' +
      'signature co-dominant myristic ~26–30 and caprylic/capric ~1–2% each. The Colombian-Amazon GC ' +
      '(PMC10295824, lauric 64% with C8/C10 undetected) is excluded as an outlier for the majors',
    url: 'https://www.cir-safety.org/sites/default/files/118_final_oils_web.pdf',
    note:
      'Full reprofile — legacy summed 100% but omitted C8/C10 (mass redistributed into lauric/' +
      'myristic). Restores caprylic 1.5 + capric 1.3 and the co-dominant myristic (28 — murumuru’s ' +
      'fingerprint vs coconut/PKO ~16). SAP 0.253 (built primary, FNWL) KEPT: the completed profile ' +
      'derives 0.2376 — a +6.5% gate deviation ((stored−derived)/derived), within the 8% threshold; the ' +
      'added light C8/C10 improved it from the truncated +8.6%, which had put murumuru on the acknowledged-' +
      'deviation list (now removed). Derived IV 14; stored iodine left as-is (profile-only backfill, not ' +
      'gate-checked). Property ' +
      'shift max 5.5 (condition −5.5 from trimming the high legacy oleic), under the guard, no ' +
      'acknowledgment. Removed from the LAURIC_OILS_MISSING_MCT guard allowlist.',
  },

  'cohune-oil': {
    profile: {
      lauric: 46.5, myristic: 16, palmitic: 9.5, oleic: 10, caprylic: 7.5, capric: 6.5,
      stearic: 3, linoleic: 1,
    },
    sourceType: 'literature',
    source:
      'Attalea cohune — FAO Minor Oil Crops bulletin (Axtell 1992, from R.M. Fairman), the only ' +
      'cohune-native complete profile (reproduced by Wikipedia + Monaco Nature Encyclopedia; NOT ' +
      'independently GC-measured — SINGLE-SOURCE). High confidence on the caprylic 7.5 / capric 6.5 ' +
      'presence and lauric ~46%, but myristic 16 / palmitic 9.5 run higher than measured relatives ' +
      '(babassu/indaiá ~12 / ~4) — a documented asterisk. Codex CXS 210 does NOT cover cohune. ' +
      'Cross-check: this profile derives SAP 0.246 / IV 11, matching the measured relatives (babassu ' +
      '0.237, indaiá 0.241) — a single source that predicts independent measurements',
    url: 'https://en.wikipedia.org/wiki/Cohune_oil',
    note:
      'Restores caprylic + capric (~14% combined) the legacy profile dropped. PAIRED WITH a ' +
      'LEGACY_SAP_CORRECTION: stored SAP 0.205 is impossibly low for a lauric palm-kernel oil (below ' +
      'the saponification value of any lauric composition; even the truncated profile derived 0.232). ' +
      'Corrected to the profile-derived 0.246 (no FNWL match → applied via LEGACY_SAP_CORRECTIONS, ' +
      'confidence→estimated); legacy iodine 30 (also inconsistent — cohune is ~96% saturated) corrected ' +
      'to the derived 11. Profile-derived 0.2457 then agrees with the corrected 0.246 (+0.1%, gate-safe). ' +
      'Property shift bubbly/cleansing +12.5 (restored C8/C10) / condition −10, under the guard. Removed ' +
      'from the MCT guard allowlist and the acknowledged-SAP-deviation list. CAVEAT: single-source FA ' +
      'data — revise the profile if an independent GC analysis of A. cohune appears.',
  },
};
