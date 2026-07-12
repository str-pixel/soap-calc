import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeInciName } from './normalize-inci.js';

/**
 * Names-only extract of the full EU CosIng Ingredients & Fragrance Inventory
 * (sources/cosing-inventory-inci-names.json). Unlike the FNWL-derived proxy glossary,
 * this is independent of the FNWL chart, so it can falsify a `source: "cosing"` claim.
 */
export type CosingInventory = {
  count: number;
  normalized: Set<string>;
};

/**
 * Matching key: INCI labeling allows an optional parenthetical common name
 * ("Prunus Armeniaca (Apricot) Kernel Oil") that the inventory export omits
 * ("PRUNUS ARMENIACA KERNEL OIL"); strip parentheticals on both sides before comparing.
 */
export function inventoryKey(name: string): string {
  return normalizeInciName(name.replace(/\([^)]*\)/g, ' '));
}

/** The real snapshot holds ~24k names; a parse well below this is a truncated/empty write,
 * not a legitimate inventory. Floor it so a corrupt snapshot fails loud instead of silently
 * returning an empty Set (which would false-abort every source:"cosing" verification). */
const MIN_INVENTORY_NAMES = 1000;

export function loadCosingInventory(path: string): CosingInventory | null {
  // Missing file is a legitimate degraded state (callers warn and skip verification);
  // a present-but-corrupt file is an error we must not silently treat as "empty inventory".
  if (!existsSync(path)) return null;
  let raw: { inciNames?: unknown };
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`CosIng inventory snapshot ${path} is not valid JSON: ${(err as Error).message}`);
  }
  if (!Array.isArray(raw.inciNames) || raw.inciNames.length < MIN_INVENTORY_NAMES) {
    const got = Array.isArray(raw.inciNames) ? `${raw.inciNames.length} names` : 'no inciNames array';
    throw new Error(
      `CosIng inventory snapshot ${path} looks truncated (${got}, expected ≥ ${MIN_INVENTORY_NAMES}) — refresh it rather than shipping unverifiable "cosing" claims.`,
    );
  }
  return {
    count: raw.inciNames.length,
    normalized: new Set((raw.inciNames as string[]).map(inventoryKey)),
  };
}

export function inciInInventory(name: string, inventory: CosingInventory): boolean {
  return inventory.normalized.has(inventoryKey(name));
}

export const defaultInventoryPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../sources/cosing-inventory-inci-names.json',
);
