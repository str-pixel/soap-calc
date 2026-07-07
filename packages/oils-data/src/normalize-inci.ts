/** Normalize INCI names for glossary lookup (case/punctuation insensitive). */
export function normalizeInciName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*\(\s*/g, ' (')
    .replace(/\s*\)\s*/g, ') ')
    .replace(/[^a-z0-9()/%\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isPlausibleInciName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 3) return false;
  if (!/[A-Za-z]/.test(trimmed)) return false;
  return true;
}
