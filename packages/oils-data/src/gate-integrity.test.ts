import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p: string) => readFileSync(join(repoRoot, p), 'utf8');

/**
 * Guards the GATE ITSELF, because the gate is what everything else is checked against.
 *
 * `npm test` looks like the bar and is not: it runs typecheck, oils validation and the
 * three vitest suites, but NOT the Playwright job, which CI runs separately. A branch
 * therefore passed every local check while a spec that had been on main all along stayed
 * broken on it for two days. `npm run gate` exists to be the one command equal to CI —
 * and it is only worth anything for as long as that equality holds, which nothing was
 * checking. A CI job added later would silently fall outside it exactly as e2e did.
 *
 * Note what this file does NOT do: assert a hand-written list of commands. That list
 * would go stale the same way. It derives the expectation from the workflow itself, so
 * adding a step to CI fails this test until the gate runs it too.
 */
describe('the gate runs everything CI runs', () => {
  /** Every `run:` step in the workflow that invokes a repo npm script. */
  function ciNpmCommands(): string[] {
    const workflow = read('.github/workflows/test.yml');
    const runs = [...workflow.matchAll(/^\s*(?:-\s*)?run:\s*(.+)$/gm)].map((m) => m[1].trim());
    return runs.filter(
      (c) =>
        /^npm\s+(test|run\s)/.test(c) &&
        // `npm ci` is environment setup, not a check; `playwright install` likewise.
        !/^npm\s+ci\b/.test(c),
    );
  }

  const gate = (): string => {
    const pkg = JSON.parse(read('package.json')) as { scripts?: Record<string, string> };
    const script = pkg.scripts?.gate;
    if (!script) throw new Error('root package.json has no `gate` script');
    return script;
  };

  it('parses a plausible set of commands out of the workflow (guards against a vacuous pass)', () => {
    // The check below is "every CI command appears in the gate". If the parse above ever
    // returns nothing — a reformatted workflow, a renamed file — that statement becomes
    // vacuously TRUE and this file would go on passing while guarding nothing. That is the
    // precise failure mode this whole test exists to prevent, so it is asserted here first.
    const found = ciNpmCommands();
    expect(found.length).toBeGreaterThanOrEqual(3);
    expect(found).toContain('npm test');
  });

  it('includes every npm command the workflow runs', () => {
    for (const cmd of ciNpmCommands()) {
      expect(gate(), `CI runs \`${cmd}\` but \`npm run gate\` does not`).toContain(cmd);
    }
  });

  it('runs the e2e suite — the job whose omission started this', () => {
    // Named explicitly rather than left to the loop: e2e is the one CI job that `npm test`
    // does not cover, so it is the one whose absence is silent.
    expect(gate()).toMatch(/test:e2e/);
  });

  it('is what AGENTS.md tells a contributor to run, and says npm test is not', () => {
    // The instruction file is part of the mechanism: the previous wording named `npm test`
    // as the bar, which is what made the gap invisible in the first place.
    const agents = read('AGENTS.md');
    expect(agents).toMatch(/npm run gate/);
    expect(agents).toMatch(/`npm test` is NOT the gate/);
  });
});
