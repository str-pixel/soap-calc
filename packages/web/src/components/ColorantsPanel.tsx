import { memo } from 'react';
import {
  colorantEntryById,
  colorantsByFamily,
  NATURAL_COLORANT_CAUTION,
  type ColorantKind,
} from '@soap-calc/core';
import { additiveStageLabel } from '../lib/additiveStageLabel';
import {
  colorantDispersalText,
  colorantGuidanceText,
  percentValue,
  colorantShadeLadder,
  colorantStabilityText,
} from '../lib/colorantGuidance';
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

const COLORANT_GROUPS = colorantsByFamily();

const KIND_LABELS: Record<ColorantKind, string> = {
  mica: 'Mica',
  oxide: 'Oxide or ultramarine',
  natural: 'Natural powder',
  dye: 'Water-soluble dye',
  other: 'Other',
};

/* What the kind decides, said where it is chosen — the additive panel's stage seg explains
   its selected cell the same way. The only thing the kind changes is the dose guidance, so
   "Other" is the honest escape hatch: outside these four families this app has no sourced
   rate to offer. */
const KIND_NOTE: Record<ColorantKind, string> = {
  mica: 'Shimmer pigment. What was used to dye it decides whether it survives soap, so buy one labelled for cold process.',
  oxide: 'Opaque mineral pigment — the oxides and the ultramarines. Steadfast, and it will not bleed across a swirl.',
  natural: 'A plant, clay or mineral powder. Rates vary widely by material, and many plant colours fade.',
  dye: 'Water-soluble colour. Vivid, but it creeps across a layer line and gives up its colour in daylight.',
  other: 'Anything outside those four — glitter, a lake pigment, a coated neon. No dose range comes with it: this app has no sourced rate for them.',
};

const COLORANT_KINDS: Array<{ value: ColorantKind; cell: string; name: string }> = [
  { value: 'mica', cell: 'Mica', name: 'Mica' },
  { value: 'oxide', cell: 'Oxide', name: 'Oxide or ultramarine' },
  { value: 'natural', cell: 'Natural', name: 'Natural powder' },
  { value: 'dye', cell: 'Dye', name: 'Water-soluble dye' },
  { value: 'other', cell: 'Other', name: 'Other' },
];

/* Process copy. The cold-process source's rule of thumb is that the colour belongs to the
   bar and not to the wash — overdose it and the pigment migrates into the lather, staining
   tub, towels and skin (CP:9376-9388). A whole-batter colour goes into the oils and a portion
   colour in at trace (CP:9396-9404), each powder dispersed 1:1 in a light carrier oil rather
   than water or glycerin, which the source prefers because it does not raise the risk of
   gelling or glycerin sweating (CP:9395-9400).

   HP sends a single colour straight into the oils, where the immersion blender can work it
   through (HP:11331-11338). Its solvent list is a CHOICE — oil, glycerin, water, yogurt,
   milk — with hot sugar water the author's own preference, oil "an excellent option" often
   combined with the post-cook superfat, and glycerin the one it advises against
   (HP:11296-11312); the sugar's own benefit is lather (HP:11308-11310). Quantities at
   HP:11320-11329.

   LS colours the diluted soap (LS:13253-13262) and steers to water-soluble colorants because
   pigments and coarse particles sediment (LS:13307-13310, LS:13380-13390). The oils are a
   colorant in their own right there: hemp green, red palm a range from bright golden orange
   to deep red, sea buckthorn deep yellow, pumpkin seed brown (LS:13234-13251).

   Reworded, not quoted. */
const PROCESS_COPY: Record<ProcessId, string> = {
  cp: 'Aim the colour at the bar, not at the wash: overdo it and the pigment travels into the lather and marks the tub, the towels and your skin. One colour for the whole batch goes in with the oils; to colour parts of it, split the batter first and add them at trace. Work each powder into an equal weight of light carrier oil — that oil rides on the recipe as extra superfat.',
  hp: 'One colour for the whole batch goes in with the oils, where the blender can work it through evenly. To colour parts of the batch, split the batter and colour each part after the cook. The solvent is yours to pick: hot sugar water is a common choice and the sugar buys a little extra lather, while oil serves just as well and many makers disperse the colour into the post-cook superfat and add the two together. Glycerin is the one to leave out here.',
  ls: 'Colour goes in after the dilution, and a water-soluble dye is the one to reach for. Pigments and anything coarse sink to the bottom of the bottle instead — some makers just shake it before use, but it is a hard sell on a shelf in clear plastic. The oils colour the soap too: hemp reads green, red palm anywhere from bright orange to deep red, pumpkin seed brown, so a recipe can arrive coloured before you add a thing.',
};

export const ColorantsPanel = memo(function ColorantsPanel({ scent, computed, process, weightUnit, onChange }: Props) {
  const setColorant = (key: string, patch: Partial<ColorantLine>) =>
    onChange({ ...scent, colorants: scent.colorants.map((c) => (c.key === key ? { ...c, ...patch } : c)) });
  const setPortion = (key: string, patch: Partial<Portion>) =>
    onChange({ ...scent, portions: scent.portions.map((p) => (p.key === key ? { ...p, ...patch } : p)) });
  /** Picking a catalog entry adopts its name and kind, and seeds the LOW end of its own
   * sourced band as the dose — the gentlest figure the source gives, freely editable. An
   * empty field left the maker with a range they could not act on; the smallest dose is
   * both the safe default and the one every source says to start from. A colour with no
   * defensible rate (indigo, alkanet) still starts empty, because there is nothing to seed.
   * Custom… hands the name, the kind and the dose back. */
  const pickCatalog = (key: string, catalogId: string) => {
    const entry = catalogId ? colorantEntryById(catalogId) : undefined;
    if (!entry) {
      setColorant(key, { catalogId: '', percent: '' });
      return;
    }
    setColorant(key, {
      catalogId,
      name: entry.name,
      kind: entry.kind,
      percent: entry.tspPerLbLow !== null ? percentValue(entry.tspPerLbLow) : '',
    });
  };
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
                <div className="additive-list__choice">
                  <span className="micro-label">Portion</span>
                  <div className="additive-list__names">
                    <input
                      className="input"
                      aria-label="Portion name"
                      placeholder="e.g. Swirl, Top layer"
                      value={p.name}
                      onChange={(e) => setPortion(p.key, { name: e.target.value })}
                    />
                    <button type="button" className="btn btn--icon" aria-label={`Remove portion ${portionName}`} onClick={() => removePortion(p.key)}>×</button>
                  </div>
                </div>
                <label className="ledger__row additive-list__amount">
                  <span className="micro-label">Share</span>
                  <span className="ledger__figure">
                    <input
                      type="number"
                      className="input figure-field"
                      min={0}
                      /* No max: a share over 100% is a state the section deliberately keeps,
                         shows and flags (portionsOver100). Clamping it here would hide the
                         mistake the footer exists to point out. */
                      step={0.1}
                      aria-label={`Portion ${portionName} share`}
                      value={p.percent}
                      onChange={(e) => setPortion(p.key, { percent: e.target.value })}
                    />
                    <span className="ledger__unit">% of batter</span>
                  </span>
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
          No colour yet. Pick one from the list, or name your own. Clays, charcoal and cocoa are
          dosed under Additives instead when they are there for slip or scrub rather than colour.
        </p>
      ) : (
        <ul className="additive-list" aria-label="Colorants">
          {scent.colorants.map((col, i) => {
            const c = computed.colorants[i];
            const entry = col.catalogId ? colorantEntryById(col.catalogId) : undefined;
            const rowName = col.name.trim() || 'Colorant';
            const guidance = process === 'ls' ? null : colorantGuidanceText(col.kind, weightUnit, col.catalogId);
            const ladder = process === 'ls' ? null : colorantShadeLadder(col.catalogId, weightUnit);
            const stability = colorantStabilityText(col.catalogId);
            return (
              <li key={col.key} className="additive-list__row">
                {/* Same shape as an additive row: the pick and its × on one line, then
                    labelled ledger rows down a shared label column. */}
                <div className="additive-list__choice">
                  <span className="micro-label">Colorant</span>
                  <div className="additive-list__names">
                    <select
                      className="input"
                      aria-label={`Colorant for ${rowName}`}
                      value={col.catalogId}
                      onChange={(e) => pickCatalog(col.key, e.target.value)}
                    >
                      <option value="">Custom…</option>
                      {COLORANT_GROUPS.map((g) => (
                        <optgroup key={g.family} label={g.label}>
                          {g.entries.map((item) => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn--icon"
                      aria-label={`Remove ${rowName}`}
                      onClick={() => onChange({ ...scent, colorants: scent.colorants.filter((x) => x.key !== col.key) })}
                    >
                      ×
                    </button>
                  </div>
                </div>
                {!entry && (
                  <label className="ledger__row">
                    <span className="micro-label">Name</span>
                    <input
                      className="input"
                      aria-label="Colorant name"
                      placeholder="e.g. Ultramarine blue"
                      value={col.name}
                      onChange={(e) => setColorant(col.key, { name: e.target.value })}
                    />
                  </label>
                )}
                <div className="additive-list__choice">
                  <span className="micro-label">Kind</span>
                  {/* A catalog pick states its kind; only a custom colour has a choice. */}
                  {entry ? (
                    <p className="additive-list__stage-fixed">{KIND_LABELS[col.kind]}</p>
                  ) : (
                    <>
                      <SegRadioGroup
                        label={`Kind of ${rowName}`}
                        name={`colorant-kind-${col.key}`}
                        options={COLORANT_KINDS}
                        value={col.kind}
                        onChange={(kind) => setColorant(col.key, { kind })}
                        preserveCase
                      />
                      {/* Same weight as the other hints in the row: this explains the
                          control above it, so it must not read louder than the guidance
                          under it. */}
                      <p className="inline-note additive-list__hint">{KIND_NOTE[col.kind]}</p>
                    </>
                  )}
                </div>
                <label className="ledger__row additive-list__amount">
                  <span className="micro-label">Dose</span>
                  <span className="ledger__figure">
                    <input
                      type="number"
                      className="input figure-field"
                      min={0}
                      max={100}
                      step={0.01}
                      /* No placeholder: the unit is a visible suffix inside the slab, and a
                         word long enough to say "to shade" ran straight into it. The Adds
                         row below says "to shade" instead, where there is room for it. */
                      aria-label={`${rowName} dose, % of oils`}
                      value={col.percent}
                      onChange={(e) => setColorant(col.key, { percent: e.target.value })}
                    />
                    <span className="ledger__unit">% of oils</span>
                  </span>
                </label>
                {/* A portion picker with nothing to pick is not a control: it appears once
                    the batter has actually been split. */}
                {process !== 'ls' && scent.portions.length > 0 && (
                  <label className="ledger__row">
                    <span className="micro-label">Portion</span>
                    <select
                      className="input"
                      aria-label={`${rowName} portion`}
                      value={col.portionKey}
                      onChange={(e) => setColorant(col.key, { portionKey: e.target.value })}
                    >
                      <option value="">Whole batter</option>
                      {scent.portions.map((p) => (
                        <option key={p.key} value={p.key}>{p.name.trim() || 'Portion'}</option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="additive-list__choice">
                  <span className="micro-label">Add at</span>
                  <p className="additive-list__stage-fixed">{additiveStageLabel(c.stage, process)}</p>
                </div>
                <div className="additive-list__foot">
                  <span className="micro-label">Adds</span>
                  <div className="additive-list__grams" aria-live="polite">
                    {c.grams !== null
                      ? formatWeight(c.grams, weightUnit)
                      : c.portionShareMissing
                        ? "enter the portion's share"
                        : 'to shade'}
                  </div>
                </div>
                <p className="inline-note additive-list__hint">
                  {/* The ladder carries the dose AND what it buys, so the plain band would
                      only repeat it more vaguely. One or the other, never both. */}
                  {!ladder && guidance && <>{guidance} </>}
                  {colorantDispersalText(c.dispersal, weightUnit)}.
                  {c.kind !== 'dye' && process === 'ls' && ' Micas and oxides settle in a liquid — shake before use.'}
                </p>
                {ladder && (
                  <p className="inline-note additive-list__hint">
                    <strong>How dark it goes.</strong> {ladder} Weigh a spoonful once to fix your own percent, and start low.
                  </p>
                )}
                {stability && (
                  <p className="inline-note additive-list__hint">
                    <strong>Over time.</strong> {stability}
                  </p>
                )}
                {entry?.note && <p className="inline-note additive-list__hint">{entry.note}</p>}
                {entry?.alsoAdditiveId && (
                  <p className="inline-note additive-list__hint">
                    Also covered under Additives — dose it there instead when it is going in for slip, scrub or absorbency rather than for colour.
                  </p>
                )}
              </li>
            );
          })}
          {scent.colorants.some((c) => colorantEntryById(c.catalogId)?.kind === 'natural') && (
            <li className="inline-note">{NATURAL_COLORANT_CAUTION}</li>
          )}
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
