export function parseTags(tags: string | null | undefined): string[] {
  if (!tags) return [];
  try {
    const parsed = JSON.parse(tags);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function formatTags(tags: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const cleaned = t.trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return JSON.stringify(out);
}

export function mergeTags(...tagGroups: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of tagGroups) {
    for (const t of group) {
      const cleaned = t.trim();
      if (!cleaned) continue;
      const key = cleaned.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(cleaned);
    }
  }
  return out;
}
