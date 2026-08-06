const LETTER_POINTS: Record<string, number> = {
  "A+": 4.0,
  A: 4.0,
  "A-": 3.7,
  "B+": 3.3,
  B: 3.0,
  "B-": 2.7,
  "C+": 2.3,
  C: 2.0,
  "C-": 1.7,
  "D+": 1.3,
  D: 1.0,
  "D-": 0.7,
  F: 0.0,
};

export interface ParsedGrade {
  points: number;
  percent: number | null;
  raw: string;
}

function percentToPoints(p: number): number {
  return Math.max(0, Math.min(4, p / 25));
}

export function parseGrade(raw: string | null | undefined): ParsedGrade | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const pct = s.match(/^(\d{1,3}(?:\.\d+)?)\s*%?$/);
  if (pct) {
    const v = parseFloat(pct[1]);
    if (v >= 0 && v <= 100) return { points: percentToPoints(v), percent: v, raw: s };
    return null;
  }
  const frac = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (frac) {
    const n = parseFloat(frac[1]);
    const d = parseFloat(frac[2]);
    if (d > 0 && n >= 0) {
      const v = (n / d) * 100;
      return { points: percentToPoints(v), percent: v, raw: s };
    }
  }
  const letter = s.toUpperCase();
  if (LETTER_POINTS[letter] !== undefined) return { points: LETTER_POINTS[letter], percent: null, raw: s };
  return null;
}

export function pointsToLetter(p: number): string {
  if (p >= 3.85) return "A";
  if (p >= 3.5) return "A-";
  if (p >= 3.15) return "B+";
  if (p >= 2.85) return "B";
  if (p >= 2.5) return "B-";
  if (p >= 2.15) return "C+";
  if (p >= 1.85) return "C";
  if (p >= 1.5) return "C-";
  if (p >= 1.15) return "D+";
  if (p >= 0.85) return "D";
  if (p >= 0.5) return "D-";
  return "F";
}

export interface GradeSummary {
  count: number;
  averagePoints: number | null;
  averagePercent: number | null;
  letter: string | null;
}

export function summarizeGrades(grades: Array<string | null | undefined>): GradeSummary {
  const parsed: ParsedGrade[] = [];
  for (const g of grades) {
    const p = parseGrade(g);
    if (p) parsed.push(p);
  }
  if (parsed.length === 0) {
    return { count: 0, averagePoints: null, averagePercent: null, letter: null };
  }
  const avgPoints = parsed.reduce((sum, p) => sum + p.points, 0) / parsed.length;
  const percents = parsed.filter((p) => p.percent !== null);
  const avgPercent =
    percents.length === parsed.length
      ? percents.reduce((sum, p) => sum + (p.percent as number), 0) / parsed.length
      : null;
  return {
    count: parsed.length,
    averagePoints: Math.round(avgPoints * 100) / 100,
    averagePercent: avgPercent === null ? null : Math.round(avgPercent * 10) / 10,
    letter: pointsToLetter(avgPoints),
  };
}
