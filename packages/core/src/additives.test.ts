import { describe, expect, it } from 'vitest';
import {
  ADDITIVE_CATALOG,
  ADDITIVE_STAGE_LABELS,
  catalogEntryById,
  catalogEntriesForProcess,
  isAdditiveOfferedFor,
  effectiveCatalogEntry,
  type AdditiveCatalogEntry,
  gramsFromDose,
  gramsFromPercentOfOil,
  LATHER_SUPPORT_PACK,
  MAX_ADDITIVE_NAME_LENGTH,
  MAX_RECIPE_ADDITIVES,
  parsePercentOfOil,
  parseDoseAmount,
  type AdditiveStage,
} from './additives.js';

describe('additives', () => {
  it('computes grams from percent of oil weight', () => {
    expect(gramsFromPercentOfOil(1000, 1)).toBe(10);
    expect(gramsFromPercentOfOil(500, 2.5)).toBe(12.5);
  });

  it('rejects invalid percent input', () => {
    expect(parsePercentOfOil('')).toBeNull();
    expect(parsePercentOfOil('abc')).toBeNull();
    expect(parsePercentOfOil('101')).toBeNull();
    expect(parsePercentOfOil('1.5')).toBe(1.5);
  });

  it('ships lather support pack at 1% each', () => {
    expect(LATHER_SUPPORT_PACK).toHaveLength(3);
    expect(LATHER_SUPPORT_PACK.every((item) => item.percentOfOil === 1)).toBe(true);
    expect(ADDITIVE_CATALOG.some((e) => e.id === 'chelator')).toBe(true);
  });

  it('has unique catalog ids and coherent dose ranges', () => {
    const ids = ADDITIVE_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of ADDITIVE_CATALOG) {
      expect(entry.typicalLow).toBeGreaterThanOrEqual(0);
      expect(entry.typicalHigh).toBeLessThanOrEqual(100);
      expect(entry.typicalLow).toBeLessThanOrEqual(entry.typicalHigh);
    }
  });

  it('offers sodium lactate as a lye-water hardener at 0.5–2%', () => {
    const sl = ADDITIVE_CATALOG.find((e) => e.id === 'sodium-lactate');
    expect(sl).toBeDefined();
    expect(sl?.defaultStage).toBe('lye');
    expect(sl?.typicalLow).toBe(0.5);
    expect(sl?.typicalHigh).toBe(2);
  });

  it('keeps table salt (id "salt") tightened to a hardener dose', () => {
    const salt = ADDITIVE_CATALOG.find((e) => e.id === 'salt');
    expect(salt).toBeDefined();
    // Above ~1% of oil weight table salt thickens the batch rather than hardening it.
    expect(salt?.typicalHigh).toBeLessThanOrEqual(1);
    expect(salt?.defaultStage).toBe('lye');
  });

  it('exports import limits', () => {
    expect(MAX_RECIPE_ADDITIVES).toBeGreaterThan(0);
    expect(MAX_ADDITIVE_NAME_LENGTH).toBeGreaterThan(0);
  });

  it('includes an after_cook stage labeled "After cook"', () => {
    const stage: AdditiveStage = 'after_cook';
    expect(ADDITIVE_STAGE_LABELS[stage]).toBe('After cook');
  });
});

describe('additive catalog process scoping', () => {
  it('sugar range is corrected to 0.5–2%', () => {
    const sugar = catalogEntryById('sugar-sorbitol');
    expect(sugar?.typicalLow).toBe(0.5);
    expect(sugar?.typicalHigh).toBe(2);
  });
  it('unscoped entries appear for every process', () => {
    const cp = catalogEntriesForProcess('cp');
    expect(cp.some((e) => e.id === 'sugar-sorbitol')).toBe(true);
  });

  it('offers yogurt only for HP', () => {
    const hp = catalogEntriesForProcess('hp').map((e) => e.id);
    expect(hp).toEqual(expect.arrayContaining(['yogurt']));

    const cp = catalogEntriesForProcess('cp').map((e) => e.id);
    expect(cp).not.toEqual(expect.arrayContaining(['yogurt']));
    const ls = catalogEntriesForProcess('ls').map((e) => e.id);
    expect(ls).not.toEqual(expect.arrayContaining(['yogurt']));
  });

  it('doses yogurt after cook at 2–5%', () => {
    const yogurt = catalogEntryById('yogurt');
    expect(yogurt).toBeDefined();
    expect(yogurt?.defaultStage).toBe('after_cook');
    expect(yogurt?.typicalLow).toBe(2);
    expect(yogurt?.typicalHigh).toBe(5);
  });

  it('guar and hec are LS-only thickeners at 0.5–1% added after dilution', () => {
    for (const id of ['guar', 'hec']) {
      const e = catalogEntryById(id)!;
      expect(e).toBeDefined();
      expect(e.typicalLow).toBe(0.5);
      expect(e.typicalHigh).toBe(1);
      expect(e.defaultStage).toBe('after_cook');
      expect(e.processes).toEqual(['ls']);
    }
    expect(catalogEntriesForProcess('cp').some((e) => e.id === 'guar')).toBe(false);
    expect(catalogEntriesForProcess('cp').some((e) => e.id === 'hec')).toBe(false);
    expect(catalogEntriesForProcess('ls').some((e) => e.id === 'guar')).toBe(true);
    expect(catalogEntriesForProcess('ls').some((e) => e.id === 'hec')).toBe(true);
  });

  it('keeps salt, sodium-lactate, sugar, and eugenol unscoped (reused across processes)', () => {
    for (const id of ['salt', 'sodium-lactate', 'sugar-sorbitol', 'eugenol']) {
      const entry = catalogEntryById(id);
      expect(entry?.processes).toBeUndefined();
    }
  });
});

describe('additive catalog book audit (2026-07-26)', () => {
  it('doses eugenol into the heated oils (a trace accelerant is pointless at trace)', () => {
    expect(catalogEntryById('eugenol')?.defaultStage).toBe('oils');
  });

  it('doses ground loofah at 0.1–0.3%', () => {
    const loofah = catalogEntryById('loofah');
    expect(loofah?.typicalLow).toBe(0.1);
    expect(loofah?.typicalHigh).toBe(0.3);
  });

  it('doses silk at 0.25–1% in the lye water', () => {
    const silk = catalogEntryById('silk');
    expect(silk?.typicalLow).toBe(0.25);
    expect(silk?.typicalHigh).toBe(1);
    expect(silk?.defaultStage).toBe('lye');
  });

  it('doses clay from a 0.1% floor', () => {
    const clay = catalogEntryById('clay');
    expect(clay?.typicalLow).toBe(0.1);
    expect(clay?.typicalHigh).toBe(2);
  });

  it('tags honey with the sugar overheat hazard', () => {
    expect(catalogEntryById('honey')?.hazards).toContain('can tunnel/overheat');
  });

  it('does not offer jojoba as an additive (it belongs in the saponified oil blend)', () => {
    expect(catalogEntryById('jojoba')).toBeUndefined();
  });

  it('splits sugar and sorbitol: separate entries, both 0.5–2% base (CP-audited)', () => {
    // id stays 'sugar-sorbitol' so recipes saved before the split still resolve.
    // (Sorbitol's base was 1–5 until the 2026-07-27 sorbitol-vs-ceiling investigation
    // found that figure belongs to HP/LS; CP is "same as sugar" — see the entry comment.)
    const sugar = catalogEntryById('sugar-sorbitol');
    expect(sugar?.name).toBe('Sugar');
    expect(sugar?.typicalLow).toBe(0.5);
    expect(sugar?.typicalHigh).toBe(2);
    expect(sugar?.defaultStage).toBe('trace');

    const sorbitol = catalogEntryById('sorbitol');
    expect(sorbitol?.name).toBe('Sorbitol');
    expect(sorbitol?.typicalLow).toBe(0.5);
    expect(sorbitol?.typicalHigh).toBe(2);
    expect(sorbitol?.defaultStage).toBe('trace');
    expect(sorbitol?.processes).toBeUndefined();
    expect(sorbitol?.hazards).toContain('can tunnel/overheat');
  });
});

describe('additive hazard tags (behavior-only)', () => {
  it('flags eugenol as able to seize', () => {
    const entry = catalogEntryById('eugenol');
    expect(entry?.hazards).toContain('can seize');
  });

  it('flags sugar/sorbitol as able to tunnel/overheat', () => {
    const entry = catalogEntryById('sugar-sorbitol');
    expect(entry?.hazards).toContain('can tunnel/overheat');
  });

  it('flags salt as able to make the bar crumbly', () => {
    const entry = catalogEntryById('salt');
    expect(entry?.hazards).toContain('can make the bar crumbly');
  });

  it('flags titanium dioxide as able to glycerin-river at high water', () => {
    const entry = catalogEntryById('titanium-dioxide');
    expect(entry?.hazards).toContain('can glycerin-river at high water');
  });

  it('leaves untagged entries without a hazards field', () => {
    const entry = catalogEntryById('chelator');
    expect(entry?.hazards).toBeUndefined();
  });
});

describe('parseDoseAmount', () => {
  it('accepts percent up to 100 and rejects above', () => {
    expect(parseDoseAmount('5', 'percent')).toBe(5);
    expect(parseDoseAmount('100', 'percent')).toBe(100);
    expect(parseDoseAmount('100.1', 'percent')).toBeNull();
  });
  it('accepts ppt up to 1000 and rejects above', () => {
    expect(parseDoseAmount('3', 'ppt')).toBe(3);
    expect(parseDoseAmount('1000', 'ppt')).toBe(1000);
    expect(parseDoseAmount('1001', 'ppt')).toBeNull();
  });
  it('rejects empty, negative, and non-numeric', () => {
    expect(parseDoseAmount('', 'percent')).toBeNull();
    expect(parseDoseAmount('-1', 'ppt')).toBeNull();
    expect(parseDoseAmount('abc', 'percent')).toBeNull();
  });
});

describe('gramsFromDose', () => {
  it('percent divides by 100, ppt divides by 1000', () => {
    expect(gramsFromDose(1000, 5, 'percent')).toBe(50);
    expect(gramsFromDose(1000, 3, 'ppt')).toBe(3);
  });
  it('returns null for negative basis or amount', () => {
    expect(gramsFromDose(-1, 5, 'percent')).toBeNull();
    expect(gramsFromDose(1000, -5, 'ppt')).toBeNull();
  });
});

describe('dose units (deep-review)', () => {
  it('eugenol is dosed in ppt per its own guidance, and the schema can say so', () => {
    const eugenol = catalogEntryById('eugenol');
    expect(eugenol?.doseUnit).toBe('ppt');
  });
  it('entries without a doseUnit are percent by definition', () => {
    const sugar = catalogEntryById('sugar-sorbitol');
    expect(sugar?.doseUnit ?? 'percent').toBe('percent');
  });
});

describe('citric acid additive (auto-lye)', () => {
  it('offers citric acid for every process at the lye stage; LS widens to the 1–3% chelator route', () => {
    const citric = catalogEntryById('citric-acid')!;
    expect(citric.name).toBe('Citric acid (anhydrous)');
    expect(citric.defaultStage).toBe('lye');
    expect(citric.processes).toBeUndefined();
    for (const process of ['cp', 'hp', 'ls'] as const) {
      expect(catalogEntriesForProcess(process).some((e) => e.id === 'citric-acid')).toBe(true);
    }
    const cp = effectiveCatalogEntry(citric, 'cp');
    expect([cp.typicalLow, cp.typicalHigh]).toEqual([1, 2]);
    const ls = effectiveCatalogEntry(citric, 'ls');
    expect([ls.typicalLow, ls.typicalHigh]).toEqual([1, 3]);
  });

  it('carries stoichiometric neutralization factors (triprotic, anhydrous MW 192.124)', () => {
    const factors = catalogEntryById('citric-acid')?.lyeNeutralization;
    // digits: 3 — the exact values are 0.6245530/0.8760794; a 4-digit pin on the rounded
    // figures would sit within 5e-5 of the tolerance edge.
    expect(factors?.naohPerGram).toBeCloseTo(0.6246, 3);
    expect(factors?.kohPerGram).toBeCloseTo(0.8761, 3);
  });

  it('leaves every other entry without neutralization factors', () => {
    for (const entry of ADDITIVE_CATALOG) {
      if (entry.id !== 'citric-acid') expect(entry.lyeNeutralization).toBeUndefined();
    }
  });
});

describe('per-process catalog overrides (HP audit 2026-07-26)', () => {
  it('sodium lactate: CP keeps 0.5–2% in the lye water; HP overrides to 3–4% at trace', () => {
    const base = catalogEntryById('sodium-lactate')!;
    const cp = effectiveCatalogEntry(base, 'cp');
    expect([cp.typicalLow, cp.typicalHigh, cp.defaultStage]).toEqual([0.5, 2, 'lye']);
    // (LS gained its own source-backed override in the 2026-07-27 LS audit — pinned in
    // the LS describe below, superseding the earlier LS-inherits-base premise.)
    const hp = effectiveCatalogEntry(base, 'hp');
    expect([hp.typicalLow, hp.typicalHigh, hp.defaultStage]).toEqual([3, 4, 'trace']);
    // Merge preserves everything the override does not name.
    expect(hp.id).toBe('sodium-lactate');
    expect(hp.name).toBe('Sodium lactate');
  });

  it('sugar: HP overrides the range to 1–5% but keeps the trace stage', () => {
    const base = catalogEntryById('sugar-sorbitol')!;
    const hp = effectiveCatalogEntry(base, 'hp');
    expect([hp.typicalLow, hp.typicalHigh]).toEqual([1, 5]);
    expect(hp.defaultStage).toBe('trace');
  });

  it('returns the entry unchanged for a process with no override', () => {
    const honey = catalogEntryById('honey')!;
    expect(effectiveCatalogEntry(honey, 'hp')).toEqual(honey);
  });
});

describe('free fatty acids are oils, not additives (HP audit 2026-07-26)', () => {
  it('carries no stearic/lauric additive entries — they saponify and belong in the oils list', () => {
    expect(catalogEntryById('stearic')).toBeUndefined();
    expect(catalogEntryById('lauric')).toBeUndefined();
  });

  it('offers finished soap as the lye-neutral HP trace accelerant at 0.05–1% into the oils', () => {
    const soap = catalogEntryById('finished-soap');
    expect(soap?.name).toBe('Finished soap (grated or liquid)');
    expect([soap?.typicalLow, soap?.typicalHigh]).toEqual([0.05, 1]);
    expect(soap?.defaultStage).toBe('oils');
    expect(soap?.processes).toEqual(['hp', 'ls']);
    expect(catalogEntriesForProcess('hp').some((e) => e.id === 'finished-soap')).toBe(true);
    expect(catalogEntriesForProcess('cp').some((e) => e.id === 'finished-soap')).toBe(false);
  });
});

describe('doseBasis / hazards on the override seam (LS audit 2026-07-27)', () => {
  it('merges doseBasis and hazards from an override; base entries default to no doseBasis', () => {
    const probe: AdditiveCatalogEntry = {
      id: 'probe', name: 'Probe', typicalLow: 1, typicalHigh: 2, defaultStage: 'trace',
      hazards: ['base hazard'],
      processOverrides: { ls: { doseBasis: 'solution', hazards: ['ls hazard'] } },
    };
    const ls = effectiveCatalogEntry(probe, 'ls');
    expect(ls.doseBasis).toBe('solution');
    expect(ls.hazards).toEqual(['ls hazard']); // replaces, not appends
    const cp = effectiveCatalogEntry(probe, 'cp');
    expect(cp.doseBasis).toBeUndefined();
    expect(cp.hazards).toEqual(['base hazard']);
  });

  it('solution-based dosing is reachable only under LS (data invariant)', () => {
    for (const entry of ADDITIVE_CATALOG) {
      for (const process of ['cp', 'hp'] as const) {
        // Skip entries never offered for this process — unreachable is fine.
        if (entry.processes && !entry.processes.includes(process)) continue;
        expect(effectiveCatalogEntry(entry, process).doseBasis ?? 'oil').not.toBe('solution');
      }
    }
  });
});

describe('LS dose corrections and new entries (LS audit 2026-07-27)', () => {
  it('sodium lactate LS: 3–5% into the oils (envelope 1–10 documented, not encoded)', () => {
    const ls = effectiveCatalogEntry(catalogEntryById('sodium-lactate')!, 'ls');
    expect([ls.typicalLow, ls.typicalHigh, ls.defaultStage]).toEqual([3, 5, 'oils']);
  });

  it('sugar LS: 1–5% into the oils (less browning than the lye water)', () => {
    const ls = effectiveCatalogEntry(catalogEntryById('sugar-sorbitol')!, 'ls');
    expect([ls.typicalLow, ls.typicalHigh, ls.defaultStage]).toEqual([1, 5, 'oils']);
  });

  it('salt LS: 3–8% at the lye stage, with the salt-curve hazard replacing the bar tag', () => {
    const ls = effectiveCatalogEntry(catalogEntryById('salt')!, 'ls');
    expect([ls.typicalLow, ls.typicalHigh, ls.defaultStage]).toEqual([3, 8, 'lye']);
    expect(ls.hazards).toEqual(['past the salt curve more salt thins, not thickens']);
    const cp = effectiveCatalogEntry(catalogEntryById('salt')!, 'cp');
    expect(cp.hazards).toEqual(['can make the bar crumbly']);
  });

  it('fragrance LS: 0.5–3% of the finished solution (3% max)', () => {
    const ls = effectiveCatalogEntry(catalogEntryById('fragrance')!, 'ls');
    expect([ls.typicalLow, ls.typicalHigh, ls.doseBasis]).toEqual([0.5, 3, 'solution']);
    expect(effectiveCatalogEntry(catalogEntryById('fragrance')!, 'cp').doseBasis).toBeUndefined();
  });

  it('glycerin: LS-only, 20–25% of oils into the lye solution', () => {
    const g = catalogEntryById('glycerin');
    expect([g?.typicalLow, g?.typicalHigh, g?.defaultStage, g?.processes]).toEqual([20, 25, 'lye', ['ls']]);
    expect(g?.doseBasis).toBeUndefined(); // % of oil weight
  });

  it('glycerin is never offered for CP or HP — the pickers, not just the scoping field', () => {
    // Behavioural pin, not structural: what matters is that a CP/HP user cannot reach it.
    // CP and HP make their own glycerin (0.77 g per g NaOH); adding more softens the bar
    // and makes it dissolve faster, and neither process source doses it. The real added-
    // glycerin percentages belong to TRANSPARENT / melt-and-pour soap, which this app does
    // not model — so an HP entry would advertise an LS dose for a different craft.
    for (const process of ['cp', 'hp'] as const) {
      expect(catalogEntriesForProcess(process).some((e) => e.id === 'glycerin')).toBe(false);
    }
    expect(catalogEntriesForProcess('ls').some((e) => e.id === 'glycerin')).toBe(true);
  });

  it('pearlizer and water-dispersible shea: LS-only, solution-based, after cook', () => {
    const p = catalogEntryById('pearlizer');
    expect([p?.typicalLow, p?.typicalHigh, p?.defaultStage, p?.doseBasis, p?.processes])
      .toEqual([2, 10, 'after_cook', 'solution', ['ls']]);
    const sh = catalogEntryById('wd-shea');
    expect([sh?.typicalLow, sh?.typicalHigh, sh?.defaultStage, sh?.doseBasis, sh?.processes])
      .toEqual([1, 25, 'after_cook', 'solution', ['ls']]);
  });

  it('finished soap extends to LS', () => {
    expect(catalogEntryById('finished-soap')?.processes).toEqual(['hp', 'ls']);
    expect(catalogEntriesForProcess('ls').some((e) => e.id === 'finished-soap')).toBe(true);
  });
});

describe('sorbitol mirrors sugar per process (CP source: "same suggested usage rates as sugar")', () => {
  it('CP 0.5–2 (tested to 4 lives in the ceiling, not the range); HP/LS 1–5', () => {
    const base = catalogEntryById('sorbitol')!;
    const cp = effectiveCatalogEntry(base, 'cp');
    expect([cp.typicalLow, cp.typicalHigh]).toEqual([0.5, 2]);
    for (const process of ['hp', 'ls'] as const) {
      const eff = effectiveCatalogEntry(base, process);
      expect([eff.typicalLow, eff.typicalHigh]).toEqual([1, 5]);
    }
    // Structural mirror of the sugar entry — the source's own claim.
    const sugar = catalogEntryById('sugar-sorbitol')!;
    for (const process of ['cp', 'hp', 'ls'] as const) {
      const s = effectiveCatalogEntry(sugar, process);
      const so = effectiveCatalogEntry(base, process);
      expect([so.typicalLow, so.typicalHigh]).toEqual([s.typicalLow, s.typicalHigh]);
    }
  });
});

describe('isAdditiveOfferedFor (single source of truth)', () => {
  it('agrees with the picker list for every process', () => {
    for (const process of ['cp', 'hp', 'ls'] as const) {
      expect(catalogEntriesForProcess(process)).toEqual(
        ADDITIVE_CATALOG.filter((e) => isAdditiveOfferedFor(e, process)),
      );
    }
  });

  it('says no to glycerin under CP and HP, yes under LS', () => {
    const g = catalogEntryById('glycerin')!;
    expect(isAdditiveOfferedFor(g, 'cp')).toBe(false);
    expect(isAdditiveOfferedFor(g, 'hp')).toBe(false);
    expect(isAdditiveOfferedFor(g, 'ls')).toBe(true);
  });
});
