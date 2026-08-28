import type { InputHTMLAttributes, ReactNode } from 'react';

/** One ledger row: visible label left, an underline figure right, the unit OUTSIDE the
 * rule (it names the figure, it is not part of it). The whole row is the input's label,
 * so with no explicit aria-label the visible text IS the accessible name; pass one in
 * `input` only when the name must carry more than the row shows (an InfoTip's prose kept
 * out of it, or the "Label (unit)" convention the tests key on). Edit them together. */
export function LedgerRow({
  label,
  unit,
  note,
  emphasis = false,
  input,
}: {
  label: ReactNode;
  /** Unit suffix outside the rule; omitted for unitless counts. */
  unit?: string;
  /** An aside stacked under the figure, inside the row it annotates — as a ledger
   * sibling it would paint below the row's own hairline. */
  note?: ReactNode;
  /** The panel's key figure (Settings' Total oil) gets the louder rule. */
  emphasis?: boolean;
  input: InputHTMLAttributes<HTMLInputElement>;
}) {
  const figure = (
    <span className="ledger__figure">
      <input
        type="number"
        className={`input figure-field${emphasis ? ' figure-field--key' : ''}`}
        {...input}
      />
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
