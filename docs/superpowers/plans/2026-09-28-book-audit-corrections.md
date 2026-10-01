# Book-Citation Audit Corrections — Record

**Dates:** audit 2026-09-27, Scientific-text audit 2026-09-28, implementation and review 2026-09-29, final gate 2026-10-01.

**Goal:** Every claim the app attributes to one of its four source texts (the cold-process, hot-process and liquid-soap texts, cited `CP:<n>` / `HP:<n>` / `LS:<n>`, and the experimental soap-chemistry text, cited `Sci:<n>`) must be something that text actually says, and every shipped sentence derived from them must say no more than its source. Citation conventions are the ones recorded in `2026-09-19-review-fixes.md`.

**Scope audited:** all 473 numbered citation sites in `packages/` plus the un-numbered attributions beside them ("the LS text never names it", "no source gives", "the book's own…"), and the app's chemistry claims against the experimental text. Not audited: `docs/` plans and specs, and claims that carry no attribution.

**Audit totals (numbered citations):** 401 supported, 30 wrong line (claim true, pointer off), 8 misquote, 2 unsupported, 3 contradicted, 29 overreach (14 of them one repeated claim). The 401 were agent verdicts with a 12-row spot check; the final review later found one of them (clay into the oils, cited CP:9912) was itself wrong, so that class is not clean.

## What shipped (all on branch `book-audit-corrections-2026-09-29`)

### User-facing copy corrected (each with a test shown red first)

| Where | Was | Now | Why |
|---|---|---|---|
| `insights.ts` lye_excess_bar | "adding citric acid to a bar does not lower its pH, it just frees fatty acids" | sentence removed; the sourced remedy stays (CP:14028-14037, 14064-14070) | the experimental text says finished soap can be acidified and that makers do it to lower pH (Sci:2768, 3850); the LS text's own neutralization route consumes excess lye (LS:1216, 1232); the app's Neutralize panel does the same |
| `AdditivesPanel.tsx` HP hint | "the hot paste browns milk sugars and drives off scent"; "colorants … go in after the cook" | once the lye is spent it cannot react with the fragrance (HP:10244-10247, 8319-8320); only portion colours wait for the cook, a single colour goes in with the oils (HP:11331-11338, 10649-10651) | no text says heat drives scent off; the CP text rejects the flash-point and boiling-point versions for both bar processes (CP:9844-9866) |
| `AdditivesPanel.tsx` CP hint | "Beeswax and candelilla are oils too, at 1–2%" | 1–2% for beeswax alone (CP:9179); candelilla and other waxes go in the oils list without a rate | no source doses candelilla |
| `AdditivesPanel.tsx` LS dose | free fatty acids "typically 5–10%" | lauric or myristic at 5–10% (LS:2574-2581) | the LS no-paste chapter doses only those two; its stearic figure, 3–8%, is a thickening rate (LS:1246) |
| `insights.ts` split_liquid_high_trace_liquid | "Expect faster trace, softer bars, or a wetter batter" | "softer at unmolding, a longer cure, or a wetter batter"; rule limited to CP and HP | more water slowed trace (Sci:3488, 3340); hardness converges with cure (Sci:3314, 3321-3324, 3338); in liquid soap the 1:1 ratio with the liquid at trace is the route the LS text recommends (LS:3055) — owner decision 2026-09-30 |
| `settingsFields.ts` lye concentration | "a harder bar" | "a bar that is harder at unmolding" | Sci:3338, 3340 |
| `PreservativeSnippet.tsx` | milk, beer or botanicals make a preservative "necessary" | milk or beer necessary (LS:3051, 3228); botanicals or infusions a reason to consider one (LS:2975) | the LS text's own strength |
| `ColorantsPanel.tsx` HP | hot sugar water "is a common choice" | "is one option" | an author preference (HP:11305; HP:8513 uses oil) |
| `FragrancePanel.tsx` LS | "most cloud a little" | "almost all cloud the solution" | LS:16993-16994 |

### Owner decisions recorded

- **Sorbitol in cold process** stays 0.5–2%. The CP text prints both 1–5% (CP:5790-5792) and "same suggested usage rates as sugar" (CP:10514-10517); the comment that denied the first is corrected.
- **Sugars in liquid soap** stay 1–6% with the warning above 6%. The LS text prints 1–6% (LS:1069), 1–5% (LS:3009, 2665) and 3–5% (LS:2667); the comments that said 5% "answered to nothing" are corrected.
- **Milk powder in liquid soap** stays withheld. Ruled out after the cook by the owner (2026-09-29) and by the LS text (milks after dilution, LS:3067); offering it at trace, as one LS recipe does (LS:3326-3340), is an open decision. Pinned by tests that go red under either mutation.
- **Oil data:** hazelnut iodine corrected 97 → 88 (Codex 81–95; AOCS band 83–90; profile-derived 88). Tamanu, pecan and mango seed stay at the build's warn tier: their sources are not strong enough to assert a value.

### Comment-only corrections

False provenance statements in about 30 files (loofah "CP silent" while CP supplies the shipped 0.1–0.3%; the zero-water "reference's own starting entry" at 15 sites; EDTA's stage attributed to the bar texts when it is the experimental text's, Sci:3244 and 3280; a "recipe built on" vegetable shortening that is a blog-link title; a colorant rate "for a single-colour soap" the CP text never qualifies; and others) and about 30 line-number corrections, every new pointer opened and checked.

## Final review (fresh context, 2026-09-29)

No critical findings. Seven important, thirteen minor; all addressed in one fix pass, with tests red-then-green for the two that touched copy.

| # | Finding | Resolution |
|---|---|---|
| I1 | Five new `Sci:` pointers one paragraph off | corrected (Sci:3244, 3338, 3340) |
| I2 | `LS:619` is a full-text line; under the convention it is `LS:249` | corrected |
| I3 | colorant-catalog header claimed web sources for six off-list members and "every" note | header now says the book is not their source and that their rates were not traced |
| I4 | scent comment said the CP text rejects heat driving scent off outright | narrowed to the flash-point and boiling-point versions |
| I5 | "softer bars" was the same overreach the lye-concentration fix removed | copy changed, test and snapshot updated |
| I6 | clay "into the oils" cited CP:9912, a fragrance premix | now CP:17573; trace route CP:9911-9914, 17106-17108 |
| I7 | milk decision recorded wider than the instruction | narrowed to "after the cook"; trace left open |
| M1–M13 | wording and pointer precision inside rewritten lines, a stale test title, an unanchored regex | all fixed except M12 (beer "necessary" rests on the author's practice, LS:3228; accepted) |

Reviewer claims checked and overruled: additive rows do not carry across a process switch (each process loads its own workspace, `useRecipeStorage.ts`), so a milk row reaches liquid soap only through an imported or older saved recipe.

Facts the review corrected in the record: the HP calculator page (p236) shows a fragrance field holding 3, "recommended 3%"; the archive's "0–3%" was a transcription error. The HP text prints a fifth recipe with a post-cook superfat (p246) that counts it inside the batch total.

## Verification

`npm run gate` (unit, builds, browser e2e) exit 0 on 2026-10-01: core 838, oils-data 124, web 1904, e2e 124. Three earlier gate runs failed on timeouts only, each matching a system sleep in the power log.

## Open items

- The LS citric-acid note ("it will not bring a finished soap's pH down") matches LS:1216 but sits beside the Neutralize panel's pH 9–10.5 target.
- `fragrance.ts` ships the phrase "the bar recipes in the cold-process text", a source reference in user-facing copy.
- The sorbitol note's "for a paler result" is carried over from sugar; the CP text says sorbitol is less likely to discolour (CP:10507-10508).
- Tamanu iodine (111) is above every source found and above its own profile (99.6); the profile needs a cited source first.
- `docs/` plans still carry the old strings.
