import type {
  ZhihuBlock,
  ZhihuFormula,
  ZhihuImageResource,
  ZhihuInlineRun,
  ZhihuTableBlock,
  ZhihuTableCell,
  ZhihuTableRow,
} from '@/features/rich-content';
import { getSafeExportUrl } from './safeUrl';
import { serializeExportHtmlBlock } from './serializeHtml';
import {
  assertExportNever,
  createSerializationContext,
  type ExportSerializationContext,
  escapeExportHtml,
  escapeExportMarkdown as escapeText,
  exportLinkLabel,
  exportListStart,
  exportTableSpan,
  resolveExportImage,
} from './serializeShared';
import type { ExportRenderOptions, ExportSource } from './types';

function code(value: string): string {
  // CommonMark collapses code-span newlines; bare HTML code also collapses
  // whitespace. Explicit breaks/spaces keep multiline input readable even in
  // Markdown viewers that discard inline styles. Tabs use four-space stops.
  if (/[\r\n]/.test(value)) {
    const lines = value
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => {
        let column = 0;
        return Array.from(line)
          .map((character) => {
            if (character === '\t') {
              const spaces = 4 - (column % 4);
              column += spaces;
              return '&nbsp;'.repeat(spaces);
            }
            column += 1;
            return character === ' ' ? '&nbsp;' : escapeExportHtml(character);
          })
          .join('');
      });
    return `<code>${lines.join('<br>')}</code>`;
  }
  const longest = Math.max(
    0,
    ...[...value.matchAll(/`+/g)].map((match) => match[0].length),
  );
  const fence = '`'.repeat(longest + 1);
  const padding =
    value.startsWith('`') ||
    value.endsWith('`') ||
    (/^ .* $/.test(value) && value.trim())
      ? ' '
      : '';
  return `${fence}${padding}${value}${padding}${fence}`;
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
  return safe ? `[${text}](<${safe}>)` : text;
}

function image(
  resource: ZhihuImageResource,
  alt: string,
  context: ExportSerializationContext,
  formula = false,
): string {
  if (!context.options.includeImages && !formula) return '';
  const src = resolveExportImage(resource, context.options);
  return src
    ? `![${escapeText(alt)}](<${src}>)`
    : escapeText(
        `[${formula ? '公式图片' : '图片'}未能导出${alt ? `：${alt}` : ''}]`,
      );
}

function formula(
  value: ZhihuFormula,
  block: boolean,
  context: ExportSerializationContext,
): string {
  const latex = value.latex?.trim();
  if (!latex)
    return value.image
      ? image(value.image, '公式', context, true)
      : escapeText('[公式不可用]');
  // Keep arbitrary TeX from ending a Markdown math fence or introducing raw HTML.
  // Resource/HTML commands are inert source code even in trusting Markdown readers.
  if (
    /[<>$\r\n]/.test(latex) ||
    /\\(?:href|url|includegraphics|html\w+|def|gdef|newcommand|renewcommand)\b/.test(
      latex,
    )
  ) {
    return block ? fencedCode(latex, 'latex') : code(latex);
  }
  return block ? `$$\n${latex}\n$$` : `$${latex}$`;
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
          return `**${inline(run.children, context)}**`;
        case 'emphasis':
          return `*${inline(run.children, context)}*`;
        case 'underline':
          return `<u>${htmlInline(run.children, context)}</u>`;
        case 'strikethrough':
          return `~~${inline(run.children, context)}~~`;
        case 'highlight':
          return `<mark>${htmlInline(run.children, context)}</mark>`;
        case 'subscript':
          return `<sub>${htmlInline(run.children, context)}</sub>`;
        case 'superscript':
          return `<sup>${htmlInline(run.children, context)}</sup>`;
        case 'inlineCode':
          return code(run.text);
        case 'keyboardInput':
          return `<kbd>${escapeExportHtml(run.text)}</kbd>`;
        case 'inlineImage':
          return image(run.resource, run.alt ?? '', context);
        case 'link':
          return link(run.url, run.children, context);
        case 'inlineFormula':
          return formula(run.formula, false, context);
        case 'segment':
          return inline(run.children, context);
        case 'segmentHighlight':
          return `<u>${htmlInline(run.children, context)}</u>`;
        case 'lineBreak':
          return '  \n';
        case 'unsupported':
          return escapeText(run.fallbackText);
        case 'footnoteReference': {
          const id = context.footnoteIds.get(run.definitionId);
          if (id) context.markdownReferences.add(id);
          return id ? `[^${id}]` : escapeText(`[${run.label}：脚注缺失]`);
        }
        default:
          return assertExportNever(run);
      }
    })
    .join('');
}

function htmlInline(
  runs: readonly ZhihuInlineRun[],
  context: ExportSerializationContext,
): string {
  const paragraph = serializeExportHtmlBlock(
    { id: 'inline-export', type: 'paragraph', children: runs },
    context,
  );
  return paragraph.slice(3, -4);
}

function fencedCode(value: string, language?: string): string {
  const longest = Math.max(
    2,
    ...[...value.matchAll(/`+/g)].map((match) => match[0].length),
  );
  const fence = '`'.repeat(longest + 1);
  const safeLanguage =
    language && /^[\w+-]{1,32}$/.test(language) ? language : '';
  return `${fence}${safeLanguage}\n${value}${value.endsWith('\n') ? '' : '\n'}${fence}`;
}

function blocks(
  values: readonly ZhihuBlock[],
  context: ExportSerializationContext,
): string {
  return values
    .map((block) => serializeBlock(block, context))
    .filter(Boolean)
    .join('\n\n');
}

function simpleCell(cell: ZhihuTableCell): boolean {
  return (
    exportTableSpan(cell.colSpan) === 1 &&
    exportTableSpan(cell.rowSpan) === 1 &&
    cell.blocks.every((block) => block.type === 'paragraph')
  );
}

function table(
  value: ZhihuTableBlock,
  context: ExportSerializationContext,
): string {
  const head = value.head ?? [];
  const foot = value.foot ?? [];
  const allRows = [...head, ...value.body, ...foot];
  const width = allRows[0]?.cells.length ?? 0;
  if (
    head.length > 1 ||
    foot.length > 0 ||
    width === 0 ||
    allRows.some(
      (row) => row.cells.length !== width || !row.cells.every(simpleCell),
    )
  )
    return `> 此表格使用 HTML 保留结构，显示效果取决于 Markdown 阅读器。\n\n${serializeExportHtmlBlock(value, context)}`;
  const renderRow = (row: ZhihuTableRow): string =>
    `| ${row.cells
      .map((cell) =>
        cell.blocks
          .map((block) =>
            block.type === 'paragraph'
              ? inline(block.children, context)
                  .replace(/\r?\n/g, '<br>')
                  .replace(/(?<!\\)\|/g, '\\|')
              : '',
          )
          .join('<br><br>'),
      )
      .join(' | ')} |`;
  const firstBody = value.body[0];
  const implicitHead =
    !head.length && firstBody?.cells.every((cell) => cell.isHeader);
  const header = head[0] ?? (implicitHead ? firstBody : undefined);
  const bodyRows = implicitHead ? value.body.slice(1) : value.body;
  const divider = `| ${Array.from({ length: width }, (_, index) => {
    const alignment =
      value.columnAlignments?.[index] ?? header?.cells[index]?.alignment;
    return alignment === 'center'
      ? ':---:'
      : alignment === 'right'
        ? '---:'
        : alignment === 'left'
          ? ':---'
          : '---';
  }).join(' | ')} |`;
  return [
    ...(value.caption ? [inline(value.caption, context), ''] : []),
    header
      ? renderRow(header)
      : `| ${Array.from({ length: width }, () => '').join(' | ')} |`,
    divider,
    ...bodyRows.map(renderRow),
  ].join('\n');
}

function serializeBlock(
  block: ZhihuBlock,
  context: ExportSerializationContext,
): string {
  switch (block.type) {
    case 'paragraph':
      return inline(block.children, context);
    case 'heading':
      return `${'#'.repeat(block.level)} ${inline(block.children, context)}`;
    case 'image':
      return [
        image(block.resource, block.alt ?? '', context),
        block.caption ? inline(block.caption, context) : '',
      ]
        .filter(Boolean)
        .join('\n\n');
    case 'blockFormula':
      return formula(block.formula, true, context);
    case 'list': {
      const start = exportListStart(block.start);
      if (block.ordered && (start < 0 || start > 999999999))
        return serializeExportHtmlBlock(block, context);
      return block.items
        .map((item, index) => {
          const prefix = block.ordered ? `${start + index}. ` : '- ';
          const indent = ' '.repeat(prefix.length);
          const content = blocks(item.blocks, context);
          const first = item.blocks[0]?.type;
          const separate =
            first === 'list' ||
            first === 'code' ||
            first === 'table' ||
            first === 'quote';
          return separate
            ? `${prefix.trimEnd()}\n${content
                .split('\n')
                .map((line) => `${indent}${line}`)
                .join('\n')}`
            : `${prefix}${content.replace(/\n/g, `\n${indent}`)}`;
        })
        .join('\n\n');
    }
    case 'quote':
      return blocks(block.blocks, context)
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    case 'code':
      return fencedCode(block.text, block.language);
    case 'video':
      return [
        block.poster ? image(block.poster, '视频封面', context) : '',
        `${link(block.url, block.title || '视频', context)}（视频请在原文观看）`,
      ]
        .filter(Boolean)
        .join('\n\n');
    case 'linkCard':
      return [
        block.image ? image(block.image, '', context) : '',
        link(block.url, block.title || '链接', context),
        block.description ? escapeText(block.description) : '',
      ]
        .filter(Boolean)
        .join('\n\n');
    case 'divider':
      return '---';
    case 'table':
      return table(block, context);
    case 'unsupported':
      return escapeText(
        block.fallbackText || '此内容无法静态导出，请查看原文。',
      );
    default:
      return assertExportNever(block);
  }
}

export function serializeExportMarkdown(
  source: ExportSource,
  options: ExportRenderOptions,
): string {
  const context = createSerializationContext(
    source.document,
    options,
    'markdown',
  );
  const metadata = [
    source.author ? `作者：${escapeText(source.author)}` : '',
    source.publishedAt ? `发布时间：${escapeText(source.publishedAt)}` : '',
    source.updatedAt ? `更新时间：${escapeText(source.updatedAt)}` : '',
    getSafeExportUrl(source.sourceUrl)
      ? link(source.sourceUrl, '查看原文', context)
      : '',
  ]
    .filter(Boolean)
    .join('  \n');
  const notices = [
    ...(source.completeness === 'partial'
      ? ['部分内容：正文尚未完整获取，请以原文为准。']
      : []),
    ...source.warnings,
  ]
    .map((warning) => `> ${escapeText(warning).replace(/\n/g, '\n> ')}`)
    .join('\n\n');
  const body = blocks(source.document.blocks, context);
  const definitions = context.footnotes.map((note) => ({
    note,
    content: blocks(note.blocks, context),
  }));
  const notes = definitions
    .map(({ note, content }) => {
      // An HTML table's reference needs a matching HTML anchor in a Markdown note.
      const id = context.footnoteIds.get(note.id);
      const anchor = context.references.has(id ?? '')
        ? `<a id="${id}"></a> `
        : '';
      if (!context.markdownReferences.has(id ?? ''))
        return `${anchor}**[${escapeText(note.label)}]**\n\n${content}`;
      return `[^${id}]: ${anchor}${content.replace(/\n/g, '\n    ')}`;
    })
    .join('\n\n');
  return `${[
    `# ${escapeText(source.title).replace(/\r?\n/g, ' ')}`,
    metadata,
    notices,
    '---',
    body || '暂无可导出正文。',
    notes,
  ]
    .filter(Boolean)
    .join('\n\n')}\n`;
}
