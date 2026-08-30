/** THE enum control: radios drawn as a segmented group — adjoining 40px cells, the
 * checked one filled with ink, the rest paper. Every mutually-exclusive pick in the app
 * is this one object; the quieter "text pick" skin it briefly also carried is gone, the
 * dial redesign having settled on one treatment for all of them. The input fills its
 * label invisibly, so the whole cell is the radio's own hit target and label-based
 * locators resolve to it.
 *
 * The naming contract lives here so call sites cannot disagree about it:
 * - No `name` on an option → the visible cell text IS the accessible name.
 * - A `name` on an option → it becomes the input's aria-label and the span is hidden
 *   from the accessibility tree. The cell text MUST then be contained in the name
 *   (Label-in-Name, WCAG 2.5.3) — a voice-control user clicks what they can read.
 *
 * TEST AUTHORS: target cells by accessible name (getByRole('radio', { name })), never by
 * the span's text — the invisible input overlays it, so a text-targeted click reports
 * "intercepts pointer events" and retries forever. Users are fine: any click in the cell
 * lands on the radio. */

type SegOption<V extends string> = {
  value: V;
  /** The visible cell text. */
  cell: string;
  /** Accessible name, when the cell abbreviates it. Must contain the cell text. */
  name?: string;
};

type SegRadioGroupProps<V extends string> = {
  /** The group's accessible name. */
  label: string;
  /** The radios' shared name attribute — must be unique per mounted group, or two
   * groups silently join and uncheck each other. */
  name: string;
  options: ReadonlyArray<SegOption<V>>;
  value: V;
  onChange: (value: V) => void;
  /** Keep the cells' own casing (chemical names like NaOH, units like cm) instead of the
   * seg uppercase. */
  preserveCase?: boolean;
};

export function SegRadioGroup<V extends string>({
  label,
  name,
  options,
  value,
  onChange,
  preserveCase = false,
}: SegRadioGroupProps<V>) {
  return (
    <div
      className={`seg${preserveCase ? ' seg--case' : ''}`}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option) => (
        <label key={option.value} className="seg__option">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            aria-label={option.name}
            onChange={() => onChange(option.value)}
          />
          <span aria-hidden={option.name ? true : undefined}>{option.cell}</span>
        </label>
      ))}
    </div>
  );
}
