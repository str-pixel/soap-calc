/**
 * Façade: the variant layer moved into the process definitions (spec 2026-07-30, slice 2 —
 * "one definition layer, nested, not two overlapping ones"). Every export re-routes to
 * `process.ts`, so the 8 consumer files keep their import paths; new code should import
 * from './process' directly. Dependency is one-way: this file → process.ts, never back.
 */
export {
  processProfilesFor,
  processProfileById,
  defaultVariantFor,
  isProcessVariantId,
  allProcessVariantIds,
  soapingTempRangeFor,
  effectiveSoapingTempF,
} from './process';
export type {
  ProcessVariantId,
  WaterBand,
  TempTarget,
  FinishDuration,
  ProcessProfile,
  SoapingTempRange,
} from './process';
