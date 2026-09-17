import { memo, useState } from 'react';
import {
  FATTY_ACID_DISPLAY_GROUPS,
  FATTY_ACID_RANCIDITY_INSIGHT_CODES,
  FORMULATION_FATTY_ACID_GUIDE,
  formatPropertyRangePercent,
  formatPropertyScore,
  formatPropertyScoreRange,
  formatSoapPropertyPercent,
  isLowCoverage,
  saturatedUnsaturatedRatio,
  sumFattyAcids,
  type FormulationInsight,
} from '@soap-calc/core';
import type { RecipeFattyAcids } from '../lib/calculateFattyAcids';
import type { ProcessId } from '../lib/process';
import { trackPct as pct, valueAnchorClass } from '../lib/meterGeometry';
import { makeTabsKeyDownHandler } from '../lib/tabsKeyboard';
import { fattyAcidBasisCaption, missingOilsSuffix } from '../lib/coverageCaption';
import { oilDisplayName } from '../lib/oilDisplay';
import { FattyAcidRadar, type FattyAcidRadarAxis } from './FattyAcidRadar';
import { ModeledOilsNote } from './ModeledOilsNote';

type FattyAcidPanelProps = {
  result: RecipeFattyAcids;
  /** The recipe's formulation insights. Only the rancidity ones are shown here, inline above
   *  the chart: the same objects Formulation notes renders, so the two cannot disagree.
   *  Required, because a warning must not be omittable into silence. Pass [] when none. */
  insights: FormulationInsight[];
  /** Rancidity insight codes the lower bound is holding back — core's
   *  `withheldRancidityInsightCodes`, which answers this by running the rules rather than by
   *  inspecting coverage. Required, so a panel that forgot to pass it cannot silently claim
   *  nothing is hidden. Pass [] when nothing is. */
  withheldRancidity: readonly string[];
  /**
   * Which process the recipe is for. Liquid soap gets the SAME readings with no typical ranges:
   * the bands here describe bar soap, and the source that supplies them puts words rather than
   * numbers on its liquid-soap qualities — which is why panel 08 shows none for LS either.
   * Measured against that source's own seven liquid-soap recipes, the bar bands misdescribe it:
   * palmitic+stearic runs 10–17% against a band of 20–30, and ricinoleic 0–27 against 4–7.
   * No substitute exists to swap in — industrial potassium-soap patents do publish ranges, but
   * for a different product class (lauric+myristic 70–95%), further from artisan practice than
   * the bar bands are.
   */
  process: ProcessId;
};

/** "Beeswax", "Beeswax and Pine Tar" — named as the OBJECT of the sentence, with no verb, so the
 *  wording around it does not have to agree with a number that varies by recipe. */
function listOils(ids: readonly string[]): string {
  const names = ids.map(oilDisplayName);
  if (names.length === 0) return 'the oils without fatty-acid data';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

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
// axes: they are ~0% in ordinary oils and hold the acids no named group covers, so they
// say little about a blend's shape. They print under the chart instead, so the view hides
// nothing.
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
export const FattyAcidPanel = memo(function FattyAcidPanel({ result, insights, withheldRancidity, process }: FattyAcidPanelProps) {
  const [view, setView] = useState<'meters' | 'radar'>('meters');
  const viewActiveIndex = FATTY_VIEWS.indexOf(view);
  const handleViewKeyDown = makeTabsKeyDownHandler(FATTY_VIEWS, viewActiveIndex, setView);
  // Compare the rounded coverage so the shown "X%" and the estimate treatment never disagree.
  const lowCoverage = result.profile
    ? isLowCoverage(result.coveragePercent)
    : false;

  if (!result.profile) {
    return (
      <section className="panel">
        <h2 className="panel__title"><span className="panel__num" aria-hidden="true">09</span>Fatty acid profile</h2>
        <p className="results-hint">
          Add triglyceride oils with fatty-acid data to see recipe totals
          {missingOilsSuffix(result.missingOilIds)}.
        </p>
      </section>
    );
  }

  // Liquid soap shows the readings and no bands. Dropping the bands drops the radar with them:
  // that chart is band-FITTED (each axis maps its own typical range onto the ring), so without
  // ranges it has no geometry left to draw. Meters only, exactly as 08 does for this process.
  const showRanges = process !== 'ls';
  const { saturated, unsaturated } = saturatedUnsaturatedRatio(result.profile);

  // ONE derivation for both views (a review finding): the meters and the radar must state
  // the same readings, so the values and bands are computed once and each view only decides
  // how much geometry accompanies them. No reading is flagged, in either view: the bands are
  // descriptive (FORMULATION_FATTY_ACID_GUIDE says why), and rancidity is judged by the
  // formulation insights shown above the chart.
  const groups = FATTY_ACID_DISPLAY_GROUPS.map(({ key, acids }) => {
    const guide = FORMULATION_FATTY_ACID_GUIDE[key];
    const value = sumFattyAcids(result.profile!, acids);
    return { key, guide, value };
  });
  type Group = (typeof groups)[number];
  const byKey = new Map(groups.map((g) => [g.key, g] as const));
  const drawn = RADAR_AXES.map((a) => byKey.get(a.key)!);
  const others = groups.filter((g) => !RADAR_AXES.some((a) => a.key === g.key));
  const axes: FattyAcidRadarAxis[] = RADAR_AXES.map((a) => {
    const g = byKey.get(a.key)!;
    return {
      key: g.key,
      label: a.label,
      value: g.value,
      low: g.guide.low,
      high: g.guide.high,
    };
  });

  // The same accessible reading in both views — a role="meter" value plus its typical range —
  // so switching views can never change what is claimed.
  const value = (g: Group, onTrack = false) => (
    <span
      className={`property-meters__value${onTrack ? valueAnchorClass(pct(g.value)) : ''}`}
      style={onTrack ? { left: `${pct(g.value)}%` } : undefined}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={SCALE_MAX}
      aria-valuenow={Math.round(g.value * 10) / 10}
      aria-label={`${g.guide.label}: ${lowCoverage ? 'estimated ' : ''}${formatSoapPropertyPercent(g.value)}`}
    >
      {lowCoverage ? '~' : ''}
      {formatSoapPropertyPercent(g.value)}
    </span>
  );
  const typical = (g: Group) => (
    <p className="sr-only">Typical {formatPropertyRangePercent(g.guide.low, g.guide.high)}</p>
  );

  // The Saturated/Unsaturated line is an estimate exactly when the meters are: "~" on screen,
  // "estimated" to a screen reader, as each meter's aria-label says.
  const estimate = lowCoverage ? (
    <>
      <span aria-hidden="true">~</span>
      <span className="sr-only">estimated </span>
    </>
  ) : null;

  // Whether a note is actually being held back, answered by core running the rules twice rather
  // than guessed from "is any weight unprofiled?". That guess was wrong roughly five times in six:
  // swept over the catalog at a 10% superfat it fired on all 9,702 recipe states while a note was
  // genuinely withheld in 1,505, because most partly-uncharacterized recipes are nowhere near a
  // rancidity threshold to begin with.
  const holdingBack = withheldRancidity.length > 0;
  const rancidity = insights.filter((insight) =>
    (FATTY_ACID_RANCIDITY_INSIGHT_CODES as readonly string[]).includes(insight.code),
  );

  return (
    <section className="panel">
      {/* The toggle rides the head, per the mock — a compact cell pair beside the title,
          not a control block between the caption and the readings. Same tablist idiom as
          the properties panel's Meters/Radar switch, with its own ids and an accessible
          name that keeps the two switches on this page apart — every page-level
          locator must scope through the tablist name, never the bare tab. Where the title
          and the switch do not fit side by side, the switch wraps under the title instead of
          squeezing it onto two or three lines (panel__head--wrap). */}
      <div className="panel__head panel__head--wrap">
        <h2 className="panel__title"><span className="panel__num" aria-hidden="true">09</span>Fatty acid profile</h2>
        {showRanges && (
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
        )}
      </div>
      {/* One sentence, per the mock — the coverage clause joins the caption instead of
          standing as a second line under it. */}
      <p className="panel__subtitle">{fattyAcidBasisCaption(result)}.</p>
      {/* Its own line, not a third clause on the subtitle: that sentence already carries the
          basis and the coverage, and appending this buried both in a five-line paragraph. Panel
          08 splits the same two thoughts the same way for this process. */}
      {!showRanges && (
        <p className="properties-coverage">
          No typical ranges are shown: the usual ones describe bar soap, which is formulated
          differently.
        </p>
      )}

      {/* These readings ARE the reconstruction, so the modeled marker belongs here most of
          all — not only on the properties derived from them. */}
      <ModeledOilsNote oilIds={result.modeledOilIds} />

      {/* The recipe's rancidity notes, here where the fatty acids are and not only in
          Formulation notes, which was never on screen while this panel was at any of five
          measured widths. These are the insight objects themselves, so this list and
          Formulation notes cannot disagree. The risk depends on superfat and antioxidants
          this panel does not see, which is why it is not judged from the readings below.
          Outside the tabpanel, so both views show it. */}
      {(rancidity.length > 0 || holdingBack) && (
        <ul className="message-list message-list--insights fatty-rancidity" aria-label="Rancidity notes">
          {rancidity.map((insight) => (
            <li
              key={insight.code}
              className={
                insight.level === 'warning' ? 'message-list__item--warn' : 'message-list__item--info'
              }
            >
              {insight.message}
            </li>
          ))}
          {/* Only when a note genuinely is being held back — so this says what happened, not
              what might have. Naming the oils makes it actionable: the reader knows which
              ingredient to look up. The withheld note's own wording stays unsaid, because the
              risk it asserts is exactly what the data cannot support. */}
          {holdingBack && (
            <li className="message-list__item--info">
              A rancidity note is held back here: counting {listOils(result.missingOilIds)} as
              carrying no polyunsaturates puts this recipe under the level that raises one. The
              missing fatty acids could put it over.
            </li>
          )}
        </ul>
      )}

      {/* Neither view holds focusable children, so the tabpanel itself stays reachable
          (tabIndex 0) per the ARIA Tabs pattern. Both views render the SAME readings with
          the same role="meter" values and typical ranges — the toggle changes how much
          geometry accompanies them, never what is claimed. */}
      <div
        role="tabpanel"
        id="fatty-tabpanel"
        aria-labelledby={`fatty-tab-${view}`}
        tabIndex={0}
      >
      {view === 'meters' || !showRanges ? (
        <>
        {/* The properties panel's row idiom: the name on the label row, the value
           riding its dot on a 0–100% track with the typical band shaded, the band's
           bounds numbered under it. No LOW / HIGH words on this track — it is percent of
           oil weight, and the subtitle says so — which leaves the row's left edge free
           for the many bands here that start at 0. A band too narrow for two numbers
           prints one, "0–2", growing rightward from its left edge. */}
        <ul className="property-meters" aria-label="Recipe fatty acid groups">
          {groups.map((g) => (
            <li key={g.key} className="property-meters__row">
              <div className="property-meters__label">
                <span>{g.guide.label}</span>
              </div>
              <div className="property-meters__plot">
                {value(g, true)}
                <div className="property-meter" aria-hidden="true">
                  {showRanges && (
                    <span
                      className="property-meter__band property-meter__band--suggested"
                      style={{
                        left: `${pct(g.guide.low)}%`,
                        width: `${pct(g.guide.high) - pct(g.guide.low)}%`,
                      }}
                    />
                  )}
                  <span
                    className="property-meter__marker"
                    style={{ left: `${pct(g.value)}%` }}
                  />
                </div>
                {showRanges && (
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
                )}
              </div>
              {showRanges && typical(g)}
            </li>
          ))}
        </ul>
        {/* The shading needs naming here as much as it does in the properties panel; this
            view was the only one of the four carrying a band nothing explained. One swatch,
            because this panel has a typical range and no target band to claim. */}
        {showRanges && (
          <p className="property-legend">
            <span className="property-legend__item">
              <span className="property-legend__swatch property-legend__swatch--suggested" />
              Typical range
            </span>
          </p>
        )}
        </>
      ) : (
        <>
          <FattyAcidRadar axes={axes} lowCoverage={lowCoverage} />
          {/* The chart is aria-hidden; keep the six drawn readings reachable to AT so the
              toggle never hides a number from a screen reader. */}
          <ul className="sr-only" aria-label="Recipe fatty acid groups">
            {drawn.map((g) => (
              <li key={g.key}>
                {value(g)}
                {typical(g)}
              </li>
            ))}
          </ul>
          {/* The catch-alls, in the open: name, value and typical range, the three things
              each axis above prints. */}
          <ul className="fatty-radar__others" aria-label="Other fatty acid groups">
            {others.map((g) => (
              <li key={g.key} className="fatty-radar__other">
                <span className="fatty-radar__other-name">{g.guide.label}</span>
                {value(g)}
                <span className="fatty-radar__other-range">
                  Typical {formatPropertyRangePercent(g.guide.low, g.guide.high)}
                </span>
              </li>
            ))}
          </ul>
          <p className="fatty-radar__caption">
            Shaded ring = each group&apos;s typical range. Every axis is scaled to its own
            range, so the shape shows fit, not share, and a reading off the ring is not
            flagged. A rancidity note appears above the chart when the oils charted here put
            the recipe at risk of going rancid, a risk that also depends on superfat and
            antioxidants. Oils without fatty-acid data count as carrying none. Lauric includes
            myristic and C8–C10; palmitic includes stearic.
          </p>
        </>
      )}
      </div>

      <p className="fatty-ratio">
        Saturated {estimate}
        {formatSoapPropertyPercent(saturated)} · Unsaturated {estimate}
        {formatSoapPropertyPercent(unsaturated)}
      </p>
    </section>
  );
});
