import { memo, useState } from 'react';
import {
  FATTY_ACID_DISPLAY_GROUPS,
  FORMULATION_FATTY_ACID_GUIDE,
  formatPropertyRangePercent,
  formatPropertyScore,
  formatPropertyScoreRange,
  formatSoapPropertyPercent,
  LOW_COVERAGE_PERCENT,
  rangeVerdict,
  saturatedUnsaturatedRatio,
  sumFattyAcids,
} from '@soap-calc/core';
import type { RecipeFattyAcids } from '../lib/calculateFattyAcids';
import { trackPct as pct, valueAnchorClass } from '../lib/meterGeometry';
import { makeTabsKeyDownHandler } from '../lib/tabsKeyboard';
import { oilDisplayName } from '../lib/oilDisplay';
import { FattyAcidRadar, type FattyAcidRadarAxis } from './FattyAcidRadar';
import { ModeledOilsNote } from './ModeledOilsNote';

type FattyAcidPanelProps = {
  result: RecipeFattyAcids;
};

const SCALE_MAX = 100;

// Meters first, the same pair as the properties panel: one zoned row per group, the value
// on its dot against the group's typical band, which is the reading a maker acts on. Radar
// is the same nine readings as one shape — six named groups drawn as axes, the three
// catch-alls printed under the chart.
const FATTY_VIEWS: Array<'meters' | 'radar'> = ['meters', 'radar'];

type GroupKey = (typeof FATTY_ACID_DISPLAY_GROUPS)[number]['key'];

// The radar's axes, with short names that sit around the ring without wrapping (the Meters
// rows carry the full group labels, and the caption under the chart says what the short
// names fold in). The catch-alls — other saturated, other unsaturated, trans — are not
// axes: they are ~0% in ordinary oils and exist to flag an odd one, not to describe a
// blend's shape. They print under the chart instead, so the view hides nothing.
const RADAR_AXES: ReadonlyArray<{ key: GroupKey; label: string }> = [
  { key: 'lauricMyristic', label: 'Lauric' },
  { key: 'palmiticStearic', label: 'Palmitic' },
  { key: 'oleic', label: 'Oleic' },
  { key: 'linoleic', label: 'Linoleic' },
  { key: 'linolenic', label: 'Linolenic' },
  { key: 'ricinoleic', label: 'Ricinoleic' },
];

// A band narrower than this, in points of the track, cannot carry two numbers under its
// edges without them overprinting, so it prints one ("0–2") instead.
const NARROW_BAND = 6;

// memo: `result` is a stable view-model memo output, so unrelated keystrokes
// skip re-rendering this panel.
export const FattyAcidPanel = memo(function FattyAcidPanel({ result }: FattyAcidPanelProps) {
  const [view, setView] = useState<'meters' | 'radar'>('meters');
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
        <h2 className="panel__title"><span className="panel__num" aria-hidden="true">09</span>Fatty acid profile</h2>
        <p className="results-hint">
          Add triglyceride oils with fatty-acid data to see recipe totals.
        </p>
      </section>
    );
  }

  const { saturated, unsaturated } = saturatedUnsaturatedRatio(result.profile);

  // ONE derivation for both views (a review finding): the meters and the radar must state
  // the same readings, so the values, bands, and verdicts are computed once and each view
  // only decides how much geometry accompanies them.
  const groups = FATTY_ACID_DISPLAY_GROUPS.map(({ key, acids }) => {
    const guide = FORMULATION_FATTY_ACID_GUIDE[key];
    const value = sumFattyAcids(result.profile!, acids);
    // Judge the figure this panel PRINTS — it prints one decimal — so a reading can never
    // read "Too high" beside a number that is plainly inside the range it names.
    const verdict = rangeVerdict(value, guide.low, guide.high, 1);
    // Low-coverage values are already flagged as estimates (the "~" prefix); don't also
    // mark them out-of-range — the guide band isn't a meaningful signal on partial data.
    const outOfRange = verdict !== 'in' && !lowCoverage;
    return { key, guide, value, verdict, outOfRange };
  });
  type Group = (typeof groups)[number];
  const byKey = new Map(groups.map((g) => [g.key, g] as const));
  const drawn = RADAR_AXES.map((a) => byKey.get(a.key)!);
  const others = groups.filter((g) => !RADAR_AXES.some((a) => a.key === g.key));
  const axes: FattyAcidRadarAxis[] = RADAR_AXES.map((a) => {
    const g = byKey.get(a.key)!;
    return { key: g.key, label: a.label, value: g.value, low: g.guide.low, high: g.guide.high };
  });

  // The same accessible reading in both views — a status verdict plus a role="meter" value —
  // so switching views can never change what is claimed.
  const status = (g: Group) =>
    g.outOfRange ? (
      <span className="property-meters__status">
        {g.verdict === 'low' ? 'Too low' : 'Too high'}
      </span>
    ) : null;
  const value = (g: Group, onTrack = false) => (
    <span
      className={`property-meters__value${g.outOfRange ? ' property-meters__value--outside' : ''}${onTrack ? valueAnchorClass(pct(g.value)) : ''}`}
      style={onTrack ? { left: `${pct(g.value)}%` } : undefined}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={SCALE_MAX}
      aria-valuenow={Math.round(g.value * 10) / 10}
      aria-label={`${g.guide.label}: ${lowCoverage ? 'estimated ' : ''}${formatSoapPropertyPercent(g.value)}${g.outOfRange ? ' — outside typical range' : ''}`}
    >
      {lowCoverage ? '~' : ''}
      {formatSoapPropertyPercent(g.value)}
    </span>
  );
  const typical = (g: Group) => (
    <p className="sr-only">Typical {formatPropertyRangePercent(g.guide.low, g.guide.high)}</p>
  );

  return (
    <section className="panel">
      {/* The toggle rides the head, per the mock — a compact cell pair beside the title,
          not a control block between the caption and the readings. Same tablist idiom as
          the properties panel's Meters/Radar switch, with its own ids and an accessible
          name that keeps the two switches on this page apart — every page-level
          locator must scope through the tablist name, never the bare tab. */}
      <div className="panel__head">
        <h2 className="panel__title"><span className="panel__num" aria-hidden="true">09</span>Fatty acid profile</h2>
        <div
          className="property-view-toggle property-view-toggle--compact"
          role="tablist"
          aria-label="Fatty acid display"
        >
          <button
            type="button"
            role="tab"
            id="fatty-tab-meters"
            aria-controls="fatty-tabpanel"
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
            id="fatty-tab-radar"
            aria-controls="fatty-tabpanel"
            aria-selected={view === 'radar'}
            tabIndex={view === 'radar' ? 0 : -1}
            className={`property-view-toggle__tab${view === 'radar' ? ' property-view-toggle__tab--active' : ''}`}
            onClick={() => setView('radar')}
            onKeyDown={handleViewKeyDown}
          >
            Radar
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

      {/* These readings ARE the reconstruction, so the modeled marker belongs here most of
          all — not only on the properties derived from them. */}
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
      {view === 'meters' ? (
        /* The properties panel's row idiom: name and verdict on the label row, the value
           riding its dot on a 0–100% track with the typical band shaded, the band's
           bounds numbered under it. No LOW / HIGH words on this track — it is percent of
           oil weight, and the subtitle says so — which leaves the row's left edge free
           for the many bands here that start at 0. A band too narrow for two numbers
           prints one, "0–2", growing rightward from its left edge. */
        <ul className="property-meters" aria-label="Recipe fatty acid groups">
          {groups.map((g) => (
            <li key={g.key} className="property-meters__row">
              <div className="property-meters__label">
                <span>{g.guide.label}</span>
                {status(g)}
              </div>
              <div className="property-meters__plot">
                {value(g, true)}
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
                  {g.guide.high - g.guide.low < NARROW_BAND ? (
                    <span
                      className="property-meter__tick property-meter__tick--start"
                      style={{ left: `${pct(g.guide.low)}%` }}
                    >
                      {formatPropertyScoreRange(g.guide.low, g.guide.high)}
                    </span>
                  ) : (
                    <>
                      <span className="property-meter__tick" style={{ left: `${pct(g.guide.low)}%` }}>
                        {formatPropertyScore(g.guide.low)}
                      </span>
                      <span className="property-meter__tick" style={{ left: `${pct(g.guide.high)}%` }}>
                        {formatPropertyScore(g.guide.high)}
                      </span>
                    </>
                  )}
                </div>
              </div>
              {typical(g)}
            </li>
          ))}
        </ul>
      ) : (
        <>
          <FattyAcidRadar axes={axes} lowCoverage={lowCoverage} />
          {/* The chart is aria-hidden; keep the six drawn readings reachable to AT so the
              toggle never hides a number from a screen reader. */}
          <ul className="sr-only" aria-label="Recipe fatty acid groups">
            {drawn.map((g) => (
              <li key={g.key}>
                {status(g)}
                {value(g)}
                {typical(g)}
              </li>
            ))}
          </ul>
          {/* The catch-alls, in the open: name, verdict and value on one line. */}
          <ul className="fatty-radar__others" aria-label="Other fatty acid groups">
            {others.map((g) => (
              <li key={g.key} className="fatty-radar__other">
                <span className="fatty-radar__other-name">{g.guide.label}</span>
                {status(g)}
                {value(g)}
                {typical(g)}
              </li>
            ))}
          </ul>
          <p className="fatty-radar__caption">
            Shaded ring = each group&apos;s typical range. Every axis is scaled to its own
            range, so the shape shows fit, not share. Lauric includes myristic and C8–C10;
            palmitic includes stearic.
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
