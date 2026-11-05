export function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts * 1000);
  return `${formatDate(ts)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 将 Unix 时间戳格式化为适合动态流展示的相对时间。
 * 一天以内显示分钟/小时，超过一天后显示日期。
 */
export function formatRelativeTime(ts: number, now = Date.now()): string {
  const diffSeconds = Math.floor((now - ts * 1000) / 1000);

  if (diffSeconds < 60) return '刚刚';
  if (diffSeconds < 60 * 60) return `${Math.floor(diffSeconds / 60)}分钟前`;
  if (diffSeconds < 24 * 60 * 60) {
    return `${Math.floor(diffSeconds / (60 * 60))}小时前`;
  }

  return formatDate(ts);
}

/**
 * 列表里的紧凑时间：一天以内用相对时间，今年内只显示月-日，更早显示完整日期。
 */
export function formatCompactTime(ts: number, now = Date.now()): string {
  if (now - ts * 1000 < 24 * 60 * 60 * 1000) return formatRelativeTime(ts, now);
  const d = new Date(ts * 1000);
  if (d.getFullYear() !== new Date(now).getFullYear()) return formatDate(ts);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
