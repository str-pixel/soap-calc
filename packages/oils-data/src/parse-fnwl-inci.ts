export interface FnwlInciRow {
  productName: string;
  inciName: string;
  productId: string;
}

export function parseFnwlInciCsv(text: string): FnwlInciRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l && !l.startsWith('Last Updated') && !l.startsWith('PRODUCT'));
  const rows: FnwlInciRow[] = [];

  for (const line of lines) {
    const cols = line.split('\t');
    if (cols.length < 3) continue;
    const productName = cols[0].trim();
    const inciName = cols[1].trim();
    const productId = cols[2].trim().toLowerCase();
    if (!productName || !inciName || !productId) continue;
    rows.push({ productName, inciName, productId });
  }

  return rows;
}

export function buildFnwlInciIndex(
  rows: FnwlInciRow[],
): Map<string, FnwlInciRow> {
  return new Map(rows.map((row) => [row.productId, row]));
}

export function resolveInciForFnwlProduct(
  productId: string | undefined,
  inciIndex: Map<string, FnwlInciRow>,
): string | undefined {
  if (!productId) return undefined;
  return inciIndex.get(productId.toLowerCase())?.inciName;
}
