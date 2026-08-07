import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * A generated-JSON payload as build-canonical emits one: a top-level `generatedAt`
 * ISO timestamp beside the data itself.
 */
type GeneratedPayload = { generatedAt: string } & Record<string, unknown>;

/**
 * Writes a generated JSON file so that `generatedAt` means "when the data last changed",
 * not "when the build last ran".
 *
 * build-canonical stamps every payload with `new Date().toISOString()`, and two of its
 * outputs (canonical-oils.json, canonical-oils-lite.json) are git-tracked — so every local
 * `npm run build:oils` used to dirty a clean tree with a timestamp-only diff, over and over.
 * The honest meaning of the field is the one this writer enforces: if the file on disk holds
 * the same data (compared with the incoming stamp substituted by the existing one, on the
 * exact serialized bytes), the write is SKIPPED and the old timestamp survives; only a real
 * data change moves the timestamp, and it moves with the data.
 *
 * Bytes, not values: the candidate is serialized the same way this writer serializes
 * everything (2-space indent, trailing newline), so a hand-edited or differently-formatted
 * existing file never matches and is rewritten to the canonical form. An unreadable or
 * unparseable existing file is likewise rewritten fresh rather than trusted.
 *
 * Returns true when the file was written, false when it was left untouched.
 */
export function writeGeneratedJson(path: string, payload: GeneratedPayload): boolean {
  const serialize = (p: GeneratedPayload) => JSON.stringify(p, null, 2) + '\n';
  if (existsSync(path)) {
    try {
      const existingRaw = readFileSync(path, 'utf8');
      const existingStamp = (JSON.parse(existingRaw) as GeneratedPayload).generatedAt;
      if (typeof existingStamp === 'string') {
        // Spread-then-override keeps generatedAt at its original key position, so the
        // comparison is stamp-for-stamp on otherwise identical bytes.
        if (serialize({ ...payload, generatedAt: existingStamp }) === existingRaw) {
          return false;
        }
      }
    } catch {
      // Unreadable or unparseable — fall through and write fresh.
    }
  }
  writeFileSync(path, serialize(payload));
  return true;
}
