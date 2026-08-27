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

// List first: the zoned-meter rows answer "where does each group sit against its band";
// Bars is the mock's column chart — the same readings as heights, for the blend's shape
// at a glance. (An earlier List was a text-only compact readout; the meters took its tab
// when the chart arrived, since meter rows read as a list and the chart is the bars.)
const FATTY_VIEWS: Array<'list' | 'bars'> = ['list', 'bars'];

// Column abbreviations for the chart, per display-group key, with the legend line below
// the chart expanding every one — the cell never stands alone. Typed EXHAUSTIVELY against
// the display groups: add a group in core without an abbreviation here and the build
// fails, instead of the legend printing "undefined".
const FATTY_ABBR: Record<(typeof FATTY_ACID_DISPLAY_GROUPS)[number]['key'], string> = {
  lauricMyristic: 'Lau',
  palmiticStearic: 'Pal',
  oleic: 'Ole',
  linoleic: 'Lin',
  linolenic: 'Lnn',
  ricinoleic: 'Ric',
  otherSaturated: 'Osa',
  otherUnsaturated: 'Oun',
  trans: 'Trs',
};

// The tallest bar in the chart area, in px — every bar scales to the recipe's own largest
// group rather than to a fixed 100, so a typical blend uses the full height.
const CHART_BAR_MAX_PX = 150;

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

  // ONE derivation for both views (a review finding): the meters and the chart must state
  // the same readings, so the values, bands, and verdicts are computed once and each view
  // only decides how much geometry accompanies them.
  const groups = FATTY_ACID_DISPLAY_GROUPS.map(({ key, acids }) => {
    const guide = FORMULATION_FATTY_ACID_GUIDE[key];
    const value = sumFattyAcids(result.profile!, acids);
    const inBand = inGuideBand(value, guide.low, guide.high);
    // Low-coverage values are already flagged as estimates (the "~" prefix); don't also
    // mark them out-of-range — the guide band isn't a meaningful signal on partial data.
    const outOfRange = !inBand && !lowCoverage;
    return { key, guide, value, outOfRange };
  });
  const chartScaleMax = Math.max(...groups.map((g) => g.value), 1);

  // The same accessible reading in both views — status verdict plus a role="meter" value —
  // so switching views can never change what is claimed. `bare` drops the visible "%" in
  // the chart (the columns' subtitle already says percent); the accessible name keeps it.
  const reading = (g: (typeof groups)[number], bare: boolean) => (
    <>
      {g.outOfRange && (
        <span className="property-bars__status">
          {g.value < g.guide.low ? 'Too low' : 'Too high'}
        </span>
      )}
      <span
        className={`property-bars__value${g.outOfRange ? ' property-bars__value--outside' : ''}`}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={SCALE_MAX}
        aria-valuenow={Math.round(g.value * 10) / 10}
        aria-label={`${g.guide.label}: ${lowCoverage ? 'estimated ' : ''}${formatSoapPropertyPercent(g.value)}${g.outOfRange ? ' — outside typical range' : ''}`}
      >
        {lowCoverage ? '~' : ''}
        {bare ? formatSoapPropertyPercent(g.value).replace('%', '') : formatSoapPropertyPercent(g.value)}
      </span>
    </>
  );

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
        /* The zoned-meter rows: each group against its typical band, marker where the
           recipe lands. This is the "list" — one labelled row per group. */
        <ul className="property-bars" aria-label="Recipe fatty acid groups">
          {groups.map((g) => {
            // Scale row: render each boundary number that fits, and hide a Low/High caption
            // when a fitting tick would otherwise collide with it (see CAPTION_ZONE). Both
            // ends checked symmetrically so a left-hugging band (ricinoleic 4–7) yields
            // Low, not High.
            const lowFits = tickFits(g.guide.low);
            const highFits = tickFits(g.guide.high);
            const showLow =
              !(lowFits && pct(g.guide.low) < CAPTION_ZONE) &&
              !(highFits && pct(g.guide.high) < CAPTION_ZONE);
            const showHigh =
              !(highFits && pct(g.guide.high) > 100 - CAPTION_ZONE) &&
              !(lowFits && pct(g.guide.low) > 100 - CAPTION_ZONE);
            return (
              <li key={g.key} className="property-bars__row">
                <div className="property-bars__label">
                  <span>{g.guide.label}</span>
                  <span className="property-bars__reading">{reading(g, false)}</span>
                </div>
                {/* Zoned meter (0–100): plain track = too-low / too-high, shaded band =
                    typical range, marker = where this recipe lands. Decorative — the
                    value's role="meter" and the sr-only range text carry it for AT. */}
                <div className="property-meter" aria-hidden="true">
                  <span
                    className="property-meter__band property-meter__band--suggested"
                    style={{
                      left: `${pct(g.guide.low)}%`,
                      width: `${pct(g.guide.high) - pct(g.guide.low)}%`,
                    }}
                  />
                  <span
                    className={`property-meter__marker${g.outOfRange ? ' property-meter__marker--outside' : ''}`}
                    style={{ left: `${pct(g.value)}%` }}
                  />
                </div>
                <div className="property-meter__scale" aria-hidden="true">
                  {showLow && <span className="property-meter__extreme">Low</span>}
                  {lowFits && (
                    <span className="property-meter__tick" style={{ left: `${pct(g.guide.low)}%` }}>
                      {Math.round(g.guide.low)}
                    </span>
                  )}
                  {highFits && (
                    <span className="property-meter__tick" style={{ left: `${pct(g.guide.high)}%` }}>
                      {Math.round(g.guide.high)}
                    </span>
                  )}
                  {showHigh && (
                    <span className="property-meter__extreme property-meter__extreme--high">High</span>
                  )}
                </div>
                <p className="sr-only">
                  Typical {formatPropertyRangePercent(g.guide.low, g.guide.high)}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        /* The column chart (the redesign's Bars): the same readings as heights, scaled to
           the recipe's own largest group. Verdict and figure ride each column's top; a
           dashed paper notch marks every column's foot so the near-zero groups still show
           where their bar stands. Cells abbreviate — the legend line expands every one. */
        <>
          <ul className="fatty-chart" aria-label="Recipe fatty acid groups">
            {groups.map((g) => (
              <li key={g.key} className="fatty-chart__col">
                <span className="fatty-chart__reading">{reading(g, true)}</span>
                <span
                  className={`fatty-chart__bar${g.outOfRange ? ' fatty-chart__bar--outside' : ''}`}
                  style={{
                    height: `${Math.max(Math.round((g.value / chartScaleMax) * CHART_BAR_MAX_PX), 3)}px`,
                  }}
                  aria-hidden="true"
                />
                <span className="fatty-chart__abbr" aria-hidden="true">
                  {FATTY_ABBR[g.key]}
                </span>
                <p className="sr-only">
                  Typical {formatPropertyRangePercent(g.guide.low, g.guide.high)}
                </p>
              </li>
            ))}
          </ul>
          <p className="fatty-chart__legend">
            {groups
              .map(
                (g) =>
                  `${FATTY_ABBR[g.key]} ${g.guide.label.replace(/\s*\(.*\)$/, '').toLowerCase()}`,
              )
              .join(' · ')}
            .
          </p>
        </>
      )}
      </div>

      <p className="fatty-ratio">
        Saturated {formatSoapPropertyPercent(saturated)} · Unsaturated{' '}
        {formatSoapPropertyPercent(unsaturated)}
      </p>
    </section>
  );
});
