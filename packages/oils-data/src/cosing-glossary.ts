import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeInciName, isPlausibleInciName } from './normalize-inci.js';

export type CosingGlossaryIndex = {
  generatedAt: string;
  source: string;
  note: string;
  referenceUrl: string;
  inciNames: string[];
  normalizedIndex: Record<string, string>;
};

export function loadCosingGlossaryIndex(path: string): CosingGlossaryIndex | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as CosingGlossaryIndex;
}

export function lookupInciInGlossary(
  inciName: string,
  glossary: CosingGlossaryIndex,
): { found: boolean; canonicalInci?: string } {
  const key = normalizeInciName(inciName);
  const canonical = glossary.normalizedIndex[key];
  if (canonical) return { found: true, canonicalInci: canonical };
  return { found: false };
}

export function validateInciName(inciName: string | undefined): string[] {
  const issues: string[] = [];
  if (!inciName) return issues;
  if (!isPlausibleInciName(inciName)) {
    issues.push(`implausible INCI name: ${inciName}`);
  }
  return issues;
}

export const defaultGlossaryPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../sources/cosing-glossary-index.json',
);
