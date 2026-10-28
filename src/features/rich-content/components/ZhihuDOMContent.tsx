import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import { WebView, type WebViewProps } from 'react-native-webview';
import { useRuntimeThemeColors } from '@/components/Themed';
import { radii, typography } from '@/constants/designTokens';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { ZhihuContentSegment } from '@/types/zhihu';
import { getZhihuVideoRoute } from '@/utils/zhihuVideoRoute';
import katexRuntime from '../assets/katex-runtime.json';
import katexStyle from '../assets/katex-style.json';
import {
  parseRichContentBridgeMessage,
  type TextSelectionInfo,
} from '../bridge';
import { DAILY_AVATAR_SIZE, type RichContentVariant } from '../imagePolicy';
import {
  createRichContentMetrics,
  RICH_CONTENT_COMPACT_EMPTY_LINE_SCALE,
  RICH_CONTENT_LIST_ITEM_SPACING,
  RICH_CONTENT_PARAGRAPH_SPACING,
} from '../presentation';
import type { RichContentTypographyOptions } from '../types';
import { videoPlaybackHtml } from '../videoHtml';
import {
  getSafeRichContentUrl,
  sanitizeRichContentHtml,
  serializeInlineScriptValue,
} from '../webviewSecurity';

export type { TextSelectionInfo } from '../bridge';

export interface ZhihuDOMContentProps {
  htmlContent: string;
  contentArray?: readonly ZhihuContentSegment[];
  segmentInfosStr?: string;
  linkCardInfoStr?: string;
  colorScheme: 'light' | 'dark';
  onImagePress: (src: string) => void;
  onImageLongPress?: (src: string) => void;
  onLinkPress: (href: string) => void;
  onSegmentPress?: (pid: string, nodeId?: string) => void;
  onTextSelected?: (info: TextSelectionInfo | null) => void;
  onReady?: () => void;
  style?: StyleProp<ViewStyle>;
  variant?: RichContentVariant;
  fontSizeScale?: number;
  lineHeightScale?: number;
  typographyOptions?: RichContentTypographyOptions;
  selectable?: boolean;
  suppressDoubleTapSelection?: boolean;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

/** Preserve pin ordering in one document, then apply the shared HTML allowlist. */
function contentSegmentsToHtml(
  contentArray: readonly ZhihuContentSegment[],
): string {
  const attribute = (name: string, value: string | undefined) =>
    typeof value === 'string' ? ` ${name}="${escapeHtml(value)}"` : '';
  const sizeAttribute = (name: string, value: number | undefined) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0
      ? attribute(name, String(value))
      : '';
  return contentArray
    .map((segment) => {
      if (segment.type === 'text')
        return `<div>${typeof segment.content === 'string' ? segment.content : typeof segment.own_text === 'string' ? segment.own_text : ''}</div>`;
      if (segment.type === 'image')
        return `<img${attribute('src', segment.url)}${sizeAttribute('data-rawwidth', segment.width)}${sizeAttribute('data-rawheight', segment.height)}>`;
      if (segment.type === 'link_card') {
        const title =
          typeof segment.data_draft_title === 'string'
            ? segment.data_draft_title
            : typeof segment.title === 'string'
              ? segment.title
              : '链接';
        return `<a data-draft-type="link-card"${attribute('href', segment.url)}${attribute('data-draft-cover', segment.data_draft_cover)}>${escapeHtml(title)}</a>`;
      }
      if (segment.type === 'video') {
        const route = getZhihuVideoRoute({
          lensId: segment.video_id || segment.video_bo_id,
          url: segment.url,
          title: segment.title,
        });
        return videoPlaybackHtml({
          route,
          posterUrl: segment.thumbnail
            ? getSafeRichContentUrl(segment.thumbnail, true)
            : undefined,
          title: segment.title,
        });
      }
      return `<div>${typeof segment.content === 'string' ? segment.content : typeof segment.own_text === 'string' ? segment.own_text : ''}</div><p>${escapeHtml(typeof segment.title === 'string' ? segment.title : '[暂不支持的想法内容]')}</p>`;
    })
    .join('');
}

export default React.memo(function ZhihuDOMContent({
  htmlContent,
  contentArray,
  segmentInfosStr,
  linkCardInfoStr,
  onImagePress,
  onImageLongPress,
  onLinkPress,
  onSegmentPress,
  onTextSelected,
  onReady,
  style,
  variant = 'default',
  fontSizeScale: fontSizeOverride,
  lineHeightScale: lineHeightOverride,
  typographyOptions,
  selectable = true,
  suppressDoubleTapSelection = false,
}: ZhihuDOMContentProps) {
  const [height, setHeight] = useState(400);
  const webViewRef = useRef<WebView<WebViewProps>>(null);
  const selectionState = useRef({ selectable, revision: 0 });
  if (selectionState.current.selectable !== selectable)
    selectionState.current = {
      selectable,
      revision: selectionState.current.revision + 1,
    };
  const doubleTapSelectionState = useRef({
    suppress: suppressDoubleTapSelection,
    revision: 0,
  });
  if (doubleTapSelectionState.current.suppress !== suppressDoubleTapSelection)
    doubleTapSelectionState.current = {
      suppress: suppressDoubleTapSelection,
      revision: doubleTapSelectionState.current.revision + 1,
    };
  const textSelectionCallback = useRef(onTextSelected);
  textSelectionCallback.current = onTextSelected;
  const safeHtmlContent = useMemo(
    () =>
      sanitizeRichContentHtml(
        contentArray ? contentSegmentsToHtml(contentArray) : htmlContent,
      ),
    [contentArray, htmlContent],
  );

  const themeColors = useRuntimeThemeColors();
  const textColor = themeColors.text;
  const settings = useSettingsStore();
  const fontSizeScale = fontSizeOverride ?? settings.fontSizeScale;
  const lineHeightScale = lineHeightOverride ?? settings.lineHeightScale;
  const removeImageWatermark = settings.removeImageWatermark;
  const metrics = useMemo(
    () => createRichContentMetrics(fontSizeScale, lineHeightScale),
    [fontSizeScale, lineHeightScale],
  );
  const headingStyles = Object.entries(metrics.headings)
    .map(
      ([tag, metric]) =>
        `.zhihu-content ${tag} { font-size: ${metric.fontSize}px; line-height: ${metric.lineHeight}px; font-weight: bold; margin: ${metric.marginTop}px 0 ${metric.marginBottom}px; }`,
    )
    .join('\n');
  const primaryColor = themeColors.link;
  const dailyStyles =
    variant === 'daily'
      ? `
        .zhihu-content .meta {
          display: flex;
          align-items: center;
          min-height: ${DAILY_AVATAR_SIZE}px;
          margin: 0 0 20px;
        }
        .zhihu-content .meta .avatar {
          box-sizing: border-box;
          flex: 0 0 ${DAILY_AVATAR_SIZE}px;
          width: ${DAILY_AVATAR_SIZE}px !important;
          height: ${DAILY_AVATAR_SIZE}px !important;
          max-width: none;
          margin: 0 10px 0 0;
          border-radius: 50%;
          object-fit: cover;
        }
        .zhihu-content .meta .author {
          flex: 0 0 auto;
          font-size: 15px;
          font-weight: 600;
        }
        .zhihu-content .meta .bio {
          flex: 1 1 auto;
          min-width: 0;
          color: ${themeColors.textSecondary};
          font-size: 14px;
        }
        .zhihu-content .question-title:empty {
          display: none;
        }
      `
      : '';

  const documentVersion = useRef(0);
  const renderingDocument = useMemo(() => {
    const documentIdentity = ++documentVersion.current;
    const html = `
    <!DOCTYPE html>
    <html lang="zh-Hans">
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style>${katexStyle.css}</style>
      <script>${katexRuntime.script.replace(/<\/script/gi, '<\\/script')}</script>
      <script>${katexRuntime.autoRender.replace(/<\/script/gi, '<\\/script')}</script>
      <style>
        html {
          overflow: hidden;
          -webkit-user-select: none;
          user-select: none;
        }
        body {
          margin: 0;
          padding: 0;
          background-color: transparent !important;
          max-width: 100%;
          overflow: hidden;
          -webkit-user-select: inherit;
          user-select: inherit;
        }
        .zhihu-content {
          display: flow-root;
          min-height: 1px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          font-size: ${metrics.body.fontSize}px;
          line-height: ${metrics.body.lineHeight}px;
          color: ${textColor};
          max-width: 100%;
          word-break: normal;
          line-break: ${typographyOptions?.lineBreak ?? 'auto'};
          overflow-wrap: break-word;
          text-align: ${typographyOptions?.justify ? 'justify' : 'start'};
          text-align-last: start;
          ${typographyOptions?.autoSpacing ? 'text-autospace: ideograph-alpha ideograph-numeric;' : ''}
          ${typographyOptions?.trimPunctuation ? 'text-spacing-trim: trim-both;' : ''}
        }
        .katex { color: ${textColor}; }
        .katex-display {
          overflow-x: auto;
          overflow-y: hidden;
          padding: 4px 0;
        }
        pre, code {
          max-width: 100%;
          overflow-x: auto;
          color: ${textColor};
          font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
          font-size: ${metrics.codeFontSize}px;
          text-align: start;
          text-autospace: no-autospace;
        }
        .highlight {
          background-color: ${themeColors.backgroundSecondary};
          padding: 12px;
          border-radius: 8px;
          margin: 15px 0;
          border: 1px solid ${themeColors.border};
        }
        .zhihu-content p {
          margin: 0 0 ${RICH_CONTENT_PARAGRAPH_SPACING}px;
        }
        .zhihu-content p.zhihu-empty-paragraph {
          height: ${metrics.body.lineHeight * RICH_CONTENT_COMPACT_EMPTY_LINE_SCALE}px !important;
          line-height: ${metrics.body.lineHeight * RICH_CONTENT_COMPACT_EMPTY_LINE_SCALE}px !important;
          font-size: 0 !important;
          margin: 0 !important;
        }
        .zhihu-content p.zhihu-empty-paragraph + p.zhihu-empty-paragraph {
          height: ${metrics.body.lineHeight}px !important;
          line-height: ${metrics.body.lineHeight}px !important;
          margin: 0 0 ${RICH_CONTENT_PARAGRAPH_SPACING}px !important;
        }
        .zhihu-content img {
          max-width: 100%;
          height: auto !important;
          border-radius: 12px;
          margin: 10px 0;
          cursor: pointer;
        }
        .zhihu-content figure {
          margin: 15px 0;
          text-align: center;
        }
        .zhihu-content figcaption {
          color: ${themeColors.iconMuted};
          font-size: ${metrics.captionFontSize}px;
          margin-top: 8px;
          font-style: italic;
          text-align: center;
        }
        .zhihu-content a {
          color: ${primaryColor};
          text-decoration: none;
        }
        .zhihu-content .zhihu-video {
          display: block;
          position: relative;
          margin: 15px 0;
          -webkit-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
        }
        .zhihu-content .zhihu-video-with-cover {
          aspect-ratio: 16 / 9;
          overflow: hidden;
          background-color: ${themeColors.backgroundTertiary};
        }
        .zhihu-content .zhihu-video img.zhihu-video-cover {
          display: block;
          width: 100%;
          height: 100% !important;
          object-fit: cover;
          margin: 0;
          border-radius: 0;
          -webkit-touch-callout: none;
        }
        .zhihu-video-with-cover .zhihu-video-play {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          padding: 4px 8px;
          color: white;
          background-color: rgba(0, 0, 0, 0.6);
          white-space: nowrap;
        }
        .zhihu-content a.zhihu-link-card {
          display: block;
          box-sizing: border-box;
          max-width: 100%;
          overflow: hidden;
          margin: 16px 0;
          padding: 14px 16px;
          border: 1px solid ${themeColors.contentBorderStrong};
          border-radius: ${radii.md}px;
          background: ${themeColors.backgroundTertiary};
          color: ${textColor};
        }
        .zhihu-link-card-title {
          color: ${textColor};
          font-size: ${typography.fontSize.bodyLarge}px;
          font-weight: 600;
          line-height: ${typography.lineHeight.compact};
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          overflow: hidden;
          word-break: break-word;
        }
        .zhihu-link-card-desc {
          margin-top: 4px;
          color: ${themeColors.textSecondary};
          font-size: ${typography.fontSize.caption}px;
          line-height: ${typography.lineHeight.compact};
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 1;
          overflow: hidden;
          word-break: break-word;
        }
        .zhihu-content a.zhihu-link-card img.zhihu-link-card-image {
          display: block;
          width: 100%;
          height: 120px !important;
          max-height: 120px;
          object-fit: cover;
          margin-top: 10px;
          border-radius: ${radii.sm}px;
        }
        .zhihu-content blockquote {
          border-left: 4px solid ${primaryColor};
          background-color: transparent;
          padding: 12px 18px;
          margin: 15px 0;
          font-size: ${metrics.body.fontSize}px;
          line-height: ${metrics.body.lineHeight}px;
          color: ${themeColors.textSecondary};
        }
        .zhihu-content blockquote p {
          color: ${themeColors.textSecondary};
          font-size: ${metrics.body.fontSize}px;
          line-height: ${metrics.body.lineHeight}px;
        }
        .zhihu-content blockquote > :last-child {
          margin-bottom: 0;
        }
        .zhihu-content table {
          display: block;
          max-width: 100%;
          overflow-x: auto;
          border-collapse: collapse;
          margin: 15px 0;
        }
        .zhihu-content td, .zhihu-content th {
          border: 1px solid ${themeColors.contentBorder};
          padding: 8px;
          vertical-align: top;
        }
        .zhihu-content h1, .zhihu-content h2, .zhihu-content h3, .zhihu-content h4, .zhihu-content h5, .zhihu-content h6 { color: ${textColor}; text-align: start; }
        ${headingStyles}
        .zhihu-content ul, .zhihu-content ol { padding-left: 20px; margin: 10px 0; }
        .zhihu-content li { margin-bottom: ${RICH_CONTENT_LIST_ITEM_SPACING}px; font-size: ${metrics.body.fontSize}px; line-height: ${metrics.body.lineHeight}px; }
        .zhihu-content hr { height: 1px; background-color: ${themeColors.contentBorder}; border: none; margin: 25px 0; }
        ${dailyStyles}

        .segment-interactable {
          text-decoration: underline dashed;
          text-decoration-style: dashed;
          text-decoration-color: ${primaryColor}40;
          cursor: pointer;
        }
        .segment-liked {
          text-decoration: underline dashed;
          text-decoration-style: dashed;
          text-decoration-color: ${primaryColor}60;
        }
      </style>
    </head>
    <body>
      <div id="content" class="zhihu-content"></div>
      <script>
        const documentIdentity = ${documentIdentity};
        window.__zhihuDocumentIdentity = documentIdentity;
        if (window.__zhihuSelectionDocumentIdentity !== documentIdentity) {
          window.__zhihuTextSelectable = false;
          window.__zhihuSelectionRevision = 0;
        }
        if (document.documentElement) {
          var userSelect = window.__zhihuTextSelectable === true ? 'text' : 'none';
          document.documentElement.style.webkitUserSelect = userSelect;
          document.documentElement.style.userSelect = userSelect;
        }
        function postBridgeMessage(message) {
          if (message.type === 'selection') message.selectionRevision = window.__zhihuSelectionRevision;
          window.ReactNativeWebView.postMessage(JSON.stringify(
            Object.assign({ documentIdentity }, message)
          ));
        }
        const htmlContent = ${serializeInlineScriptValue(safeHtmlContent)};
        const segmentInfosStr = ${serializeInlineScriptValue(segmentInfosStr || '[]')};
        const linkCardInfoStr = ${serializeInlineScriptValue(linkCardInfoStr || '{}')};

        const container = document.getElementById('content');
        container.innerHTML = htmlContent;

        function getLinkCardInfo(href) {
          let info;
          try {
            info = JSON.parse(linkCardInfoStr);
          } catch (_) {
            return null;
          }
          const value = info && info[href];
          if (typeof value === 'string') {
            try {
              return JSON.parse(value);
            } catch (_) {
              return null;
            }
          }
          return value && typeof value === 'object' ? value : null;
        }

        function getImageUrl(value) {
          if (typeof value !== 'string') return '';
          const candidate = value.trim();
          if (!/^(https?:)?\\/\\//i.test(candidate)) return '';
          try {
            const url = new URL(candidate.indexOf('//') === 0 ? 'https:' + candidate : candidate);
            return !url.username && !url.password && /^(https?:)$/.test(url.protocol) ? url.href : '';
          } catch (_) {
            return '';
          }
        }

        function getLinkCardImage(display) {
          if (!display) return '';
          const content = display.content;
          const directImage = getImageUrl(display.image_url) || getImageUrl(display.cover_url) || getImageUrl(display.thumbnail);
          if (directImage) return directImage;
          if (!content || typeof content !== 'object') return '';
          return getImageUrl(content.image_url) || getImageUrl(content.cover_url) || getImageUrl(content.thumbnail) || getImageUrl(content.url) || getImageUrl(content.src) || '';
        }

        function getCardText(value) {
          if (typeof value !== 'string') return '';
          const element = document.createElement('template');
          element.innerHTML = value;
          return (element.content.textContent || '').trim();
        }

        // Zhihu stores link cards as editor-only anchors. Turn them into
        // visible cards before layout while keeping the anchor for clicks.
        container.querySelectorAll('a[data-draft-type="link-card"], a.LinkCard').forEach((anchor) => {
          const href = anchor.getAttribute('href') || '';
          const info = getLinkCardInfo(href);
          const display = info && info.display && typeof info.display === 'object' ? info.display : {};
          const cardHref = typeof display.card_open_url === 'string' ? display.card_open_url : href;
          const title = getCardText(display.title) || (anchor.textContent || '').trim() || href;
          const desc = getCardText(display.desc);
          const card = document.createElement('a');
          card.href = cardHref;
          card.className = 'zhihu-link-card';
          card.setAttribute('data-link-card-url', cardHref);

          const titleNode = document.createElement('div');
          titleNode.className = 'zhihu-link-card-title';
          titleNode.textContent = title;
          card.appendChild(titleNode);

          if (desc) {
            const descNode = document.createElement('div');
            descNode.className = 'zhihu-link-card-desc';
            descNode.textContent = desc;
            card.appendChild(descNode);
          }

          const image = getLinkCardImage(display) || getImageUrl(anchor.getAttribute('data-draft-cover'));
          if (image) {
            const imageNode = document.createElement('img');
            imageNode.className = 'zhihu-link-card-image';
            imageNode.src = image;
            imageNode.alt = '';
            card.appendChild(imageNode);
          }
          anchor.replaceWith(card);
        });

        // Process images
        const images = container.querySelectorAll('img');
        images.forEach((img) => {
          const src = img.getAttribute('src') || '';
          const eeimg = img.getAttribute('eeimg');
          const isFormula = src.includes('zhihu.com/equation') || eeimg === '1' || eeimg === '2';
          const alt = img.getAttribute('alt') || '';

          if (isFormula && alt) {
            const isBlockFormula = eeimg === '2' || alt.includes('\\\\begin') || alt.includes('\\\\\\\\');
            const textContent = isBlockFormula ? '$$' + alt + '$$' : '$' + alt + '$';
            const textNode = document.createTextNode(textContent);
            img.parentNode?.replaceChild(textNode, img);
          } else if (!isFormula) {
            const originalToken = img.getAttribute('data-original-token');
            let actualSrc = img.getAttribute('data-actualsrc') || img.getAttribute('data-original') || src;

            if (${removeImageWatermark ? 'true' : 'false'} && actualSrc && originalToken) {
              const cleanToken = originalToken.trim();
              const tokenRegex = /v2-[a-fA-F0-9]{32}/;
              if (/^v2-[a-fA-F0-9]{32}$/.test(cleanToken) && tokenRegex.test(actualSrc)) {
                actualSrc = actualSrc.replace(tokenRegex, cleanToken);
              }
            }

            if (actualSrc) {
              actualSrc = actualSrc.trim();
              if (actualSrc.startsWith('//')) actualSrc = 'https:' + actualSrc;
              img.setAttribute('src', actualSrc);
            }

            const rawwidth = img.getAttribute('data-rawwidth');
            const rawheight = img.getAttribute('data-rawheight');
            if (rawwidth && rawheight) {
              img.setAttribute('width', rawwidth);
              img.setAttribute('height', rawheight);
              img.style.aspectRatio = rawwidth + ' / ' + rawheight;
            }
          }
        });

        // Process segments
        try {
          const segmentInfos = JSON.parse(segmentInfosStr);
          if (segmentInfos && segmentInfos.length > 0) {
            const paragraphs = container.querySelectorAll('p[data-pid]');
            paragraphs.forEach((p) => {
              const pid = p.getAttribute('data-pid');
              if (!pid) return;
              // Semantic documents already mark the precise ranges. Avoid
              // decorating the whole paragraph or dispatching a guessed mark.
              if (p.querySelector('[data-segment-node-id]')) return;

              const segment = segmentInfos.find(s => s.pid === pid);
              if (!segment) return;

              const marks = segment.marks;
              if (!marks || marks.length === 0) return;

              let interaction = null;
              for (const mark of marks) {
                if (mark.seg_info?.is_like) { interaction = mark.seg_info; break; }
                if (mark.master_seg_info?.is_like) { interaction = mark.master_seg_info; break; }
              }
              if (!interaction) {
                interaction = marks[0].seg_info || marks[0].master_seg_info;
              }

              if (
                interaction &&
                (interaction.like_count > 0 || interaction.comment_count > 0 || interaction.is_like)
              ) {
                p.classList.add('segment-interactable');
                if (interaction.is_like) {
                  p.classList.add('segment-liked');
                }
              }
            });
          }
        } catch (_) {
          // Invalid optional metadata cannot block layout or reveal its contents.
        }

        // Process footnotes
        try {
          const footnotes = container.querySelectorAll('sup[data-text]');
          if (footnotes.length > 0) {
            const footnoteList = document.createElement('div');
            footnoteList.style.marginTop = '40px';
            footnoteList.style.borderTop = '1px solid ${themeColors.contentBorder}';
            footnoteList.style.paddingTop = '15px';
            footnoteList.style.fontSize = '14px';

            const title = document.createElement('h4');
            title.innerText = '注脚';
            title.style.margin = '0 0 10px 0';
            title.style.fontSize = '16px';
            title.style.color = '${textColor}';
            footnoteList.appendChild(title);

            footnotes.forEach((sup) => {
              const text = sup.getAttribute('data-text');
              const numero = sup.getAttribute('data-numero') || sup.innerText.replace('[', '').replace(']', '');

              const footnoteId = 'footnote-' + numero;
              const refId = 'ref-' + numero;
              sup.id = refId;

              const item = document.createElement('div');
              item.id = footnoteId;
              item.style.marginBottom = '8px';
              item.style.lineHeight = '1.5';
              item.style.color = '${themeColors.textSecondary}';

              const backlink = document.createElement('a');
              backlink.href = '#' + refId;
              backlink.style.color = '${primaryColor}';
              backlink.style.fontWeight = 'bold';
              backlink.textContent = '[' + numero + ']';
              item.appendChild(backlink);
              item.appendChild(document.createTextNode(' ' + (text || '')));

              footnoteList.appendChild(item);

              const reference = document.createElement('a');
              reference.href = '#' + footnoteId;
              reference.style.color = '${primaryColor}';
              reference.textContent = '[' + numero + ']';
              sup.replaceChildren(reference);
            });

            container.appendChild(footnoteList);
          }
        } catch (_) {
          // Invalid optional footnotes cannot block the surrounding content.
        }

        // Render Math
        if (typeof renderMathInElement === 'function') {
          try {
            renderMathInElement(container, {
                ignoredClasses: ['zhihu-literal-text'],
              delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\(', right: '\\)', display: false },
                { left: '\\[', right: '\\]', display: true }
              ],
              throwOnError: false,
              strict: false,
            });
          } catch (_) {
            // Formula failures keep text, interactions and height reporting available.
          }
        }

        // Click and touch long-press handlers
        var imageTouchTimer = null;
        var imageTouchStart = null;
        var isLongPress = false;
        var imageLongPressMoveTolerance = 10;

        function clearImageLongPress() {
          if (imageTouchTimer) {
            clearTimeout(imageTouchTimer);
            imageTouchTimer = null;
          }
          imageTouchStart = null;
        }

        function findTrackedTouch(touchList) {
          if (!imageTouchStart) return null;
          for (var i = 0; i < touchList.length; i++) {
            if (touchList[i].identifier === imageTouchStart.identifier) {
              return touchList[i];
            }
          }
          return null;
        }

        function findVideoTarget(target) {
          while (target && target !== container) {
            if (target.classList && target.classList.contains('zhihu-video')) return target;
            target = target.parentElement;
          }
          return null;
        }

        container.addEventListener('touchstart', function(e) {
          clearImageLongPress();
          isLongPress = false;
          if (e.touches.length !== 1) return;
          if (findVideoTarget(e.target)) return;

          var target = e.target;
          while (target && target !== container) {
            if (target.tagName === 'IMG') {
              var src = target.getAttribute('src');
              if (src) {
                var touch = e.touches[0];
                imageTouchStart = {
                  identifier: touch.identifier,
                  x: touch.clientX,
                  y: touch.clientY,
                };
                imageTouchTimer = setTimeout(function() {
                  if (!imageTouchStart) return;
                  imageTouchTimer = null;
                  isLongPress = true;
                  postBridgeMessage({ type: 'image_long_press', src: src });
                }, 450);
              }
              break;
            }
            target = target.parentElement;
          }
        }, { passive: true });

        window.addEventListener('touchmove', function(e) {
          if (!imageTouchStart) return;
          if (e.touches.length !== 1) {
            clearImageLongPress();
            return;
          }

          var touch = findTrackedTouch(e.touches);
          if (!touch) {
            clearImageLongPress();
            return;
          }

          var deltaX = touch.clientX - imageTouchStart.x;
          var deltaY = touch.clientY - imageTouchStart.y;
          if (
            deltaX * deltaX + deltaY * deltaY >
            imageLongPressMoveTolerance * imageLongPressMoveTolerance
          ) {
            clearImageLongPress();
          }
        }, { passive: true, capture: true });

        window.addEventListener('touchend', clearImageLongPress, { passive: true, capture: true });
        window.addEventListener('touchcancel', clearImageLongPress, { passive: true, capture: true });

        container.addEventListener('click', function(e) {
          if (isLongPress) {
            isLongPress = false;
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          let target = e.target;
          const videoTarget = findVideoTarget(target);
          if (videoTarget) {
            e.preventDefault();
            const href = videoTarget.getAttribute('href');
            if (href) postBridgeMessage({ type: 'link', href });
            return;
          }
          let cardTarget = target;
          while (cardTarget && cardTarget !== container) {
            if (
              cardTarget.tagName === 'A' &&
              cardTarget.classList.contains('zhihu-link-card')
            ) {
              e.preventDefault();
              const href = cardTarget.getAttribute('data-link-card-url') || cardTarget.getAttribute('href');
              if (href) {
                postBridgeMessage({ type: 'link', href });
              }
              return;
            }
            cardTarget = cardTarget.parentElement;
          }
          while (target && target !== container) {
            if (target.tagName === 'IMG') {
              const src = target.getAttribute('src');
              if (src) {
                postBridgeMessage({ type: 'image', src });
                return;
              }
            }
            if (target.tagName === 'A') {
              e.preventDefault();
              const href = target.getAttribute('href');
              if (href) {
                postBridgeMessage({ type: 'link', href });
                return;
              }
            }
            if ((target.tagName === 'P' || target.tagName === 'SPAN') && target.classList.contains('segment-interactable')) {
              const pid = target.getAttribute('data-pid');
              if (pid) {
                const nodeId = target.getAttribute('data-segment-node-id');
                postBridgeMessage({ type: 'segment', pid, ...(nodeId ? { nodeId } : {}) });
                return;
              }
            }
            target = target.parentElement;
          }
        });

        // Text selection detection
        function findParagraph(node) {
          while (node && node !== container) {
            if (node.nodeType === 1 && node.getAttribute && node.getAttribute('data-pid') && !node.getAttribute('data-segment-node-id')) {
              return node;
            }
            node = node.parentElement || node.parentNode;
          }
          return null;
        }

        function getTextOffset(paragraph, targetNode, targetOffset) {
          // DOM selections may end at an element's child boundary as well as
          // inside a text node. Range handles both in the same UTF-16 space.
          var prefix = document.createRange();
          prefix.selectNodeContents(paragraph);
          prefix.setEnd(targetNode, targetOffset);
          return prefix.toString().length;
        }

        var selectionTimeout;
        document.addEventListener('selectionchange', function() {
          clearTimeout(selectionTimeout);
          var selectionRevision = window.__zhihuSelectionRevision;
          selectionTimeout = setTimeout(function() {
            if (selectionRevision !== window.__zhihuSelectionRevision) return;
            var selection = window.getSelection();
            if (window.__zhihuTextSelectable !== true || !selection || !selection.rangeCount || selection.isCollapsed || !selection.toString().trim()) {
              postBridgeMessage({ type: 'selection', info: null });
              return;
            }
            var text = selection.toString();
            var range = selection.getRangeAt(0);
            var startP = findParagraph(range.startContainer);
            var endP = findParagraph(range.endContainer);
            if (startP && endP) {
              var startPid = startP.getAttribute('data-pid');
              var endPid = endP.getAttribute('data-pid');
              var sOff = getTextOffset(startP, range.startContainer, range.startOffset);
              var eOff = getTextOffset(endP, range.endContainer, range.endOffset);
              postBridgeMessage({
                type: 'selection',
                info: {
                  text: text,
                  startParagraphId: startPid,
                  endParagraphId: endPid,
                  startOffset: sOff,
                  endOffset: eOff
                }
              });
            } else {
              postBridgeMessage({ type: 'selection', info: null });
            }
          }, 300);
        });

        // Send height
        function updateTextMeasure() {
          if (!${Boolean(typographyOptions?.integerMeasure)}) return;
          var em = parseFloat(window.getComputedStyle(container).fontSize);
          var available = container.clientWidth;
          if (!(em > 0 && available > 0)) return;
          var measure = Math.max(em, Math.floor(available / em) * em);
          // Keep media full width; narrow only top-level text containers.
          Array.from(container.children).forEach(function(node) {
            if (/^(P|H[1-6]|UL|OL|BLOCKQUOTE)$/.test(node.tagName)) {
              node.style.boxSizing = 'border-box';
              if (node.style.width !== measure + 'px') node.style.width = measure + 'px';
              node.style.marginLeft = 'auto';
              node.style.marginRight = 'auto';
            }
          });
        }

        var lastHeight = 0;
        function sendHeight() {
          updateTextMeasure();
          // document/body scrollHeight includes the WebView viewport itself.
          // Measure the flow-root content so shorter replacements can shrink.
          const height = Math.max(1, Math.ceil(Math.max(
            container.getBoundingClientRect().height,
            container.scrollHeight
          )));
          if (height === lastHeight) return;
          lastHeight = height;
          postBridgeMessage({ type: 'height', height });
        }

        // Font face completion can follow math insertion; measure its final metrics.
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(sendHeight);
        window.onload = sendHeight;
        window.addEventListener('resize', sendHeight);
        // Images can finish after the startup timers, including without ResizeObserver.
        container.addEventListener('load', sendHeight, true);
        container.addEventListener('error', sendHeight, true);
        setTimeout(sendHeight, 100);
        setTimeout(sendHeight, 500);
        setTimeout(sendHeight, 1000);
        setTimeout(sendHeight, 2000);

        // Resize observer for dynamic content
        if (window.ResizeObserver) {
          const observer = new ResizeObserver(sendHeight);
          observer.observe(container);
        }
      </script>
    </body>
    </html>
  `;

    return { documentIdentity, source: { html } };
  }, [
    safeHtmlContent,
    removeImageWatermark,
    segmentInfosStr,
    linkCardInfoStr,
    textColor,
    primaryColor,
    metrics,
    headingStyles,
    dailyStyles,
    typographyOptions?.lineBreak,
    typographyOptions?.justify,
    typographyOptions?.autoSpacing,
    typographyOptions?.trimPunctuation,
    typographyOptions?.integerMeasure,
    themeColors.backgroundSecondary,
    themeColors.backgroundTertiary,
    themeColors.border,
    themeColors.contentBorder,
    themeColors.contentBorderStrong,
    themeColors.iconMuted,
    themeColors.textSecondary,
  ]);
  const activeDocument = useRef(renderingDocument);
  activeDocument.current = renderingDocument;
  const selectionScript = `
    (function() {
      var identity = ${renderingDocument.documentIdentity};
      var revision = ${selectionState.current.revision};
      if (window.__zhihuDocumentIdentity !== undefined && window.__zhihuDocumentIdentity !== identity) return;
      if (window.__zhihuSelectionDocumentIdentity === identity && window.__zhihuSelectionRevision > revision) return;
      var clearSelection = !${selectable} || (window.__zhihuSelectionDocumentIdentity === identity && window.__zhihuSelectionRevision < revision);
      window.__zhihuSelectionDocumentIdentity = identity;
      window.__zhihuSelectionRevision = revision;
      window.__zhihuTextSelectable = ${selectable};
      if (document.documentElement) {
        document.documentElement.style.webkitUserSelect = '${selectable ? 'text' : 'none'}';
        document.documentElement.style.userSelect = '${selectable ? 'text' : 'none'}';
      }
      if (clearSelection && window.getSelection) {
        var selection = window.getSelection();
        if (selection) selection.removeAllRanges();
      }
      var doubleTapRevision = ${doubleTapSelectionState.current.revision};
      if (window.__zhihuDoubleTapSelectionDocumentIdentity === identity && window.__zhihuDoubleTapSelectionRevision > doubleTapRevision) return;
      window.__zhihuDoubleTapSelectionDocumentIdentity = identity;
      window.__zhihuDoubleTapSelectionRevision = doubleTapRevision;
      var previousGuard = window.__zhihuDoubleTapSelectionGuard;
      if (previousGuard) {
        document.removeEventListener('mousedown', previousGuard, true);
        document.removeEventListener('dblclick', previousGuard, true);
        window.__zhihuDoubleTapSelectionGuard = null;
      }
      if (${suppressDoubleTapSelection}) {
        // Cancel the browser's multi-click selection before its default action.
        // Touch/long-press events and existing selection handles remain native.
        var guard = function(event) {
          if (event.button !== 0 || event.detail < 2) return;
          var selection = window.getSelection();
          if (selection && !selection.isCollapsed) return;
          if (event.cancelable) event.preventDefault();
        };
        window.__zhihuDoubleTapSelectionGuard = guard;
        document.addEventListener('mousedown', guard, true);
        document.addEventListener('dblclick', guard, true);
      }
    })();
    true;
  `;
  useEffect(() => {
    webViewRef.current?.injectJavaScript(selectionScript);
    if (!selectable) textSelectionCallback.current?.(null);
  }, [selectionScript, selectable]);

  return (
    <View style={[{ width: '100%', height }, style]}>
      <WebView
        ref={webViewRef}
        source={renderingDocument.source}
        injectedJavaScriptBeforeContentLoaded={selectionScript}
        injectedJavaScript={selectionScript}
        style={{ backgroundColor: 'transparent' }}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        onMessage={(event) => {
          if (activeDocument.current !== renderingDocument) return;
          const data = parseRichContentBridgeMessage(
            event.nativeEvent.data,
            renderingDocument.documentIdentity,
          );
          if (!data) return;

          switch (data.type) {
            case 'height':
              setHeight(data.height);
              onReady?.();
              break;
            case 'image':
              {
                const src = getSafeRichContentUrl(data.src, true);
                if (src) onImagePress(src);
              }
              break;
            case 'image_long_press':
              {
                const src = getSafeRichContentUrl(data.src, true);
                if (src) onImageLongPress?.(src);
              }
              break;
            case 'link':
              {
                const href = getSafeRichContentUrl(data.href);
                if (href) onLinkPress(href);
              }
              break;
            case 'segment':
              onSegmentPress?.(data.pid, data.nodeId);
              break;
            case 'selection':
              {
                if (!selectionState.current.selectable) return;
                const message: unknown = JSON.parse(event.nativeEvent.data);
                if (
                  !message ||
                  typeof message !== 'object' ||
                  !('selectionRevision' in message) ||
                  message.selectionRevision !== selectionState.current.revision
                )
                  return;
                textSelectionCallback.current?.(data.info);
              }
              break;
          }
        }}
        onShouldStartLoadWithRequest={(request) => {
          if (activeDocument.current !== renderingDocument) return false;
          if (
            request.url === 'about:blank' ||
            request.url.startsWith('about:blank#')
          )
            return true;
          const href = getSafeRichContentUrl(request.url);
          if (href) onLinkPress(href);
          return false;
        }}
      />
    </View>
  );
});
