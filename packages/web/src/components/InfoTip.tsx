import { useId, type ReactNode } from 'react';

type InfoTipProps = {
  /** The term being explained, used for the accessible label. */
  term: string;
  /** The definition shown in the tooltip. */
  children: ReactNode;
};

/**
 * A small, optional "?" affordance that reveals a plain-language definition on
 * hover or keyboard focus. Unobtrusive by design: it adds depth for beginners
 * without cluttering the reading of a fluent user.
 */
export function InfoTip({ term, children }: InfoTipProps) {
  const id = useId();
  return (
    <span className="infotip">
      <button
        type="button"
        className="infotip__trigger"
        aria-label={`About ${term}`}
        aria-describedby={id}
        // Prevent an enclosing <label> from redirecting the click to its input.
        onClick={(e) => e.preventDefault()}
      >
        ?
      </button>
      <span role="tooltip" id={id} className="infotip__bubble">
        {children}
      </span>
    </span>
  );
}
