import type { UploadedImage } from '@/api/zhihu/image';

const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:']);

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getSafeUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return SAFE_URL_PROTOCOLS.has(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function restoreTokens(value: string, tokens: string[]): string {
  return value.replace(
    /%%__ZHIHU_PUBLISH_TOKEN_(\d+)__%%/g,
    (_match, index: string) => tokens[Number(index)] ?? '',
  );
}

function serializeInline(
  value: string,
  uploadedImages: readonly UploadedImage[],
): string {
  const tokens: string[] = [];
  const stash = (html: string) => {
    const token = `%%__ZHIHU_PUBLISH_TOKEN_${tokens.length}__%%`;
    tokens.push(html);
    return token;
  };

  let html = value.replace(
    /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)(?:\s+"(\d+)x(\d+)")?\)/g,
    (
      _match,
      alt: string,
      rawUrl: string,
      rawWidth: string | undefined,
      rawHeight: string | undefined,
    ) => {
      const url = getSafeUrl(rawUrl);
      if (!url) return escapeHtml(alt);
      const uploadedImage = uploadedImages.find(
        (image) => getSafeUrl(image.src) === url,
      );
      const width = rawWidth ?? uploadedImage?.width;
      const height = rawHeight ?? uploadedImage?.height;
      const dimensions =
        width && height
          ? ` data-rawwidth="${width}" data-rawheight="${height}"`
          : '';
      const originalUrl = getSafeUrl(uploadedImage?.originalSrc ?? '') ?? url;
      const watermarkAttributes = uploadedImage
        ? ` data-watermark="${escapeHtml(uploadedImage.watermark ?? 'watermark')}" data-watermark-src="${escapeHtml(getSafeUrl(uploadedImage.watermarkSrc ?? '') ?? url)}" data-private-watermark-src=""`
        : '';
      return stash(
        `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" data-caption="${escapeHtml(alt)}" data-size="normal"${dimensions}${watermarkAttributes} data-original-src="${escapeHtml(originalUrl)}" />`,
      );
    },
  );

  html = html.replace(
    /\[([^\]]+)\]\(([^\s)]+)\)/g,
    (_match, label: string, rawUrl: string) => {
      const url = getSafeUrl(rawUrl);
      if (!url) return escapeHtml(label);
      return stash(`<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`);
    },
  );

  html = escapeHtml(html)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>');

  return restoreTokens(html, tokens);
}

function isStandaloneImage(value: string): boolean {
  return /^!\[[^\]]*\]\(https?:\/\/[^\s)]+(?:\s+"\d+x\d+")?\)$/.test(
    value.trim(),
  );
}

function serializeParagraph(
  lines: string[],
  uploadedImages: readonly UploadedImage[],
): string {
  const text = lines.join('\n').trim();
  if (!text) return '';
  if (isStandaloneImage(text)) {
    return `<p>${serializeInline(text, uploadedImages)}</p>`;
  }
  return `<p>${text
    .split('\n')
    .map((line) => serializeInline(line, uploadedImages))
    .join('<br/>')}</p>`;
}

/**
 * Convert the small Markdown subset exposed by the publishing composer into
 * sanitized HTML accepted by Zhihu's hybrid publishing endpoints.
 */
export function serializePublishingMarkdown(
  markdown: string,
  uploadedImages: readonly UploadedImage[] = [],
): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let index = 0;

  const flushParagraph = () => {
    const html = serializeParagraph(paragraph, uploadedImages);
    if (html) blocks.push(html);
    paragraph = [];
  };

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      flushParagraph();
      index += 1;
      continue;
    }

    const fence = line.match(/^```([^\s`]*)\s*$/);
    if (fence) {
      flushParagraph();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const language = fence[1] ? ` lang="${escapeHtml(fence[1])}"` : '';
      blocks.push(`<pre${language}>${escapeHtml(codeLines.join('\n'))}</pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const content = serializeInline(heading[2], uploadedImages);
      if (heading[1].length === 1) blocks.push(`<h2>${content}</h2>`);
      else if (heading[1].length === 2) blocks.push(`<h3>${content}</h3>`);
      else blocks.push(`<p><strong>${content}</strong></p>`);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      flushParagraph();
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push(
        `<blockquote>${serializeParagraph(quoteLines, uploadedImages)}</blockquote>`,
      );
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*]\s+/, ''));
        index += 1;
      }
      blocks.push(
        `<ul>${items.map((item) => `<li>${serializeInline(item, uploadedImages)}</li>`).join('')}</ul>`,
      );
      continue;
    }

    if (/^\d+[.)]\s+/.test(line)) {
      flushParagraph();
      const items: string[] = [];
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+[.)]\s+/, ''));
        index += 1;
      }
      blocks.push(
        `<ol>${items.map((item) => `<li>${serializeInline(item, uploadedImages)}</li>`).join('')}</ol>`,
      );
      continue;
    }

    paragraph.push(line);
    index += 1;
  }

  flushParagraph();
  return blocks.join('');
}

/** Pins use plain paragraph HTML; their images live in `data.media.medias`. */
export function serializePinText(text: string): string {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return '';
  return normalized
    .split('\n')
    .map((line) => (line ? `<p>${escapeHtml(line)}</p>` : '<p><br></p>'))
    .join('');
}
