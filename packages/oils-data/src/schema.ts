import { z } from 'zod';

export const OilCategory = z.enum([
  'triglyceride',
  'wax',
  'wax_ester',
  'free_acid',
  'tar',
  'blend',
  'unknown',
]);

export const DataSource = z.enum([
  'fnwl',
  'ldg',
  'legacy_catalog',
  'cosing',
  'supplier_coa',
  'iso_derived',
  'manual',
]);

export const SapRole = z.enum(['triglyceride', 'acid_neutralization']);

export const FattyAcidProfile = z.record(z.string(), z.number().min(0).max(100));

export const SapSourceRecord = z.object({
  source: DataSource,
  url: z.string().url().optional(),
  fetchedAt: z.string().datetime().optional(),
  mgKohPerGram: z.number().positive().optional(),
  mgKohPerGramMin: z.number().positive().optional(),
  mgKohPerGramMax: z.number().positive().optional(),
  sapKoh: z.number().positive().optional(),
  sapNaoh: z.number().positive().optional(),
  notes: z.string().optional(),
});

export const CanonicalOil = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  displayName: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  inciName: z.string().optional(),
  category: OilCategory,
  /** How sapKoh should be interpreted in lye math (default: triglyceride). */
  sapRole: SapRole.optional(),
  /** Non-SAP usage guidance for tar, wax, and manual entries. */
  usageNotes: z.string().optional(),

  sapKoh: z.number().positive(),
  sapNaoh: z.number().positive(),
  sapMgKohPerGram: z.number().positive(),

  iodine: z.number().optional(),
  ins: z.number().optional(),
  fattyAcids: FattyAcidProfile.optional(),
  propertiesAvailable: z.boolean(),

  sources: z.array(SapSourceRecord).min(1),
  primarySource: DataSource,
  confidence: z.enum(['verified', 'estimated', 'legacy_only']),
});

export const CanonicalOilDatabase = z.object({
  version: z.string(),
  generatedAt: z.string().datetime(),
  methodology: z.object({
    sapConversion: z.string(),
    references: z.array(z.object({
      name: z.string(),
      url: z.string().url(),
      role: z.string(),
    })),
  }),
  oils: z.array(CanonicalOil),
});

export type SapRole = z.infer<typeof SapRole>;
export type OilCategory = z.infer<typeof OilCategory>;
export type DataSource = z.infer<typeof DataSource>;
export type CanonicalOil = z.infer<typeof CanonicalOil>;
export type CanonicalOilDatabase = z.infer<typeof CanonicalOilDatabase>;
