import { describe, expect, it } from 'vitest';
import {
  ADDITIVE_PACKS,
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

  it('ships lather support pack at 1% each, and names no stage of its own', () => {
    expect(LATHER_SUPPORT_PACK).toHaveLength(3);
    expect(LATHER_SUPPORT_PACK.every((item) => item.percentOfOil === 1)).toBe(true);
    expect(ADDITIVE_CATALOG.some((e) => e.id === 'chelator')).toBe(true);
    // The pack says what and how much; WHEN belongs to each ingredient's per-process
    // default. A stage here would be a fourth opinion about staging that no audit covers,
    // and it silently outranked the LS defaults for as long as it existed.
    for (const item of LATHER_SUPPORT_PACK) {
      expect(item).not.toHaveProperty('stage');
    }
    // Its dose has to sit inside every offering process's range, or one press lands a line
    // the panel immediately flags as out of the typical band.
    for (const item of LATHER_SUPPORT_PACK) {
      const entry = catalogEntryById(item.catalogId)!;
      for (const process of ['cp', 'hp', 'ls'] as const) {
        if (!isAdditiveOfferedFor(entry, process)) continue;
        const eff = effectiveCatalogEntry(entry, process);
        expect(item.percentOfOil, `${entry.name} in ${process}`).toBeGreaterThanOrEqual(eff.typicalLow);
        expect(item.percentOfOil, `${entry.name} in ${process}`).toBeLessThanOrEqual(eff.typicalHigh);
      }
    }
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
    // Lye water is the sourced home for sugar in a bar (HP:9809, HP:10402; CP:8995).
    expect(sugar?.defaultStage).toBe('lye');

    const sorbitol = catalogEntryById('sorbitol');
    expect(sorbitol?.name).toBe('Sorbitol');
    expect(sorbitol?.typicalLow).toBe(0.5);
    expect(sorbitol?.typicalHigh).toBe(2);
    expect(sorbitol?.defaultStage).toBe('lye'); // mirrors sugar — HP:9809 lists them as one line
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
  it('offers citric acid for every process at the lye stage; LS states the 1–2% chelator route', () => {
    const citric = catalogEntryById('citric-acid')!;
    expect(citric.name).toBe('Citric acid (anhydrous)');
    expect(citric.defaultStage).toBe('lye');
    expect(citric.processes).toBeUndefined();
    for (const process of ['cp', 'hp', 'ls'] as const) {
      expect(catalogEntriesForProcess(process).some((e) => e.id === 'citric-acid')).toBe(true);
    }
    const cp = effectiveCatalogEntry(citric, 'cp');
    expect([cp.typicalLow, cp.typicalHigh]).toEqual([1, 2]);
    // Was 1–3, described as "wider than CP/HP". The LS text gives the in-lye citrate
    // route as 1–2% of total oil weight (LS:3037) — the same figure as CP's, stated
    // explicitly for LS rather than inherited, so a future CP edit cannot move LS with it.
    const ls = effectiveCatalogEntry(citric, 'ls');
    expect([ls.typicalLow, ls.typicalHigh]).toEqual([1, 2]);
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

  it('sugar: HP overrides the range to 1–5% but keeps the lye-water stage', () => {
    const base = catalogEntryById('sugar-sorbitol')!;
    const hp = effectiveCatalogEntry(base, 'hp');
    expect([hp.typicalLow, hp.typicalHigh]).toEqual([1, 5]);
    expect(hp.defaultStage).toBe('lye');
  });

  it('returns the entry unchanged for a process with no override', () => {
    // EDTA carries no per-process override at all (honey gained an HP one in the bar audit).
    const edta = catalogEntryById('edta')!;
    expect(effectiveCatalogEntry(edta, 'hp')).toEqual(edta);
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

  it('every solution-dosed LS entry defaults to after_cook (a solution basis presupposes a solution — nothing to dose a % of before dilution)', () => {
    for (const entry of ADDITIVE_CATALOG) {
      const ls = effectiveCatalogEntry(entry, 'ls');
      if (ls.doseBasis === 'solution') {
        expect(ls.defaultStage).toBe('after_cook');
      }
    }
  });
});

describe('LS dose corrections and new entries (LS audit 2026-07-27)', () => {
  it('sodium lactate LS: 3–5% into the oils (envelope 1–10 documented, not encoded)', () => {
    const ls = effectiveCatalogEntry(catalogEntryById('sodium-lactate')!, 'ls');
    expect([ls.typicalLow, ls.typicalHigh, ls.defaultStage]).toEqual([3, 5, 'oils']);
  });

  it('sugar LS: 1–6% into the lye water, the rate LS gives every sugar form (LS:1069)', () => {
    // Was 1–5. The 5% ceiling answered to nothing in the LS text: the general rate for
    // sugars in liquid soap is 1–6% of oil weight (LS:1069), and the 30-HTLS chapter's
    // own 3–5% practice (LS:2667) sits inside it. The lye solution is one of LS's two
    // sanctioned homes (LS:1069) and the default every process shares; the oils stay a
    // first-class choice for the paler result a hot lye solution costs (LS:2667).
    const ls = effectiveCatalogEntry(catalogEntryById('sugar-sorbitol')!, 'ls');
    expect([ls.typicalLow, ls.typicalHigh, ls.defaultStage]).toEqual([1, 6, 'lye']);
  });

  it('salt LS: 3–8% at the lye stage, with the salt-curve hazard replacing the bar tag', () => {
    const ls = effectiveCatalogEntry(catalogEntryById('salt')!, 'ls');
    expect([ls.typicalLow, ls.typicalHigh, ls.defaultStage]).toEqual([3, 8, 'lye']);
    expect(ls.hazards).toEqual(['past the salt curve more salt thins, not thickens']);
    const cp = effectiveCatalogEntry(catalogEntryById('salt')!, 'cp');
    expect(cp.hazards).toEqual(['can make the bar crumbly']);
  });

  it('fragrance LS: 0.5–3% of the finished solution (3% max), added after cook/dilution', () => {
    const ls = effectiveCatalogEntry(catalogEntryById('fragrance')!, 'ls');
    expect([ls.typicalLow, ls.typicalHigh, ls.doseBasis, ls.defaultStage]).toEqual([
      0.5, 3, 'solution', 'after_cook',
    ]);
    expect(effectiveCatalogEntry(catalogEntryById('fragrance')!, 'cp').doseBasis).toBeUndefined();
  });

  it('glycerin: LS-only, after dilution only, at the general 1–25% envelope', () => {
    // The lye-phase route (20–25% of oils, or 1–2 parts of the lye solution) is the
    // split-liquid preset, not this entry: only there does the glycerin's mass join the
    // paste and come off the dilution water, which is the accounting the source asks for.
    // What is left for an additive line is the after-the-cook dose — no saponification to
    // accelerate, no lye water to be part of — so the range is the general envelope and
    // the stage list forbids the three cook-time stages outright.
    const g = catalogEntryById('glycerin');
    expect([g?.typicalLow, g?.typicalHigh, g?.defaultStage, g?.processes]).toEqual([
      1, 25, 'after_cook', ['ls'],
    ]);
    expect(g?.stages).toEqual(['after_cook']);
    expect(g?.doseBasis).toBeUndefined(); // % of oil weight
    // The row explains where the cook's glycerin went, in the app's own words.
    expect(g?.note).toMatch(/lye water/i);
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

  it('guar and HEC: thickeners dosed on the finished solution, like their after-cook siblings', () => {
    // Both are dispersed into the DILUTED, COOLED soap at a 0.5–1% concentration — the same
    // after-dilution timing, and the same basis, as pearlizer and wd-shea above. On the oil
    // basis the dose silently shrinks with dilution: 1% of 1,000 g of oils is 10 g, where 1%
    // of the ~3,000 g of solution the gum is actually thickening is 30 g.
    for (const id of ['guar', 'hec']) {
      const e = catalogEntryById(id);
      expect([e?.typicalLow, e?.typicalHigh, e?.defaultStage, e?.doseBasis, e?.processes])
        .toEqual([0.5, 1, 'after_cook', 'solution', ['ls']]);
    }
  });

  it('finished soap extends to LS', () => {
    expect(catalogEntryById('finished-soap')?.processes).toEqual(['hp', 'ls']);
    expect(catalogEntriesForProcess('ls').some((e) => e.id === 'finished-soap')).toBe(true);
  });

  it('ships turkey red castor oil as an LS solution-dosed conditioner', () => {
    const e = catalogEntryById('turkey-red-castor')!;
    expect([e.typicalLow, e.typicalHigh]).toEqual([1, 5]);
    expect(e.doseBasis).toBe('solution');
    expect(e.defaultStage).toBe('after_cook');
    expect(e.processes).toEqual(['ls']);
  });
});

describe('sorbitol mirrors sugar per process (CP source: "same suggested usage rates as sugar")', () => {
  it('CP 0.5–2 (tested to 4 lives in the ceiling, not the range); HP 1–5; LS 1–6', () => {
    const base = catalogEntryById('sorbitol')!;
    const cp = effectiveCatalogEntry(base, 'cp');
    expect([cp.typicalLow, cp.typicalHigh]).toEqual([0.5, 2]);
    const hp = effectiveCatalogEntry(base, 'hp');
    expect([hp.typicalLow, hp.typicalHigh]).toEqual([1, 5]);
    // LS parts from HP here: its own text rates every sugar form at 1–6% of oil weight
    // and puts them in before dilution (LS:1069). The stage is the lye water, like sugar —
    // the HP recipes list "Sugar/sorbitol in lye water" as one line (HP:9809).
    const ls = effectiveCatalogEntry(base, 'ls');
    expect([ls.typicalLow, ls.typicalHigh, ls.defaultStage]).toEqual([1, 6, 'lye']);
    // Structural mirror of the sugar entry — the source's own claim — range AND staging.
    const sugar = catalogEntryById('sugar-sorbitol')!;
    for (const process of ['cp', 'hp', 'ls'] as const) {
      const s = effectiveCatalogEntry(sugar, process);
      const so = effectiveCatalogEntry(base, process);
      expect([so.typicalLow, so.typicalHigh]).toEqual([s.typicalLow, s.typicalHigh]);
      expect([so.defaultStage, so.stages]).toEqual([s.defaultStage, s.stages]);
    }
  });
});

describe('polysorbate-80 (LS post-cook-superfat emulsifier)', () => {
  it('is LS-only, 1–3% of oils, dosed after cook', () => {
    const p = catalogEntryById('polysorbate-80');
    expect(p).toBeDefined();
    expect(p?.name).toBe('Polysorbate 80');
    expect(p?.typicalLow).toBe(1);
    expect(p?.typicalHigh).toBe(3);
    expect(p?.defaultStage).toBe('after_cook');
    expect(p?.processes).toEqual(['ls']);
    expect(catalogEntriesForProcess('ls').some((e) => e.id === 'polysorbate-80')).toBe(true);
    expect(catalogEntriesForProcess('cp').some((e) => e.id === 'polysorbate-80')).toBe(false);
    expect(catalogEntriesForProcess('hp').some((e) => e.id === 'polysorbate-80')).toBe(false);
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

describe('anti-DOS antioxidants', () => {
  it('ships BHT and ROE at the experimentally recommended doses', () => {
    const bht = catalogEntryById('bht')!;
    expect([bht.typicalLow, bht.typicalHigh]).toEqual([0.1, 0.1]); // 1 ppt of oil
    expect(bht.defaultStage).toBe('oils');
    const roe = catalogEntryById('roe')!;
    expect([roe.typicalLow, roe.typicalHigh]).toEqual([0.1, 0.2]); // 1–2 ppt of oil
    expect(roe.defaultStage).toBe('oils');
  });

  it('does not ship the additives the experiment found ineffective alone', () => {
    // Grapefruit seed extract, vitamin C and vitamin E showed no prophylactic effect
    // against DOS; offering them as anti-DOS doses would advertise a null result.
    for (const id of ['gse', 'vitamin-c', 'vitamin-e']) {
      expect(catalogEntryById(id)).toBeUndefined();
    }
  });
});

describe('LS defaults answer to the liquid-soap source, not to CP by inheritance', () => {
  const ls = (id: string) => effectiveCatalogEntry(catalogEntryById(id)!, 'ls');

  // Each row is a figure the source states for LIQUID SOAP, with the line it is stated on.
  // These were audited one ingredient at a time; every one of the six below was serving a
  // CP- or HP-audited number to LS before, and three of them were also staged wrong.
  it.each([
    // Sugar: the LS "how to use" figure. The lye solution is one of its two sanctioned
    // homes (LS:1069) and the default the bar books share; the oils stay selectable for
    // the paler result a hot lye solution costs (LS:2667).
    ['sugar-sorbitol', 1, 6, 'lye'],
    // Every sugar FORM shares one LS rate — table sugar, honey, molasses, sorbitol — dosed
    // into the lye solution or the oils, before dilution. (LS:1069)
    // Sorbitol mirrors sugar exactly — the HP source lists "Sugar/sorbitol in lye water"
    // (HP:9809). Honey is the deliberate exception: it browns and overheats, so the
    // gentler oils stay its LS home (LS:1069, LS:2667).
    ['sorbitol', 1, 6, 'lye'],
    ['honey', 1, 6, 'oils'],
    // The citrate chelator route: into the lye solution, where the alkali makes citrate
    // in situ. (LS:3037)
    ['chelator', 1, 2, 'lye'],
    ['citric-acid', 1, 2, 'lye'],
    // Finished soap as an emulsion accelerant. DERIVED: the source gives a quarter to half
    // an ounce into the heated oils (LS:2559) against the 16 oz oil weight its worked
    // recipes use (LS:2090, LS:2739). The ounces are the source's; the percentage is ours.
    ['finished-soap', 1.5, 3, 'oils'],
  ])('%s doses %s–%s%% of oil at the %s stage in LS', (id, low, high, stage) => {
    const e = ls(id as string);
    expect([e.typicalLow, e.typicalHigh]).toEqual([low, high]);
    expect(e.defaultStage).toBe(stage);
  });

  // The ones that were already right, kept here so a future edit cannot quietly move them:
  // salt 3–8% of oil, into the oils or the lye water (LS:2630); sodium lactate at the
  // author's own 3–5% into the oils (LS:3019); eugenol in parts per thousand of the oils
  // (LS:2572); and the four solution-dosed additives, each stated as a share of the
  // finished, diluted soap and added after dilution — fragrance (LS:2950), turkey red
  // castor (LS:1263), water-dispersible shea (LS:3030), guar gum (LS:3101).
  it.each([
    ['salt', 3, 8, 'oil', 'lye'],
    ['sodium-lactate', 3, 5, 'oil', 'oils'],
    ['fragrance', 0.5, 3, 'solution', 'after_cook'],
    ['turkey-red-castor', 1, 5, 'solution', 'after_cook'],
    ['wd-shea', 1, 25, 'solution', 'after_cook'],
    ['guar', 0.5, 1, 'solution', 'after_cook'],
  ])('%s keeps its sourced LS dose (%s–%s%% of %s at %s)', (id, low, high, basis, stage) => {
    const e = ls(id as string);
    expect([e.typicalLow, e.typicalHigh]).toEqual([low, high]);
    expect(e.doseBasis ?? 'oil').toBe(basis);
    expect(e.defaultStage).toBe(stage);
  });

  it('doses eugenol in parts per thousand, not percent (LS:2572)', () => {
    const e = ls('eugenol');
    expect(e.doseUnit).toBe('ppt');
    expect([e.typicalLow, e.typicalHigh]).toEqual([1, 3]);
  });

  // A solution basis is a claim that the finished, diluted soap exists to dose against —
  // so it may only ship on entries the source dilutes into, and every one of those is
  // added after dilution.
  it('ships a solution basis only on after-dilution entries', () => {
    for (const entry of ADDITIVE_CATALOG) {
      const e = effectiveCatalogEntry(entry, 'ls');
      if ((e.doseBasis ?? 'oil') === 'solution') {
        expect(e.defaultStage, `${e.name} doses on the solution`).toBe('after_cook');
      }
    }
  });
});

describe('entries the LS source never names are not offered there', () => {
  // The catalog is not bound to one book — BHT and ROE ship on an experiment's figures,
  // and the app knowingly rejects that book's 1% BHT. So "absent from the source" is not
  // by itself disqualifying. It is disqualifying HERE because these two had nothing else
  // either: their LS ranges and stages were pure CP inheritance, never a decision.
  it.each(['cetyl-alcohol', 'titanium-dioxide'])('%s is CP/HP only', (id) => {
    const entry = catalogEntryById(id)!;
    expect(isAdditiveOfferedFor(entry, 'ls')).toBe(false);
    expect(isAdditiveOfferedFor(entry, 'cp')).toBe(true);
    expect(isAdditiveOfferedFor(entry, 'hp')).toBe(true);
    expect(catalogEntriesForProcess('ls').some((e) => e.id === id)).toBe(false);
  });

  // The counter-case, so this never generalises into "insoluble powders are wrong in
  // liquid soap": the source puts charcoal and clays into the oils at the very start and
  // says a more viscous solution slows their settling (LS:2991). They stay.
  it.each(['charcoal', 'clay'])('%s keeps its sourced LS place', (id) => {
    const entry = catalogEntryById(id)!;
    expect(isAdditiveOfferedFor(entry, 'ls')).toBe(true);
    expect(effectiveCatalogEntry(entry, 'ls').defaultStage).toBe('oils');
  });
});

describe('every additive carries its own incorporation note', () => {
  // The typical range answers HOW MUCH; the note answers HOW — dissolve it first, melt the
  // flakes, hydrate the gum in glycerin, match the polysorbate to the oil. The app's own
  // words throughout: the sources are read for their facts and numbers, never their
  // sentences, and the wording was measured against both LS extractions before shipping.
  const EXEMPT = new Set([
    // Offered in LS but with no liquid-soap guidance in any source this app follows, so
    // there is nothing to say that would not be invented. Listed rather than silently
    // skipped: if a source turns up, they get notes.
    'oatmeal',
    'loofah',
    // CP/HP only — out of scope for the LS audit that produced these notes.
    'cetyl-alcohol',
    'titanium-dioxide',
    'yogurt',
  ]);

  it.each(catalogEntriesForProcess('ls').map((e) => e.id))('%s explains how to add it', (id) => {
    if (EXEMPT.has(id)) return;
    const note = catalogEntryById(id)!.note;
    expect(note, `${id} has no note`).toBeTruthy();
    // Long enough to carry a method, not a label.
    expect(note!.length).toBeGreaterThan(60);
  });

  it('never states a DOSE in prose — the range above the note is the only one', () => {
    // A dose written into prose is a second source of truth for the same number and drifts
    // from typicalLow/High the first time either moves. The range renders directly above.
    //
    // One exemption, and it is not a dose: sodium lactate's note quotes the STRENGTH of the
    // liquid it is sold as, because a maker holding a weaker solution than the ranges assume
    // would under-dose without knowing it. That figure describes the bottle, not the recipe,
    // so it cannot drift from anything this entry holds.
    const STRENGTH_NOT_DOSE = new Set(['sodium-lactate']);
    for (const entry of ADDITIVE_CATALOG) {
      if (!entry.note || STRENGTH_NOT_DOSE.has(entry.id)) continue;
      const percents = entry.note.match(/\d+(\.\d+)?\s?%/g) ?? [];
      expect(percents, `${entry.id} hardcodes a percentage in prose`).toEqual([]);
    }
    // And the exemption stays honest: the quoted strength must not equal either end of its
    // own dose range, which is the collision the rule above exists to prevent.
    const sl = catalogEntryById('sodium-lactate')!;
    for (const p of sl.note!.match(/\d+(\.\d+)?(?=\s?%)/g) ?? []) {
      expect([sl.typicalLow, sl.typicalHigh]).not.toContain(Number(p));
    }
  });
});

describe('LS offers only the stages its source sanctions', () => {
  const ls = (id: string) => effectiveCatalogEntry(catalogEntryById(id)!, 'ls');

  // The seg used to offer all four stages for every additive, weighting three wrong
  // answers equally with the right one: guar into the lye water is destroyed, fragrance
  // there flashes off, turkey red before the cook defeats the point of the sulfated form.
  it.each([
    // One sanctioned moment each — the panel states these instead of offering a control.
    ['chelator', ['lye']],
    ['charcoal', ['oils']],
    ['clay', ['oils']],
    ['eugenol', ['oils']],
    ['finished-soap', ['oils']],
    ['fragrance', ['after_cook']],
    ['guar', ['after_cook']],
    ['hec', ['after_cook']],
    ['pearlizer', ['after_cook']],
    ['wd-shea', ['after_cook']],
    ['turkey-red-castor', ['after_cook']],
    ['polysorbate-80', ['after_cook']],
    ['glycerin', ['after_cook']],
    // A real choice, and only the sanctioned members of it. Trace is absent from every one
    // of these but sugar: LS names the lye solution, the oils and the dilution water. Sugar
    // alone keeps trace as an optional before-the-cook route — unusual, not wrong, since
    // the cook sterilises it — so every process offers the same three choices for it.
    ['sugar-sorbitol', ['lye', 'oils', 'trace']], // LS:1069 + trace by decision
    ['sorbitol', ['lye', 'oils', 'trace']],       // mirrors sugar
    ['honey', ['lye', 'oils']],                   // LS:1069
    ['salt', ['lye', 'oils', 'after_cook']],      // LS:2630 + LS:3091 (thickening)
    ['sodium-lactate', ['lye', 'oils', 'after_cook']], // LS:3019
    ['silk', ['lye', 'after_cook']],              // LS:3060 + LS:3347
    ['citric-acid', ['lye', 'after_cook']],       // LS:3037 + the neutralization route
  ])('%s', (id, stages) => {
    expect(ls(id as string).stages).toEqual(stages);
  });

  it('never defaults an additive to a stage it does not sanction', () => {
    for (const entry of catalogEntriesForProcess('ls')) {
      const e = effectiveCatalogEntry(entry, 'ls');
      if (!e.stages) continue;
      expect(e.stages, `${e.name}'s default sits outside its own list`).toContain(e.defaultStage);
    }
  });

  it('gives each process its own answer where the sources differ — fragrance is the sharp case', () => {
    // After dilution in liquid soap, after the cook in hot process, at trace in a bar. The
    // CP/HP audit (2026-09-07) gave the bar processes their own lists; no single
    // entry-level list could have carried all three.
    const frag = catalogEntryById('fragrance')!;
    expect(effectiveCatalogEntry(frag, 'cp').stages).toEqual(['trace']);
    expect(effectiveCatalogEntry(frag, 'hp').stages).toEqual(['after_cook']);
    expect(effectiveCatalogEntry(frag, 'ls').stages).toEqual(['after_cook']);
  });

  it("inherits the bar audit's list where the LS source is silent, never a wider one", () => {
    // These have no LS guidance of their own. Rather than leaving every stage open, LS now
    // reads the base (bar-audited) list — a narrower claim than "anywhere", and one that is
    // physically right for a liquid too (an antioxidant goes into the oils; a chelator into
    // the lye). Top is filtered out by the picker for LS regardless.
    expect(ls('oatmeal').stages).toEqual(['oils', 'trace', 'top']);
    expect(ls('loofah').stages).toEqual(['oils', 'top']);
    expect(ls('edta').stages).toEqual(['lye']);
    expect(ls('bht').stages).toEqual(['oils']);
    expect(ls('roe').stages).toEqual(['oils']);
  });
});

describe('a note explains every stage its entry offers', () => {
  // The defect this locks out, found in review: the incorporation notes and the sanctioned
  // stage lists shipped in separate commits and were never reconciled, so four additives
  // offered a cell their own prose never mentioned — sodium lactate's dilution-water route,
  // silk's after-dilution amino acids, citric acid's after-cook neutralization, and honey's
  // lye option. A maker could pick a stage and find no guidance for the thing they picked.
  const MENTIONS: Record<string, RegExp> = {
    lye: /lye (water|solution)/i,
    oils: /oils/i,
    trace: /trace/i,
    after_cook: /after (the )?(cook|dilution)|diluted|dilution water/i,
    top: /on top|decorat/i,
  };

  it.each(['cp', 'hp', 'ls'] as const)('%s', (process) => {
    for (const entry of catalogEntriesForProcess(process)) {
      const e = effectiveCatalogEntry(entry, process);
      // Only multi-stage entries: where there is one sanctioned moment the panel states it
      // on the row itself, so the note does not have to name it again.
      if (!e.stages || e.stages.length < 2 || !e.note) continue;
      for (const stage of e.stages) {
        expect(
          MENTIONS[stage].test(e.note),
          `${e.name} offers "${stage}" in ${process} but its note never explains that route`,
        ).toBe(true);
      }
    }
  });
});

describe('sugar and sorbitol: lye water by default, with the oils and trace beside it', () => {
  it.each([
    ['cp', ['lye', 'oils', 'trace']],
    ['ls', ['lye', 'oils', 'trace']],
    // HP alone also sanctions the sugars after the cook (HP:5040).
    ['hp', ['lye', 'oils', 'trace', 'after_cook']],
  ] as const)('%s', (process, stages) => {
    for (const id of ['sugar-sorbitol', 'sorbitol']) {
      const e = effectiveCatalogEntry(catalogEntryById(id)!, process);
      expect(e.stages, `${id} in ${process}`).toEqual(stages);
      expect(e.defaultStage, `${id} in ${process}`).toBe('lye');
    }
  });
});

// ---------------------------------------------------------------------------------------
// CP / HP stage audit (2026-09-07). Every entry a bar maker can pick carries the stage its
// own source names and offers the others only where that process sanctions them — the
// same treatment the LS audit gave liquid soap. Citations are CP:<line> / HP:<line> into
// the extracted texts; "practice" marks the one figure the books dose but never stage.
// ---------------------------------------------------------------------------------------
describe('CP: each additive defaults to its sourced stage and offers only sanctioned ones', () => {
  const cp = (id: string) => effectiveCatalogEntry(catalogEntryById(id)!, 'cp');
  it.each([
    ['chelator', 'lye', ['lye']],                       // CP:10596
    ['citric-acid', 'lye', ['lye']],                    // CP:10596
    ['edta', 'lye', ['lye']],                           // CP:10593
    ['cetyl-alcohol', 'trace', ['trace']],              // CP:5817 melted, after trace
    ['charcoal', 'oils', ['oils', 'trace']],            // CP:16777, 8996
    ['clay', 'oils', ['oils', 'trace']],                // CP:9912
    ['oatmeal', 'oils', ['oils', 'trace', 'top']],      // CP:16837, 17611
    ['honey', 'oils', ['lye', 'oils', 'trace']],        // CP:16837; sugars CP:5790
    ['fragrance', 'trace', ['trace']],                  // CP:16777 (EO after trace)
    ['salt', 'lye', ['lye', 'oils', 'top']],            // CP:10618, 17606
    ['sodium-lactate', 'lye', ['lye', 'oils', 'trace']], // dose CP:10669; stage: practice
    ['silk', 'lye', ['lye']],                           // CP:10697 into the water before the NaOH
    ['bht', 'oils', ['oils']],                          // CP:5563
    ['roe', 'oils', ['oils']],                          // CP:5563, 17611
    ['titanium-dioxide', 'oils', ['oils', 'lye']],      // dispersible in oil or water (HP:8514)
    ['eugenol', 'oils', ['oils']],                      // CP:10841
    ['loofah', 'oils', ['oils', 'top']],                // HP:11161 (CP silent)
  ] as const)('%s', (id, defaultStage, stages) => {
    expect(cp(id).defaultStage).toBe(defaultStage);
    expect(cp(id).stages).toEqual(stages);
  });
});

describe('HP: each additive defaults to its sourced stage and offers only sanctioned ones', () => {
  const hp = (id: string) => effectiveCatalogEntry(catalogEntryById(id)!, 'hp');
  it.each([
    ['chelator', 'lye', ['lye']],                                  // HP:5148
    ['citric-acid', 'lye', ['lye']],                               // HP:5148
    ['cetyl-alcohol', 'trace', ['trace']],                         // HP:5059
    ['charcoal', 'oils', ['oils', 'trace', 'after_cook']],         // HP:11081-11084
    ['clay', 'oils', ['oils', 'trace', 'after_cook']],             // HP:11083
    ['oatmeal', 'oils', ['oils', 'after_cook', 'top']],            // HP:11108-11116
    ['honey', 'oils', ['lye', 'oils', 'trace', 'after_cook']],     // HP:5033-5040 (sugars)
    ['fragrance', 'after_cook', ['after_cook']],                   // HP:10653
    ['salt', 'lye', ['lye', 'oils', 'top']],                       // HP:9414-9417, 11093
    ['sodium-lactate', 'trace', ['lye', 'trace']],                 // HP:9411 after a thick trace
    ['silk', 'lye', ['lye']],                                      // HP:11165
    ['bht', 'oils', ['oils', 'after_cook']],                       // HP:5797 with the PCSF
    ['roe', 'oils', ['oils', 'after_cook']],                       // HP:5797
    ['eugenol', 'oils', ['oils']],                                 // HP:9361
    ['finished-soap', 'oils', ['oils']],                           // HP:9292
    ['yogurt', 'after_cook', ['after_cook']],                      // HP:9478
  ] as const)('%s', (id, defaultStage, stages) => {
    expect(hp(id).defaultStage).toBe(defaultStage);
    expect(hp(id).stages).toEqual(stages);
  });
});

describe('bar-only additives from the CP recipes (2026-09-07), with the HP reference section for their HP stage', () => {
  // Every figure is a recipe table line or chapter figure from the CP text; the LS text is
  // silent on all six, so — like cetyl alcohol and titanium dioxide — none is offered there.
  it.each([
    // id, name, low, high, CP default, CP stages, HP default, HP stages
    ['cocoa-powder', 'Cocoa powder', 1, 1, 'oils', ['oils', 'trace'], 'oils', ['oils', 'lye', 'after_cook']],       // CP:17160; HP:11179
    ['milk-powder', 'Milk powder', 1, 1.5, 'trace', ['trace', 'oils'], 'after_cook', ['after_cook', 'oils']],       // CP:17757, 17612, 17673; HP:11122
    ['coffee-grounds', 'Coffee grounds', 2, 3, 'trace', ['trace', 'top'], 'after_cook', ['after_cook', 'top']],     // CP:16975, 16996; HP:11150
    ['seeds', 'Seeds (poppy, etc.)', 1, 1, 'trace', ['trace', 'top'], 'after_cook', ['after_cook', 'top']],         // CP:17090, 17108; HP:11144
    ['botanicals', 'Dried botanicals, ground', 0.25, 0.25, 'oils', ['oils', 'trace', 'top'], 'after_cook', ['after_cook', 'top']], // CP:17614; HP:11097
    ['arrowroot', 'Arrowroot powder', 1, 1, 'trace', ['trace'], 'after_cook', ['trace', 'after_cook']],             // CP:17605, 17673
  ] as const)('%s', (id, name, low, high, cpDefault, cpStages, hpDefault, hpStages) => {
    const base = catalogEntryById(id)!;
    expect(base.name).toBe(name);
    expect(base.processes).toEqual(['cp', 'hp']);
    const cp = effectiveCatalogEntry(base, 'cp');
    expect([cp.typicalLow, cp.typicalHigh, cp.defaultStage, cp.stages]).toEqual([low, high, cpDefault, cpStages]);
    const hp = effectiveCatalogEntry(base, 'hp');
    expect([hp.defaultStage, hp.stages]).toEqual([hpDefault, hpStages]);
    expect(catalogEntriesForProcess('ls').some((e) => e.id === id), `${id} offered in LS`).toBe(false);
  });

  it('milk powder carries the sugars hazard — milk browns and overheats in fresh lye (CP:10453)', () => {
    expect(catalogEntryById('milk-powder')?.hazards).toContain('can tunnel/overheat');
  });
});

describe('additive packs (one-press starting sets, staged by the catalog)', () => {
  it('offers the lather pack everywhere and the two bar packs in their own process', () => {
    const byId = Object.fromEntries(ADDITIVE_PACKS.map((pack) => [pack.id, pack]));
    expect(byId['lather'].processes).toBeUndefined();
    expect(byId['fluid-hp'].processes).toEqual(['hp']);
    expect(byId['hard-bar'].processes).toEqual(['cp']);
  });

  it('fluid HP pack: the HP fluidity set — sodium lactate, sugar, yogurt, eugenol (HP:9411, 9543, 9478, 9361)', () => {
    const pack = ADDITIVE_PACKS.find((p) => p.id === 'fluid-hp')!;
    expect(pack.items).toEqual([
      { catalogId: 'sodium-lactate', percentOfOil: 3 },
      { catalogId: 'sugar-sorbitol', percentOfOil: 3 },
      { catalogId: 'yogurt', percentOfOil: 3 },
      { catalogId: 'eugenol', percentOfOil: 2 },
    ]);
  });

  it('hard-bar pack: the CP unmolding aids — sodium lactate and salt (CP:10669, 10639)', () => {
    const pack = ADDITIVE_PACKS.find((p) => p.id === 'hard-bar')!;
    expect(pack.items).toEqual([
      { catalogId: 'sodium-lactate', percentOfOil: 1 },
      { catalogId: 'salt', percentOfOil: 0.5 },
    ]);
  });

  it('every pack item is offered in every process the pack is, and its dose sits inside that process\'s typical range', () => {
    for (const pack of ADDITIVE_PACKS) {
      for (const process of pack.processes ?? (['cp', 'hp', 'ls'] as const)) {
        for (const item of pack.items) {
          const entry = catalogEntryById(item.catalogId)!;
          if (!isAdditiveOfferedFor(entry, process)) continue; // the lather pack skips these by design
          const e = effectiveCatalogEntry(entry, process);
          expect(item.percentOfOil, `${pack.id}/${item.catalogId} in ${process}`).toBeGreaterThanOrEqual(e.typicalLow);
          expect(item.percentOfOil, `${pack.id}/${item.catalogId} in ${process}`).toBeLessThanOrEqual(e.typicalHigh);
        }
      }
    }
  });
});
