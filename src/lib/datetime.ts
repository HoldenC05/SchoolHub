export function toLocalInput(s: string | null | undefined): string {
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(s.trim());
  if (!m) return "";
  const [, y, mo, d, h = "00", mi = "00"] = m;
  return `${y}-${mo}-${d}T${h}:${mi}`;
}
