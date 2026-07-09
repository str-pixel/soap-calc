import type { RecipeFattyAcidResult } from '@soap-calc/core';
import {
  FORMULATION_FATTY_ACID_GUIDE,
  formatPropertyRangePercent,
  formatSoapPropertyPercent,
  FATTY_ACID_GROUP_KEYS,
  saturatedUnsaturatedRatio,
  sumFattyAcids,
} from '@soap-calc/core';
import { oilById } from '../lib/oils';

type FattyAcidPanelProps = {
  result: RecipeFattyAcidResult;
};

const DISPLAY_GROUPS = [
  {
    key: 'lauricMyristic' as const,
    guide: FORMULATION_FATTY_ACID_GUIDE.lauricMyristic,
    acids: FATTY_ACID_GROUP_KEYS.lauricMyristic,
  },
  {
    key: 'palmiticStearic' as const,
    guide: FORMULATION_FATTY_ACID_GUIDE.palmiticStearic,
    acids: FATTY_ACID_GROUP_KEYS.palmiticStearic,
  },
  {
    key: 'oleic' as const,
    guide: FORMULATION_FATTY_ACID_GUIDE.oleic,
    acids: ['oleic'] as const,
  },
  {
    key: 'linoleic' as const,
    guide: FORMULATION_FATTY_ACID_GUIDE.linoleic,
    acids: ['linoleic'] as const,
  },
  {
    key: 'linolenic' as const,
    guide: FORMULATION_FATTY_ACID_GUIDE.linolenic,
    acids: ['linolenic'] as const,
  },
  {
    key: 'ricinoleic' as const,
    guide: FORMULATION_FATTY_ACID_GUIDE.ricinoleic,
    acids: ['ricinoleic'] as const,
  },
];

const SCALE_MAX = 100;

// Below this coverage the profile is renormalized over a small known base — treat as
// an estimate and don't hard-flag values as out-of-band.
const LOW_COVERAGE_PERCENT = 80;

function inGuideBand(value: number, low: number, high: number): boolean {
  return value >= low && value <= high;
}

export function FattyAcidPanel({ result }: FattyAcidPanelProps) {
  const partial = result.profile ? result.coveragePercent < 99.9 : false;
  const lowCoverage = result.profile
    ? result.coveragePercent < LOW_COVERAGE_PERCENT
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
      <p className="panel__subtitle">Percent of total oil weight</p>

      {partial && (
        <p className="properties-coverage">
          {lowCoverage ? 'Estimated from' : 'Based on'}{' '}
          {Math.round(result.coveragePercent)}% of recipe oils
          {result.missingOilIds.length > 0 && (
            <>
              {' '}
              (no data:{' '}
              {result.missingOilIds
                .map((id) => oilById(id)?.displayName ?? id)
                .join(', ')}
              )
            </>
          )}
        </p>
      )}

      <ul className="property-bars" aria-label="Recipe fatty acid groups">
        {DISPLAY_GROUPS.map(({ key, guide, acids }) => {
          const value = sumFattyAcids(result.profile!, acids);
          const fillPct = Math.min(100, (value / SCALE_MAX) * 100);
          const inBand = inGuideBand(value, guide.low, guide.high);

          return (
            <li key={key} className="property-bars__row">
              <div className="property-bars__label">
                <span>{guide.label}</span>
                <span
                  className={`property-bars__value${inBand || lowCoverage ? '' : ' property-bars__value--outside'}`}
                >
                  {lowCoverage ? '~' : ''}
                  {formatSoapPropertyPercent(value)}
                </span>
              </div>
              <div
                className="property-bars__track"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={SCALE_MAX}
                aria-valuenow={Math.round(value * 10) / 10}
                aria-label={`${guide.label}: ${formatSoapPropertyPercent(value)}`}
              >
                <span
                  className="property-bars__band property-bars__band--preference"
                  style={{
                    left: `${guide.low}%`,
                    width: `${guide.high - guide.low}%`,
                  }}
                  aria-hidden
                />
                <span className="property-bars__fill" style={{ width: `${fillPct}%` }} />
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
}
