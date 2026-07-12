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

export function loadCosingInventory(path: string): CosingInventory | null {
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { inciNames: string[] };
  return {
    count: raw.inciNames.length,
    normalized: new Set(raw.inciNames.map(inventoryKey)),
  };
}

export function inciInInventory(name: string, inventory: CosingInventory): boolean {
  return inventory.normalized.has(inventoryKey(name));
}

export const defaultInventoryPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../sources/cosing-inventory-inci-names.json',
);
