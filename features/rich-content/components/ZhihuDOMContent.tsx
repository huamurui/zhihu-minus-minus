import React, { useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, typography } from '@/constants/designTokens';
import { useSettingsStore } from '@/store/useSettingsStore';

export interface TextSelectionInfo {
  text: string;
  startParagraphId: string;
  endParagraphId: string;
  startOffset: number;
  endOffset: number;
}

export interface ZhihuDOMContentProps {
  htmlContent: string;
  segmentInfosStr?: string;
  colorScheme: 'light' | 'dark';
  onImagePress: (src: string) => void;
  onImageLongPress?: (src: string) => void;
  onLinkPress: (href: string) => void;
  onSegmentPress: (pid: string) => void;
  onTextSelected?: (info: TextSelectionInfo | null) => void;
  onReady?: () => void;
  style?: object;
}

export default React.memo(function ZhihuDOMContent({
  htmlContent,
  segmentInfosStr,
  colorScheme,
  onImagePress,
  onImageLongPress,
  onLinkPress,
  onSegmentPress,
  onTextSelected,
  onReady,
  style,
}: ZhihuDOMContentProps) {
  const [height, setHeight] = useState(400);
  const [_loading, _setLoading] = useState(true);

  const isDark = colorScheme === 'dark';
  const textColor = colors[colorScheme].text;
  const { primaryColor: customPrimaryColor } = useSettingsStore();
  const primaryColor = customPrimaryColor || colors.light.primary;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
      <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
      <style>
        body {
          margin: 0;
          padding: 0;
          background-color: transparent !important;
          max-width: 100%;
          overflow-x: hidden;
          -webkit-user-select: text;
          user-select: text;
        }
        .zhihu-content {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          font-size: ${typography.fontSize.subtitle}px;
          line-height: ${typography.lineHeight.reading};
          color: ${textColor};
          max-width: 100%;
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
          font-size: 14px;
        }
        .highlight {
          background-color: ${colors[colorScheme].backgroundSecondary};
          padding: 12px;
          border-radius: 8px;
          margin: 15px 0;
          border: 1px solid ${colors[colorScheme].border};
        }
        .zhihu-content p {
          margin-bottom: 20px;
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
          color: ${colors[colorScheme].iconMuted};
          font-size: 13px;
          margin-top: 8px;
          font-style: italic;
        }
        .zhihu-content a {
          color: ${primaryColor};
          text-decoration: none;
        }
        .zhihu-content blockquote {
          border-left: 4px solid ${primaryColor};
          padding-left: 18px;
          background-color: ${colors[colorScheme].backgroundSecondary};
          padding: 12px 18px;
          margin: 15px 0;
          font-style: italic;
          color: ${textColor};
        }
        .zhihu-content h1, .zhihu-content h2, .zhihu-content h3 { color: ${textColor}; }
        .zhihu-content h1 { font-size: 22px; font-weight: bold; margin: 20px 0; line-height: 1.4; }
        .zhihu-content h2 { font-size: 20px; font-weight: bold; margin: 18px 0; line-height: 1.4; }
        .zhihu-content h3 { font-size: 18px; font-weight: bold; margin: 15px 0; line-height: 1.4; }
        .zhihu-content ul, .zhihu-content ol { padding-left: 20px; margin: 10px 0; }
        .zhihu-content li { margin-bottom: 8px; font-size: 17px; }
        .zhihu-content hr { height: 1px; background-color: rgba(150,150,150,0.2); border: none; margin: 25px 0; }

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
        const htmlContent = ${JSON.stringify(htmlContent)};
        const segmentInfosStr = ${JSON.stringify(segmentInfosStr || '[]')};

        const container = document.getElementById('content');
        container.innerHTML = htmlContent;

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
            let actualSrc = img.getAttribute('data-original') || img.getAttribute('data-actualsrc') || src;

            if (actualSrc && originalToken) {
              const cleanToken = originalToken.trim();
              const tokenRegex = /v2-[a-fA-F0-9]{32}/;
              if (tokenRegex.test(actualSrc)) {
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
        } catch (e) {
          console.error('Failed to parse segmentInfos', e);
        }

        // Process footnotes
        try {
          const footnotes = container.querySelectorAll('sup[data-text]');
          if (footnotes.length > 0) {
            const footnoteList = document.createElement('div');
            footnoteList.style.marginTop = '40px';
            footnoteList.style.borderTop = '1px solid rgba(150,150,150,0.2)';
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
              item.style.color = '${isDark ? '#aaa' : '#666'}';

              item.innerHTML = '<a href="#' + refId + '" style="color:${primaryColor}; text-decoration:none; font-weight:bold;">[' + numero + ']</a> ' + text;

              footnoteList.appendChild(item);

              sup.innerHTML = '<a href="#' + footnoteId + '" style="color:${primaryColor}; text-decoration:none;">[' + numero + ']</a>';
            });

            container.appendChild(footnoteList);
          }
        } catch (e) {
          console.error('Failed to process footnotes', e);
        }

        // Render Math
        renderMathInElement(container, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true }
          ],
          throwOnError: false,
          strict: false,
        });

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

        container.addEventListener('touchstart', function(e) {
          clearImageLongPress();
          isLongPress = false;
          if (e.touches.length !== 1) return;

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
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'image_long_press', src: src }));
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
          while (target && target !== container) {
            if (target.tagName === 'IMG') {
              const src = target.getAttribute('src');
              if (src) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'image', src }));
                return;
              }
            }
            if (target.tagName === 'A') {
              e.preventDefault();
              const href = target.getAttribute('href');
              if (href) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'link', href }));
                return;
              }
            }
            if ((target.tagName === 'P' || target.tagName === 'SPAN') && target.classList.contains('segment-interactable')) {
              const pid = target.getAttribute('data-pid');
              if (pid) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'segment', pid }));
                return;
              }
            }
            target = target.parentElement;
          }
        });

        // Text selection detection
        function findParagraph(node) {
          while (node && node !== container) {
            if (node.nodeType === 1 && node.getAttribute && node.getAttribute('data-pid')) {
              return node;
            }
            node = node.parentElement || node.parentNode;
          }
          return null;
        }

        function getTextOffset(paragraph, targetNode, targetOffset) {
          var walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT, null, false);
          var offset = 0;
          var node;
          while (node = walker.nextNode()) {
            if (node === targetNode) {
              return offset + targetOffset;
            }
            offset += node.textContent.length;
          }
          return offset;
        }

        var selectionTimeout;
        document.addEventListener('selectionchange', function() {
          clearTimeout(selectionTimeout);
          selectionTimeout = setTimeout(function() {
            var selection = window.getSelection();
            if (!selection || selection.isCollapsed || !selection.toString().trim()) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'selection', info: null }));
              return;
            }
            var text = selection.toString();
            var range = selection.getRangeAt(0);
            var startP = findParagraph(range.startContainer);
            var endP = findParagraph(range.endContainer);
            if (startP) {
              var startPid = startP.getAttribute('data-pid');
              var endPid = endP ? endP.getAttribute('data-pid') : startPid;
              var sOff = getTextOffset(startP, range.startContainer, range.startOffset);
              var eOff = endP ? getTextOffset(endP, range.endContainer, range.endOffset) : sOff + text.length;
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'selection',
                info: {
                  text: text,
                  startParagraphId: startPid,
                  endParagraphId: endPid,
                  startOffset: sOff,
                  endOffset: eOff
                }
              }));
            }
          }, 300);
        });

        // Send height
        function sendHeight() {
          const height = Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight,
            document.body.offsetHeight,
            document.documentElement.offsetHeight,
            container.scrollHeight
          );
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'height', height }));
        }

        // Wait for images and fonts to load
        window.onload = sendHeight;
        setTimeout(sendHeight, 100);
        setTimeout(sendHeight, 500);
        setTimeout(sendHeight, 1000);
        setTimeout(sendHeight, 2000);

        // Resize observer for dynamic content
        if (window.ResizeObserver) {
          const observer = new ResizeObserver(sendHeight);
          observer.observe(document.body);
        }
      </script>
    </body>
    </html>
  `;

  return (
    <View style={[{ width: '100%', height }, style]}>
      <WebView
        source={{ html }}
        style={{ backgroundColor: 'transparent' }}
        scrollEnabled={false}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'height') {
              setHeight(data.height);
              onReady?.();
            } else if (data.type === 'image') {
              onImagePress(data.src);
            } else if (data.type === 'image_long_press') {
              onImageLongPress?.(data.src);
            } else if (data.type === 'link') {
              onLinkPress(data.href);
            } else if (data.type === 'segment') {
              onSegmentPress(data.pid);
            } else if (data.type === 'selection') {
              onTextSelected?.(data.info);
            }
          } catch (e) {
            console.error('Failed to parse message from WebView', e);
          }
        }}
      />
    </View>
  );
});
