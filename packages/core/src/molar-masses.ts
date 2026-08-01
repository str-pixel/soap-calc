/**
 * Shared molar masses (g/mol), IUPAC-derived. Single-sourced so stoichiometric factors
 * cannot drift between modules by rounding — dilution, neutralization, the citric-acid
 * additive, and the vinegar preset all divide by the SAME alkali masses.
 */
export const KOH_MOLAR_MASS = 56.1056;
export const NAOH_MOLAR_MASS = 39.997;
export const GLYCEROL_MOLAR_MASS = 92.094;
export const WATER_MOLAR_MASS = 18.015;
/** Anhydrous citric acid, C6H8O7 (triprotic — 3 mol OH⁻ per mol). */
export const CITRIC_ACID_MOLAR_MASS = 192.124;
/** Acetic acid, CH3COOH (monoprotic). */
export const ACETIC_ACID_MOLAR_MASS = 60.052;
