/**
 * Where a newly added row goes in an editor list: FIRST.
 *
 * The panels on the left are a worklist — the row you just added is the row you are about
 * to fill in, so it belongs under the "+ Add" button that made it rather than at the end of
 * a list you then have to scroll. This is the ONE place that rule lives: every list that
 * grows (oils, additives, colorants, essential oils, allergens, split liquids, post-cook
 * superfat oils) adds through here, so they cannot drift apart into two conventions.
 *
 * It changes the EDITOR only. What goes into the batch is still ordered by weight —
 * heaviestFirst in recipeSummary is "THE one ordering rule" for the Full recipe, the printed
 * sheet and the batch sheet, and it reads the same rows whatever order they sit in here. The
 * two are deliberately different: the editor is the order you thought of things, the
 * manifest is the order you weigh them.
 */
export function withNewRow<T>(rows: readonly T[], row: T): T[] {
  return [row, ...rows];
}

/** The same rule for a list that gains several at once (a pack of additives, say): the new
 * ones go on top, in the order they were given, so the pack reads as it was written. */
export function withNewRows<T>(rows: readonly T[], added: readonly T[]): T[] {
  return [...added, ...rows];
}
