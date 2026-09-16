import { PROPERTY_ORDER } from '../lib/propertyOrder';
import { memo, useState } from 'react';
import type { LsSoapQualityName, RecipePropertiesResult, SoapPropertyName } from '@soap-calc/core';
import type { ProcessId } from '../lib/process';
import {
  FORMULATION_PREFERENCE_GUIDE,
  formatPropertyScore,
  formatPropertyScoreRange,
  IODINE_GUIDE,
  INS_GUIDE,
  isLowCoverage,
  isJudgedProperty,
  LS_SOAP_QUALITY_LABELS,
  LS_SOAP_QUALITY_ORDER,
  lsSoapQualities,
  rangeVerdict,
  SOAP_PROPERTY_GUIDE,
  SOAP_PROPERTY_LABELS,
} from '@soap-calc/core';
import type { RecipeFattyAcids } from '../lib/calculateFattyAcids';
import type { RecipeIndexResult } from '../lib/calculateRecipeIndexes';
import { indexesCoverageCaption, missingOilsSuffix, scoresCoverageCaption } from '../lib/coverageCaption';
import { makeTabsKeyDownHandler } from '../lib/tabsKeyboard';
import { InfoTip } from './InfoTip';
import { ModeledOilsNote } from './ModeledOilsNote';
import { PropertyRadar } from './PropertyRadar';
import { trackPct as pct, valueAnchorClass } from '../lib/meterGeometry';



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
    'How well the bar keeps its shape in use, from long-chain saturates like palmitic and stearic. Higher resists mushing and lasts longer between uses. Shown as a typical range rather than a target: no published source gives a tested range for it, and high-oleic bars like castile last well in the dish despite scoring low here.',
};

// Liquid soap's four qualities (core ls-qualities has the definitions and their source). Original,
// short copy: what each number counts and how it behaves in liquid soap, no source named.
const LS_QUALITY_GUIDANCE: Record<LsSoapQualityName, string> = {
  bodyLatherStability:
    'Palmitic and stearic acids. In moderation they thicken liquid soap and steady its lather; too much can cloud it, weaken the lather or make it separate.',
  cleansing:
    'Lauric and myristic acids only; the shorter C8–C10 acids in coconut oil are not counted. In liquid soap this number follows how readily the soap dissolves more than how well it cleans. Too little weakens the lather; a lot can feel drying, and suits dish and laundry soap.',
  conditioning:
    'Oleic, linoleic and linolenic acids. Too little can leave the soap drying; too much weakens the lather.',
  lather:
    'Ricinoleic, lauric and myristic acids; C8–C10 are not counted. Low means small bubbles that are slow to form and fade fast; high means big, airy bubbles, though a lot can feel drying. Castor oil counts here, but in liquid soap it adds little lather.',
};

const SCALE_MAX = 100;

/** The verdict a property earns, exactly as its Meters row shows it. Shared with the radar's
 *  screen-reader list, so the two views can never announce different verdicts. An unjudged
 *  property (longevity) always reads as in range. */
function propertyVerdict(key: SoapPropertyName, value: number): ReturnType<typeof rangeVerdict> {
  if (!isJudgedProperty(key)) return 'in';
  const guide = SOAP_PROPERTY_GUIDE[key];
  return rangeVerdict(value, guide.low, guide.high, 0);
}

const PROPERTY_VIEWS: Array<'meters' | 'radar'> = ['meters', 'radar'];

type PropertiesPanelProps = {
  result: RecipePropertiesResult;
  indexes: RecipeIndexResult;
  /** Recipe oils whose fatty-acid profile is a modeled reconstruction, not a measured composition.
   *  Required: a data-honesty signal must not be omittable into silence. Pass [] when there are none. */
  modeledOilIds: string[];
} & (
  /** Cold and hot process: the six bar-soap scores, iodine and INS, Meters and Radar. */
  | { process: Exclude<ProcessId, 'ls'>; fattyAcids?: RecipeFattyAcids }
  /** Liquid soap: the four liquid-soap qualities, summed from the recipe's fatty-acid profile, so
   *  the profile is required: without it the panel would have nothing to show. */
  | { process: 'ls'; fattyAcids: RecipeFattyAcids }
);

// memo: props are stable view-model memo outputs, so unrelated keystrokes
// (recipe name, notes, settings) skip re-rendering this panel.
export const PropertiesPanel = memo(function PropertiesPanel({
  result,
  indexes,
  modeledOilIds,
  process,
  fattyAcids,
}: PropertiesPanelProps) {
  // Meters first: one property per row, each score sitting on its own 0-100 track against
  // its suggested band, which is the reading a maker acts on. The radar is the same six
  // numbers drawn as one shape — the blend's balance at a glance, a step out, not in.
  const [view, setView] = useState<'meters' | 'radar'>('meters');
  const modeled = modeledOilIds;
  // Compare the rounded coverage so the shown "X%" and the estimate treatment never disagree.
  const lowCoverage = result.properties
    ? isLowCoverage(result.coveragePercent)
    : false;
  const viewActiveIndex = PROPERTY_VIEWS.indexOf(view);
  const handleViewKeyDown = makeTabsKeyDownHandler(PROPERTY_VIEWS, viewActiveIndex, setView);
  const showIndexes = indexes.iodine !== null && indexes.ins !== null;
  const indexLowCoverage =
    showIndexes && isLowCoverage(indexes.coveragePercent);
  // A liquid soap is not a bar. The lists are announced under the panel's own name, so a
  // screen reader never calls a liquid soap's readings "bar" properties.
  const title = process === 'ls' ? 'Soap properties' : 'Bar properties';
  // Each coverage line names what it covers, so the scores line cannot read as covering the
  // iodine and INS figures it sits under.
  const scoresCaption = result.properties ? scoresCoverageCaption(result) : null;
  const indexesCaption = showIndexes ? indexesCoverageCaption(indexes) : null;

  // LIQUID SOAP: the four liquid-soap qualities as plain meters. No ranges, verdicts, bands, ticks
  // or legend (there are no ranges to show), no iodine or INS, and no view switch: a Radar choice
  // saved in `view` under cold process is ignored here, and nothing refers to the tabs.
  if (process === 'ls') {
    const qualities = fattyAcids.profile ? lsSoapQualities(fattyAcids.profile) : null;
    const lsLow = isLowCoverage(fattyAcids.coveragePercent);
    const lsCaption = qualities ? scoresCoverageCaption(fattyAcids) : null;
    return (
      <section className="panel">
        <h2 className="panel__title">
          <span className="panel__num" aria-hidden="true">08</span>
          {title}
        </h2>
        <p className="panel__subtitle">Fatty-acid sums on a 0–100 scale, shown without target ranges</p>
        {!qualities ? (
          <p className="results-hint">
            Add triglyceride oils with fatty-acid data to see these qualities
            {missingOilsSuffix(fattyAcids.missingOilIds)}.
          </p>
        ) : (
          <>
            {lsCaption && <p className="properties-coverage">{lsCaption}</p>}
            <ModeledOilsNote oilIds={modeled} />
            <ul className="property-meters" aria-label={title}>
              {LS_SOAP_QUALITY_ORDER.map((key) => {
                const value = qualities[key];
                const shown = Math.round(value);
                const label = LS_SOAP_QUALITY_LABELS[key];
                return (
                  <li key={key} className="property-meters__row">
                    <div className="property-meters__label">
                      <span>
                        {label}
                        <InfoTip term={label}>{LS_QUALITY_GUIDANCE[key]}</InfoTip>
                      </span>
                    </div>
                    <div className="property-meters__plot">
                      <span
                        className={`property-meters__value${valueAnchorClass(pct(shown))}`}
                        style={{ left: `${pct(shown)}%` }}
                        role="meter"
                        aria-valuemin={0}
                        aria-valuemax={SCALE_MAX}
                        aria-valuenow={shown}
                        aria-label={`${label}: ${lsLow ? 'estimated ' : ''}${formatPropertyScore(value)}`}
                      >
                        {lsLow ? '~' : ''}
                        {formatPropertyScore(value)}
                      </span>
                      <div className="property-meter" aria-hidden="true">
                        <span className="property-meter__marker" style={{ left: `${pct(shown)}%` }} />
                      </div>
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
  // Past the liquid-soap return, the recipe is a bar: cold or hot process.
  const readingsLabel = 'Bar property readings';

  return (
    <section className="panel">
      <h2 className="panel__title">
        <span className="panel__num" aria-hidden="true">08</span>
        {title}
      </h2>
      <p className="panel__subtitle">
        Fatty-acid based scores, 0–100 scale
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

      {indexesCaption && <p className="properties-coverage">{indexesCaption}</p>}

      {!result.properties ? (
        <p className="results-hint">
          Add triglyceride oils with fatty-acid data to see hardness, cleansing, and
          conditioning estimates{missingOilsSuffix(result.missingOilIds)}.
        </p>
      ) : (
        <>
          {scoresCaption && <p className="properties-coverage">{scoresCaption}</p>}

          <ModeledOilsNote oilIds={modeled} />

          <div className="property-view-toggle" role="tablist" aria-label="Property display">
            <button
              type="button"
              role="tab"
              id="property-tab-meters"
              aria-controls="property-tabpanel"
              aria-selected={view === 'meters'}
              tabIndex={view === 'meters' ? 0 : -1}
              className={`property-view-toggle__tab${view === 'meters' ? ' property-view-toggle__tab--active' : ''}`}
              onClick={() => setView('meters')}
              onKeyDown={handleViewKeyDown}
            >
              Meters
            </button>
            <button
              type="button"
              role="tab"
              id="property-tab-radar"
              aria-controls="property-tabpanel"
              aria-selected={view === 'radar'}
              tabIndex={view === 'radar' ? 0 : -1}
              className={`property-view-toggle__tab${view === 'radar' ? ' property-view-toggle__tab--active' : ''}`}
              onClick={() => setView('radar')}
              onKeyDown={handleViewKeyDown}
            >
              Radar
            </button>
          </div>

          {/* One tabpanel whose content swaps with the active tab; tabIndex 0 in Radar mode
              (no focusable children) keeps it keyboard-reachable per the ARIA Tabs pattern. */}
          <div
            role="tabpanel"
            id="property-tabpanel"
            aria-labelledby={`property-tab-${view}`}
            tabIndex={view === 'radar' ? 0 : undefined}
          >
          {view === 'radar' ? (
            <>
              <PropertyRadar
                properties={result.properties}
                order={PROPERTY_ORDER}
                lowCoverage={lowCoverage}
              />
              {/* The chart is aria-hidden; keep the six readings reachable to AT so the
                  toggle never hides the actual numbers from a screen reader. */}
              <ul className="sr-only" aria-label={readingsLabel}>
                {PROPERTY_ORDER.map((key) => {
                  const value = result.properties![key];
                  const guide = SOAP_PROPERTY_GUIDE[key];
                  const preference = FORMULATION_PREFERENCE_GUIDE[key];
                  const verdict = propertyVerdict(key, value);
                  return (
                    <li key={key}>
                      {/* The same verdict the Meters row shows, read first: this list is the
                          radar's only voice for a screen reader, so without it switching views
                          dropped every verdict. */}
                      {verdict !== 'in' && !lowCoverage && (
                        <>{verdict === 'low' ? 'Too low' : 'Too high'} </>
                      )}
                      <span
                        role="meter"
                        aria-valuemin={0}
                        aria-valuemax={SCALE_MAX}
                        aria-valuenow={Math.round(value)}
                        aria-label={`${SOAP_PROPERTY_LABELS[key]}: ${lowCoverage ? 'estimated ' : ''}${formatPropertyScore(value)}`}
                      >
                        {SOAP_PROPERTY_LABELS[key]}: {lowCoverage ? '~' : ''}
                        {formatPropertyScore(value)}
                      </span>{' '}
                      {/* Match the Meters rows: keep the suggested/target range in AT reach
                          in Radar mode too, so switching views never drops the context. */}
                      {isJudgedProperty(key) ? 'Suggested' : 'Typical'} {formatPropertyScoreRange(guide.low, guide.high)}
                      {preference && (
                        <>
                          {' · '}
                          Target {formatPropertyScoreRange(preference.low, preference.high)}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="property-legend">
                <span className="property-legend__item">
                  <span className="property-legend__swatch property-legend__swatch--suggested" />
                  Suggested range
                </span>
              </p>
              <p className="fatty-radar__caption">
                Shaded ring = each score&apos;s suggested range. Every axis is scaled to its
                own range, so the shape shows fit, not size: a score inside its range sits on
                the ring, below it inside, above it outside. Longevity is shown but not rated.
                The tighter target band is in the Meters view: fitting each axis to its own
                range puts that band at a different radius on every one, so it cannot be a ring.
              </p>
            </>
          ) : (
            <>
            <ul className="property-meters" aria-label={title}>
              {PROPERTY_ORDER.map((key) => {
                const value = result.properties![key];
                const guide = SOAP_PROPERTY_GUIDE[key];
                const preference = FORMULATION_PREFERENCE_GUIDE[key];
                // Judge the figure this row PRINTS (scores print as integers), so the
                // verdict can never contradict the number beside it. The marker rides the
                // same rounded figure, so dot, value and verdict are one reading.
                // An unjudged property (longevity) still draws its band and its dot — the
                // typical range is information — but never earns a verdict from them.
                const verdict = propertyVerdict(key, value);
                const inSuggested = verdict === 'in';
                const shown = Math.round(value);
                const guidance = PROPERTY_GUIDANCE[key];
                return (
                  <li key={key} className="property-meters__row">
                    <div className="property-meters__label">
                      <span>
                        {SOAP_PROPERTY_LABELS[key]}
                        <InfoTip term={SOAP_PROPERTY_LABELS[key]}>{guidance}</InfoTip>
                      </span>
                      {/* Out-of-range verdict holds the row's right edge on its own. The
                          number it judges no longer sits beside it — it rides the dot
                          below, where the reading is. Gated by !lowCoverage for the same
                          reason as the value colour and the dot: a partial-data estimate
                          isn't a real signal. */}
                      {!inSuggested && !lowCoverage && (
                        <span className="property-meters__status">
                          {verdict === 'low' ? 'Too low' : 'Too high'}
                        </span>
                      )}
                    </div>
                    {/* THE VALUE RIDES ITS OWN DOT. Printed at the far right of the label
                        row it was a number beside a name; centred over the marker it reads
                        as the position on the scale, which is what the meter is for.
                        Deliberately OUTSIDE the aria-hidden track below: this span carries
                        role="meter", so hiding it would take the reading with it. */}
                    <div className="property-meters__plot">
                      <span
                        className={`property-meters__value${inSuggested || lowCoverage ? '' : ' property-meters__value--outside'}${valueAnchorClass(pct(shown))}`}
                        style={{ left: `${pct(shown)}%` }}
                        role="meter"
                        aria-valuemin={0}
                        aria-valuemax={SCALE_MAX}
                        aria-valuenow={Math.round(value)}
                        aria-label={`${SOAP_PROPERTY_LABELS[key]}: ${lowCoverage ? 'estimated ' : ''}${formatPropertyScore(value)}`}
                      >
                        {lowCoverage ? '~' : ''}
                        {formatPropertyScore(value)}
                      </span>
                    {/* Zoned meter (0–100): plain track = too-low / too-high, shaded band =
                        suggested range, stronger band = target, marker = where this recipe lands.
                        The target band outweighs the suggested one on purpose — it is the
                        bullseye, not a stricter limit; the reasoning is at
                        .property-meter__band--target in index.css.
                        Decorative — the value's role="meter" and the sr-only range text carry it for AT. */}
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
                        className={`property-meter__marker${inSuggested || lowCoverage ? '' : ' property-meter__marker--outside'}`}
                        style={{ left: `${pct(shown)}%` }}
                      />
                    </div>
                    {/* Scale row: the suggested band's boundary numbers, positioned under
                        its edges. No LOW / HIGH wordmarks at the ends — they named a scale
                        the subtitle already names, and they carried paper backing that hid
                        any band edge landing near either end (cleansing's 8 disappeared
                        under "LOW"). Decorative — sr-only range below. */}
                    <div className="property-meter__scale" aria-hidden="true">
                      <span
                        className="property-meter__tick"
                        style={{ left: `${pct(guide.low)}%` }}
                      >
                        {formatPropertyScore(guide.low)}
                      </span>
                      <span
                        className="property-meter__tick"
                        style={{ left: `${pct(guide.high)}%` }}
                      >
                        {formatPropertyScore(guide.high)}
                      </span>
                    </div>
                    </div>
                    <p className="sr-only">
                      {isJudgedProperty(key) ? 'Suggested' : 'Typical'} {formatPropertyScoreRange(guide.low, guide.high)}
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
            {/* Each swatch travels with the words it keys — as loose flex children the
                pair split across a line break, stranding a colour chip at the end of one
                line and its name at the start of the next. */}
            <p className="property-legend">
              <span className="property-legend__item">
                <span className="property-legend__swatch property-legend__swatch--suggested" />
                Suggested range
              </span>
              <span className="property-legend__item">
                <span className="property-legend__swatch property-legend__swatch--preference" />
                Target for a balanced bar
              </span>
            </p>
            </>
          )}
          </div>
        </>
      )}
    </section>
  );
});
