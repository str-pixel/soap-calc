import type { FattyAcidProfile } from './properties.js';

/**
 * The four liquid-soap qualities: sums of fatty-acid percentages, shown for liquid soap in place of
 * the six bar-soap scores (decided 2026-09-14). The definitions are the liquid soap book's quality
 * table, exactly (LS:5261-5303, p148):
 *
 *   Body/Lather Stability = stearic + palmitic
 *   Cleansing             = myristic + lauric
 *   Conditioning          = oleic + linoleic + linolenic
 *   Lather                = ricinoleic + lauric + myristic
 *
 * NO RANGES, NO VERDICTS. The book gives no numbers for these qualities anywhere: the page before
 * the table promises an ideal percentage per recipe type (LS:3334-3336) and none follows.
 *
 * EIGHT ACIDS ONLY. The book works with lauric, myristic, palmitic, stearic, oleic, linoleic,
 * linolenic and ricinoleic ("there are only eight primary fatty acids", LS:3151). The catalog's
 * other acids (C8/C10, palmitoleic, erucic, the long-chain saturates) count toward none of the
 * four. So cleansing here reads lower than the bar-soap score, which adds C8/C10, and lower than
 * 09's "Lauric + myristic (+C8–C10)": 65.9 against 79.3 on 100% coconut oil.
 *
 * CASTOR. The table counts ricinoleic in Lather and not in Conditioning, while the book's prose says
 * more castor does not increase lather in liquid soap (LS:7229-7230) and calls castor conditioning
 * (LS:7228). The table is followed; the UI says castor adds little lather, as the
 * ls_castor_no_lather insight does. On the book's own castor recipe (LS:12356-12359) lather reads
 * 41, and would read 19 without ricinoleic.
 */
export type LsSoapQualityName = 'bodyLatherStability' | 'cleansing' | 'conditioning' | 'lather';

export type LsSoapQualities = Record<LsSoapQualityName, number>;

/** The table's row order. */
export const LS_SOAP_QUALITY_ORDER: readonly LsSoapQualityName[] = [
  'bodyLatherStability',
  'cleansing',
  'conditioning',
  'lather',
];

export const LS_SOAP_QUALITY_FATTY_ACIDS: Record<LsSoapQualityName, readonly string[]> = {
  bodyLatherStability: ['stearic', 'palmitic'],
  cleansing: ['myristic', 'lauric'],
  conditioning: ['oleic', 'linoleic', 'linolenic'],
  lather: ['ricinoleic', 'lauric', 'myristic'],
};

export const LS_SOAP_QUALITY_LABELS: Record<LsSoapQualityName, string> = {
  bodyLatherStability: 'Body & lather stability',
  cleansing: 'Cleansing',
  conditioning: 'Conditioning',
  lather: 'Lather',
};

/** The four qualities of a recipe's fatty-acid profile. A missing acid counts as zero. */
export function lsSoapQualities(profile: FattyAcidProfile): LsSoapQualities {
  const sum = (acids: readonly string[]) => acids.reduce((total, acid) => total + (profile[acid] ?? 0), 0);
  return {
    bodyLatherStability: sum(LS_SOAP_QUALITY_FATTY_ACIDS.bodyLatherStability),
    cleansing: sum(LS_SOAP_QUALITY_FATTY_ACIDS.cleansing),
    conditioning: sum(LS_SOAP_QUALITY_FATTY_ACIDS.conditioning),
    lather: sum(LS_SOAP_QUALITY_FATTY_ACIDS.lather),
  };
}
