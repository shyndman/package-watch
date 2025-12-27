/**
 * Formats date components as an ISO date string (YYYY-MM-DD).
 */
export function toISODateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
