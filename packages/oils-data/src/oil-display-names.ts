/**
 * Corrected user-facing names for legacy catalog entries whose imported name has a quirk —
 * misspelling, truncation, an embedded note/instruction, stray whitespace, or inconsistent casing.
 * Keyed by the internal build slug (`slugify(leg.name)`), so `leg.name` (and thus FNWL matching)
 * is untouched; only the emitted `displayName` (and the aliases derived from it) change.
 *
 * Entries whose *id* is also wrong (a misspelling or an embedded instruction baked into the slug)
 * additionally get an OIL_ID_OVERRIDES entry to rename the emitted id, with the migration shim.
 */
export const OIL_DISPLAY_NAMES: Record<string, string> = {
  'andiroba-oil-karaba-crabwood': 'Andiroba Oil (karaba, crabwood)',
  'apricot-kernal-oil': 'Apricot Kernel Oil', // misspelling "Kernal" → also id-renamed
  'avocado-butter': 'Avocado Butter', // casing
  'cherry-kern1-oil-p-avium': 'Cherry Kernel Oil (Prunus avium)', // truncated "Kern1" → id-renamed
  'cherry-kern2-oil-p-cerasus': 'Cherry Kernel Oil (Prunus cerasus)', // truncated "Kern2" → id-renamed
  'coconut-oil-76': 'Coconut Oil, 76°F', // "76 deg"
  'coconut-oil-92': 'Coconut Oil, 92°F', // "92 deg"
  'jatropha-oil-soapnut-seed-oil': 'Jatropha Oil (soapnut seed)', // casing + redundant "oil"
  'mafura-butter-trichilia-emetica': 'Mafura Butter (Trichilia emetica)', // trailing space
  'monoi-de-tahiti-oil': 'Monoi de Tahiti Oil', // double space
  'olive-oil-pomace': 'Olive Oil, pomace', // double space + missing comma
  'papaya-seed-oil-carica-papaya': 'Papaya Seed Oil (Carica papaya)', // casing
  'pine-tar-lye-calc-only-no-fa': 'Pine Tar', // embedded instruction → id-renamed
  'pracaxi-seed-oil-hair-conditioner': 'Pracaxi (Pracachy) Seed Oil', // embedded note → id-renamed
  'zapote-seed-oil': 'Zapote Seed Oil', // casing
};
