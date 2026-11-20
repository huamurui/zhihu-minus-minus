import type {
  ZhihuDocument,
  ZhihuFootnoteDefinition,
  ZhihuImageResource,
  ZhihuInlineRun,
} from '@/features/rich-content';
import {
  getSafeExportImageUrl,
  getSafeExportUrl,
  getSafePreparedAsset,
} from './safeUrl';
import type { ExportRenderOptions } from './types';

export interface ExportSerializationContext {
  readonly format: 'html' | 'markdown';
  readonly options: ExportRenderOptions;
  readonly footnotes: readonly ZhihuFootnoteDefinition[];
  readonly footnoteIds: ReadonlyMap<string, string>;
  readonly references: Map<string, string[]>;
  readonly markdownReferences: Set<string>;
  referenceCount: number;
}

export function createSerializationContext(
  document: ZhihuDocument,
  options: ExportRenderOptions,
  format: 'html' | 'markdown' = 'html',
): ExportSerializationContext {
  const footnoteIds = new Map<string, string>();
  const footnotes = (document.footnotes ?? []).filter((definition) => {
    if (footnoteIds.has(definition.id)) return false;
    footnoteIds.set(definition.id, `note-${footnoteIds.size + 1}`);
    return true;
  });
  return {
    format,
    options,
    footnotes,
    footnoteIds,
    references: new Map(),
    markdownReferences: new Set(),
    referenceCount: 0,
  };
}

export function escapeExportHtml(value: string): string {
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

/** Escape text, including line-leading Markdown constructs and raw HTML. */
export function escapeExportMarkdown(value: string): string {
  return value.replace(/([\\`*_{}[\]()<>#+.!|~$-])/g, '\\$1');
}

function plainLinkLabel(runs: readonly ZhihuInlineRun[]): string {
  return runs
    .map((run) => {
      if ('children' in run) return plainLinkLabel(run.children);
      if ('text' in run) return run.text;
      if (run.type === 'unsupported') return run.fallbackText;
      return '\uFFFC'; // A reference, break or attachment is part of the label too.
    })
    .join('');
}

/** Apply the export URL policy to visible URLs before formatting or escaping. */
export function exportLinkLabel(
  url: string,
  safeUrl: string | undefined,
  label: string | readonly ZhihuInlineRun[],
): string | readonly ZhihuInlineRun[] {
  const text = (
    typeof label === 'string' ? label : plainLinkLabel(label)
  ).trim();
  const unavailable = '来源链接未导出';
  const destinationLabel = safeUrl === url ? label : (safeUrl ?? unavailable);
  if (text === url) return destinationLabel;
  if (!/^(?:https?:\/\/|\/)/i.test(text) || text.includes('\uFFFC'))
    return label;

  // The normalizer may already have canonicalized the href (e.g. host case)
  // or unwrapped a redirect. Check the URL that would actually be printed.
  let href: string;
  try {
    href = new URL(text, 'https://www.zhihu.com').href;
  } catch {
    return label;
  }
  if (href === url) return destinationLabel;
  // A URL followed by explanatory text is a descriptive label.
  if (/\s/.test(text)) return label;
  const safeText = getSafeExportUrl(text);
  return href === safeText ? label : (safeText ?? unavailable);
}

export function resolveExportImage(
  resource: ZhihuImageResource,
  options: ExportRenderOptions,
): string | undefined {
  const safeUrl = getSafeExportImageUrl(resource.url);
  const prepared =
    options.assets?.get(resource.url) ??
    (safeUrl ? options.assets?.get(safeUrl) : undefined);
  if (prepared) return getSafePreparedAsset(prepared);
  // Final offline exports require preparation even for embedded data, so byte
  // validation and resource budgets cannot be bypassed by an oversized data URI.
  if (options.allowRemoteImages !== false && resource.url.startsWith('data:'))
    return getSafePreparedAsset(resource.url);
  return options.allowRemoteImages === false ? undefined : safeUrl;
}

export function assertExportNever(value: never): never {
  throw new Error(`Unsupported export node: ${String(value)}`);
}

export function exportListStart(value: number | undefined): number {
  return value !== undefined && Number.isSafeInteger(value) ? value : 1;
}

export function exportTableSpan(value: number | undefined): number {
  return value !== undefined && Number.isInteger(value) && value > 0
    ? Math.min(value, 1000)
    : 1;
}
