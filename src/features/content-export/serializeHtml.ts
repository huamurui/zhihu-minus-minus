import { renderToString } from 'katex';
import {
  createRichContentMetrics,
  richContentKatexStyles,
  type ZhihuBlock,
  type ZhihuFormula,
  type ZhihuImageResource,
  type ZhihuInlineRun,
  type ZhihuTableBlock,
  type ZhihuTableRow,
} from '@/features/rich-content';
import { getSafeExportUrl } from './safeUrl';
import {
  assertExportNever,
  createSerializationContext,
  type ExportSerializationContext,
  escapeExportHtml as escapeText,
  exportLinkLabel,
  exportListStart,
  exportTableSpan,
  resolveExportImage,
} from './serializeShared';
import type { ExportPalette, ExportRenderOptions, ExportSource } from './types';

function image(
  resource: ZhihuImageResource,
  alt: string,
  context: ExportSerializationContext,
  kind: 'block' | 'inline' | 'formula',
): string {
  if (!context.options.includeImages && kind !== 'formula') return '';
  const src = resolveExportImage(resource, context.options);
  return src
    ? `<img class="${kind}-image" src="${escapeText(src)}" alt="${escapeText(alt)}" decoding="sync">`
    : `<span class="missing-image" role="img" aria-label="${escapeText(alt || '图片未能导出')}">[${kind === 'formula' ? '公式图片' : '图片'}未能导出${alt ? `：${escapeText(alt)}` : ''}]</span>`;
}

function formula(
  value: ZhihuFormula,
  displayMode: boolean,
  context: ExportSerializationContext,
): string {
  const latex = value.latex?.trim();
  if (latex) {
    // Markdown's HTML fragments have no bundled KaTeX CSS. Preserve readable
    // source instead of emitting a visually broken renderer-specific tree.
    if (context.format === 'markdown')
      return `<code class="formula-source" aria-label="公式 LaTeX 源码">${escapeText(latex)}</code>`;
    try {
      const rendered = renderToString(latex, {
        displayMode,
        output: 'htmlAndMathml',
        throwOnError: true,
        trust: false,
        strict: 'ignore',
        maxExpand: 1000,
        maxSize: 20,
      });
      // Static files cannot measure a matrix/fraction against the eventual page.
      // Keep a wrapping textual fallback for wide expressions; print uses it so
      // a PDF never silently loses the right-hand side of a known wide formula.
      const potentiallyWide =
        latex.length > 80 / scale(context.options.fontSizeScale, 1) ||
        /\\(?:begin|overbrace|underbrace)\b/.test(latex) ||
        /\\(?:text|mathrm|operatorname)\{[^}]{30,}\}/.test(latex);
      if (!potentiallyWide) return rendered;
      const note =
        '较宽公式：以下附可换行的 LaTeX 源码，打印时使用源码避免裁切。';
      return displayMode
        ? `<div class="wide-formula"><div class="formula-rendered">${rendered}</div><p class="formula-note">${note}</p><pre class="formula-source"><code>${escapeText(latex)}</code></pre></div>`
        : `<span class="wide-formula inline-wide-formula"><span class="formula-rendered">${rendered}</span><span class="formula-note">（${note}）</span><code class="formula-source">${escapeText(latex)}</code></span>`;
    } catch {
      // Do not include KaTeX's diagnostic, which echoes uncontrolled source text.
      return `<code class="formula-source" aria-label="公式源码">${escapeText(latex)}</code>`;
    }
  }
  return value.image
    ? image(value.image, '公式', context, 'formula')
    : '<span class="missing-image">[公式不可用]</span>';
}

function link(
  url: string,
  label: string | readonly ZhihuInlineRun[],
  context: ExportSerializationContext,
): string {
  const safe = getSafeExportUrl(url);
  const content = exportLinkLabel(url, safe, label);
  const text =
    typeof content === 'string'
      ? escapeText(content)
      : inline(content, context);
  return safe
    ? `<a href="${escapeText(safe)}" rel="noreferrer noopener">${text}</a>`
    : text;
}

function inline(
  runs: readonly ZhihuInlineRun[],
  context: ExportSerializationContext,
): string {
  return runs
    .map((run): string => {
      switch (run.type) {
        case 'text':
          return escapeText(run.text);
        case 'strong':
          return `<strong>${inline(run.children, context)}</strong>`;
        case 'emphasis':
          return `<em>${inline(run.children, context)}</em>`;
        case 'underline':
          return `<u>${inline(run.children, context)}</u>`;
        case 'strikethrough':
          return `<s>${inline(run.children, context)}</s>`;
        case 'highlight':
          return `<mark>${inline(run.children, context)}</mark>`;
        case 'subscript':
          return `<sub>${inline(run.children, context)}</sub>`;
        case 'superscript':
          return `<sup>${inline(run.children, context)}</sup>`;
        case 'inlineCode':
          return `<code>${escapeText(run.text)}</code>`;
        case 'keyboardInput':
          return `<kbd>${escapeText(run.text)}</kbd>`;
        case 'inlineImage':
          return image(run.resource, run.alt ?? '', context, 'inline');
        case 'link':
          return link(run.url, run.children, context);
        case 'inlineFormula':
          return `<span class="inline-formula">${formula(run.formula, false, context)}</span>`;
        case 'segment':
          return inline(run.children, context);
        case 'segmentHighlight':
          return `<u>${inline(run.children, context)}</u>`;
        case 'lineBreak':
          return '<br>';
        case 'unsupported':
          return escapeText(run.fallbackText);
        case 'footnoteReference': {
          const noteId = context.footnoteIds.get(run.definitionId);
          if (!noteId) return `<sup>[${escapeText(run.label)}：脚注缺失]</sup>`;
          const label = /^\[.*\]$/.test(run.label)
            ? run.label
            : `[${run.label}]`;
          const refId = `ref-${++context.referenceCount}`;
          const references = context.references.get(noteId) ?? [];
          references.push(refId);
          context.references.set(noteId, references);
          return `<sup id="${refId}"><a href="#${noteId}" role="doc-noteref">${escapeText(label)}</a></sup>`;
        }
        default:
          return assertExportNever(run);
      }
    })
    .join('');
}

function blocks(
  values: readonly ZhihuBlock[],
  context: ExportSerializationContext,
): string {
  return values
    .map((block) => serializeExportHtmlBlock(block, context))
    .join('\n');
}

function rows(
  values: readonly ZhihuTableRow[],
  context: ExportSerializationContext,
): string {
  return values
    .map(
      (row) =>
        `<tr>${row.cells
          .map((cell) => {
            const tag = cell.isHeader ? 'th' : 'td';
            const alignment = ['left', 'center', 'right'].includes(
              cell.alignment ?? '',
            )
              ? ` class="align-${cell.alignment}"`
              : '';
            return `<${tag} colspan="${exportTableSpan(cell.colSpan)}" rowspan="${exportTableSpan(cell.rowSpan)}"${alignment}>${blocks(cell.blocks, context)}</${tag}>`;
          })
          .join('')}</tr>`,
    )
    .join('\n');
}

function table(
  value: ZhihuTableBlock,
  context: ExportSerializationContext,
): string {
  return `<table>${value.caption ? `<caption>${inline(value.caption, context)}</caption>` : ''}${value.head?.length ? `<thead>${rows(value.head, context)}</thead>` : ''}<tbody>${rows(value.body, context)}</tbody>${value.foot?.length ? `<tfoot>${rows(value.foot, context)}</tfoot>` : ''}</table>`;
}

/** Also used for Markdown tables that cannot preserve semantics as pipe tables. */
export function serializeExportHtmlBlock(
  block: ZhihuBlock,
  context: ExportSerializationContext,
): string {
  switch (block.type) {
    case 'paragraph':
      return `<p>${inline(block.children, context)}</p>`;
    case 'heading':
      return `<h${block.level}>${inline(block.children, context)}</h${block.level}>`;
    case 'image':
      return `<figure>${image(block.resource, block.alt ?? '', context, 'block')}${block.caption ? `<figcaption>${inline(block.caption, context)}</figcaption>` : ''}</figure>`;
    case 'blockFormula':
      return `<div class="block-formula">${formula(block.formula, true, context)}</div>`;
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      const start = block.ordered
        ? ` start="${exportListStart(block.start)}"`
        : '';
      return `<${tag}${start}>${block.items.map((item) => `<li>${blocks(item.blocks, context)}</li>`).join('')}</${tag}>`;
    }
    case 'quote':
      return `<blockquote>${blocks(block.blocks, context)}</blockquote>`;
    case 'code':
      return `<pre><code>${escapeText(block.text)}</code></pre>`;
    case 'video':
      return `<figure class="video">${block.poster ? image(block.poster, '视频封面', context, 'block') : ''}<figcaption>${link(block.url, block.title || '视频', context)}（视频请在原文观看）</figcaption></figure>`;
    case 'linkCard':
      return `<aside class="link-card">${block.image ? image(block.image, '', context, 'block') : ''}<p>${link(block.url, block.title || '链接', context)}</p>${block.description ? `<p>${escapeText(block.description)}</p>` : ''}</aside>`;
    case 'divider':
      return '<hr>';
    case 'table':
      return table(block, context);
    case 'unsupported':
      return `<p class="unsupported">${escapeText(block.fallbackText || '此内容无法静态导出，请查看原文。')}</p>`;
    default:
      return assertExportNever(block);
  }
}

const DEFAULT_PALETTE: ExportPalette = {
  background: '#ffffff',
  text: '#202124',
  secondary: '#62666d',
  link: '#1768ac',
  border: '#d6d9dd',
  surface: '#f4f5f7',
};

function color(value: string, fallback: string): string {
  return /^(?:#[a-f\d]{3}|#[a-f\d]{4}|#[a-f\d]{6}|#[a-f\d]{8}|(?:rgb|hsl)a?\([\d.,%\s+-]+\))$/i.test(
    value,
  )
    ? value
    : fallback;
}

function scale(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value)
    ? Math.max(0.6, Math.min(value, 3))
    : fallback;
}

function styles(options: ExportRenderOptions): string {
  const palette = Object.fromEntries(
    Object.entries(DEFAULT_PALETTE).map(([key, fallback]) => [
      key,
      color(
        options.palette?.[key as keyof ExportPalette] ?? fallback,
        fallback,
      ),
    ]),
  );
  const metrics = createRichContentMetrics(
    scale(options.fontSizeScale, 1),
    scale(options.lineHeightScale, 1.6),
  );
  const headings = Object.entries(metrics.headings)
    .map(
      ([tag, values]) =>
        `${tag}{font-size:${values.fontSize}px;line-height:${values.lineHeight}px;margin:${values.marginTop}px 0 ${values.marginBottom}px}`,
    )
    .join('\n');
  return `
*{box-sizing:border-box}html,body{margin:0;padding:0;max-width:100%;background:${palette.background};color:${palette.text}}
body{font-family:-apple-system,BlinkMacSystemFont,"Noto Sans CJK SC","PingFang SC","Microsoft YaHei",sans-serif;font-size:${metrics.body.fontSize}px;line-height:${metrics.body.lineHeight}px;overflow-wrap:anywhere;word-break:normal;line-break:strict}
.export-document{max-width:820px;margin:0 auto;padding:32px 24px}main{min-width:0}header{border-bottom:1px solid ${palette.border};padding-bottom:20px;margin-bottom:24px}header h1{font-size:1.65em;line-height:1.4}.metadata,.export-notice{color:${palette.secondary};font-size:.86em}.metadata p{margin:4px 0}.export-notice{border-left:3px solid ${palette.border};padding-left:12px}
a{color:${palette.link};text-decoration:underline;overflow-wrap:anywhere}p{margin:0 0 14px}h1,h2,h3,h4,h5,h6{break-after:avoid;page-break-after:avoid;overflow-wrap:anywhere}${headings}
blockquote{margin:16px 0;padding:4px 14px;border-left:3px solid ${palette.border};color:${palette.secondary}}blockquote>:last-child,li>:last-child,td>:last-child,th>:last-child{margin-bottom:0}ul,ol{padding-left:1.6em;margin:12px 0}li{margin:6px 0}
figure{margin:20px 0;text-align:center;max-width:100%}img{max-width:100%;height:auto;object-fit:contain}figcaption,caption{font-size:${metrics.captionFontSize}px;line-height:1.6;color:${palette.secondary};margin:8px 0}.inline-image{max-height:1.6em;vertical-align:middle}.formula-image{max-width:100%;vertical-align:middle}.inline-formula .formula-image{max-height:2.5em}.missing-image{display:inline-block;border:1px dashed ${palette.border};padding:6px;max-width:100%;color:${palette.secondary}}
pre{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;padding:14px;background:${palette.surface};border-radius:6px;font-size:${metrics.codeFontSize}px;line-height:1.6;max-width:100%}code,kbd{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}kbd{border:1px solid ${palette.border};padding:1px 4px}mark{background:#fff0ad;color:#292414}
table{width:100%;max-width:100%;border-collapse:collapse;table-layout:fixed;margin:18px 0;font-size:.9em}thead{display:table-header-group}tfoot{display:table-row-group}td,th{border:1px solid ${palette.border};padding:8px;vertical-align:top;overflow-wrap:anywhere;word-break:break-word}th{background:${palette.surface}}td p,th p{margin:0 0 6px}.align-left{text-align:left}.align-center{text-align:center}.align-right{text-align:right}
.link-card{border:1px solid ${palette.border};padding:16px;margin:18px 0}.link-card img{max-height:240px}.block-formula{max-width:100%;margin:20px 0;overflow-wrap:anywhere}.katex-display{max-width:100%;margin:0!important}.katex-display>.katex{white-space:normal!important}.katex-display .base{max-width:100%}.formula-source{white-space:pre-wrap;overflow-wrap:anywhere}.formula-note{font-size:.8em;color:${palette.secondary};margin:8px 0}.formula-rendered{overflow-x:auto;max-width:100%}.inline-wide-formula>.formula-rendered{display:inline-block;vertical-align:middle}.footnotes{border-top:1px solid ${palette.border};margin-top:28px;padding-top:12px}.footnote{margin-bottom:14px}.footnote-label{font-weight:bold}.footnote-backlinks{font-size:.8em}hr{border:0;border-top:1px solid ${palette.border};margin:24px 0}
@page{size:A4;margin:16mm} @media print{.export-document{max-width:none;padding:0}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}p{orphans:3;widows:3}img,tr,.block-formula{break-inside:avoid;page-break-inside:avoid}a{color:inherit}.footnotes{break-before:auto}.wide-formula .formula-rendered{display:none}.wide-formula{break-inside:auto;page-break-inside:auto}}
@media(max-width:480px){.export-document{padding:20px 16px}}
`;
}

export function serializeExportHtml(
  source: ExportSource,
  options: ExportRenderOptions,
): string {
  const context = createSerializationContext(source.document, options);
  const body = source.document.blocks
    .map(
      (block) =>
        `<section data-export-block>${serializeExportHtmlBlock(block, context)}</section>`,
    )
    .join('\n');
  // Render all definitions before backlinks, including cross-references between notes.
  const definitions = context.footnotes.map((note) => ({
    note,
    html: blocks(note.blocks, context),
  }));
  const notes = definitions
    .map(({ note, html }) => {
      const id = context.footnoteIds.get(note.id);
      const backlinks = (context.references.get(id ?? '') ?? [])
        .map(
          (ref, index) =>
            `<a href="#${ref}" aria-label="返回引用 ${index + 1}">↩${index + 1}</a>`,
        )
        .join(' ');
      return `<section class="footnote" id="${id}" data-export-block role="doc-endnote"><p class="footnote-label">[${escapeText(note.label)}]</p>${html}${backlinks ? `<p class="footnote-backlinks">${backlinks}</p>` : ''}</section>`;
    })
    .join('\n');
  const metadata = [
    source.author ? `<p>作者：${escapeText(source.author)}</p>` : '',
    source.publishedAt
      ? `<p>发布时间：${escapeText(source.publishedAt)}</p>`
      : '',
    source.updatedAt ? `<p>更新时间：${escapeText(source.updatedAt)}</p>` : '',
    getSafeExportUrl(source.sourceUrl)
      ? `<p>${link(source.sourceUrl, '查看原文', context)}</p>`
      : '',
  ].join('');
  const notices = [
    ...(source.completeness === 'partial'
      ? ['部分内容：正文尚未完整获取，请以原文为准。']
      : []),
    ...source.warnings,
  ]
    .map((warning) => `<p class="export-notice">${escapeText(warning)}</p>`)
    .join('');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data: https:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeText(source.title)}</title><style>${richContentKatexStyles.css}\n${styles(options)}</style></head><body><article class="export-document"><header data-export-block><h1>${escapeText(source.title)}</h1><div class="metadata">${metadata}</div>${notices}</header><main>${body || '<p>暂无可导出正文。</p>'}</main>${notes ? `<section class="footnotes" role="doc-endnotes"><h2>脚注</h2>${notes}</section>` : ''}</article><!-- KaTeX ${escapeText(richContentKatexStyles.version)} · MIT License\n${richContentKatexStyles.license.replaceAll('--', '—').replaceAll('<', '&lt;')} --></body></html>`;
}
