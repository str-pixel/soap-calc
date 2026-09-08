// packages/web/src/components/FragranceColorantsPanel.tsx
import { memo } from 'react';
import { ALLERGEN_LABEL_THRESHOLD_RINSE_OFF_PERCENT, type ColorantKind, type FragranceKind } from '@soap-calc/core';
import { additiveStageLabel } from '../lib/additiveStageLabel';
import { colorantDispersalText, colorantGuidanceText } from '../lib/colorantGuidance';
import type { ComputedFragrance, ComputedScentColor } from '../lib/computeScentColor';
import { formatGrams } from '../lib/format';
import { fragranceDoseLabel, labelAllergensDetail } from '../lib/recipeSummary';
import type { ProcessId } from '../lib/process';
import {
  MAX_SCENT_ROWS, newAllergenLine, newColorantLine, newFragranceLine, newPortion,
  type ColorantLine, type FragranceLine, type Portion, type ScentColor,
} from '../lib/scentColor';
import { formatWeight, type WeightUnit } from '../lib/weightUnits';
import { SegRadioGroup } from './SegRadioGroup';

type Props = {
  scent: ScentColor;
  computed: ComputedScentColor;
  process: ProcessId;
  weightUnit: WeightUnit;
  onChange: (next: ScentColor) => void;
};

const FRAGRANCE_KINDS: Array<{ value: FragranceKind; cell: string; name: string }> = [
  { value: 'fragrance-oil', cell: 'Fragrance oil', name: 'Fragrance oil' },
  { value: 'essential-oil', cell: 'Essential oil', name: 'Essential oil' },
];
const COLORANT_KINDS: Array<{ value: ColorantKind; cell: string; name: string }> = [
  { value: 'mica', cell: 'Mica', name: 'Mica' },
  { value: 'oxide', cell: 'Oxide', name: 'Oxide or ultramarine' },
  { value: 'natural', cell: 'Natural', name: 'Natural powder' },
  { value: 'dye', cell: 'Dye', name: 'Water-soluble dye' },
  { value: 'other', cell: 'Other', name: 'Other' },
];

/* Process copy. Bars: 2–6% of total oil weight, the recipes at 3–6% (CP:9612-9614, 16777),
   the supplier's tested rate as the ceiling (CP:9565-9605), the flashpoint no soaping limit
   (CP:9844-9860); HP adds it after the cook at room temperature, and a stabilizer can thicken
   the paste (HP:11024-11029); LS doses the finished solution at 0.5–3%, 3% at most, and proves
   a new fragrance in a small solution first — most cloud a little (LS:2950-2953, 16991-16998). */
const PROCESS_COPY: Record<ProcessId, string> = {
  cp: 'Dose against total oil weight — bars usually carry 2–6%; your supplier\'s tested rate is the ceiling. The flashpoint is a shipping figure, not a soaping limit.',
  hp: 'Dose against total oil weight — bars usually carry 2–6%. Add it after the cook, at room temperature; a vanilla stabilizer goes into the measured fragrance first and can thicken the paste.',
  ls: 'Dose against the finished solution — usually 0.5–3%, 3% at most — and prove a new fragrance in a small test solution first; most cloud a little.',
};

/* EU labelling, checked 2026-09-08: Annex III of (EC) 1223/2009 names listed allergens above
   0.01% of a rinse-off product; Regulation (EU) 2023/1545 widens the list for products
   placed on the market from 31 July 2026 (sell-through to 31 July 2028). */
const REGULATORY_COPY =
  `EU labelling: a listed allergen above ${ALLERGEN_LABEL_THRESHOLD_RINSE_OFF_PERCENT}% of the finished soap must be named on the label — the wider list applies to products placed on the market from 31 July 2026. Your safety assessment (CPSR) needs the supplier's allergen declaration.`;

const productNoun = (process: ProcessId, basis: ComputedScentColor['productBasis']) =>
  basis === 'batch' ? 'raw batch' : process === 'ls' ? 'finished solution' : 'finished bar';

export const FragranceColorantsPanel = memo(function FragranceColorantsPanel({ scent, computed, process, weightUnit, onChange }: Props) {
  const update = (patch: Partial<ScentColor>) => onChange({ ...scent, ...patch });
  const setFragrance = (key: string, patch: Partial<FragranceLine>) =>
    update({ fragrances: scent.fragrances.map((f) => (f.key === key ? { ...f, ...patch } : f)) });
  const setColorant = (key: string, patch: Partial<ColorantLine>) =>
    update({ colorants: scent.colorants.map((c) => (c.key === key ? { ...c, ...patch } : c)) });
  const setPortion = (key: string, patch: Partial<Portion>) =>
    update({ portions: scent.portions.map((p) => (p.key === key ? { ...p, ...patch } : p)) });
  const removePortion = (key: string) =>
    update({
      portions: scent.portions.filter((p) => p.key !== key),
      // Its colours go back to the whole batter rather than dangling.
      colorants: scent.colorants.map((c) => (c.portionKey === key ? { ...c, portionKey: '' } : c)),
    });
  const doseLabel = fragranceDoseLabel(process);
  const noun = productNoun(process, computed.productBasis);
  const byKey = <T extends { key: string }>(xs: T[]) => new Map(xs.map((x) => [x.key, x]));
  const cf = byKey(computed.fragrances);
  const cc = byKey(computed.colorants);

  return (
    <section className="panel">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">
            <span className="panel__num" aria-hidden="true">06</span>Fragrance &amp; colorants
          </h2>
          <p className="panel__subtitle">Scent, colour and what the label must say</p>
        </div>
        <div className="panel__actions">
          <button type="button" className="btn btn--ghost" disabled={scent.fragrances.length >= MAX_SCENT_ROWS} onClick={() => update({ fragrances: [...scent.fragrances, newFragranceLine()] })}>+ Add fragrance</button>
          <button type="button" className="btn btn--ghost" disabled={scent.colorants.length >= MAX_SCENT_ROWS} onClick={() => update({ colorants: [...scent.colorants, newColorantLine(process)] })}>+ Add colorant</button>
          {process !== 'ls' && (
            <button type="button" className="btn btn--ghost" disabled={scent.portions.length >= MAX_SCENT_ROWS} onClick={() => update({ portions: [...scent.portions, newPortion()] })}>Split the batter</button>
          )}
        </div>
      </div>

      <p className="results-hint">{PROCESS_COPY[process]}</p>

      {scent.fragrances.length > 0 && (
        <ul className="additive-list" aria-label="Fragrances">
          {scent.fragrances.map((f) => {
            const c = cf.get(f.key)!;
            const rowName = f.name.trim() || 'Fragrance';
            return (
              <li key={f.key} className="additive-list__row">
                <label className="field additive-list__custom-name">
                  <span className="sr-only">Name</span>
                  <input className="input" aria-label={`Fragrance name`} placeholder="Fragrance name" value={f.name} onChange={(e) => setFragrance(f.key, { name: e.target.value })} />
                </label>
                <button type="button" className="btn btn--icon" aria-label={`Remove ${rowName}`} onClick={() => update({ fragrances: scent.fragrances.filter((x) => x.key !== f.key) })}>×</button>
                <SegRadioGroup label={`Kind of ${rowName}`} name={`fragrance-kind-${f.key}`} options={FRAGRANCE_KINDS} value={f.kind} onChange={(kind) => setFragrance(f.key, { kind })} preserveCase />
                <label className="field"><span>{doseLabel}</span>
                  <input className="input" inputMode="decimal" aria-label={`${rowName} ${doseLabel}`} value={f.percent} onChange={(e) => setFragrance(f.key, { percent: e.target.value })} />
                </label>
                <label className="field"><span>Supplier max (% of finished product)</span>
                  <input className="input" inputMode="decimal" aria-label={`${rowName} supplier max`} value={f.supplierMaxPercent} onChange={(e) => setFragrance(f.key, { supplierMaxPercent: e.target.value })} />
                </label>
                <label className="field"><span>Vanillin %</span>
                  <input className="input" inputMode="decimal" aria-label={`${rowName} vanillin`} value={f.vanillinPercent} onChange={(e) => setFragrance(f.key, { vanillinPercent: e.target.value })} />
                </label>
                <div className="additive-list__grams">{c.grams > 0 ? formatWeight(c.grams, weightUnit) : '—'}</div>
                <div className="additive-list__stage-fixed">{additiveStageLabel(c.stage, process)}</div>
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

      {scent.portions.length > 0 && process !== 'ls' && (
        <ul className="additive-list" aria-label="Batter portions">
          {scent.portions.map((p) => (
            <li key={p.key} className="additive-list__row">
              <input className="input" aria-label="Portion name" placeholder="Portion name" value={p.name} onChange={(e) => setPortion(p.key, { name: e.target.value })} />
              <label className="field"><span>% of batter</span>
                <input className="input" inputMode="decimal" aria-label={`Portion ${p.name || ''} % of batter`.replace(/\s+/g, ' ')} value={p.percent} onChange={(e) => setPortion(p.key, { percent: e.target.value })} />
              </label>
              <button type="button" className="btn btn--icon" aria-label={`Remove portion ${p.name || ''}`.trim()} onClick={() => removePortion(p.key)}>×</button>
            </li>
          ))}
          <li className="additive-list__foot">
            Portions total {formatGrams(computed.portionsTotalPercent, 1)}%
            {computed.portionsOver100 && <strong> — over 100%: the portions cannot add up to more than the batter.</strong>}
          </li>
        </ul>
      )}

      {scent.colorants.length > 0 && (
        <ul className="additive-list" aria-label="Colorants">
          {scent.colorants.map((col) => {
            const c = cc.get(col.key)!;
            const rowName = col.name.trim() || 'Colorant';
            const guidance = process === 'ls' ? null : colorantGuidanceText(col.kind, weightUnit);
            return (
              <li key={col.key} className="additive-list__row">
                <input className="input" aria-label="Colorant name" placeholder="Colorant name" value={col.name} onChange={(e) => setColorant(col.key, { name: e.target.value })} />
                <button type="button" className="btn btn--icon" aria-label={`Remove ${rowName}`} onClick={() => update({ colorants: scent.colorants.filter((x) => x.key !== col.key) })}>×</button>
                <SegRadioGroup label={`Kind of ${rowName}`} name={`colorant-kind-${col.key}`} options={COLORANT_KINDS} value={col.kind} onChange={(kind) => setColorant(col.key, { kind })} preserveCase />
                <label className="field"><span>% of oils</span>
                  <input className="input" inputMode="decimal" aria-label={`${rowName} % of oils`} placeholder="to shade" value={col.percent} onChange={(e) => setColorant(col.key, { percent: e.target.value })} />
                </label>
                {process !== 'ls' && (
                  <label className="field"><span>Portion</span>
                    <select className="input" aria-label={`${rowName} portion`} value={col.portionKey} onChange={(e) => setColorant(col.key, { portionKey: e.target.value })}>
                      <option value="">Whole batter</option>
                      {scent.portions.map((p) => <option key={p.key} value={p.key}>{p.name.trim() || 'Portion'}</option>)}
                    </select>
                  </label>
                )}
                <div className="additive-list__grams">{c.grams !== null ? formatWeight(c.grams, weightUnit) : c.portionShareMissing ? 'enter the portion\'s share' : 'to shade'}</div>
                <div className="additive-list__stage-fixed">{additiveStageLabel(c.stage, process)}</div>
                <p className="inline-note additive-list__hint">
                  {guidance && <>{guidance} </>}
                  {colorantDispersalText(c.dispersal, weightUnit)}.
                  {c.kind !== 'dye' && process === 'ls' && ' Micas and oxides settle in a liquid — shake before use.'}
                </p>
              </li>
            );
          })}
          {computed.carrierOilGrams > 0 && (
            <li className="inline-note">
              The carrier oil is unsaponified oil riding on the recipe: {formatWeight(computed.carrierOilGrams, weightUnit)} adds about {formatGrams(computed.carrierSuperfatShiftPercent, 1)} superfat points.
            </li>
          )}
        </ul>
      )}

      {scent.fragrances.length === 0 && scent.colorants.length === 0 && (
        <p className="results-hint">No fragrance or colour yet. Clays, charcoal, cocoa, botanicals and titanium dioxide are dosed under Additives.</p>
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
  if (c.caution) notes.push({ hazard: true, text: 'Clove and cinnamon essential oils accelerate trace and can irritate — check the supplier\'s rate closely.' });
  if (c.polysorbateGrams > 0) notes.push({ text: `Mix ${formatWeight(c.polysorbateGrams, unit)} polysorbate 20 into the fragrance so it stays emulsified over the superfat.` });
  if (notes.length === 0) return null;
  return (
    <ul className="additive-list__hazards">
      {notes.map((n, i) => <li key={i} className={n.hazard ? 'additive-list__hazard' : 'inline-note'}>{n.text}</li>)}
    </ul>
  );
}

