import { ADDITIVE_STAGE_LABELS, type AdditiveStage } from '@soap-calc/core';
import type { ProcessId } from './process';

/**
 * Label for an additive's timing stage. `after_cook` is process-aware: Liquid Soap's
 * analogous post-cook step is dilution, so it reads "After dilution" under `ls` and
 * "After cook" everywhere else (Hot Process, or no process context e.g. split-liquid's
 * narrower stage type). All other stages are unaffected by process.
 */
export function additiveStageLabel(stage: AdditiveStage, process?: ProcessId): string {
  if (stage === 'after_cook' && process === 'ls') return 'After dilution';
  return ADDITIVE_STAGE_LABELS[stage];
}
