import { useState } from 'react';
import type { GelMode } from '@soap-calc/core';
import { ppoOzToPercentOfOil, tspToPercentOfOil } from '../lib/doseConverters';

type CpExtrasPanelProps = {
  /** Current recipe's total oil weight in grams, for the tsp→% converter. */
  totalOilGrams: number;
  gelMode: GelMode;
  onGelModeChange: (mode: GelMode) => void;
};

function formatPercent(value: number | null): string {
  if (value === null) return '—';
  return `${value.toFixed(2)}%`;
}

export function CpExtrasPanel({ totalOilGrams, gelMode, onGelModeChange }: CpExtrasPanelProps) {
  const [tsp, setTsp] = useState('');
  const [ppoOz, setPpoOz] = useState('');

  const tspPercent = tsp === '' ? null : tspToPercentOfOil(Number(tsp), totalOilGrams);
  const ppoPercent = ppoOz === '' ? null : ppoOzToPercentOfOil(Number(ppoOz));

  return (
    <section className="panel panel--nested">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">CP extras</h2>
          <p className="panel__subtitle">Dose converters and a few cold-process notes</p>
        </div>
      </div>

      <label className="field">
        <span>Gel phase</span>
        <select
          className="input"
          value={gelMode}
          onChange={(e) => onGelModeChange(e.target.value as GelMode)}
          aria-label="Gel phase"
        >
          <option value="none">None (prevented — e.g. refrigerated)</option>
          <option value="natural">Natural (uninsulated loaf)</option>
          <option value="forced">Forced (insulated / CPOP)</option>
        </select>
      </label>
      <p className="results-hint">
        Gel doesn&rsquo;t change safety, but it changes how fast the bar firms and unmolds —
        forcing it reaches the fast, same-day end; preventing it runs slower.
      </p>

      <label className="field">
        <span>Teaspoons of additive (whole recipe)</span>
        <input
          type="number"
          className="input input--number"
          min={0}
          step={0.25}
          value={tsp}
          onChange={(e) => setTsp(e.target.value)}
          aria-label="Teaspoons of additive"
        />
      </label>
      <p className="results-hint">{formatPercent(tspPercent)} of total oil weight</p>

      <label className="field">
        <span>PPO (oz per lb of oils)</span>
        <input
          type="number"
          className="input input--number"
          min={0}
          step={0.05}
          value={ppoOz}
          onChange={(e) => setPpoOz(e.target.value)}
          aria-label="PPO ounces per pound of oils"
        />
      </label>
      <p className="results-hint">{formatPercent(ppoPercent)} of total oil weight</p>

      <p className="results-hint">
        Vanillin/vanilla darkens soap to tan/brown over weeks — expected, not a defect.
      </p>
      <p className="results-hint">
        For shelf life, antioxidants like Vitamin E, ROE, or 1% BHT + 1% sodium citrate slow
        rancidity/DOS.
      </p>
      <ul className="message-list message-list--insights">
        <li className="message-list__item--info">
          Myth: a correctly-cured bar has no free lye left — it&rsquo;s all saponified.
        </li>
        <li className="message-list__item--info">
          Myth: gel is just cosmetic — it changes look and how fast the bar firms, not safety.
        </li>
      </ul>
    </section>
  );
}
