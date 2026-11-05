import { formatRelativeTime } from '@/utils/date';

/**
 * 关注流动态行：知乎返回的 action_text 把人名和动作连在一起（「张三赞同了回答」），
 * 在人名后补一个空格，再用「 · 」接上时间。
 */
/**
 * 动态行本身以作者名开头（「张三 回答了问题」）时，卡片不必再显示一遍作者行。
 * 动态行不带人名（「关注的问题有了新回答」）时，即使动作者就是作者也要保留作者行。
 */
export function actionTextNamesAuthor(
  actionText: string | undefined,
  actor: { id?: string; name?: string } | undefined,
  authorId: string | undefined,
): boolean {
  return Boolean(
    actionText &&
      authorId &&
      actor?.id === authorId &&
      actor.name &&
      actionText.startsWith(actor.name),
  );
}

export function formatFeedActionText(
  actionText: string | undefined,
  actorName: string | undefined,
  time: number | undefined,
  now = Date.now(),
): string | undefined {
  if (!actionText) return undefined;
  const text =
    actorName &&
    actionText.startsWith(actorName) &&
    actionText.length > actorName.length &&
    !/^\s/.test(actionText.slice(actorName.length))
      ? `${actorName} ${actionText.slice(actorName.length)}`
      : actionText;
  return time ? `${text} · ${formatRelativeTime(time, now)}` : text;
}
