import type { KeyboardEvent } from 'react';

/** Commit a numeric field on Enter, matching blur. Every field here commits on blur only;
 * without this, a typed value applies only when you click/tab away. Enter → blur() fires the
 * field's existing onBlur commit — no new commit path, just an extra, expected trigger. */
export const commitOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.currentTarget.blur();
};
