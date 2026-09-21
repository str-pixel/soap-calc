/** A non-null object — the one guard every JSON-reading module uses. Arrays pass, as they
 * always have in each of the five copies this replaces; tightening it would be a behaviour
 * change in every loader. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
