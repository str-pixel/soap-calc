import { useState } from 'react';
import { ppoOzToPercentOfOil, tspToPercentOfOil } from '../lib/doseConverters';
import { LedgerRow } from './LedgerRow';

// The gel-phase control moved to the Soaping temperature panel, where it sits beside the
// gel PREDICTION and the two inputs (temperature, water) that actually decide gel.
type CpExtrasPanelProps = {
  /** Current recipe's total oil weight in grams, for the tsp→% converter. */
  totalOilGrams: number;
};

function formatPercent(value: number | null): string {
  if (value === null) return '—';
  return `${value.toFixed(2)}%`;
}

export function CpExtrasPanel({ totalOilGrams }: CpExtrasPanelProps) {
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

      {/* Both converters are numerics, so they take the dial slab like every other figure
          in the app — they were the last bordered number boxes left. */}
      <div className="ledger">
        <LedgerRow
          label="Teaspoons of additive (whole recipe)"
          unit="tsp"
          input={{
            'aria-label': 'Teaspoons of additive',
            min: 0,
            step: 0.25,
            value: tsp,
            onChange: (e) => setTsp(e.target.value),
          }}
          note={`${formatPercent(tspPercent)} of total oil weight`}
        />
        <LedgerRow
          label="PPO (oz per lb of oils)"
          unit="oz"
          input={{
            'aria-label': 'PPO ounces per pound of oils',
            min: 0,
            step: 0.05,
            value: ppoOz,
            onChange: (e) => setPpoOz(e.target.value),
          }}
          note={`${formatPercent(ppoPercent)} of total oil weight`}
        />
      </div>

      <p className="results-hint">
        Vanillin/vanilla darkens soap to tan/brown over weeks — expected, not a defect.
      </p>
      <p className="results-hint">
        {/* Vitamin E is deliberately absent: the same DOS experiment this branch sources
            elsewhere (SCI:3234) found it "showed no prophylactic effect" when used alone —
            recommending it here would contradict that finding. ROE and the BHT + sodium
            citrate pair are the tested effective options; keep them. */}
        For shelf life, antioxidants like ROE or 0.1% BHT + 0.1% sodium citrate slow
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
