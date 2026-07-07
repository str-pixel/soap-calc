import type { RecipePropertiesResult, SoapPropertyName } from '@soap-calc/core';
import {
  SOAP_PROPERTY_GUIDE,
  SOAP_PROPERTY_LABELS,
} from '@soap-calc/core';
import { formatGrams } from '../lib/format';
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

type PropertiesPanelProps = {
  result: RecipePropertiesResult;
  indexes: RecipeIndexResult;
};

export function PropertiesPanel({ result, indexes }: PropertiesPanelProps) {
  const partial = result.properties ? result.coveragePercent < 99.9 : false;
  const showIndexes = indexes.iodine !== null && indexes.ins !== null;
  const indexPartial = indexes.coveragePercent < 99.9;

  return (
    <section className="panel">
      <h2 className="panel__title">Bar properties</h2>

      {showIndexes && (
        <dl className="recipe-indexes" aria-label="Recipe iodine and INS">
          <div>
            <dt>Iodine</dt>
            <dd>{formatGrams(indexes.iodine!, 0)}</dd>
          </div>
          <div>
            <dt>INS</dt>
            <dd>{formatGrams(indexes.ins!, 0)}</dd>
          </div>
        </dl>
      )}

      {showIndexes && indexPartial && (
        <p className="properties-coverage">
          Iodine/INS based on {formatGrams(indexes.coveragePercent, 0)}% of recipe oils
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
              Based on {formatGrams(result.coveragePercent, 0)}% of recipe oils
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
              const pct = Math.min(100, (value / guide.high) * 100);

              return (
                <li key={key} className="property-bars__row">
                  <div className="property-bars__label">
                    <span>{SOAP_PROPERTY_LABELS[key]}</span>
                    <span className="property-bars__value">{formatGrams(value, 0)}</span>
                  </div>
                  <div
                    className="property-bars__track"
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={guide.high}
                    aria-valuenow={Math.round(value)}
                    aria-label={`${SOAP_PROPERTY_LABELS[key]}: ${formatGrams(value, 0)}`}
                  >
                    <span
                      className="property-bars__fill"
                      style={{ width: `${pct}%` }}
                    />
                    <span
                      className="property-bars__guide property-bars__guide--low"
                      style={{ left: `${(guide.low / guide.high) * 100}%` }}
                      aria-hidden
                    />
                    <span
                      className="property-bars__guide property-bars__guide--high"
                      style={{ left: `${(guide.high / guide.high) * 100}%` }}
                      aria-hidden
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
