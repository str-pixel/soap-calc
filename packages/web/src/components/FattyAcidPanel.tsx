import { memo, useState } from 'react';
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
import { makeTabsKeyDownHandler } from '../lib/tabsKeyboard';
import { oilDisplayName } from '../lib/oilDisplay';
import { ModeledOilsNote } from './ModeledOilsNote';

type FattyAcidPanelProps = {
  result: RecipeFattyAcids;
};

const SCALE_MAX = 100;

// List first: the compact readout answers "what is this blend made of" in one column of
// figures; the bars are the same numbers against their typical bands, a step down into
// detail — the same list-before-detail order the redesign gave this panel's mock.
const FATTY_VIEWS: Array<'list' | 'bars'> = ['list', 'bars'];

/** Clamp a 0–100 percentage to a track position. */
const pct = (n: number): number => Math.max(0, Math.min(100, n));

// A boundary tick renders unless it would clip off the track edge — a value at/near 0 centered
// with translateX(-50%) spills past the left edge. Values ≥3% clear it even on a ~300px mobile
// track, so linolenic's 0/1 and the 0–2 trace bands drop while 4 (ricinoleic) still shows.
const TICK_EDGE = 3;
const tickFits = (position: number): boolean =>
  pct(position) >= TICK_EDGE && pct(position) <= 100 - TICK_EDGE;

// A "Low"/"High" caption yields to any tick that lands in its end zone, so the precise number
// shows in place of the generic label instead of colliding with it. Unlike the mid-scale
// bar-property bands, several fatty-acid bands hug zero (linoleic 7–14, ricinoleic 4–7), so
// their numbers fall where the caption sits; the number is the more useful of the two. The zone
// must exceed the caption's width as a share of the narrowest real track (~300px): 9% clears it.
const CAPTION_ZONE = 9;

function inGuideBand(value: number, low: number, high: number): boolean {
  return value >= low && value <= high;
}

// memo: `result` is a stable view-model memo output, so unrelated keystrokes
// skip re-rendering this panel.
export const FattyAcidPanel = memo(function FattyAcidPanel({ result }: FattyAcidPanelProps) {
  const [view, setView] = useState<'list' | 'bars'>('list');
  const viewActiveIndex = FATTY_VIEWS.indexOf(view);
  const handleViewKeyDown = makeTabsKeyDownHandler(FATTY_VIEWS, viewActiveIndex, setView);
  const partial = result.profile ? result.coveragePercent < 99.9 : false;
  // Compare the rounded coverage so the shown "X%" and the estimate treatment never disagree.
  const lowCoverage = result.profile
    ? Math.round(result.coveragePercent) < LOW_COVERAGE_PERCENT
    : false;

  if (!result.profile) {
    return (
      <section className="panel">
        <h2 className="panel__title"><span className="panel__num" aria-hidden="true">07</span>Fatty acid profile</h2>
        <p className="results-hint">
          Add triglyceride oils with fatty-acid data to see recipe totals.
        </p>
      </section>
    );
  }

  const { saturated, unsaturated } = saturatedUnsaturatedRatio(result.profile);

  return (
    <section className="panel">
      <h2 className="panel__title"><span className="panel__num" aria-hidden="true">07</span>Fatty acid profile</h2>
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

      {/* Same tablist idiom as the properties panel's Radar/Bars switch, with its own ids
          and an accessible name that keeps the two "Bars" tabs on this page apart — every
          page-level locator must scope through the tablist name, never the bare tab. */}
      <div className="property-view-toggle" role="tablist" aria-label="Fatty acid display">
        <button
          type="button"
          role="tab"
          id="fatty-tab-list"
          aria-controls="fatty-tabpanel"
          aria-selected={view === 'list'}
          tabIndex={view === 'list' ? 0 : -1}
          className={`property-view-toggle__tab${view === 'list' ? ' property-view-toggle__tab--active' : ''}`}
          onClick={() => setView('list')}
          onKeyDown={handleViewKeyDown}
        >
          List
        </button>
        <button
          type="button"
          role="tab"
          id="fatty-tab-bars"
          aria-controls="fatty-tabpanel"
          aria-selected={view === 'bars'}
          tabIndex={view === 'bars' ? 0 : -1}
          className={`property-view-toggle__tab${view === 'bars' ? ' property-view-toggle__tab--active' : ''}`}
          onClick={() => setView('bars')}
          onKeyDown={handleViewKeyDown}
        >
          Bars
        </button>
      </div>

      {/* Neither view holds focusable children, so the tabpanel itself stays reachable
          (tabIndex 0) per the ARIA Tabs pattern. Both views render the SAME readings with
          the same role="meter" values and out-of-range statuses — the toggle changes how
          much geometry accompanies them, never what is claimed. */}
      <div
        role="tabpanel"
        id="fatty-tabpanel"
        aria-labelledby={`fatty-tab-${view}`}
        tabIndex={0}
      >
      {view === 'list' ? (
        <ul className="fatty-list" aria-label="Recipe fatty acid groups">
          {FATTY_ACID_DISPLAY_GROUPS.map(({ key, acids }) => {
            const guide = FORMULATION_FATTY_ACID_GUIDE[key];
            const value = sumFattyAcids(result.profile!, acids);
            const inBand = inGuideBand(value, guide.low, guide.high);
            const outOfRange = !inBand && !lowCoverage;
            return (
              <li key={key} className="fatty-list__row">
                <span className="fatty-list__label">{guide.label}</span>
                <span className="fatty-list__typical">
                  typical {formatPropertyRangePercent(guide.low, guide.high)}
                </span>
                <span className="property-bars__reading">
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
              </li>
            );
          })}
        </ul>
      ) : (
      <ul className="property-bars" aria-label="Recipe fatty acid groups">
        {FATTY_ACID_DISPLAY_GROUPS.map(({ key, acids }) => {
          const guide = FORMULATION_FATTY_ACID_GUIDE[key];
          const value = sumFattyAcids(result.profile!, acids);
          const inBand = inGuideBand(value, guide.low, guide.high);
          // Low-coverage values are already flagged as estimates (the "~" prefix); don't also
          // mark them out-of-range — the guide band isn't a meaningful signal on partial data.
          const outOfRange = !inBand && !lowCoverage;

          // Scale row: render each boundary number that fits, and hide a Low/High caption when a
          // fitting tick would otherwise collide with it (see CAPTION_ZONE). Both ends checked
          // symmetrically so a left-hugging band (ricinoleic 4–7) yields Low, not High.
          const lowFits = tickFits(guide.low);
          const highFits = tickFits(guide.high);
          const showLow =
            !(lowFits && pct(guide.low) < CAPTION_ZONE) &&
            !(highFits && pct(guide.high) < CAPTION_ZONE);
          const showHigh =
            !(highFits && pct(guide.high) > 100 - CAPTION_ZONE) &&
            !(lowFits && pct(guide.low) > 100 - CAPTION_ZONE);

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
                  range, marker = where this recipe lands. Decorative — the value's role="meter"
                  and the sr-only range text carry it for AT. */}
              <div className="property-meter" aria-hidden="true">
                <span
                  className="property-meter__band property-meter__band--suggested"
                  style={{
                    left: `${pct(guide.low)}%`,
                    width: `${pct(guide.high) - pct(guide.low)}%`,
                  }}
                />
                <span
                  className={`property-meter__marker${outOfRange ? ' property-meter__marker--outside' : ''}`}
                  style={{ left: `${pct(value)}%` }}
                />
              </div>
              {/* Scale row: Low / High at the extremes, typical-range boundary numbers under the
                  band edges. A caption yields to a boundary number that lands in its zone. */}
              <div className="property-meter__scale" aria-hidden="true">
                {showLow && <span className="property-meter__extreme">Low</span>}
                {lowFits && (
                  <span className="property-meter__tick" style={{ left: `${pct(guide.low)}%` }}>
                    {Math.round(guide.low)}
                  </span>
                )}
                {highFits && (
                  <span className="property-meter__tick" style={{ left: `${pct(guide.high)}%` }}>
                    {Math.round(guide.high)}
                  </span>
                )}
                {showHigh && (
                  <span className="property-meter__extreme property-meter__extreme--high">High</span>
                )}
              </div>
              <p className="sr-only">Typical {formatPropertyRangePercent(guide.low, guide.high)}</p>
            </li>
          );
        })}
      </ul>
      )}
      </div>

      <p className="fatty-ratio">
        Saturated {formatSoapPropertyPercent(saturated)} · Unsaturated{' '}
        {formatSoapPropertyPercent(unsaturated)}
      </p>
    </section>
  );
});
