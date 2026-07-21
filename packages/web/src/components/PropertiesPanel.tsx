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

// Plain-language guidance for each bar: what it measures and the trade-off at the extremes.
// Original copy — general soapmaking behavior, phrased for beginners.
const PROPERTY_GUIDANCE: Record<SoapPropertyName, string> = {
  hardness:
    'Bar firmness and how well it holds up, mostly from palmitic, stearic, lauric and myristic acids. Low bars are soft and dissolve fast; a very high number can feel brittle.',
  cleansing:
    'How strongly the lather lifts away oils, from lauric, myristic and the shorter C8–C10 acids in coconut and palm-kernel oil. Higher cleans harder but can feel drying — raising the superfat softens that. All soap cleans — a low cleansing score means gentler, not ineffective.',
  condition:
    'Share of skin-loving unsaturated oils like oleic, linoleic and ricinoleic. Higher feels more moisturizing; very high can leave a soft, shorter-lived bar.',
  creamy:
    'Dense, stable, low-bubble lather from palmitic, stearic and ricinoleic acids. Higher gives a rich, lotion-like foam, as in shave soap.',
  bubbly:
    'Big, airy, fast-forming bubbles from lauric, myristic, the shorter C8–C10 acids, and ricinoleic acid. Higher is fluffier; very high can feel drying or slippery.',
  longevity:
    'How well the bar keeps its shape in use, from long-chain saturates like palmitic and stearic. Higher resists mushing and lasts longer between uses.',
};

const SCALE_MAX = 100;

/** Clamp a 0–100 score to a track position percentage. */
const pct = (n: number): number => Math.max(0, Math.min(100, n));

type PropertiesPanelProps = {
  result: RecipePropertiesResult;
  indexes: RecipeIndexResult;
  /** Recipe oils whose fatty-acid profile is a modeled reconstruction, not a measured composition.
   *  Required: a data-honesty signal must not be omittable into silence. Pass [] when there are none. */
  modeledOilIds: string[];
  /** True for liquid-soap (KOH) recipes. Appends an LS-specific note to the cleansing row's
   *  guidance, since "cleansing" reads as solubility/dilution there, not bar harshness. */
  isLiquidSoap?: boolean;
};

// memo: props are stable view-model memo outputs, so unrelated keystrokes
// (recipe name, notes, settings) skip re-rendering this panel.
export const PropertiesPanel = memo(function PropertiesPanel({
  result,
  indexes,
  modeledOilIds,
  isLiquidSoap,
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
      <h2 className="panel__title">
        <span className="panel__num" aria-hidden="true">04</span>
        {isLiquidSoap ? 'Soap properties' : 'Bar properties'}
      </h2>
      <p className="panel__subtitle">
        {isLiquidSoap
          ? 'Fatty-acid based scores, 0–100 scale — suggested ranges reflect bar-soap conventions'
          : 'Fatty-acid based scores, 0–100 scale'}
      </p>

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
              // Append, don't mutate PROPERTY_GUIDANCE: cleansing reads as solubility/dilution
              // in liquid soap, not bar harshness, so LS recipes get an extra clause here.
              const guidance =
                key === 'cleansing' && isLiquidSoap
                  ? `${PROPERTY_GUIDANCE[key]} In liquid soap this tracks solubility/how well it dilutes, not harshness.`
                  : PROPERTY_GUIDANCE[key];
              return (
                <li key={key} className="property-bars__row">
                  <div className="property-bars__label">
                    <span>
                      {SOAP_PROPERTY_LABELS[key]}
                      <InfoTip term={SOAP_PROPERTY_LABELS[key]}>{guidance}</InfoTip>
                    </span>
                    <span className="property-bars__reading">
                      {/* Out-of-range verdict sits on the same baseline as the number it
                          judges. Gated by !lowCoverage for the same reason as the value
                          color and the dot: a partial-data estimate isn't a real signal. */}
                      {!inSuggested && !lowCoverage && (
                        <span className="property-bars__status">
                          {value < guide.low ? 'Too low' : 'Too high'}
                        </span>
                      )}
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
                    </span>
                  </div>
                  {/* Zoned meter (0–100): plain track = too-low / too-high, shaded band =
                      suggested range, stronger band = target, dot = where this recipe lands.
                      Decorative — the value's role="meter" and the range text carry it for AT. */}
                  <div className="property-meter" aria-hidden="true">
                    <span
                      className="property-meter__band property-meter__band--suggested"
                      style={{
                        left: `${pct(guide.low)}%`,
                        width: `${pct(guide.high) - pct(guide.low)}%`,
                      }}
                    />
                    {preference && (
                      <span
                        className="property-meter__band property-meter__band--target"
                        style={{
                          left: `${pct(preference.low)}%`,
                          width: `${pct(preference.high) - pct(preference.low)}%`,
                        }}
                      />
                    )}
                    <span
                      className={`property-meter__dot${inSuggested || lowCoverage ? '' : ' property-meter__dot--outside'}`}
                      style={{ left: `${pct(value)}%` }}
                    />
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
