import type {
  ZhihuDocument,
  ZhihuFootnoteDefinition,
  ZhihuImageResource,
  ZhihuInlineRun,
} from '@/features/rich-content';
import { getSafeExportImageUrl, getSafePreparedAsset } from './safeUrl';
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

/** Compare source text before HTML/Markdown styling or escaping can obscure a URL. */
export function exportLinkLabel(
  url: string,
  safeUrl: string | undefined,
  label: string,
  escapeText: (text: string) => string,
  runs?: readonly ZhihuInlineRun[],
): string {
  if (safeUrl === url) return label;
  const urlOnly = runs
    ? plainLinkLabel(runs).trim() === url
    : label.trim() === escapeText(url);
  return urlOnly ? escapeText(safeUrl ?? '来源链接未导出') : label;
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
