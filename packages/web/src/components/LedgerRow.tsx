import type { InputHTMLAttributes, ReactNode } from 'react';

/** One ledger row: visible label left, the figure's dial slab filling the row's control
 * column, with the unit INSIDE the slab — figure and unit are one instrument, read
 * together. The whole row is the input's label, so with no explicit aria-label the
 * visible text IS the accessible name; pass one in `input` only when the name must carry
 * more than the row shows (an InfoTip's prose kept out of it, or the "Label (unit)"
 * convention the tests key on). Edit them together.
 *
 * Every dial is ONE size — no emphasised variant. The panel's key figure earns its rank
 * from where it sits, not from a half-step of type. */
export function LedgerRow({
  label,
  unit,
  note,
  input,
}: {
  label: ReactNode;
  /** Unit suffix inside the slab; omitted for unitless counts. */
  unit?: string;
  /** An aside stacked under the figure, inside the row it annotates — as a ledger
   * sibling it would read as a caption for whatever row follows. */
  note?: ReactNode;
  input: InputHTMLAttributes<HTMLInputElement>;
}) {
  const figure = (
    <span className="ledger__figure">
      <input type="number" className="input figure-field" {...input} />
      {unit && <span className="ledger__unit">{unit}</span>}
    </span>
  );
  return (
    <label className="ledger__row">
      <span className="ledger__label">{label}</span>
      {note ? (
        <span className="ledger__figure ledger__figure--stacked">
          {figure}
          <span className="ledger__note">{note}</span>
        </span>
      ) : (
        figure
      )}
    </label>
  );
}
