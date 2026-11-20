import { getZhihuVideoRoute } from '@/utils/zhihuVideoRoute';
import type {
  ZhihuBlock,
  ZhihuDocument,
  ZhihuFormula,
  ZhihuImageResource,
  ZhihuInlineRun,
  ZhihuParagraphBlock,
  ZhihuTableRow,
} from './document';
import { walkZhihuDocument } from './documentTraversal';
import { segmentCommentCount } from './segmentHighlight';
import { videoPlaybackHtml } from './videoHtml';
import { getSafeRichContentUrl } from './webviewSecurity';

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

function attribute(name: string, value: string | undefined): string {
  return value === undefined ? '' : ` ${name}="${escapeHtml(value)}"`;
}

function literalHtml(text: string): string {
  const escaped = escapeHtml(text);
  // Auto-render must consume AST formula nodes, not reinterpret source text.
  return text.includes('$') || text.includes('\\(') || text.includes('\\[')
    ? `<span class="zhihu-literal-text">${escaped}</span>`
    : escaped;
}

function positiveSize(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function imageHtml(
  resource: ZhihuImageResource,
  options: {
    alt?: string;
    title?: string;
    style?: string;
    avatar?: boolean;
    card?: boolean;
  } = {},
): string {
  const src = getSafeRichContentUrl(resource.url, true);
  if (!src) return literalHtml(options.alt ?? '图片');
  const width = positiveSize(resource.width);
  const height = positiveSize(resource.height);
  return `<img${attribute('src', src)}${attribute('alt', options.alt ?? '')}${attribute('title', options.title)}${attribute('class', options.avatar ? 'avatar' : options.card ? 'zhihu-link-card-image' : undefined)}${attribute('data-rawwidth', width?.toString())}${attribute('data-rawheight', height?.toString())}${attribute('style', options.style)}>`;
}

function formulaHtml(formula: ZhihuFormula, block = false): string {
  const src = formula.image
    ? getSafeRichContentUrl(formula.image.url, true)
    : undefined;
  if (!formula.latex && !src) return literalHtml(formula.latex ?? '公式');
  // The shared DOM runtime replaces eeimg + alt with local KaTeX input.
  // A LaTeX-only formula deliberately needs no remote image placeholder.
  return `<img eeimg="${block ? '2' : '1'}"${attribute('src', src)}${attribute('alt', formula.latex ?? '')}>`;
}

function inlineRunHtml(run: ZhihuInlineRun, paragraphId?: string): string {
  switch (run.type) {
    case 'text':
      return literalHtml(run.text);
    case 'strong':
      return `<strong>${inlineHtml(run.children, paragraphId)}</strong>`;
    case 'emphasis':
      return `<em>${inlineHtml(run.children, paragraphId)}</em>`;
    case 'underline':
      return `<u>${inlineHtml(run.children, paragraphId)}</u>`;
    case 'segmentHighlight': {
      const children = inlineHtml(run.children, paragraphId);
      const marker =
        (segmentCommentCount(run) ?? 0) > 0 ? ' segment-comments' : '';
      if (!paragraphId) return `<u class="${marker.trim()}">${children}</u>`;
      return `<span class="segment-interactable${marker}"${attribute('data-pid', paragraphId)}${attribute('data-segment-node-id', run.id)}>${children}</span>`;
    }
    case 'strikethrough':
      return `<s>${inlineHtml(run.children, paragraphId)}</s>`;
    case 'highlight':
      return `<mark>${inlineHtml(run.children, paragraphId)}</mark>`;
    case 'subscript':
      return `<sub>${inlineHtml(run.children, paragraphId)}</sub>`;
    case 'superscript':
      return `<sup>${inlineHtml(run.children, paragraphId)}</sup>`;
    case 'inlineCode':
      return `<code style="white-space:pre-wrap">${escapeHtml(run.text)}</code>`;
    case 'keyboardInput':
      return `<kbd>${literalHtml(run.text)}</kbd>`;
    case 'inlineImage':
      return imageHtml(run.resource, {
        alt: run.alt,
        title: run.title,
        avatar: run.role === 'avatar',
        style: 'margin:0;vertical-align:middle',
      });
    case 'footnoteReference':
      return `<sup>${literalHtml(run.label)}</sup>`;
    case 'link': {
      const children = inlineHtml(run.children, paragraphId);
      const href = getSafeRichContentUrl(run.url);
      return href ? `<a${attribute('href', href)}>${children}</a>` : children;
    }
    case 'inlineFormula':
      return formulaHtml(run.formula);
    case 'segment': {
      const children = inlineHtml(run.children, paragraphId);
      // Only exact source paragraphs expose an internal node identity. Reaction
      // payloads/targets remain in the document and are validated by the host.
      if (!paragraphId || paragraphId !== run.paragraphId) return children;
      const liked = run.segInfo?.is_like || run.masterSegInfo?.is_like;
      const marker =
        (segmentCommentCount(run) ?? 0) > 0 ? ' segment-comments' : '';
      return `<span class="segment-interactable${liked ? ' segment-liked' : ''}${marker}"${attribute('data-pid', paragraphId)}${attribute('data-segment-node-id', run.id)}>${children}</span>`;
    }
    case 'lineBreak':
      return '<br>';
    case 'unsupported':
      return literalHtml(run.fallbackText);
  }
}

function inlineHtml(
  runs: readonly ZhihuInlineRun[],
  paragraphId?: string,
): string {
  return runs.map((run) => inlineRunHtml(run, paragraphId)).join('');
}

function sourceParagraphs(document: ZhihuDocument): ReadonlySet<ZhihuBlock> {
  const pidCounts = new Map<string, number>();
  for (const node of walkZhihuDocument(document)) {
    if (
      (node.type === 'paragraph' || node.type === 'heading') &&
      node.paragraphId
    )
      pidCounts.set(
        node.paragraphId,
        (pidCounts.get(node.paragraphId) ?? 0) + 1,
      );
  }
  const paragraphs = new Set<ZhihuParagraphBlock>();
  function visit(blocks: readonly ZhihuBlock[]): void {
    for (const block of blocks) {
      if (block.type === 'quote') visit(block.blocks);
      if (block.type !== 'paragraph') continue;
      const pid = block.paragraphId;
      if (!pid || pid !== pid.trim() || pidCounts.get(pid) !== 1) continue;
      const nodeIds = new Set<string>();
      function hasSourceText(runs: readonly ZhihuInlineRun[]): boolean {
        return runs.every((run) => {
          if (!run.id || nodeIds.has(run.id)) return false;
          nodeIds.add(run.id);
          if ('children' in run) return hasSourceText(run.children);
          // HTML parsing normalizes CR/NUL; attachments and generated labels
          // also change source offsets. They remain visible without API ranges.
          return (
            (run.type === 'text' || run.type === 'inlineCode') &&
            !run.text.includes('\r') &&
            !run.text.includes('\0')
          );
        });
      }
      if (hasSourceText(block.children)) paragraphs.add(block);
    }
  }
  visit(document.blocks);
  return paragraphs;
}

function tableRowsHtml(
  rows: readonly ZhihuTableRow[],
  paragraphs: ReadonlySet<ZhihuBlock>,
): string {
  return rows
    .map(
      (row) =>
        `<tr>${row.cells
          .map((cell) => {
            const tag = cell.isHeader ? 'th' : 'td';
            const span = (value: number | undefined) =>
              value !== undefined && Number.isSafeInteger(value) && value > 0
                ? value.toString()
                : undefined;
            const alignment =
              cell.alignment && cell.alignment !== 'default'
                ? cell.alignment
                : undefined;
            return `<${tag}${attribute('colspan', span(cell.colSpan))}${attribute('rowspan', span(cell.rowSpan))}${attribute('align', alignment)}>${blocksHtml(cell.blocks, paragraphs)}</${tag}>`;
          })
          .join('')}</tr>`,
    )
    .join('');
}

function blockHtml(
  block: ZhihuBlock,
  paragraphs: ReadonlySet<ZhihuBlock>,
): string {
  switch (block.type) {
    case 'paragraph':
      return `<p${attribute('data-pid', paragraphs.has(block) ? block.paragraphId : undefined)} style="white-space:pre-wrap">${block.empty ? '<br>' : inlineHtml(block.children, paragraphs.has(block) ? block.paragraphId : undefined)}</p>`;
    case 'heading':
      return `<h${block.level} style="white-space:pre-wrap">${inlineHtml(block.children)}</h${block.level}>`;
    case 'image': {
      const width = positiveSize(block.resource.width);
      const style =
        block.layout === 'normal'
          ? 'width:100%'
          : block.layout === 'small'
            ? `width:${width === undefined ? '50%' : `${width}px`};max-width:100%`
            : undefined;
      return `<figure>${imageHtml(block.resource, { alt: block.alt, style, avatar: block.role === 'avatar' })}${block.caption ? `<figcaption style="white-space:pre-wrap">${inlineHtml(block.caption)}</figcaption>` : ''}</figure>`;
    }
    case 'blockFormula':
      return `<div>${formulaHtml(block.formula, true)}</div>`;
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      const start =
        block.ordered &&
        block.start !== undefined &&
        Number.isSafeInteger(block.start)
          ? block.start.toString()
          : undefined;
      return `<${tag}${attribute('start', start)}>${block.items.map((item) => `<li>${blocksHtml(item.blocks, paragraphs)}</li>`).join('')}</${tag}>`;
    }
    case 'quote':
      return `<blockquote>${blocksHtml(block.blocks, paragraphs)}</blockquote>`;
    case 'code':
      return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
    case 'video': {
      const href = getZhihuVideoRoute({
        ...block,
        resourceUrl: block.resource?.url,
      });
      return videoPlaybackHtml({
        route: href,
        posterUrl: block.poster
          ? getSafeRichContentUrl(block.poster.url, true)
          : undefined,
        title: block.title,
      });
    }
    case 'linkCard': {
      const href = getSafeRichContentUrl(block.url);
      const content = `<div class="zhihu-link-card-title" style="white-space:pre-wrap">${literalHtml(block.title)}</div>${block.description ? `<div class="zhihu-link-card-desc" style="white-space:pre-wrap">${literalHtml(block.description)}</div>` : ''}${block.image ? imageHtml(block.image, { card: true }) : ''}`;
      return href
        ? `<a class="zhihu-link-card"${attribute('href', href)}${attribute('data-link-card-url', href)}>${content}</a>`
        : `<div>${content}</div>`;
    }
    case 'divider':
      return '<hr>';
    case 'table':
      return `<table>${block.caption ? `<caption>${inlineHtml(block.caption)}</caption>` : ''}${block.head ? `<thead>${tableRowsHtml(block.head, paragraphs)}</thead>` : ''}<tbody>${tableRowsHtml(block.body, paragraphs)}</tbody>${block.foot ? `<tfoot>${tableRowsHtml(block.foot, paragraphs)}</tfoot>` : ''}</table>`;
    case 'unsupported':
      return `<p style="white-space:pre-wrap">${literalHtml(block.fallbackText)}</p>`;
  }
}

function blocksHtml(
  blocks: readonly ZhihuBlock[],
  paragraphs: ReadonlySet<ZhihuBlock>,
): string {
  return blocks.map((block) => blockHtml(block, paragraphs)).join('');
}

/** Semantic documents enter the shared WebView sanitizer/bridge via inert HTML. */
export function serializeZhihuDocumentHtml(document: ZhihuDocument): string {
  const paragraphs = sourceParagraphs(document);
  const footnotes = document.footnotes?.length
    ? `<section>${document.footnotes.map((footnote) => `<div><sup>${literalHtml(footnote.label)}</sup>${blocksHtml(footnote.blocks, paragraphs)}</div>`).join('')}</section>`
    : '';
  return blocksHtml(document.blocks, paragraphs) + footnotes;
}
