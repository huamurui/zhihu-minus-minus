import { type ChildNode, isTag, isText } from 'domhandler';
import { DomUtils, parseDocument } from 'htmlparser2';
import { getSafeExternalUrl, parseZhihuUrl } from './url';
import { getCommentImageUrl } from './zhihuContent';

type CommentMedia = { text: string; url: string; offset: number };

export type CommentPart =
  | { kind: 'text'; text: string }
  | { kind: 'placeholder'; text: string; offset: number }
  | { kind: 'mention'; text: string; member: string; offset: number }
  | ({ kind: 'emoji' } & CommentMedia)
  | ({ kind: 'image' } & CommentMedia);

function mentionedMember(href: string | undefined): string | undefined {
  if (!href) return undefined;
  let target = href;
  if (!/^zhihu:\/\/(?:people|users?)\//i.test(target)) {
    if (target.startsWith('//')) target = `https:${target}`;
    else if (target.startsWith('/')) target = `https://www.zhihu.com${target}`;
    const safe = getSafeExternalUrl(target);
    if (!safe) return undefined;
    target = safe;
  }
  const segment = parseZhihuUrl(target)?.match(/^\/user\/([^/]+)$/)?.[1];
  if (!segment) return undefined;
  try {
    const member = decodeURIComponent(segment);
    // Expo Router encodes the parameter. The profile API interpolates its decoded value into a URL path.
    return member !== '.' && member !== '..' && !/[\p{Cc}/\\?#%]/u.test(member)
      ? member
      : undefined;
  } catch {
    return undefined;
  }
}

/** Decode comment HTML as native text and media, retaining a copyable label for every part. */
export function parseCommentContent(html: string): CommentPart[] {
  const parts: CommentPart[] = [];
  function addText(text: string) {
    if (!text) return;
    const last = parts.at(-1);
    if (last?.kind === 'text') last.text += text;
    else parts.push({ kind: 'text', text });
  }

  function visit(node: ChildNode) {
    if (isText(node)) {
      let start = 0;
      for (const match of node.data.matchAll(
        /\[(?!图片\])[^\s[\]<>]{1,32}\]/g,
      )) {
        addText(node.data.slice(start, match.index));
        parts.push({
          kind: 'placeholder',
          text: match[0],
          offset: (node.startIndex ?? 0) + match.index,
        });
        start = match.index + match[0].length;
      }
      addText(node.data.slice(start));
      return;
    }
    if (!isTag(node) || node.name === 'script' || node.name === 'style') return;
    const { name, attribs } = node;
    const classes = attribs.class?.split(/\s+/) ?? [];
    const offset = node.startIndex ?? 0;
    if (name === 'br') {
      addText('\n');
      return;
    }
    if (name === 'a' && classes.includes('comment_img')) {
      const url = getCommentImageUrl(attribs.href);
      if (url) parts.push({ kind: 'image', text: '[图片]', url, offset });
      else addText(DomUtils.textContent(node).trim() || '[图片]');
      return;
    }
    if (name === 'img') {
      const alt = attribs.alt?.trim() || attribs.title?.trim();
      const emoji =
        classes.includes('sticker') ||
        classes.includes('emoji') ||
        classes.includes('emoticon') ||
        'data-emoticon' in attribs ||
        // Zhihu also uses the bracketed label [图片] on ordinary attachments.
        (alt !== '[图片]' && /^\[[^\]]+\]$/.test(alt ?? ''));
      const text = alt || (emoji ? '[表情]' : '[图片]');
      const url = getCommentImageUrl(attribs.src);
      if (url)
        parts.push({ kind: emoji ? 'emoji' : 'image', text, url, offset });
      else addText(text);
      return;
    }
    if (name === 'a') {
      const member = mentionedMember(attribs.href);
      const text = DomUtils.textContent(node);
      if (member && text.trim()) {
        parts.push({ kind: 'mention', text, member, offset });
        return;
      }
    }
    const isBlock = name === 'p' || name === 'div';
    if (isBlock && parts.length && !parts.at(-1)?.text.endsWith('\n'))
      addText('\n');
    node.children.forEach(visit);
    if (isBlock && !parts.at(-1)?.text.endsWith('\n')) addText('\n');
  }

  parseDocument(html, { withStartIndices: true }).children.forEach(visit);
  const first = parts[0];
  if (first?.kind === 'text') first.text = first.text.trimStart();
  const last = parts.at(-1);
  if (last?.kind === 'text') last.text = last.text.trimEnd();
  return parts.filter((part) => part.text);
}
