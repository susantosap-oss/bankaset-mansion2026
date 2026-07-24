export type Grade = 'A' | 'B' | 'C' | 'D';

export function gradeFromScore(score: number): Grade {
  if (score >= 0.75) return 'A';
  if (score >= 0.50) return 'B';
  if (score >= 0.25) return 'C';
  return 'D';
}

export const GRADE_LABELS: Record<Grade, string> = {
  A: 'Sangat Potensial',
  B: 'Potensial',
  C: 'Cukup',
  D: 'Kurang',
};

export const GRADE_COLORS: Record<Grade, string> = {
  A: 'bg-emerald-100 text-emerald-800',
  B: 'bg-blue-100 text-blue-800',
  C: 'bg-amber-100 text-amber-800',
  D: 'bg-red-100 text-red-800',
};
