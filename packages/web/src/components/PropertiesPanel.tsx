import type { RecipePropertiesResult, SoapPropertyName } from '@soap-calc/core';
import {
  FORMULATION_PREFERENCE_GUIDE,
  formatPropertyRangePercent,
  formatSoapPropertyPercent,
  IODINE_GUIDE,
  INS_GUIDE,
  LOW_COVERAGE_PERCENT,
  SOAP_PROPERTY_GUIDE,
  SOAP_PROPERTY_LABELS,
} from '@soap-calc/core';
import type { RecipeIndexResult } from '../lib/calculateRecipeIndexes';
import { oilById } from '../lib/oils';

const PROPERTY_ORDER: SoapPropertyName[] = [
  'hardness',
  'cleansing',
  'condition',
  'creamy',
  'bubbly',
  'longevity',
];

const SCALE_MAX = 100;

type PropertiesPanelProps = {
  result: RecipePropertiesResult;
  indexes: RecipeIndexResult;
};

export function PropertiesPanel({ result, indexes }: PropertiesPanelProps) {
  const partial = result.properties ? result.coveragePercent < 99.9 : false;
  // Compare the rounded coverage so the shown "X%" and the estimate treatment never disagree.
  const lowCoverage = result.properties
    ? Math.round(result.coveragePercent) < LOW_COVERAGE_PERCENT
    : false;
  const showIndexes = indexes.iodine !== null && indexes.ins !== null;
  const indexPartial = indexes.coveragePercent < 99.9;
  const indexLowCoverage =
    showIndexes && Math.round(indexes.coveragePercent) < LOW_COVERAGE_PERCENT;

  return (
    <section className="panel">
      <h2 className="panel__title">Bar properties</h2>
      <p className="panel__subtitle">Fatty-acid totals as % of oil weight</p>

      {showIndexes && (
        <dl className="recipe-indexes" aria-label="Recipe iodine and INS">
          <div>
            <dt>Iodine</dt>
            <dd>
              {indexLowCoverage ? '~' : ''}
              {Math.round(indexes.iodine!)}
              <span className="recipe-indexes__range">
                {' '}
                (typical {IODINE_GUIDE.low}–{IODINE_GUIDE.high})
              </span>
            </dd>
          </div>
          <div>
            <dt>INS</dt>
            <dd>
              {indexLowCoverage ? '~' : ''}
              {Math.round(indexes.ins!)}
              <span className="recipe-indexes__range">
                {' '}
                (typical {INS_GUIDE.low}–{INS_GUIDE.high})
              </span>
            </dd>
          </div>
        </dl>
      )}

      {showIndexes && indexPartial && (
        <p className="properties-coverage">
          Iodine/INS {indexLowCoverage ? 'estimated from' : 'based on'}{' '}
          {Math.round(indexes.coveragePercent)}% of recipe oils
          {indexes.missingOilIds.length > 0 && (
            <>
              {' '}
              (no data:{' '}
              {indexes.missingOilIds
                .map((id) => oilById(id)?.displayName ?? id)
                .join(', ')}
              )
            </>
          )}
        </p>
      )}

      {!result.properties ? (
        <p className="results-hint">
          Add triglyceride oils with fatty-acid data to see hardness, cleansing, and
          conditioning estimates.
        </p>
      ) : (
        <>
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

          <ul className="property-bars" aria-label="Soap bar properties">
            {PROPERTY_ORDER.map((key) => {
              const value = result.properties![key];
              const guide = SOAP_PROPERTY_GUIDE[key];
              const preference = FORMULATION_PREFERENCE_GUIDE[key];
              const fillPct = Math.min(100, (value / SCALE_MAX) * 100);
              const inSuggested = value >= guide.low && value <= guide.high;

              return (
                <li key={key} className="property-bars__row">
                  <div className="property-bars__label">
                    <span>{SOAP_PROPERTY_LABELS[key]}</span>
                    <span
                      className={`property-bars__value${inSuggested || lowCoverage ? '' : ' property-bars__value--outside'}`}
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
                    aria-label={`${SOAP_PROPERTY_LABELS[key]}: ${lowCoverage ? 'estimated ' : ''}${formatSoapPropertyPercent(value)}`}
                  >
                    <span
                      className="property-bars__band property-bars__band--suggested"
                      style={{
                        left: `${guide.low}%`,
                        width: `${guide.high - guide.low}%`,
                      }}
                      aria-hidden
                    />
                    {preference && (
                      <span
                        className="property-bars__band property-bars__band--preference"
                        style={{
                          left: `${preference.low}%`,
                          width: `${preference.high - preference.low}%`,
                        }}
                        aria-hidden
                      />
                    )}
                    <span className="property-bars__fill" style={{ width: `${fillPct}%` }} />
                  </div>
                  <p className="property-bars__range">
                    Suggested {formatPropertyRangePercent(guide.low, guide.high)}
                    {preference && (
                      <>
                        {' '}
                        · Balanced target{' '}
                        {formatPropertyRangePercent(preference.low, preference.high)}
                      </>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>

          <p className="property-legend">
            <span className="property-legend__swatch property-legend__swatch--suggested" />
            Suggested range
            <span className="property-legend__swatch property-legend__swatch--preference" />
            Balanced target
          </p>
        </>
      )}
    </section>
  );
}
