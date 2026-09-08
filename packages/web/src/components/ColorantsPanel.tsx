import { memo } from 'react';
import type { ColorantKind } from '@soap-calc/core';
import { additiveStageLabel } from '../lib/additiveStageLabel';
import { colorantDispersalText, colorantGuidanceText } from '../lib/colorantGuidance';
import type { ComputedScentColor } from '../lib/computeScentColor';
import { formatGrams } from '../lib/format';
import type { ProcessId } from '../lib/process';
import {
  MAX_SCENT_ROWS, newColorantLine, newPortion,
  type ColorantLine, type Portion, type ScentColor,
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

const COLORANT_KINDS: Array<{ value: ColorantKind; cell: string; name: string }> = [
  { value: 'mica', cell: 'Mica', name: 'Mica' },
  { value: 'oxide', cell: 'Oxide', name: 'Oxide or ultramarine' },
  { value: 'natural', cell: 'Natural', name: 'Natural powder' },
  { value: 'dye', cell: 'Dye', name: 'Water-soluble dye' },
  { value: 'other', cell: 'Other', name: 'Other' },
];

/* Process copy. CP colours the soap, not the lather (CP:9376-9379); a whole-batter colour
   goes into the oils and a portion colour in at trace (CP:9401-9404), each powder dispersed
   1:1 in a light carrier oil rather than water or glycerin (CP:9395-9400). HP sends a single
   colour straight into the oils (HP:11330-11334) and colours portions after the cook, each in
   a little hot sugar water (HP:11319-11321). LS colours the diluted soap (LS:13256, 13262);
   micas and oxides settle out of a liquid (LS:13390). */
const PROCESS_COPY: Record<ProcessId, string> = {
  cp: 'Colour the soap, not the lather. One colour for the whole batch goes in with the oils; split the batter first to colour parts of it at trace. Disperse each powder 1:1 in a light carrier oil — that oil rides on the recipe as extra superfat.',
  hp: 'One colour for the whole batch goes in with the oils. To colour parts of the batch, split the batter and add each colour after the cook, dispersed in a little hot sugar water.',
  ls: 'Colour goes in after the dilution. A water-soluble dye stays in solution; micas and oxides settle out and need shaking before use.',
};

export const ColorantsPanel = memo(function ColorantsPanel({ scent, computed, process, weightUnit, onChange }: Props) {
  const setColorant = (key: string, patch: Partial<ColorantLine>) =>
    onChange({ ...scent, colorants: scent.colorants.map((c) => (c.key === key ? { ...c, ...patch } : c)) });
  const setPortion = (key: string, patch: Partial<Portion>) =>
    onChange({ ...scent, portions: scent.portions.map((p) => (p.key === key ? { ...p, ...patch } : p)) });
  const removePortion = (key: string) =>
    onChange({
      ...scent,
      portions: scent.portions.filter((p) => p.key !== key),
      // Its colours go back to the whole batter rather than dangling.
      colorants: scent.colorants.map((c) => (c.portionKey === key ? { ...c, portionKey: '' } : c)),
    });

  return (
    <section className="panel">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">
            <span className="panel__num" aria-hidden="true">07</span>Colorants
          </h2>
          <p className="panel__subtitle">Colour, and how each one is dispersed</p>
        </div>
        <div className="panel__actions">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={scent.colorants.length >= MAX_SCENT_ROWS}
            onClick={() => onChange({ ...scent, colorants: [...scent.colorants, newColorantLine(process)] })}
          >
            + Add colorant
          </button>
          {process !== 'ls' && (
            <button
              type="button"
              className="btn btn--ghost"
              disabled={scent.portions.length >= MAX_SCENT_ROWS}
              onClick={() => onChange({ ...scent, portions: [...scent.portions, newPortion()] })}
            >
              Split the batter
            </button>
          )}
        </div>
      </div>

      <p className="results-hint">{PROCESS_COPY[process]}</p>

      {scent.portions.length > 0 && process !== 'ls' && (
        <ul className="additive-list" aria-label="Batter portions">
          {scent.portions.map((p) => {
            const portionName = p.name.trim() || 'Portion';
            return (
              <li key={p.key} className="additive-list__row">
                <div className="additive-list__names">
                  <label className="field">
                    <span>Portion name</span>
                    <input
                      className="input"
                      aria-label="Portion name"
                      placeholder="e.g. Swirl, Top layer"
                      value={p.name}
                      onChange={(e) => setPortion(p.key, { name: e.target.value })}
                    />
                  </label>
                  <button type="button" className="btn btn--icon" aria-label={`Remove portion ${portionName}`} onClick={() => removePortion(p.key)}>×</button>
                </div>
                <label className="field"><span>% of batter</span>
                  <input className="input" inputMode="decimal" aria-label={`Portion ${portionName} % of batter`} value={p.percent} onChange={(e) => setPortion(p.key, { percent: e.target.value })} />
                </label>
              </li>
            );
          })}
          <li className="additive-list__foot">
            Portions total {formatGrams(computed.portionsTotalPercent, 1)}%
            {computed.portionsOver100 && <strong> — over 100%: the portions cannot add up to more than the batter.</strong>}
          </li>
        </ul>
      )}

      {scent.colorants.length === 0 ? (
        <p className="results-hint">
          No colour yet. Clays, charcoal, cocoa, botanicals and titanium dioxide are dosed under Additives instead.
        </p>
      ) : (
        <ul className="additive-list" aria-label="Colorants">
          {scent.colorants.map((col, i) => {
            const c = computed.colorants[i];
            const rowName = col.name.trim() || 'Colorant';
            const guidance = process === 'ls' ? null : colorantGuidanceText(col.kind, weightUnit);
            return (
              <li key={col.key} className="additive-list__row">
                <div className="additive-list__names">
                  <label className="field">
                    <span>Colorant name</span>
                    <input
                      className="input"
                      aria-label="Colorant name"
                      placeholder="e.g. Ultramarine blue"
                      value={col.name}
                      onChange={(e) => setColorant(col.key, { name: e.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn--icon"
                    aria-label={`Remove ${rowName}`}
                    onClick={() => onChange({ ...scent, colorants: scent.colorants.filter((x) => x.key !== col.key) })}
                  >
                    ×
                  </button>
                </div>
                <SegRadioGroup
                  label={`Kind of ${rowName}`}
                  name={`colorant-kind-${col.key}`}
                  options={COLORANT_KINDS}
                  value={col.kind}
                  onChange={(kind) => setColorant(col.key, { kind })}
                  preserveCase
                />
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
                <div className="additive-list__grams">
                  {c.grams !== null ? formatWeight(c.grams, weightUnit) : c.portionShareMissing ? "enter the portion's share" : 'to shade'}
                </div>
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
    </section>
  );
});
