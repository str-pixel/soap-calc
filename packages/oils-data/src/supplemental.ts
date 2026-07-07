import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { sapKohToSapNaoh } from '@soap-calc/core';
import {
  CanonicalOil,
  DataSource,
  OilCategory,
  SapRole,
  SapSourceRecord,
} from './schema.js';
import { inferCategory, canonicalAlias } from './normalize.js';

const TAR_USAGE_NOTES =
  'Lye consumption estimate only — not an ISO 3657 triglyceride SAP. No fatty acids; soap property predictions N/A.';

export const SupplementalOilInput = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  displayName: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  inciName: z.string().optional(),
  category: OilCategory,
  sapRole: SapRole.optional(),
  usageNotes: z.string().optional(),
  sapKoh: z.number().positive(),
  iodine: z.number().optional(),
  ins: z.number().optional(),
  primarySource: DataSource,
  confidence: z.enum(['verified', 'estimated', 'legacy_only']),
  sources: z.array(SapSourceRecord).min(1),
});

export type SupplementalOilInput = z.infer<typeof SupplementalOilInput>;

export function loadSupplementalOils(path: string): SupplementalOilInput[] {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return z.object({ oils: z.array(SupplementalOilInput) }).parse(raw).oils;
}

export function supplementalToCanonical(entry: SupplementalOilInput): CanonicalOil {
  const category = entry.category ?? inferCategory(entry.displayName, entry.id);
  const sapRole: SapRole =
    entry.sapRole ?? (category === 'tar' ? 'acid_neutralization' : 'triglyceride');
  const sapNaoh = sapKohToSapNaoh(entry.sapKoh);

  const sources = entry.sources.map((source) => ({
    ...source,
    sapKoh: source.sapKoh ?? entry.sapKoh,
    sapNaoh: source.sapNaoh ?? (source.sapKoh ? sapKohToSapNaoh(source.sapKoh) : sapNaoh),
  }));

  return {
    id: entry.id,
    displayName: entry.displayName,
    aliases: [
      canonicalAlias(entry.displayName),
      ...entry.aliases.map(canonicalAlias),
    ].filter((alias, index, all) => alias && all.indexOf(alias) === index),
    inciName: entry.inciName,
    category,
    sapRole,
    usageNotes:
      entry.usageNotes ?? (category === 'tar' ? TAR_USAGE_NOTES : undefined),
    sapKoh: entry.sapKoh,
    sapNaoh,
    sapMgKohPerGram: entry.sapKoh * 1000,
    iodine: entry.iodine ?? (category === 'tar' ? 0 : undefined),
    ins: entry.ins ?? (category === 'tar' ? 0 : undefined),
    fattyAcids: category === 'tar' ? {} : undefined,
    propertiesAvailable: category === 'triglyceride' || category === 'blend',
    sources,
    primarySource: entry.primarySource,
    confidence: entry.confidence,
  };
}

export function tarMetadataForLegacy(category: OilCategory): {
  sapRole?: SapRole;
  usageNotes?: string;
} {
  if (category !== 'tar') return {};
  return {
    sapRole: 'acid_neutralization',
    usageNotes: TAR_USAGE_NOTES,
  };
}
