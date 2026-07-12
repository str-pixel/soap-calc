import { normalizeOilName } from './normalize.js';

export interface FnwlRow {
  name: string;
  sapRange: string;
  sapNaoh: number;
  sapKoh: number;
  productId?: string;
}

export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'") {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Parse FNWL tab export. When multiple products normalize to the same name, keep the
 * row with the **median** sapKoh — a representative value. Taking the max latched onto
 * high outliers (e.g. avocado's 177–226 row) and inflated the lye estimate.
 */
export function parseFnwlCsv(text: string): FnwlRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l && !l.startsWith('Last Updated') && !l.startsWith('OIL,'));
  const byName = new Map<string, FnwlRow[]>();

  for (const line of lines) {
    const cols = parseCsvLine(line);
    if (cols.length < 4) continue;
    const name = cols[0].replace(/^'|'$/g, '');
    const sapRange = cols[1];
    const sapNaoh = Number(cols[2]);
    const sapKoh = Number(cols[3]);
    const productId = cols[4]?.trim().replace(/^'|'$/g, '');
    if (Number.isNaN(sapNaoh) || Number.isNaN(sapKoh)) continue;

    const row: FnwlRow = {
      name,
      sapRange,
      sapNaoh,
      sapKoh,
      ...(productId ? { productId } : {}),
    };
    const key = normalizeOilName(name);
    const group = byName.get(key);
    if (group) group.push(row);
    else byName.set(key, [row]);
  }

  // Keep an actual row per name (preserving its range/productId), chosen at the median
  // sapKoh. For an even count the lower-middle row is used.
  return [...byName.values()].map((group) => {
    const sorted = [...group].sort((a, b) => a.sapKoh - b.sapKoh);
    return sorted[Math.floor((sorted.length - 1) / 2)];
  });
}
