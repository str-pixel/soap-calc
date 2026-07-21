import { memo } from 'react';
import {
  FATTY_ACID_DISPLAY_GROUPS,
  FORMULATION_FATTY_ACID_GUIDE,
  formatPropertyRangePercent,
  formatSoapPropertyPercent,
  LOW_COVERAGE_PERCENT,
  saturatedUnsaturatedRatio,
  sumFattyAcids,
} from '@soap-calc/core';
import type { RecipeFattyAcids } from '../lib/calculateFattyAcids';
import { oilDisplayName } from '../lib/oilDisplay';
import { ModeledOilsNote } from './ModeledOilsNote';

type FattyAcidPanelProps = {
  result: RecipeFattyAcids;
};

const SCALE_MAX = 100;

/** Clamp a 0–100 percentage to a track position. */
const pct = (n: number): number => Math.max(0, Math.min(100, n));

function inGuideBand(value: number, low: number, high: number): boolean {
  return value >= low && value <= high;
}

// memo: `result` is a stable view-model memo output, so unrelated keystrokes
// skip re-rendering this panel.
export const FattyAcidPanel = memo(function FattyAcidPanel({ result }: FattyAcidPanelProps) {
  const partial = result.profile ? result.coveragePercent < 99.9 : false;
  // Compare the rounded coverage so the shown "X%" and the estimate treatment never disagree.
  const lowCoverage = result.profile
    ? Math.round(result.coveragePercent) < LOW_COVERAGE_PERCENT
    : false;

  if (!result.profile) {
    return (
      <section className="panel">
        <h2 className="panel__title">Fatty acid profile</h2>
        <p className="results-hint">
          Add triglyceride oils with fatty-acid data to see recipe totals.
        </p>
      </section>
    );
  }

  const { saturated, unsaturated } = saturatedUnsaturatedRatio(result.profile);

  return (
    <section className="panel">
      <h2 className="panel__title">Fatty acid profile</h2>
      <p className="panel__subtitle">Percent of oil weight</p>

      {partial && (
        <p className="properties-coverage">
          {lowCoverage ? 'Estimated from' : 'Based on'}{' '}
          {Math.round(result.coveragePercent)}% of recipe oils
          {result.missingOilIds.length > 0 && (
            <>
              {' '}
              (no data: {result.missingOilIds.map(oilDisplayName).join(', ')})
            </>
          )}
        </p>
      )}

      {/* These bars ARE the reconstruction, so the modeled marker belongs here most of all —
          not only on the properties derived from them. */}
      <ModeledOilsNote oilIds={result.modeledOilIds} />

      <ul className="property-bars" aria-label="Recipe fatty acid groups">
        {FATTY_ACID_DISPLAY_GROUPS.map(({ key, acids }) => {
          const guide = FORMULATION_FATTY_ACID_GUIDE[key];
          const value = sumFattyAcids(result.profile!, acids);
          const inBand = inGuideBand(value, guide.low, guide.high);
          // Low-coverage values are already flagged as estimates (the "~" prefix); don't also
          // mark them out-of-range — the guide band isn't a meaningful signal on partial data.
          const outOfRange = !inBand && !lowCoverage;

          return (
            <li key={key} className="property-bars__row">
              <div className="property-bars__label">
                <span>{guide.label}</span>
                <span className="property-bars__reading">
                  {/* Non-color, real-text out-of-range signal (WCAG 1.4.1), the same verdict the
                      bar-property rows use; the meter's aria-label below also names the status. */}
                  {outOfRange && (
                    <span className="property-bars__status">
                      {value < guide.low ? 'Too low' : 'Too high'}
                    </span>
                  )}
                  <span
                    className={`property-bars__value${outOfRange ? ' property-bars__value--outside' : ''}`}
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={SCALE_MAX}
                    aria-valuenow={Math.round(value * 10) / 10}
                    aria-label={`${guide.label}: ${lowCoverage ? 'estimated ' : ''}${formatSoapPropertyPercent(value)}${outOfRange ? ' — outside typical range' : ''}`}
                  >
                    {lowCoverage ? '~' : ''}
                    {formatSoapPropertyPercent(value)}
                  </span>
                </span>
              </div>
              {/* Zoned meter (0–100): plain track = too-low / too-high, shaded band = typical
                  range, dot = where this recipe lands. Decorative — the value's role="meter"
                  and the range text carry it for AT. */}
              <div className="property-meter" aria-hidden="true">
                <span
                  className="property-meter__band property-meter__band--suggested"
                  style={{
                    left: `${pct(guide.low)}%`,
                    width: `${pct(guide.high) - pct(guide.low)}%`,
                  }}
                />
                <span
                  className={`property-meter__dot${outOfRange ? ' property-meter__dot--outside' : ''}`}
                  style={{ left: `${pct(value)}%` }}
                />
              </div>
              <p className="property-bars__range">
                Typical {formatPropertyRangePercent(guide.low, guide.high)}
              </p>
            </li>
          );
        })}
      </ul>

      <p className="fatty-ratio">
        Saturated {formatSoapPropertyPercent(saturated)} · Unsaturated{' '}
        {formatSoapPropertyPercent(unsaturated)}
      </p>
    </section>
  );
});
