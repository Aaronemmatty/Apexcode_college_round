/**
 * Rate formatting helper matching backend format_pct:
 * Returns "No data" if denominator m is 0,
 * otherwise formatted with 1 decimal place plus counts, e.g. "12.5% (1/8)", "100.0% (8/8)", "0.0% (0/4)".
 */
export function formatRate(n: number, m: number): string {
  if (m === 0) return 'No data';
  const pct = ((n / m) * 100).toFixed(1);
  return `${pct}% (${n}/${m})`;
}
