import { memo } from 'react';
import {
  ALLERGEN_LABEL_THRESHOLD_RINSE_OFF_PERCENT,
  ESSENTIAL_OIL_CATALOG,
  essentialOilEntryById,
  formatCeilingPercent,
} from '@soap-calc/core';
import { additiveStageLabel } from '../lib/additiveStageLabel';
import { productNoun, type ComputedFragrance, type ComputedScentColor } from '../lib/computeScentColor';
import { formatGrams } from '../lib/format';
import { fragranceDoseLabel, labelAllergensDetail } from '../lib/recipeSummary';
import type { ProcessId } from '../lib/process';
import {
  MAX_SCENT_ROWS, newFragranceLine,
  type FragranceLine, type ScentColor,
} from '../lib/scentColor';
import { formatWeight, type WeightUnit } from '../lib/weightUnits';
import { withNewRow } from '../lib/rowOrder';

type Props = {
  scent: ScentColor;
  computed: ComputedScentColor;
  process: ProcessId;
  weightUnit: WeightUnit;
  onChange: (next: ScentColor) => void;
};

/* Process copy. Bars: 2–6% of total oil weight, the recipes at 3–6% (CP:9612-9614, 16777);
   the text says usage rates differ by oil and to check each (CP:9547-9552), and the app now
   carries that per oil — each listed oil's ceiling in soap is the catalog's (core
   essential-oil-catalog.ts: IFRA's standards and annex, EU Annex III, the SCCS) — the
   flashpoint no soaping limit (CP:9844-9860); HP adds it after the cook at room temperature, and a stabilizer can thicken
   the paste (HP:11024-11029); LS doses the finished solution at 0.5–3%, 3% at most, and proves
   a new fragrance in a small solution first — most cloud a little (LS:2950-2953, 16991-16998). */
const PROCESS_COPY: Record<ProcessId, string> = {
  cp: "Dose against total oil weight — bars usually carry 2–6%. Every oil in the list comes with its own ceiling for soap, IFRA's or EU law's where that binds first, and the row warns when a dose is over it. The flashpoint is a shipping figure, not a soaping limit.",
  hp: 'Dose against total oil weight — bars usually carry 2–6%, and every oil in the list comes with its own ceiling for soap; the row warns when a dose is over it. Add it after the cook, at room temperature; a vanilla stabilizer goes into the measured fragrance first and can thicken the paste.',
  ls: 'Dose against the finished solution — usually 0.5–3%, 3% at most. Every oil in the list comes with its own ceiling, and the row warns when a dose is over it; prove a new fragrance in a small test solution first, most cloud a little.',
};

/** The books' usual range, in the basis the maker types in — the fallback where an oil has
 * no ceiling, and the line past which the row warns (core USUAL_DOSE_MAX_PERCENT). */
function usualRangeCopy(process: ProcessId): string {
  return process === 'ls'
    ? 'liquid soap usually carries 0.5–3% of the finished solution, 3% at most'
    : 'bars usually carry 2–6% of oil weight';
}

/** The same range as the thing a dose is past. */
function usualRangePast(process: ProcessId): string {
  return process === 'ls'
    ? 'the 3% of the finished solution liquid soap carries at most'
    : 'the 2–6% of oil weight bars usually carry';
}

/* EU labelling, checked 2026-09-08: Annex III of (EC) 1223/2009 names listed allergens above
   0.01% of a rinse-off product; Regulation (EU) 2023/1545 widens the list for products
   placed on the market from 31 July 2026 (sell-through to 31 July 2028). */
const REGULATORY_COPY =
  `EU labelling: a listed allergen above ${ALLERGEN_LABEL_THRESHOLD_RINSE_OFF_PERCENT}% of the finished soap must be named on the label — the wider list applies to products placed on the market from 31 July 2026. Your safety assessment (CPSR) needs the supplier's allergen declaration.`;

export const FragrancePanel = memo(function FragrancePanel({ scent, computed, process, weightUnit, onChange }: Props) {
  const setFragrance = (key: string, patch: Partial<FragranceLine>) =>
    onChange({ ...scent, fragrances: scent.fragrances.map((f) => (f.key === key ? { ...f, ...patch } : f)) });
  /** Picking an oil settles its name; what it carries and what it may be dosed at come off
   * the catalog at compute time, so nothing has to be copied into the row. Custom… hands the
   * name back and leaves the rest alone. */
  const pickCatalog = (key: string, catalogId: string) => {
    const entry = essentialOilEntryById(catalogId);
    setFragrance(key, entry ? { catalogId: entry.id, name: entry.name } : { catalogId: '' });
  };
  const doseLabel = fragranceDoseLabel(process);
  const noun = productNoun(process, computed.productBasis);

  return (
    <section className="panel">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">
            <span className="panel__num" aria-hidden="true">06</span>Essential oils
          </h2>
          <p className="panel__subtitle">Scent, and what the label must say</p>
        </div>
        <div className="panel__actions">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={scent.fragrances.length >= MAX_SCENT_ROWS}
            onClick={() => onChange({ ...scent, fragrances: withNewRow(scent.fragrances, newFragranceLine()) })}
          >
            + Add essential oil
          </button>
        </div>
      </div>

      <p className="results-hint">{PROCESS_COPY[process]}</p>

      {scent.fragrances.length === 0 ? (
        <p className="results-hint">
          No scent yet. This section holds essential oils: a fragrance oil is a supplier's own
          blend, so its dose limit and its allergens come from the declaration that ships with it
          rather than from anything this app can work out.
        </p>
      ) : (
        <ul className="additive-list" aria-label="Fragrances">
          {scent.fragrances.map((f, i) => {
            const c = computed.fragrances[i];
            const rowName = f.name.trim() || 'Essential oil';
            return (
              <li key={f.key} className="additive-list__row">
                {/* Same shape as an additive row: the name and its × on one line, then
                    labelled ledger rows down a shared label column. */}
                <div className="additive-list__choice">
                  <span className="micro-label">Essential oil</span>
                  <div className="additive-list__names">
                    <select
                      className="input"
                      aria-label={`Essential oil for ${rowName}`}
                      value={f.catalogId}
                      onChange={(e) => pickCatalog(f.key, e.target.value)}
                    >
                      <option value="">Custom…</option>
                      {ESSENTIAL_OIL_CATALOG.map((entry) => (
                        <option key={entry.id} value={entry.id}>{entry.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn--icon"
                      aria-label={`Remove ${rowName}`}
                      onClick={() => onChange({ ...scent, fragrances: scent.fragrances.filter((x) => x.key !== f.key) })}
                    >
                      ×
                    </button>
                  </div>
                </div>
                {/* A pick settles the name; only an oil the maker names themselves needs
                    the field, exactly as a custom colour does. */}
                {f.catalogId === '' && (
                  <label className="ledger__row">
                    <span className="micro-label">Name</span>
                    <input
                      className="input"
                      aria-label="Essential oil name"
                      placeholder="e.g. Lavender"
                      value={f.name}
                      onChange={(e) => setFragrance(f.key, { name: e.target.value })}
                    />
                  </label>
                )}
                <label className="ledger__row additive-list__amount">
                  <span className="micro-label">Dose</span>
                  <span className="ledger__figure">
                    <input
                      type="number"
                      className="input figure-field"
                      min={0}
                      max={100}
                      step={0.1}
                      aria-label={`${rowName} dose, ${doseLabel}`}
                      value={f.percent}
                      onChange={(e) => setFragrance(f.key, { percent: e.target.value })}
                    />
                    <span className="ledger__unit">{doseLabel}</span>
                  </span>
                </label>
                {/* Vanillin is what browns a bar, and it comes from vanilla-bearing
                    fragrance material — no essential oil in the catalog carries any. So the
                    field is offered for an oil the maker named themselves (a vanilla
                    absolute, a benzoin), and for a saved row that already has a figure,
                    rather than sitting empty on every lavender. */}
                {(f.catalogId === '' || f.vanillinPercent !== '') && (
                <label className="ledger__row additive-list__amount">
                  <span className="micro-label">Vanillin</span>
                  <span className="ledger__figure">
                    <input
                      type="number"
                      className="input figure-field"
                      min={0}
                      max={100}
                      step={0.1}
                      aria-label={`${rowName} vanillin`}
                      value={f.vanillinPercent}
                      onChange={(e) => setFragrance(f.key, { vanillinPercent: e.target.value })}
                    />
                    <span className="ledger__unit">%</span>
                  </span>
                </label>
                )}
                <div className="additive-list__choice">
                  <span className="micro-label">Add at</span>
                  <p className="additive-list__stage-fixed">{additiveStageLabel(c.stage, process)}</p>
                </div>
                <div className="additive-list__foot">
                  <span className="micro-label">Adds</span>
                  <div className="additive-list__grams" aria-live="polite">
                    {c.grams > 0 ? formatWeight(c.grams, weightUnit) : '—'}
                  </div>
                </div>
                <FragranceNotes c={c} noun={noun} unit={weightUnit} doseLabel={doseLabel} usualPast={usualRangePast(process)} />
                {/* One warning and one safe-use line, in place of a list to fill in. What
                    the oil carries comes off the catalog; what it may be dosed at is the
                    catalog's ceiling — a standard's own figure, or a constituent's limit
                    turned into a share of the finished soap — with the sentence behind it.
                    The ceiling is also turned back into the basis the maker types in, for
                    this recipe, so nothing is left to convert by hand. */}
                {c.allergenNames.length > 0 && (
                  <p className="inline-note scent-list__warning" aria-label={`${rowName} allergens`}>
                    <strong>Allergens.</strong> This oil carries {c.allergenNames.join(', ')} — expect to name
                    them on the label, and confirm each against your supplier&apos;s allergen declaration.
                  </p>
                )}
                <p className="inline-note" aria-label={`${rowName} safe use`}>
                  <strong>Safe use.</strong>{' '}
                  {f.catalogId === '' ? (
                    <>
                      No ceiling is known for an oil the app does not list — your supplier&apos;s IFRA certificate
                      gives one for soap (Category 9). Until then, {usualRangeCopy(process)}.
                    </>
                  ) : c.safeMaxPercentOfProduct === null ? (
                    <>
                      IFRA sets no ceiling for this oil in soap and EU law names no limit on it — {usualRangeCopy(process)}.
                      {c.shareOfProduct > 0 && <> This dose is {formatGrams(c.shareOfProduct, 1)}% of the {noun}.</>}
                    </>
                  ) : c.ceilingAboveUsualRange ? (
                    <>
                      No ceiling bites below the usual range: this oil&apos;s works out at{' '}
                      {formatCeilingPercent(c.safeMaxPercentOfProduct)}% of the {noun} ({c.ceilingWhy}), and{' '}
                      {usualRangeCopy(process)}.
                      {c.shareOfProduct > 0 && <> This dose is {formatGrams(c.shareOfProduct, 1)}%.</>}
                    </>
                  ) : (
                    <>
                      Up to <strong>{formatCeilingPercent(c.safeMaxPercentOfProduct)}% of the {noun}</strong>
                      {c.safeMaxPercentOfBasis !== null && <> (about {formatGrams(c.safeMaxPercentOfBasis, 1)}{doseLabel} in this recipe)</>}
                      {' — '}{c.ceilingWhy}.
                      {c.shareOfProduct > 0 && (
                        <> This dose is {formatGrams(c.shareOfProduct, 1)}%{c.overSafeMax ? <strong> — over it.</strong> : '.'}</>
                      )}
                    </>
                  )}
                </p>
              </li>
            );
          })}
          <li className="additive-list__foot">
            Blend: {formatGrams(computed.fragrances.reduce((s, f) => s + (f.percent ?? 0), 0), 2)}{doseLabel} · {formatWeight(computed.fragranceGrams, weightUnit)}
            {computed.stabilizerGrams > 0 && <> · vanilla stabilizer {formatWeight(computed.stabilizerGrams, weightUnit)}</>}
            {computed.polysorbateGrams > 0 && <> · polysorbate 20 {formatWeight(computed.polysorbateGrams, weightUnit)}</>}
          </li>
          {computed.labelAllergens.length > 0 && (
            <li className="inline-note">
              <strong>Expect to name on the label:</strong> {labelAllergensDetail(computed.labelAllergens)} — confirm each against the supplier&apos;s declaration.
            </li>
          )}
        </ul>
      )}

      <p className="results-hint">{REGULATORY_COPY}</p>
    </section>
  );
});

function FragranceNotes({ c, noun, unit, doseLabel, usualPast }: {
  c: ComputedFragrance; noun: string; unit: WeightUnit; doseLabel: string; usualPast: string;
}) {
  const notes: Array<{ text: string; hazard?: boolean }> = [];
  // The same grams in both bases, each named: the dose is typed against the oils, every
  // ceiling is a share of the finished soap, and the bar is heavier than its oils.
  if (c.shareOfProduct > 0) {
    notes.push({ text: `${formatGrams(c.percent ?? 0, 2)}${doseLabel} = ${formatGrams(c.shareOfProduct, 1)}% of the ${noun}.` });
  }
  if (c.overUsualRange) {
    notes.push({ hazard: true, text: `${formatGrams(c.percent ?? 0, 2)}${doseLabel} is past ${usualPast} — no book or standard stands behind more.` });
  }
  if (c.browning !== 'none') {
    notes.push({
      text: `Browning: ${c.browning}.${c.stabilizerGrams > 0 ? ` Mix ${formatWeight(c.stabilizerGrams, unit)} vanilla stabilizer into the fragrance first.` : ''}`,
    });
  }
  if (c.caution) notes.push({ hazard: true, text: 'Clove and cinnamon essential oils accelerate trace and can irritate — keep under the ceiling in Safe use.' });
  if (c.polysorbateGrams > 0) notes.push({ text: `Mix ${formatWeight(c.polysorbateGrams, unit)} polysorbate 20 into the fragrance so it stays emulsified over the superfat.` });
  if (notes.length === 0) return null;
  return (
    <ul className="additive-list__hazards">
      {notes.map((n, i) => <li key={i} className={n.hazard ? 'additive-list__hazard' : 'inline-note'}>{n.text}</li>)}
    </ul>
  );
}
