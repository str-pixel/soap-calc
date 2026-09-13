import type { SoapPropertyName } from '@soap-calc/core';

/**
 * The order the six bar properties appear in, everywhere they are listed: the properties
 * panel's Meters rows, its radar axes and screen-reader list, and the printed batch sheet.
 * One constant, so the printout cannot drift from the screen again: the sheet listed bubbly
 * before creamy until 2026-09-13.
 */
export const PROPERTY_ORDER: SoapPropertyName[] = [
  'hardness',
  'cleansing',
  'condition',
  'creamy',
  'bubbly',
  'longevity',
];

/** The batch sheet's short property names, keyed exhaustively, so a property added in core
 *  without a printed name fails the build instead of silently missing from the sheet. */
export const BATCH_SHEET_PROPERTY_LABEL: Record<SoapPropertyName, string> = {
  hardness: 'Hardness',
  cleansing: 'Cleansing',
  condition: 'Conditioning',
  creamy: 'Creamy',
  bubbly: 'Bubbly',
  longevity: 'Longevity',
};
