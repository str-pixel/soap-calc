/**
 * Derive saponification / iodine / INS from a fatty-acid profile — the independent
 * "oracle" used to cross-check stored oil chemistry. A single physical-constants table
 * (free fatty-acid molecular weight + C=C count) drives all three outputs.
 *
 * The derivation is a triglyceride model, so it is only meaningful for oils whose profile
 * is a near-complete triglyceride composition; callers gate on category and on the returned
 * `mappedPercent`. See docs/superpowers/specs/2026-07-12-oil-data-quality-architecture-design.md
 */

const KOH_MOLAR_MASS = 56.1056; // g/mol
/** glycerol (92.094) − 3×H₂O (18.015): the triglyceride backbone mass beyond 3 fatty acids. */
const GLYCERYL_ADJUSTMENT = 38.049;
/** mass of 2 iodine atoms (g/mol) — one I₂ adds across each C=C double bond (Wijs). */
const DIIODINE_MASS = 253.809;

/**
 * The single "profile completeness" threshold: below this mapped-profile percentage the
 * triglyceride derivation is not meaningful and property scores are treated as estimates.
 * Shared by the derivation gate, the SAP-vs-profile guard, and the completeness guard so
 * "complete enough" means one thing everywhere.
 */
export const MIN_MAPPED_PERCENT = 93;

export type FattyAcidConstants = {
  /** Free fatty-acid molecular weight, g/mol. */
  molecularWeight: number;
  /** Number of C=C double bonds. */
  doubleBonds: number;
};

export const FATTY_ACID_PROPERTIES: Record<string, FattyAcidConstants> = {
  caprylic: { molecularWeight: 144.21, doubleBonds: 0 },
  capric: { molecularWeight: 172.26, doubleBonds: 0 },
  lauric: { molecularWeight: 200.32, doubleBonds: 0 },
  myristic: { molecularWeight: 228.37, doubleBonds: 0 },
  palmitic: { molecularWeight: 256.42, doubleBonds: 0 },
  stearic: { molecularWeight: 284.48, doubleBonds: 0 },
  arachidic: { molecularWeight: 312.53, doubleBonds: 0 },
  behenic: { molecularWeight: 340.58, doubleBonds: 0 },
  palmitoleic: { molecularWeight: 254.41, doubleBonds: 1 },
  oleic: { molecularWeight: 282.46, doubleBonds: 1 },
  ricinoleic: { molecularWeight: 298.46, doubleBonds: 1 },
  eicosenoic: { molecularWeight: 310.51, doubleBonds: 1 },
  erucic: { molecularWeight: 338.57, doubleBonds: 1 },
  docosenoic: { molecularWeight: 338.57, doubleBonds: 1 },
  linoleic: { molecularWeight: 280.45, doubleBonds: 2 },
  docosadienoic: { molecularWeight: 336.55, doubleBonds: 2 },
  linolenic: { molecularWeight: 278.43, doubleBonds: 3 },
};

export type DerivedChemistry = {
  /** KOH saponification coefficient, g KOH / g oil. */
  sapKoh: number;
  /** Iodine value, g I₂ / 100 g oil (calculated from double-bond count). */
  iodineValue: number;
  /** INS index = round(SAP mg KOH/g − iodine value). */
  ins: number;
  /** Sum of the profile percentages the table could map (0–100). */
  mappedPercent: number;
};

/**
 * Returns derived chemistry for a fatty-acid profile, or `null` when less than
 * {@link MIN_MAPPED_PERCENT} of the profile maps to known acids (derivation not meaningful).
 */
export function deriveChemistryFromProfile(
  profile: Record<string, number>,
): DerivedChemistry | null {
  let molarMassSum = 0;
  let mappedPercent = 0;
  let iodineValue = 0;

  for (const [acid, percent] of Object.entries(profile)) {
    const fa = FATTY_ACID_PROPERTIES[acid];
    if (!fa || !(percent > 0)) continue;
    molarMassSum += percent * fa.molecularWeight;
    mappedPercent += percent;
    iodineValue += (percent * fa.doubleBonds * DIIODINE_MASS) / fa.molecularWeight;
  }

  if (mappedPercent < MIN_MAPPED_PERCENT) return null;

  const meanMolarMass = molarMassSum / mappedPercent;
  const sapKoh = (3 * KOH_MOLAR_MASS) / (3 * meanMolarMass + GLYCERYL_ADJUSTMENT);
  const ins = Math.round(sapKoh * 1000 - iodineValue);

  return { sapKoh, iodineValue, ins, mappedPercent };
}
