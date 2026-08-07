import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeGeneratedJson } from './write-generated.js';

/**
 * The contract under test: `generatedAt` means "when the data last changed", not "when the
 * build last ran". build-canonical stamps every payload with a fresh timestamp; the writer
 * must keep a rebuild of UNCHANGED data byte-identical to the file already on disk (so
 * `npm run build:oils` never dirties a clean tree), while a real data change still moves
 * the timestamp with the data.
 */
describe('writeGeneratedJson', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'write-generated-'));
    path = join(dir, 'out.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const OLD_STAMP = '2026-07-19T23:51:31.113Z';
  const NEW_STAMP = '2026-08-07T00:00:00.000Z';

  it('writes a fresh file, pretty-printed with a trailing newline, when none exists', () => {
    const wrote = writeGeneratedJson(path, { version: '1.0.0', generatedAt: NEW_STAMP, oils: [1, 2] });
    expect(wrote).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe(
      JSON.stringify({ version: '1.0.0', generatedAt: NEW_STAMP, oils: [1, 2] }, null, 2) + '\n',
    );
  });

  it('a rebuild of unchanged data keeps the file byte-identical — the old generatedAt survives', () => {
    writeGeneratedJson(path, { version: '1.0.0', generatedAt: OLD_STAMP, oils: [1, 2] });
    const before = readFileSync(path, 'utf8');
    const wrote = writeGeneratedJson(path, { version: '1.0.0', generatedAt: NEW_STAMP, oils: [1, 2] });
    expect(wrote).toBe(false);
    expect(readFileSync(path, 'utf8')).toBe(before);
    expect(readFileSync(path, 'utf8')).toContain(OLD_STAMP);
  });

  it('a real data change moves the timestamp WITH the data', () => {
    writeGeneratedJson(path, { version: '1.0.0', generatedAt: OLD_STAMP, oils: [1, 2] });
    const wrote = writeGeneratedJson(path, { version: '1.0.0', generatedAt: NEW_STAMP, oils: [1, 2, 3] });
    expect(wrote).toBe(true);
    const after = readFileSync(path, 'utf8');
    expect(after).toContain(NEW_STAMP);
    expect(after).not.toContain(OLD_STAMP);
    expect(JSON.parse(after).oils).toEqual([1, 2, 3]);
  });

  it('generatedAt keeps its original key position when the old stamp is judged against', () => {
    // The comparison substitutes the OLD stamp into the NEW payload and serializes both the
    // same way — so a payload whose only difference is the stamp matches even though the
    // stamp sits mid-object, between other keys.
    writeGeneratedJson(path, { a: 1, generatedAt: OLD_STAMP, z: 2 });
    const before = readFileSync(path, 'utf8');
    expect(writeGeneratedJson(path, { a: 1, generatedAt: NEW_STAMP, z: 2 })).toBe(false);
    expect(readFileSync(path, 'utf8')).toBe(before);
  });

  it('an unparseable existing file is rewritten fresh rather than trusted', () => {
    writeFileSync(path, 'not json{');
    const wrote = writeGeneratedJson(path, { generatedAt: NEW_STAMP, oils: [] });
    expect(wrote).toBe(true);
    expect(JSON.parse(readFileSync(path, 'utf8')).generatedAt).toBe(NEW_STAMP);
  });

  it('an existing file with different formatting is rewritten — deep-equal is judged on bytes, not values', () => {
    // A hand-edited or differently-serialized file must not be left stale just because its
    // VALUES match: the build's own serialization is the canonical form.
    writeFileSync(path, JSON.stringify({ generatedAt: OLD_STAMP, oils: [1] }) + '\n'); // no indentation
    const wrote = writeGeneratedJson(path, { generatedAt: NEW_STAMP, oils: [1] });
    expect(wrote).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe(
      JSON.stringify({ generatedAt: NEW_STAMP, oils: [1] }, null, 2) + '\n',
    );
  });
});
