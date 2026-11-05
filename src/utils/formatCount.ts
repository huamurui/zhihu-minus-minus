/** 大数字缩写为「万 / 亿」，与知乎的计数显示一致。 */
export function formatCount(value: number | undefined): string {
  const count = Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
  if (count >= 100_000_000) {
    return `${(count / 100_000_000).toFixed(1).replace(/\.0$/, '')}亿`;
  }
  if (count >= 10_000) {
    return `${(count / 10_000).toFixed(1).replace(/\.0$/, '')}万`;
  }
  return String(Math.floor(count));
}
