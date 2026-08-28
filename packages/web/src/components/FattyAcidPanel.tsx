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

// List first, per the handoff: the hairline rows answer "what is each group's share",
// with the amber verdict beside a flagged value; Bars is the mock's column chart — the
// same readings as heights, for the blend's shape at a glance. (The zoned-meter rows
// that briefly held the List tab belong to the properties panel's idiom, not this one —
// the mock's list is text.)
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

// The chart's FIXED scale, per the handoff: 3px per percent, so a column's height is the
// reading itself rather than a share of the recipe's own largest group — two recipes'
// charts are comparable at a glance. The dashed reference rule sits at 25%.
const CHART_PX_PER_PERCENT = 3;
const CHART_MIN_HEIGHT_PX = 190;
// A zero-value group keeps a visible stub — a column, not a missing entry.
const CHART_STUB_PX = 2;

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
      {/* The toggle rides the head, per the mock — a compact cell pair beside the title,
          not a control block between the caption and the readings. Same tablist idiom as
          the properties panel's Radar/Bars switch, with its own ids and an accessible
          name that keeps the two "Bars" tabs on this page apart — every page-level
          locator must scope through the tablist name, never the bare tab. */}
      <div className="panel__head">
        <h2 className="panel__title"><span className="panel__num" aria-hidden="true">07</span>Fatty acid profile</h2>
        <div
          className="property-view-toggle property-view-toggle--compact"
          role="tablist"
          aria-label="Fatty acid display"
        >
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
      </div>
      {/* One sentence, per the mock — the coverage clause joins the caption instead of
          standing as a second line under it. */}
      <p className="panel__subtitle">
        Percent of oil weight
        {partial && (
          <>
            , {lowCoverage ? 'estimated from' : 'based on'}{' '}
            {Math.round(result.coveragePercent)}% of recipe oils
            {result.missingOilIds.length > 0 && (
              <> (no data: {result.missingOilIds.map(oilDisplayName).join(', ')})</>
            )}
          </>
        )}
        .
      </p>

      {/* These bars ARE the reconstruction, so the modeled marker belongs here most of all —
          not only on the properties derived from them. */}
      <ModeledOilsNote oilIds={result.modeledOilIds} />

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
        /* The mock's list: one hairline row per group — name left, mono value right, the
           amber verdict beside a flagged value. No geometry: the row IS the reading. */
        <ul className="fatty-list" aria-label="Recipe fatty acid groups">
          {groups.map((g) => (
            <li key={g.key} className="fatty-list__row">
              <span className="fatty-list__name">{g.guide.label}</span>
              <span className="fatty-list__reading">{reading(g, false)}</span>
              <p className="sr-only">
                Typical {formatPropertyRangePercent(g.guide.low, g.guide.high)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        /* The mock's column chart: readings as heights on the FIXED 3px-per-percent scale,
           an ink baseline under the columns, a dashed reference rule at 25% with its label
           on paper at the right end. Verdict and figure ride each column's top; flagged
           columns go signal-red. Cells abbreviate on the axis row below the baseline — the
           legend line expands every one. */
        <div className="fatty-chart">
          <ul className="fatty-chart__cols" aria-label="Recipe fatty acid groups">
            {groups.map((g) => (
              <li key={g.key} className="fatty-chart__col">
                <span className="fatty-chart__reading">{reading(g, true)}</span>
                <span
                  className={`fatty-chart__bar${g.outOfRange ? ' fatty-chart__bar--outside' : ''}`}
                  style={{
                    height: `${Math.min(
                      Math.max(Math.round(g.value * CHART_PX_PER_PERCENT), CHART_STUB_PX),
                      CHART_MIN_HEIGHT_PX,
                    )}px`,
                  }}
                  aria-hidden="true"
                />
                <p className="sr-only">
                  Typical {formatPropertyRangePercent(g.guide.low, g.guide.high)}
                </p>
              </li>
            ))}
          </ul>
          <div className="fatty-chart__axis" aria-hidden="true">
            {groups.map((g) => (
              <span key={g.key} className="fatty-chart__abbr">
                {FATTY_ABBR[g.key]}
              </span>
            ))}
          </div>
          <p className="fatty-chart__legend">
            {groups
              .map(
                (g) =>
                  `${FATTY_ABBR[g.key]} ${g.guide.label.replace(/\s*\(.*\)$/, '').toLowerCase()}`,
              )
              .join(' · ')}
            .
          </p>
        </div>
      )}
      </div>

      <p className="fatty-ratio">
        Saturated {formatSoapPropertyPercent(saturated)} · Unsaturated{' '}
        {formatSoapPropertyPercent(unsaturated)}
      </p>
    </section>
  );
});
