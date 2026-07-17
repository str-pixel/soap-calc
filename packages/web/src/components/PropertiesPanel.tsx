import { memo } from 'react';
import type { RecipePropertiesResult, SoapPropertyName } from '@soap-calc/core';
import {
  FORMULATION_PREFERENCE_GUIDE,
  formatPropertyScore,
  formatPropertyScoreRange,
  IODINE_GUIDE,
  INS_GUIDE,
  LOW_COVERAGE_PERCENT,
  SOAP_PROPERTY_GUIDE,
  SOAP_PROPERTY_LABELS,
} from '@soap-calc/core';
import type { RecipeIndexResult } from '../lib/calculateRecipeIndexes';
import { oilDisplayName } from '../lib/oilDisplay';
import { InfoTip } from './InfoTip';
import { ModeledOilsNote } from './ModeledOilsNote';
import { PropertyRadar } from './PropertyRadar';

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
  /** Recipe oils whose fatty-acid profile is a modeled reconstruction, not a measured composition.
   *  Required: a data-honesty signal must not be omittable into silence. Pass [] when there are none. */
  modeledOilIds: string[];
};

// memo: props are stable view-model memo outputs, so unrelated keystrokes
// (recipe name, notes, settings) skip re-rendering this panel.
export const PropertiesPanel = memo(function PropertiesPanel({
  result,
  indexes,
  modeledOilIds,
}: PropertiesPanelProps) {
  const modeled = modeledOilIds;
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
      <p className="panel__subtitle">Fatty-acid based scores, 0–100 scale</p>

      {showIndexes && (
        <dl className="recipe-indexes" aria-label="Recipe iodine and INS">
          <div>
            <dt>
              Iodine
              <InfoTip term="Iodine value">
                An index of soft, unsaturated oils. Higher means a softer bar that is more prone to
                going rancid.
              </InfoTip>
            </dt>
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
            <dt>
              INS
              <InfoTip term="INS">
                A rough hardness index from the oil blend. Typical bar soaps land around 136–165.
              </InfoTip>
            </dt>
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
              (no data: {indexes.missingOilIds.map(oilDisplayName).join(', ')})
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
                  (no data: {result.missingOilIds.map(oilDisplayName).join(', ')})
                </>
              )}
            </p>
          )}

          <ModeledOilsNote oilIds={modeled} />

          <PropertyRadar
            properties={result.properties}
            order={PROPERTY_ORDER}
            lowCoverage={lowCoverage}
          />

          <ul className="property-bars" aria-label="Soap bar properties">
            {PROPERTY_ORDER.map((key) => {
              const value = result.properties![key];
              const guide = SOAP_PROPERTY_GUIDE[key];
              const preference = FORMULATION_PREFERENCE_GUIDE[key];
              const inSuggested = value >= guide.low && value <= guide.high;
              return (
                <li key={key} className="property-bars__row">
                  <div className="property-bars__label">
                    <span>{SOAP_PROPERTY_LABELS[key]}</span>
                    <span
                      className={`property-bars__value${inSuggested || lowCoverage ? '' : ' property-bars__value--outside'}`}
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={SCALE_MAX}
                      aria-valuenow={Math.round(value)}
                      aria-label={`${SOAP_PROPERTY_LABELS[key]}: ${lowCoverage ? 'estimated ' : ''}${formatPropertyScore(value)}`}
                    >
                      {lowCoverage ? '~' : ''}
                      {formatPropertyScore(value)}
                    </span>
                  </div>
                  <p className="property-bars__range">
                    Suggested {formatPropertyScoreRange(guide.low, guide.high)}
                    {preference && (
                      <>
                        {' · '}
                        Target {formatPropertyScoreRange(preference.low, preference.high)}
                      </>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>

          <p className="property-legend">
            <span className="property-legend__swatch property-legend__swatch--suggested" />
            Shaded band on the chart = suggested range
          </p>
        </>
      )}
    </section>
  );
});
