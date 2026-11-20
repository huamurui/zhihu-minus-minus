import { type ChildNode, Element, isTag, isText } from 'domhandler';
import { DomUtils, parseDocument } from 'htmlparser2';
import { getZhihuVideoRoute } from '@/utils/zhihuVideoRoute';
import { parseZhihuSegmentHighlight } from './segmentHighlight';
import { videoPlaybackHtml } from './videoHtml';
import {
  decorateWebViewSegments,
  type WebViewSegmentParagraphs,
} from './webviewSegments';

const CONTENT_TAGS = new Set(
  'a abbr b blockquote br caption code col colgroup dd del details div dl dt em figcaption figure h1 h2 h3 h4 h5 h6 hr i img kbd li mark ol p pre q s section small span strong sub summary sup table tbody td th thead tfoot tr u ul video source'.split(
    ' ',
  ),
);
const REMOVED_TAGS = new Set(
  'script style noscript iframe object embed form input button textarea select option svg math template'.split(
    ' ',
  ),
);
const CONTENT_ATTRIBUTES = new Set(
  'id class title alt width height eeimg start colspan rowspan align dir lang hidden controls preload type'.split(
    ' ',
  ),
);
const IMAGE_URL_ATTRIBUTES = new Set([
  'src',
  'poster',
  'data-actualsrc',
  'data-original',
  'data-original-src',
  'data-default-watermark-src',
  'data-thumbnail',
  'data-draft-cover',
]);
const STYLE_PROPERTIES = new Set(
  'color background-color font-size font-weight font-style font-family line-height text-align text-decoration white-space vertical-align margin margin-top margin-bottom margin-left margin-right padding padding-top padding-bottom padding-left padding-right border border-color border-width border-style border-radius border-collapse display width height max-width max-height word-break overflow-wrap list-style-type'.split(
    ' ',
  ),
);
const LINK_SCHEMES = new Set([
  'http:',
  'https:',
  'mailto:',
  'tel:',
  'zhihu:',
  'zhihu--:',
]);

/** Resolve only supported content links, including nested Zhihu redirects. */
export function getSafeRichContentUrl(
  value: string,
  image = false,
): string | undefined {
  let candidate = value.trim();
  if (
    image &&
    candidate.length <= 1024 * 1024 &&
    /^data:image\/(?:png|jpeg|gif|webp|svg\+xml)(?:;(?:base64|utf8|charset=utf-8))*,/i.test(
      candidate,
    )
  )
    return candidate;
  const visited = new Set<string>();
  for (let count = 0; count < 5; count += 1) {
    if (!candidate) return undefined;
    try {
      const url = new URL(candidate, 'https://www.zhihu.com');
      if (
        (image
          ? !['http:', 'https:'].includes(url.protocol)
          : !LINK_SCHEMES.has(url.protocol)) ||
        url.username ||
        url.password ||
        visited.has(url.href)
      )
        return undefined;
      visited.add(url.href);
      const target =
        !image && url.hostname.toLowerCase() === 'link.zhihu.com'
          ? url.searchParams.get('target')
          : null;
      if (!target) return url.href;
      candidate = target;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function safeStyle(value: string): string {
  return value
    .split(';')
    .filter((declaration) => {
      const colon = declaration.indexOf(':');
      return (
        colon > 0 &&
        STYLE_PROPERTIES.has(
          declaration.slice(0, colon).trim().toLowerCase(),
        ) &&
        !/[\\<>"'{}@]|(?:url|expression)\s*\(/i.test(
          declaration.slice(colon + 1),
        )
      );
    })
    .join(';');
}

/** Keep Zhihu's content dialect while excluding executable page capabilities. */
export function sanitizeRichContentHtml(
  html: string,
  segmentParagraphs?: WebViewSegmentParagraphs,
): string {
  const clean = (nodes: readonly ChildNode[]): ChildNode[] =>
    nodes.flatMap((node): ChildNode[] => {
      if (isText(node)) return [node];
      if (!isTag(node) || REMOVED_TAGS.has(node.name)) return [];
      if (
        node.name === 'video' ||
        (node.name === 'a' &&
          (node.attribs.class?.split(/\s+/).includes('video-box') ||
            node.attribs['data-lens-id']))
      ) {
        const source = node.children.find(
          (child) => isTag(child) && child.name === 'source',
        );
        const resourceUrl =
          node.attribs.src ||
          (source && isTag(source) ? source.attribs.src : undefined);
        const route = getZhihuVideoRoute({
          lensId: node.attribs['data-lens-id'],
          url: node.attribs.href
            ? getSafeRichContentUrl(node.attribs.href)
            : undefined,
          resourceUrl: resourceUrl
            ? getSafeRichContentUrl(resourceUrl, true)
            : undefined,
          title: node.attribs.title,
        });
        const image = DomUtils.findOne(
          (child) => child.name === 'img',
          node.children,
          true,
        );
        const posterUrl = [
          node.attribs.poster,
          node.attribs['data-thumbnail'],
          image?.attribs['data-actualsrc'],
          image?.attribs['data-original'],
          image?.attribs['data-original-src'],
          image?.attribs.src,
        ]
          .map((value) =>
            value ? getSafeRichContentUrl(value, true) : undefined,
          )
          .find((value) => value !== undefined);
        return parseDocument(
          videoPlaybackHtml({ route, posterUrl, title: node.attribs.title }),
        ).children;
      }
      const children = clean(node.children);
      if (!CONTENT_TAGS.has(node.name)) return children;
      node.children = children;
      // Derive the controlled layout class from content, including plain
      // <p><br></p> emitted by the editor. A source class alone cannot hide text.
      const classes = (node.attribs.class ?? '')
        .split(/\s+/)
        .filter((name) => name && name !== 'zhihu-empty-paragraph');
      if (
        classes.includes('highlight-wrap') &&
        (parseZhihuSegmentHighlight(node.attribs)?.reaction?.commentCount ??
          0) > 0
      ) {
        classes.push('segment-comments');
      }
      if (node.name === 'p') {
        const elements = children.filter(isTag);
        const whitespaceOnly = children.every(
          (child) => !isText(child) || !child.data.trim(),
        );
        if (
          whitespaceOnly &&
          (elements.length === 0 ||
            (elements.length === 1 && elements[0].name === 'br'))
        ) {
          classes.push('zhihu-empty-paragraph');
          node.children = [new Element('br', {})];
        }
      }
      if (classes.length) node.attribs.class = classes.join(' ');
      else delete node.attribs.class;
      for (const [name, value] of Object.entries(node.attribs)) {
        if (name === 'href') {
          const safe = getSafeRichContentUrl(value);
          // Card metadata keys use the source href; resolve the destination
          // when dispatching rather than rewriting that lookup identity here.
          if (safe) node.attribs[name] = value.trim();
          else delete node.attribs[name];
        } else if (name === 'data-url' && node.name === 'sup') {
          const safe = getSafeRichContentUrl(value);
          if (safe) node.attribs[name] = safe;
          else delete node.attribs[name];
        } else if (IMAGE_URL_ATTRIBUTES.has(name)) {
          const safe = getSafeRichContentUrl(value, true);
          if (safe) node.attribs[name] = safe;
          else delete node.attribs[name];
        } else if (name === 'style') {
          const safe = safeStyle(value);
          if (safe) node.attribs[name] = safe;
          else delete node.attribs[name];
        } else if (name === 'data-original-token') {
          if (!/^v2-[a-f\d]{32}$/i.test(value)) delete node.attribs[name];
        } else if (
          !CONTENT_ATTRIBUTES.has(name) &&
          !/^data-[a-z\d-]+$/.test(name)
        )
          delete node.attribs[name];
      }
      return [node];
    });
  // This serializer encodes all non-ASCII characters. Keep Chinese/emoji as
  // UTF-8 so sanitizing a long answer does not multiply its bridge payload.
  const nodes = clean(parseDocument(html).children);
  if (segmentParagraphs?.size)
    decorateWebViewSegments(nodes, segmentParagraphs);
  return DomUtils.getOuterHTML(nodes).replace(
    /&#x([\da-f]+);/gi,
    (entity: string, digits: string) => {
      const codePoint = Number.parseInt(digits, 16);
      return codePoint >= 0x80 ? String.fromCodePoint(codePoint) : entity;
    },
  );
}

/** JSON strings inside a script must not contain HTML parser delimiters. */
export function serializeInlineScriptValue(value: string): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}
