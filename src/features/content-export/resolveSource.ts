import { getAnswer } from '@/api/zhihu/answer';
import { getArticle } from '@/api/zhihu/article';
import { getDailyDetail } from '@/api/zhihu/daily';
import {
  getNextContentRender,
  getNextRender,
  getStructuredContentContinuation,
} from '@/api/zhihu/nextRender';
import { getPin } from '@/api/zhihu/pin';
import { getQuestion } from '@/api/zhihu/question';
import {
  mergeStructuredContentPages,
  normalizeZhihuContentSegments,
  normalizeZhihuDocument,
  normalizeZhihuStructuredContent,
  parseStructuredContentPaging,
  parseZhihuStructuredContent,
  type ZhihuDocument,
} from '@/features/rich-content';
import { getAuthSessionVersion } from '@/store/useAuthStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import type {
  ZhihuContentSegment,
  ZhihuStructuredContent,
} from '@/types/zhihu';
import { ContentExportError } from './errors';
import type { ExportSource, ExportTarget, ExportTaskContext } from './types';

const MAX_BODY_PAGES = 100;
const PARTIAL_BODY = '正文未完整获取，文件只包含当前可访问的部分内容。';
const PARTIAL_PAGING = '正文续页未完整获取，文件只包含已获取的部分内容。';
const UNSUPPORTED = '部分内容已转为静态说明，请结合原文阅读。';

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function date(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    return undefined;
  const parsed = new Date(value * 1000);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function assertCurrent(target: ExportTarget, context: ExportTaskContext): void {
  if (context.signal.aborted) throw new ContentExportError('导出已取消');
  if (getAuthSessionVersion() !== target.sessionVersion)
    throw new ContentExportError('登录状态已变化，请重新导出');
  try {
    context.assertActive();
  } catch {
    throw new ContentExportError('导出已取消');
  }
}

function checkedDetail(
  value: unknown,
  target: ExportTarget,
): Record<string, unknown> {
  const detail = record(value);
  if (
    !detail ||
    String(detail.id) !== target.id ||
    (typeof detail.type === 'string' &&
      target.type !== 'daily' &&
      detail.type !== target.type)
  )
    throw new ContentExportError('返回内容与导出对象不一致，请重试');
  if (detail.is_copyable === false || detail.can_copy === false)
    throw new ContentExportError('作者已限制复制，此内容无法导出');
  return detail;
}

function isPartial(detail: Record<string, unknown>): boolean {
  return (
    detail.content_need_truncated === true ||
    detail.force_login_when_click_read_more === true ||
    record(detail.paid_info)?.has_purchased === false
  );
}

/** Exports carry the same images the reader sees. */
function exportsUnwatermarkedImages(): boolean {
  return useSettingsStore.getState().removeImageWatermark;
}

function htmlDocument(
  html: string,
  target: ExportTarget,
  detail: Record<string, unknown>,
  warnings: string[],
): ZhihuDocument {
  const result = normalizeZhihuDocument(html, {
    documentId: `export:${target.type}:${target.id}`,
    variant: target.type === 'daily' ? 'daily' : 'default',
    linkCardInfo: detail.link_card_info,
    removeImageWatermark: exportsUnwatermarkedImages(),
  });
  if (result.diagnostics.length) warnings.push(UNSUPPORTED);
  return result.document;
}

function sourceMetadata(
  target: ExportTarget,
  detail: Record<string, unknown>,
): Pick<
  ExportSource,
  'target' | 'title' | 'author' | 'publishedAt' | 'updatedAt' | 'sourceUrl'
> {
  const author = record(detail.author);
  const question = record(detail.question);
  const encodedId = encodeURIComponent(target.id);
  const title =
    (target.type === 'answer' ? text(question?.title) : text(detail.title)) ??
    {
      answer: '知乎回答',
      article: '知乎文章',
      question: '知乎问题',
      pin: '知乎想法',
      daily: '知乎日报',
    }[target.type];
  const sourceUrl =
    target.type === 'daily'
      ? `https://daily.zhihu.com/story/${encodedId}`
      : target.type === 'article'
        ? `https://zhuanlan.zhihu.com/p/${encodedId}`
        : target.type === 'answer'
          ? `https://www.zhihu.com/answer/${encodedId}`
          : `https://www.zhihu.com/${target.type}/${encodedId}`;
  return {
    target,
    title,
    author: text(author?.name) ?? text(author?.fullname),
    publishedAt: date(detail.created_time ?? detail.created),
    updatedAt: date(detail.updated_time ?? detail.updated),
    sourceUrl,
  };
}

async function answerBody(
  detail: Record<string, unknown>,
  target: ExportTarget,
  context: ExportTaskContext,
  warnings: string[],
): Promise<{ document: ZhihuDocument; partial: boolean }> {
  const html = text(detail.content);
  let initial: ZhihuStructuredContent | undefined;
  if (detail.structured_content !== undefined) {
    try {
      initial = parseZhihuStructuredContent(detail.structured_content);
    } catch {
      // Retry a malformed alternative before deciding final completeness.
    }
  }
  // Prefer complete detail HTML; it preserves the original tables and footnotes.
  if (html && !isPartial(detail))
    return {
      document: htmlDocument(html, target, detail, warnings),
      partial: false,
    };

  if (!initial && (!html || isPartial(detail))) {
    try {
      assertCurrent(target, context);
      const page = await getNextRender(
        { id: target.id, type: 'answer', context_expand: 0, is_native: 1 },
        { signal: context.signal, sessionVersion: target.sessionVersion },
      );
      assertCurrent(target, context);
      const answer = page.data.find(
        (item) => item.type === 'answer' && item.id === target.id,
      );
      if (answer?.type === 'answer') {
        // if (answer.canCopy === false)
        // throw new ContentExportError('作者已限制复制，此内容无法导出');
        initial = answer.structuredContent;
      }
    } catch (error: unknown) {
      assertCurrent(target, context);
      if (error instanceof ContentExportError) throw error;
    }
  }

  if (!initial) {
    if (!html) throw new ContentExportError('暂无可访问的正文，无法导出');
    const partial = isPartial(detail);
    if (partial) warnings.push(PARTIAL_BODY);
    return { document: htmlDocument(html, target, detail, warnings), partial };
  }

  const pages = [initial];
  const pageParams: (string | undefined)[] = [undefined];
  let version: string | null | undefined;
  let partial = !parseStructuredContentPaging(initial.paging).is_start;
  while (true) {
    assertCurrent(target, context);
    const continuation = getStructuredContentContinuation(pages, pageParams);
    if (continuation.error) {
      partial = true;
      break;
    }
    if (!continuation.next) break;
    if (pages.length >= MAX_BODY_PAGES) {
      partial = true;
      break;
    }
    const url = new URL(continuation.next);
    const nextVersion = url.searchParams.get('version_id');
    // The server supplies pagination URLs; never rewrite their opaque cursor.
    // Only the selected answer and one content revision may enter this document.
    if (
      url.searchParams.get('url_token') !== target.id ||
      url.searchParams.get('content_type') !== 'answer' ||
      (version !== undefined && nextVersion !== version)
    ) {
      partial = true;
      break;
    }
    version = nextVersion;
    try {
      const next = await getNextContentRender(continuation.next, {
        signal: context.signal,
        sessionVersion: target.sessionVersion,
      });
      assertCurrent(target, context);
      const parsed = parseZhihuStructuredContent(next);
      const paging = parseStructuredContentPaging(parsed.paging);
      if (!paging.is_end) {
        const following = new URL(paging.next);
        if (
          following.searchParams.get('url_token') !== target.id ||
          following.searchParams.get('content_type') !== 'answer' ||
          following.searchParams.get('version_id') !== version
        ) {
          // A changed response cursor can indicate a changed content revision.
          // Do not append that page before checking its content identity.
          partial = true;
          break;
        }
      }
      pages.push(parsed);
      pageParams.push(continuation.next);
      context.onProgress?.({ phase: 'source', completed: pages.length });
    } catch {
      assertCurrent(target, context);
      partial = true;
      break;
    }
  }
  if (partial) warnings.push(PARTIAL_PAGING);
  return {
    document: normalizeZhihuStructuredContent(
      mergeStructuredContentPages(pages),
      {
        documentId: `export:answer:${target.id}`,
        removeImageWatermark: exportsUnwatermarkedImages(),
      },
    ),
    partial,
  };
}

/** Project only known fields before giving pin content to the shared parser. */
function pinSegments(value: unknown): ZhihuContentSegment[] | undefined {
  if (!Array.isArray(value) || !value.length) return undefined;
  return value.map((entry) => {
    const segment = record(entry);
    if (!segment || !text(segment.type))
      throw new ContentExportError('想法正文返回结构无效，请重试');
    return {
      type: String(segment.type),
      content: text(segment.content),
      own_text: text(segment.own_text),
      title: text(segment.title),
      url: text(segment.url),
      data_draft_title: text(segment.data_draft_title),
      data_draft_cover: text(segment.data_draft_cover),
      video_id: text(segment.video_id),
      video_bo_id: text(segment.video_bo_id),
      thumbnail: text(segment.thumbnail),
      width: typeof segment.width === 'number' ? segment.width : undefined,
      height: typeof segment.height === 'number' ? segment.height : undefined,
    };
  });
}

function pollHtml(detail: Record<string, unknown>, warnings: string[]): string {
  const bottom = record(detail.bottom_poll);
  const seen = new Set<string>();
  return [bottom?.voting, bottom?.pk]
    .map((value) => {
      const poll = record(value);
      if (!poll || !Array.isArray(poll.options)) return '';
      const id = String(poll.id ?? '');
      if (id && seen.has(id)) return '';
      if (id) seen.add(id);
      warnings.push('投票已转为静态选项，参与投票请打开原文。');
      const options = poll.options
        .map((entry) => {
          const option = record(entry);
          const title = text(option?.title);
          return title ? `<li>${escapeHtml(title)}</li>` : '';
        })
        .join('');
      return `<h2>${escapeHtml(text(poll.title) ?? '想法投票')}</h2><ul>${options}</ul><p>投票为导出时的静态内容，参与投票请打开原文。</p>`;
    })
    .join('');
}

async function loadDetail(
  target: ExportTarget,
  context: ExportTaskContext,
): Promise<unknown> {
  const options = { signal: context.signal };
  switch (target.type) {
    case 'answer':
      return getAnswer(target.id, undefined, options);
    case 'article':
      return getArticle(target.id, options);
    case 'daily':
      return getDailyDetail(target.id, options);
    case 'pin':
      return getPin(target.id, options);
    case 'question':
      return getQuestion(target.id, undefined, options);
  }
}

/** Resolve a fresh, account-bound source independently of the currently visible card. */
export async function resolveExportSource(
  target: ExportTarget,
  context: ExportTaskContext,
): Promise<ExportSource> {
  target = Object.freeze({ ...target });
  try {
    assertCurrent(target, context);
    if (!/^[a-zA-Z0-9_-]+$/.test(target.id))
      throw new ContentExportError('导出对象无效，请重新打开内容');
    context.onProgress?.({ phase: 'source', completed: 0 });
    const response: unknown = await loadDetail(target, context);
    assertCurrent(target, context);
    const detail = checkedDetail(response, target);
    const warnings: string[] = [];
    let document: ZhihuDocument;
    let partial = isPartial(detail);
    if (target.type === 'answer') {
      const body = await answerBody(detail, target, context, warnings);
      document = body.document;
      partial = body.partial;
    } else if (target.type === 'pin') {
      const segments = pinSegments(detail.content);
      if (segments) {
        const result = normalizeZhihuContentSegments(segments, {
          documentId: `export:pin:${target.id}`,
          linkCardInfo: detail.link_card_info,
          removeImageWatermark: exportsUnwatermarkedImages(),
        });
        document = result.document;
        if (result.diagnostics.length) warnings.push(UNSUPPORTED);
      } else {
        document = htmlDocument(
          text(detail.content_html) ?? text(detail.content) ?? '',
          target,
          detail,
          warnings,
        );
      }
      const polls = htmlDocument(
        pollHtml(detail, warnings),
        { ...target, id: `${target.id}:polls` },
        detail,
        warnings,
      );
      document = { ...document, blocks: [...document.blocks, ...polls.blocks] };
      if (!document.blocks.length)
        throw new ContentExportError('暂无可访问的正文，无法导出');
    } else {
      let html: string;
      if (target.type === 'daily') {
        const body = text(detail.body);
        if (!body)
          throw new ContentExportError('暂无可访问的日报正文，无法导出');
        const image = text(detail.image);
        const credit = text(detail.image_source);
        html = `${image ? `<figure><img src="${escapeHtml(image)}">${credit ? `<figcaption>${escapeHtml(credit)}</figcaption>` : ''}</figure>` : credit ? `<p>${escapeHtml(credit)}</p>` : ''}${body}`;
      } else if (target.type === 'question') {
        html = typeof detail.detail === 'string' ? detail.detail : '';
        if (typeof detail.detail !== 'string') {
          partial = true;
          html = text(detail.excerpt)
            ? `<p>${escapeHtml(String(detail.excerpt))}</p>`
            : '';
        }
      } else {
        html = text(detail.content) ?? '';
        if (!html) throw new ContentExportError('暂无可访问的正文，无法导出');
      }
      document = htmlDocument(html, target, detail, warnings);
    }
    if (partial) warnings.push(PARTIAL_BODY);
    assertCurrent(target, context);
    context.onProgress?.({ phase: 'source', completed: 1, total: 1 });
    return {
      ...sourceMetadata(target, detail),
      document,
      completeness: partial ? 'partial' : 'complete',
      warnings: [...new Set(warnings)],
    };
  } catch (error: unknown) {
    assertCurrent(target, context);
    if (error instanceof ContentExportError) throw error;
    throw new ContentExportError('正文获取失败，请稍后重试');
  }
}
