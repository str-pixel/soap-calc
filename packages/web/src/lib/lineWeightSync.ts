import type { RecipeLine } from './recipe';

function parseNum(value: string): number | null {
  if (value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function formatGrams(n: number): string {
  return String(Math.round(n));
}

/** Percents are display-rounded to 0.1, so each stored percent can be off by up to
 * half a step. Shared by resync normalization and the percent-total warning. */
export const PERCENT_ROUNDING_EPSILON = 0.05;

function formatPercent(n: number): string {
  return String(Math.round(n * 10) / 10);
}

function clampPercent(n: number): number {
  return Math.min(100, Math.max(0, n));
}

function totalGrams(lines: RecipeLine[]): number {
  return lines.reduce((sum, line) => sum + (parseNum(line.weightGrams) ?? 0), 0);
}

function syncPercentsFromWeights(lines: RecipeLine[], total: number): RecipeLine[] {
  return lines.map((line) => {
    const grams = parseNum(line.weightGrams) ?? 0;
    if (grams <= 0) {
      return { ...line, weightPercent: '' };
    }
    const pct = total > 0 ? (grams / total) * 100 : 0;
    return { ...line, weightPercent: formatPercent(pct) };
  });
}

function normalizePercentsTo100(lines: RecipeLine[]): RecipeLine[] {
  const parsed = lines.map((line) => ({
    line,
    pct: parseNum(line.weightPercent ?? '') ?? 0,
  }));
  const sum = parsed.reduce((total, row) => total + row.pct, 0);
  if (sum <= 0 || Math.abs(sum - 100) <= PERCENT_ROUNDING_EPSILON) {
    return lines;
  }

  return parsed.map(({ line, pct }) => ({
    ...line,
    weightPercent: formatPercent((pct / sum) * 100),
  }));
}

/** After percent→gram rounding, the summed line weights can drift a few grams off a
 * locked batch total. This corrects that drift so `sum(lines) === batch` exactly.
 *
 * Growing (diff > 0) is always safe on a single line — it can never go negative — so the
 * whole surplus lands on one eligible line, same as before. Shrinking (diff < 0) is where
 * the original implementation broke the locked-batch invariant: it dumped the entire
 * deficit onto one line and, if that made the line negative, clamped it to 0 and returned
 * — silently dropping the un-applied remainder instead of continuing to remove it from
 * other lines. For recipes where the chosen line's weight is smaller than the deficit
 * (e.g. many near-equal lines with little headroom), that left the stored total several
 * grams off the locked batch.
 *
 * Fix: when shrinking, walk the eligible lines and take as much as each can give (down to
 * 0, never negative), carrying whatever remains to the next eligible line, until the full
 * deficit is absorbed or eligible lines run out. `skipKey` (the just-edited line) is never
 * touched either way.
 */
function fixGramRounding(lines: RecipeLine[], batch: number, skipKey?: string): RecipeLine[] {
  const grams = lines.map((line) => parseNum(line.weightGrams) ?? 0);
  const sum = grams.reduce((total, g) => total + g, 0);
  const diff = batch - sum;
  if (diff === 0) return lines;

  // Eligible lines in the order the original single-line correction preferred: from the
  // end of the array, skipping the just-edited line.
  const eligible: number[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].key !== skipKey) eligible.push(i);
  }
  if (eligible.length === 0) return lines;

  const next = [...grams];
  if (diff > 0) {
    next[eligible[0]] += diff;
  } else {
    let remaining = -diff;
    for (const i of eligible) {
      if (remaining <= 0) break;
      const take = Math.min(next[i], remaining);
      next[i] -= take;
      remaining -= take;
    }
    // If eligible lines' combined weight is less than the deficit, `remaining` stays > 0:
    // the batch can't be hit without touching the skipped line. Best effort — every
    // eligible line is already at 0, none went negative.
  }

  return lines.map((line, i) => {
    if (next[i] === grams[i]) return line;
    return {
      ...line,
      weightGrams: next[i] > 0 ? formatGrams(next[i]) : '',
      weightPercent: formatPercent(batch > 0 ? (next[i] / batch) * 100 : 0),
    };
  });
}

function distributeWeightsToBatch(
  lines: RecipeLine[],
  key: string,
  editedGrams: number,
  batch: number,
): RecipeLine[] {
  const editedClamped = Math.max(0, Math.min(editedGrams, batch));
  const remaining = batch - editedClamped;
  const otherLines = lines.filter((line) => line.key !== key);

  if (otherLines.length === 0) {
    const target = lines.find((line) => line.key === key);
    if (!target) return lines;
    return [
      {
        ...target,
        weightGrams: editedClamped > 0 ? formatGrams(editedClamped) : '',
        weightPercent: formatPercent(batch > 0 ? (editedClamped / batch) * 100 : 0),
      },
    ];
  }

  const otherWeightSum = otherLines.reduce(
    (sum, line) => sum + (parseNum(line.weightGrams) ?? 0),
    0,
  );

  const otherGrams = otherLines.map((line) => {
    const oldGrams = parseNum(line.weightGrams) ?? 0;
    if (remaining <= 0) return 0;
    if (otherWeightSum > 0) return Math.round((oldGrams / otherWeightSum) * remaining);
    return Math.round(remaining / otherLines.length);
  });

  const allocated = editedClamped + otherGrams.reduce((sum, grams) => sum + grams, 0);
  const diff = batch - allocated;
  if (diff !== 0 && otherGrams.length > 0) {
    otherGrams[otherGrams.length - 1] += diff;
  }

  let otherIndex = 0;
  const synced = lines.map((line) => {
    if (line.key === key) {
      return {
        ...line,
        weightGrams: editedClamped > 0 ? formatGrams(editedClamped) : '',
        weightPercent: formatPercent(batch > 0 ? (editedClamped / batch) * 100 : 0),
      };
    }

    const grams = otherGrams[otherIndex++];
    return {
      ...line,
      weightGrams: grams > 0 ? formatGrams(grams) : '',
      weightPercent: formatPercent(batch > 0 ? (grams / batch) * 100 : 0),
    };
  });

  return fixGramRounding(synced, batch, key);
}

export type SyncedRecipe = {
  lines: RecipeLine[];
  batchOilGrams: string;
  /** Provenance of batchOilGrams: true when the user typed the total (locks it), false
   * when it was derived from line weights (follows them). Travels with lines/batch so
   * every sync path keeps the flag consistent with the value it describes. */
  batchSetByUser: boolean;
};

export function resyncFromWeights(lines: RecipeLine[]): SyncedRecipe {
  const total = totalGrams(lines);
  const batchOilGrams = total > 0 ? formatGrams(total) : '';
  return {
    batchOilGrams,
    lines: syncPercentsFromWeights(lines, total),
    // Derived from the weights themselves — never a user-locked total.
    batchSetByUser: false,
  };
}

export function syncWeightEdit(
  lines: RecipeLine[],
  key: string,
  weightGrams: string,
  batchOilGrams: string,
  batchSetByUser: boolean,
): SyncedRecipe {
  const editedGrams = parseNum(weightGrams);
  const batch = parseNum(batchOilGrams);

  if (editedGrams === null) {
    const cleared = lines.map((line) =>
      line.key === key ? { ...line, weightGrams, weightPercent: '' } : line,
    );
    if (batchSetByUser) {
      return { batchOilGrams, lines: cleared, batchSetByUser: true };
    }
    return resyncFromWeights(cleared);
  }

  // Only a total the user typed locks the batch; a total derived from line weights
  // grows and shrinks with them, so entering weights never steals from other lines.
  if (batchSetByUser && batch !== null && batch > 0) {
    return {
      batchOilGrams,
      lines: distributeWeightsToBatch(lines, key, editedGrams, batch),
      batchSetByUser: true,
    };
  }

  const updated = lines.map((line) =>
    line.key === key ? { ...line, weightGrams } : line,
  );
  return resyncFromWeights(updated);
}

export function syncPercentEdit(
  lines: RecipeLine[],
  key: string,
  weightPercent: string,
  batchOilGrams: string,
  batchSetByUser: boolean,
): SyncedRecipe {
  const batch = parseNum(batchOilGrams);
  const editedPct = parseNum(weightPercent);

  if (editedPct === null) {
    const cleared = lines.map((line) =>
      line.key === key ? { ...line, weightPercent, weightGrams: '' } : line,
    );
    // A user-set total stays locked; a derived total re-derives from remaining weights.
    return batchSetByUser
      ? { batchOilGrams, lines: cleared, batchSetByUser: true }
      : resyncFromWeights(cleared);
  }

  // Derived batch: a percent is relative to the whole recipe, so hold the OTHER lines'
  // typed weights fixed and set this line so it is editedPct% of the grown total, then
  // re-derive batch/percents. This never steals from weights the user already entered
  // and matches the weight-entry result (e.g. olive 300 + coconut 40% -> 300/200, 500).
  if (!batchSetByUser) {
    const p = clampPercent(editedPct);
    if (p <= 0) {
      return resyncFromWeights(
        lines.map((line) => (line.key === key ? { ...line, weightGrams: '' } : line)),
      );
    }
    const ownGrams = parseNum(lines.find((line) => line.key === key)?.weightGrams ?? '') ?? 0;
    const others = lines.filter((line) => line.key !== key);
    const otherGrams = totalGrams(others);

    // Nothing anywhere to scale against: no weights on any line and no derived total yet.
    // Record the typed percent so a later batch-total edit scales it into weights, the
    // same way a locked batch does below. Falling through would target 0 g, blank the
    // line, and discard the input — making percent-first entry impossible.
    if (ownGrams <= 0 && otherGrams <= 0 && (batch === null || batch <= 0)) {
      return {
        batchOilGrams,
        lines: lines.map((line) => (line.key === key ? { ...line, weightPercent } : line)),
        batchSetByUser: false,
      };
    }

    let targetGrams: number;
    if (p >= 100) {
      // The edited line is the whole batch: keep ITS own weight and drop the others. With
      // no weight of its own it takes over the others' total, and failing that the derived
      // total itself — the same "never to 0" fallback the p<100 branch uses below.
      // Targeting 0 would blank this line AND clear the others, wiping every weight and
      // the batch total.
      targetGrams = ownGrams > 0 ? ownGrams : otherGrams > 0 ? otherGrams : (batch ?? 0);
    } else if (otherGrams > 0) {
      targetGrams = (otherGrams * p) / (100 - p);
    } else {
      // No other weighted lines: scale the sole line against the derived total, falling
      // back to its own weight when the batch string is empty/unsynced (never to 0).
      const base = batch !== null && batch > 0 ? batch : ownGrams;
      targetGrams = (base * p) / 100;
    }
    const updated = lines.map((line) => {
      if (line.key === key) {
        return { ...line, weightGrams: targetGrams > 0 ? formatGrams(targetGrams) : '' };
      }
      // At >=100% the edited line is the entire batch, so clear the others.
      return p >= 100 ? { ...line, weightGrams: '' } : line;
    });
    return resyncFromWeights(updated);
  }

  if (batch === null || batch <= 0) {
    return {
      batchOilGrams,
      lines: lines.map((line) =>
        line.key === key ? { ...line, weightPercent } : line,
      ),
      batchSetByUser: true,
    };
  }

  const otherLines = lines.filter((line) => line.key !== key);

  if (otherLines.length === 0) {
    const pct = clampPercent(editedPct);
    const grams = (batch * pct) / 100;
    return {
      batchOilGrams,
      lines: [
        {
          ...lines[0],
          weightPercent: formatPercent(pct),
          weightGrams: pct > 0 ? formatGrams(grams) : '',
        },
      ],
      batchSetByUser: true,
    };
  }

  const editedPctClamped = clampPercent(editedPct);
  const remaining = 100 - editedPctClamped;
  const otherPercentSum = otherLines.reduce(
    (sum, line) => sum + (parseNum(line.weightPercent ?? '') ?? 0),
    0,
  );

  const syncedLines = lines.map((line) => {
    if (line.key === key) {
      const grams = (batch * editedPctClamped) / 100;
      return {
        ...line,
        weightPercent: formatPercent(editedPctClamped),
        weightGrams: editedPctClamped > 0 ? formatGrams(grams) : '',
      };
    }

    const oldPct = parseNum(line.weightPercent ?? '') ?? 0;
    let newPct = 0;
    if (remaining <= 0) {
      newPct = 0;
    } else if (otherPercentSum > 0) {
      newPct = (oldPct / otherPercentSum) * remaining;
    } else {
      newPct = remaining / otherLines.length;
    }

    const grams = (batch * newPct) / 100;
    return {
      ...line,
      weightPercent: formatPercent(newPct),
      weightGrams: newPct > 0 ? formatGrams(grams) : '',
    };
  });

  return {
    batchOilGrams,
    lines: fixGramRounding(syncedLines, batch, key),
    batchSetByUser: true,
  };
}

export function syncBatchTotalEdit(lines: RecipeLine[], batchOilGrams: string): RecipeLine[] {
  if (batchOilGrams === '') {
    return lines;
  }

  const batch = parseNum(batchOilGrams);
  if (batch === null || batch <= 0) {
    return lines;
  }

  const percentSum = lines.reduce(
    (sum, line) => sum + (parseNum(line.weightPercent ?? '') ?? 0),
    0,
  );
  const currentTotal = totalGrams(lines);
  let baseLines = lines;
  if (percentSum <= 0 && currentTotal > 0) {
    baseLines = syncPercentsFromWeights(lines, currentTotal);
  } else if (percentSum <= 0) {
    return lines;
  }

  const normalized = normalizePercentsTo100(baseLines);
  const scaled = normalized.map((line) => {
    const pct = parseNum(line.weightPercent ?? '') ?? 0;
    if (pct <= 0) {
      return { ...line, weightGrams: '' };
    }
    return { ...line, weightGrams: formatGrams((batch * pct) / 100) };
  });

  return fixGramRounding(scaled, batch);
}

export function addRecipeLine(
  lines: RecipeLine[],
  batchOilGrams: string,
  newLine: RecipeLine,
  batchSetByUser: boolean,
): SyncedRecipe {
  const batch = parseNum(batchOilGrams);
  // A new line is empty, so it changes nothing yet; preserve the batch and its provenance
  // when a total exists, otherwise re-derive (which reports the batch as unlocked).
  if (batch !== null && batch > 0) {
    return {
      batchOilGrams,
      lines: [...lines, newLine],
      batchSetByUser,
    };
  }

  return resyncFromWeights([...lines, newLine]);
}
