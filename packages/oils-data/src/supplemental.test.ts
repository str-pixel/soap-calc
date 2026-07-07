import { describe, expect, it } from 'vitest';
import { supplementalToCanonical } from './supplemental.js';
import { inferCategory } from './normalize.js';

describe('supplementalToCanonical', () => {
  it('builds birch tar with acid-neutralization metadata and pine-tar proxy SAP', () => {
    const oil = supplementalToCanonical({
      id: 'birch-tar',
      displayName: 'Birch Tar',
      aliases: ['birch tar oil', 'betula tar', 'берёзовый дёготь'],
      inciName: 'Betula Alba Tar',
      category: 'tar',
      sapRole: 'acid_neutralization',
      sapKoh: 0.06,
      usageNotes: 'Proxy from pine tar.',
      primarySource: 'manual',
      confidence: 'estimated',
      sources: [
        {
          source: 'manual',
          notes: 'No published birch tar SAP; proxied from pine tar',
        },
      ],
    });

    expect(oil.sapKoh).toBe(0.06);
    expect(oil.sapNaoh).toBeCloseTo(0.04278, 4);
    expect(oil.sapMgKohPerGram).toBe(60);
    expect(oil.category).toBe('tar');
    expect(oil.sapRole).toBe('acid_neutralization');
    expect(oil.propertiesAvailable).toBe(false);
    expect(oil.confidence).toBe('estimated');
    expect(oil.primarySource).toBe('manual');
    expect(oil.aliases).toContain('birch tar');
    expect(oil.aliases).toContain('берёзовый дёготь');
  });
});

describe('inferCategory birch tar', () => {
  it('classifies birch tar as tar', () => {
    expect(inferCategory('Birch Tar', 'birch-tar')).toBe('tar');
    expect(inferCategory('Birch Tar Oil', 'birch-tar-oil')).toBe('tar');
  });
});
