import { memo } from 'react';
import {
  ALLERGEN_LABEL_THRESHOLD_RINSE_OFF_PERCENT,
  ceilingDigits,
  ESSENTIAL_OIL_CATALOG,
  essentialOilEntryById,
  essentialOilStartingDose,
  formatPercentToward,
  formatShareAgainstCeiling,
  usualDoseClause,
  usualDosePastClause,
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

/* Process copy. The usual range is core's (USUAL_DOSE_RANGE_PERCENT: the cold-process
   recipes run 3–6% of total oil weight, CP:16761, 17084, 17556, 17667, 17670; LS 0.5–3% of
   the solution, 3% at most, LS:13214-13215), spliced in so the number and the words cannot
   drift. The text says usage rates differ by oil and to follow the supplier's tested rate
   (CP:9547-9552, 9565-9600) and to dose on total oil weight (CP:9612-9620); the app carries
   the per-oil part itself — each listed oil's ceiling in soap is the catalog's (core
   essential-oil-catalog.ts: IFRA's standards and annex, EU Annex III, the SCCS) — and the
   row says when none is on record. The flashpoint is no soaping limit (CP:9844-9860); HP
   adds the scent after the cook at room temperature, and a stabilizer can thicken the paste
   (HP:11024-11029); LS proves a new fragrance in a small solution first — almost all cloud
   (LS:16991-16998). */
const PROCESS_COPY: Record<ProcessId, string> = {
  cp: `Dose against total oil weight — ${usualDoseClause('cp')}. Each listed oil's row says what ceiling soap sets for it, IFRA's or EU law's, or that none does, and warns when a dose is over it. The flashpoint is a shipping figure, not a soaping limit.`,
  hp: `Dose against total oil weight — ${usualDoseClause('hp')}; each listed oil's row says what ceiling soap sets for it, or that none does. Add it after the cook, at room temperature; a vanilla stabilizer goes into the measured fragrance first and can thicken the paste.`,
  ls: `Dose against the finished solution — ${usualDoseClause('ls')}. Each listed oil's row says what ceiling applies, or that none does; prove a new fragrance in a small test solution first, most cloud a little.`,
};

/* EU labelling, checked 2026-09-08: Annex III of (EC) 1223/2009 names listed allergens above
   0.01% of a rinse-off product; Regulation (EU) 2023/1545 widens the list for products
   placed on the market from 31 July 2026 (sell-through to 31 July 2028). */
const REGULATORY_COPY =
  `EU labelling: a listed allergen above ${ALLERGEN_LABEL_THRESHOLD_RINSE_OFF_PERCENT}% of the finished soap must be named on the label — the wider list applies to products placed on the market from 31 July 2026. Your safety assessment (CPSR) needs the supplier's allergen declaration.`;

export const FragrancePanel = memo(function FragrancePanel({ scent, computed, process, weightUnit, onChange }: Props) {
  const setFragrance = (key: string, patch: Partial<FragranceLine>) =>
    onChange({ ...scent, fragrances: scent.fragrances.map((f) => (f.key === key ? { ...f, ...patch } : f)) });
  /** Picking an oil settles its name and, if the dose is still empty, starts it at the
   * oil's own starting dose (core essentialOilStartingDose) — a typed dose is the maker's
   * and is left alone. What the oil carries and what it may be dosed at come off the
   * catalog at compute time, so nothing else has to be copied into the row. Custom… hands
   * the name back and leaves the rest alone. */
  const pickCatalog = (key: string, catalogId: string) => {
    const entry = essentialOilEntryById(catalogId);
    if (!entry) { setFragrance(key, { catalogId: '' }); return; }
    const row = scent.fragrances.find((f) => f.key === key);
    const seed = row && row.percent.trim() === '' ? { percent: String(essentialOilStartingDose(entry, process).percent) } : {};
    setFragrance(key, { catalogId: entry.id, name: entry.name, ...seed });
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
            const figures = rowFigures(c);
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
                <FragranceNotes c={c} noun={noun} unit={weightUnit} doseLabel={doseLabel} process={process} shareText={figures.share} />
                {/* One warning and one safe-use line, in place of a list to fill in. What
                    the oil carries comes off the catalog; what it may be dosed at is the
                    catalog's ceiling — a standard's own figure, or a constituent's limit
                    turned into a share of the finished soap — with the sentence behind it,
                    and the same ceiling turned back into the basis the maker types in, for
                    this recipe. A row with nothing on it yet has nothing to say. */}
                {c.allergenNames.length > 0 && (
                  <p className="inline-note scent-list__warning" aria-label={`${rowName} allergens`}>
                    <strong>Allergens.</strong> This oil carries {c.allergenNames.join(', ')} — expect to name
                    them on the label, and confirm each against your supplier&apos;s allergen declaration.
                  </p>
                )}
                {(f.catalogId !== '' || f.name.trim() !== '' || c.typedPercent !== null) && (
                  <p className="inline-note" aria-label={`${rowName} safe use`}>
                    <strong>Safe use.</strong>{' '}
                    <SafeUse f={f} c={c} process={process} noun={noun} doseLabel={doseLabel} figures={figures} />
                  </p>
                )}
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

/**
 * The row's figures, printed once and shared by the share line and the safe-use line so
 * the two can never disagree: beside a ceiling they are rounded toward the verdict (core
 * formatShareAgainstCeiling); with none, the share is simply the nearest tenth.
 */
function rowFigures(c: ComputedFragrance): { share: string | null; ceiling: string | null; basis: string | null } {
  if (!c.ceiling) return { share: c.shareOfProduct > 0 ? formatGrams(c.shareOfProduct, 1) : null, ceiling: null, basis: null };
  const d = ceilingDigits(c.ceiling.percentOfProduct);
  const printed = c.shareOfProduct > 0 ? formatShareAgainstCeiling(c.shareOfProduct, c.ceiling.percentOfProduct, c.overSafeMax) : null;
  return {
    share: printed?.share ?? null,
    ceiling: printed?.ceiling ?? formatPercentToward(c.ceiling.percentOfProduct, d, 'down'),
    // Rounded down, so typing the printed figure never lands over the ceiling.
    basis: c.ceilingPercentOfBasis !== null ? formatPercentToward(c.ceilingPercentOfBasis, d, 'down') : null,
  };
}

/** The one dose sentence, with its basis named and the verdict on the end. */
function DoseSentence({ c, noun, share }: { c: ComputedFragrance; noun: string; share: string | null }) {
  if (share === null) return null;
  return <> This dose is {share}% of the {noun}{c.overSafeMax ? <strong> — over it.</strong> : '.'}</>;
}

/** Where the dose starts for a listed oil, and why — the figure the pick fills in. */
function StartSentence({ f, process, doseLabel }: { f: FragranceLine; process: ProcessId; doseLabel: string }) {
  const entry = essentialOilEntryById(f.catalogId);
  if (!entry) return null;
  const start = essentialOilStartingDose(entry, process);
  return <> Start at <strong>{formatGrams(start.percent, 2)}{doseLabel}</strong> — {start.why}.</>;
}

function SafeUse({ f, c, process, noun, doseLabel, figures }: {
  f: FragranceLine; c: ComputedFragrance; process: ProcessId; noun: string; doseLabel: string;
  figures: ReturnType<typeof rowFigures>;
}) {
  const dose = <DoseSentence c={c} noun={noun} share={figures.share} />;
  const start = <StartSentence f={f} process={process} doseLabel={doseLabel} />;
  if (f.catalogId === '') {
    return (
      <>
        No ceiling is known for an oil the app does not list — your supplier&apos;s IFRA certificate gives one for
        soap (Category 9). Until then, {usualDoseClause(process)}.{dose}
      </>
    );
  }
  if (!c.ceiling) {
    return (
      <>
        No ceiling applies: none of this oil&apos;s restricted constituents comes near its limit in soap, and no
        standard names the oil itself — {usualDoseClause(process)}.{start}{dose}
      </>
    );
  }
  if (c.ceilingAboveUsualRange) {
    return (
      <>
        No ceiling bites below the usual range: this oil&apos;s works out at {figures.ceiling}% of the {noun}{' '}
        ({c.ceiling.why}), and {usualDoseClause(process)}.{start}{dose}
      </>
    );
  }
  return (
    <>
      Up to <strong>{figures.ceiling}% of the {noun}</strong>
      {figures.basis !== null && <> (about {figures.basis}{doseLabel} in this recipe)</>}
      {' — '}{c.ceiling.why}.{start}{dose}
    </>
  );
}

function FragranceNotes({ c, noun, unit, doseLabel, process, shareText }: {
  c: ComputedFragrance; noun: string; unit: WeightUnit; doseLabel: string; process: ProcessId; shareText: string | null;
}) {
  const notes: Array<{ text: string; hazard?: boolean }> = [];
  const typed = formatGrams(c.typedPercent ?? c.percent ?? 0, 2);
  // The same grams in both bases, each named: the dose is typed against the oils, every
  // ceiling is a share of the finished soap, and the bar is heavier than its oils.
  if (shareText !== null) notes.push({ text: `${typed}${doseLabel} = ${shareText}% of the ${noun}.` });
  if (c.overUsualRange) {
    notes.push({ hazard: true, text: `${typed}${doseLabel} is past ${usualDosePastClause(process)} — no book or standard stands behind more.` });
  }
  if (c.browning !== 'none') {
    notes.push({
      text: `Browning: ${c.browning}.${c.stabilizerGrams > 0 ? ` Mix ${formatWeight(c.stabilizerGrams, unit)} vanilla stabilizer into the fragrance first.` : ''}`,
    });
  }
  if (c.caution) notes.push({ hazard: true, text: 'Clove and cinnamon essential oils accelerate trace and can irritate — keep the dose low.' });
  if (c.polysorbateGrams > 0) notes.push({ text: `Mix ${formatWeight(c.polysorbateGrams, unit)} polysorbate 20 into the fragrance so it stays emulsified over the superfat.` });
  if (notes.length === 0) return null;
  return (
    <ul className="additive-list__hazards">
      {notes.map((n, i) => <li key={i} className={n.hazard ? 'additive-list__hazard' : 'inline-note'}>{n.text}</li>)}
    </ul>
  );
}
