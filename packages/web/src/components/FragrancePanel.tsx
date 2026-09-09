import { memo } from 'react';
import { ALLERGEN_LABEL_THRESHOLD_RINSE_OFF_PERCENT } from '@soap-calc/core';
import { additiveStageLabel } from '../lib/additiveStageLabel';
import { productNoun, type ComputedFragrance, type ComputedScentColor } from '../lib/computeScentColor';
import { formatGrams } from '../lib/format';
import { fragranceDoseLabel, labelAllergensDetail } from '../lib/recipeSummary';
import type { ProcessId } from '../lib/process';
import {
  MAX_SCENT_ROWS, newAllergenLine, newFragranceLine,
  type FragranceLine, type ScentColor,
} from '../lib/scentColor';
import { formatWeight, type WeightUnit } from '../lib/weightUnits';

type Props = {
  scent: ScentColor;
  computed: ComputedScentColor;
  process: ProcessId;
  weightUnit: WeightUnit;
  onChange: (next: ScentColor) => void;
};

/* Process copy. Bars: 2–6% of total oil weight, the recipes at 3–6% (CP:9612-9614, 16777),
   the supplier's tested rate as the ceiling (CP:9565-9605), the flashpoint no soaping limit
   (CP:9844-9860); HP adds it after the cook at room temperature, and a stabilizer can thicken
   the paste (HP:11024-11029); LS doses the finished solution at 0.5–3%, 3% at most, and proves
   a new fragrance in a small solution first — most cloud a little (LS:2950-2953, 16991-16998). */
const PROCESS_COPY: Record<ProcessId, string> = {
  cp: "Dose against total oil weight — bars usually carry 2–6%; your supplier's tested rate is the ceiling. The flashpoint is a shipping figure, not a soaping limit.",
  hp: 'Dose against total oil weight — bars usually carry 2–6%. Add it after the cook, at room temperature; a vanilla stabilizer goes into the measured fragrance first and can thicken the paste.',
  ls: 'Dose against the finished solution — usually 0.5–3%, 3% at most — and prove a new fragrance in a small test solution first; most cloud a little.',
};

/* EU labelling, checked 2026-09-08: Annex III of (EC) 1223/2009 names listed allergens above
   0.01% of a rinse-off product; Regulation (EU) 2023/1545 widens the list for products
   placed on the market from 31 July 2026 (sell-through to 31 July 2028). */
const REGULATORY_COPY =
  `EU labelling: a listed allergen above ${ALLERGEN_LABEL_THRESHOLD_RINSE_OFF_PERCENT}% of the finished soap must be named on the label — the wider list applies to products placed on the market from 31 July 2026. Your safety assessment (CPSR) needs the supplier's allergen declaration.`;

export const FragrancePanel = memo(function FragrancePanel({ scent, computed, process, weightUnit, onChange }: Props) {
  const setFragrance = (key: string, patch: Partial<FragranceLine>) =>
    onChange({ ...scent, fragrances: scent.fragrances.map((f) => (f.key === key ? { ...f, ...patch } : f)) });
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
            onClick={() => onChange({ ...scent, fragrances: [...scent.fragrances, newFragranceLine()] })}
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
                    <input
                      className="input"
                      aria-label="Essential oil name"
                      placeholder="e.g. Lavender"
                      value={f.name}
                      onChange={(e) => setFragrance(f.key, { name: e.target.value })}
                    />
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
                <label className="ledger__row additive-list__amount">
                  <span className="micro-label">Dose</span>
                  <span className="ledger__figure">
                    <input
                      type="number"
                      className="input figure-field"
                      min={0}
                      max={100}
                      step={0.1}
                      aria-label={`${rowName} ${doseLabel}`}
                      value={f.percent}
                      onChange={(e) => setFragrance(f.key, { percent: e.target.value })}
                    />
                    <span className="ledger__unit">{doseLabel}</span>
                  </span>
                </label>
                <label className="ledger__row additive-list__amount">
                  <span className="micro-label">Max in product</span>
                  <span className="ledger__figure">
                    <input
                      type="number"
                      className="input figure-field"
                      min={0}
                      max={100}
                      step={0.1}
                      aria-label={`${rowName} supplier max`}
                      value={f.supplierMaxPercent}
                      onChange={(e) => setFragrance(f.key, { supplierMaxPercent: e.target.value })}
                    />
                    <span className="ledger__unit">%</span>
                  </span>
                </label>
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
                <FragranceNotes c={c} noun={noun} unit={weightUnit} />
                <details className="scent-list__allergens">
                  <summary>Allergens ({f.allergens.length})</summary>
                  {f.allergens.map((a) => (
                    <div key={a.key} className="scent-list__allergen">
                      <input className="input" aria-label="Allergen name" placeholder="INCI name, as declared" value={a.name}
                        onChange={(e) => setFragrance(f.key, { allergens: f.allergens.map((x) => (x.key === a.key ? { ...x, name: e.target.value } : x)) })} />
                      <input className="input" inputMode="decimal" aria-label="Allergen % of fragrance" placeholder="% of fragrance" value={a.percentOfFragrance}
                        onChange={(e) => setFragrance(f.key, { allergens: f.allergens.map((x) => (x.key === a.key ? { ...x, percentOfFragrance: e.target.value } : x)) })} />
                      <button type="button" className="btn btn--icon" aria-label={`Remove allergen ${a.name || ''}`.trim()}
                        onClick={() => setFragrance(f.key, { allergens: f.allergens.filter((x) => x.key !== a.key) })}>×</button>
                    </div>
                  ))}
                  <button type="button" className="btn btn--ghost" disabled={f.allergens.length >= MAX_SCENT_ROWS} onClick={() => setFragrance(f.key, { allergens: [...f.allergens, newAllergenLine()] })}>+ Add allergen</button>
                </details>
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
              <strong>Name on the label:</strong> {labelAllergensDetail(computed.labelAllergens)} — of the {noun}.
            </li>
          )}
        </ul>
      )}

      <p className="results-hint">{REGULATORY_COPY}</p>
    </section>
  );
});

function FragranceNotes({ c, noun, unit }: { c: ComputedFragrance; noun: string; unit: WeightUnit }) {
  const notes: Array<{ text: string; hazard?: boolean }> = [];
  if (c.overSupplierMax) {
    notes.push({ hazard: true, text: `Over the supplier's rate: ${formatGrams(c.percent ?? 0, 2)}% → ${formatGrams(c.shareOfProduct, 1)}% of the ${noun}; supplier max ${formatGrams(c.supplierMaxPercent ?? 0, 2)}%.` });
  } else if (c.shareOfProduct > 0) {
    notes.push({ text: `${formatGrams(c.percent ?? 0, 2)}% → ${formatGrams(c.shareOfProduct, 1)}% of the ${noun}${c.supplierMaxPercent !== null ? `; supplier max ${formatGrams(c.supplierMaxPercent, 2)}%` : ''}.` });
  }
  if (c.browning !== 'none') {
    notes.push({
      text: `Browning: ${c.browning}.${c.stabilizerGrams > 0 ? ` Mix ${formatWeight(c.stabilizerGrams, unit)} vanilla stabilizer into the fragrance first.` : ''}`,
    });
  }
  if (c.caution) notes.push({ hazard: true, text: "Clove and cinnamon essential oils accelerate trace and can irritate — check the supplier's rate closely." });
  if (c.polysorbateGrams > 0) notes.push({ text: `Mix ${formatWeight(c.polysorbateGrams, unit)} polysorbate 20 into the fragrance so it stays emulsified over the superfat.` });
  if (notes.length === 0) return null;
  return (
    <ul className="additive-list__hazards">
      {notes.map((n, i) => <li key={i} className={n.hazard ? 'additive-list__hazard' : 'inline-note'}>{n.text}</li>)}
    </ul>
  );
}
