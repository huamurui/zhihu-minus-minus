import { type ChildNode, Element, isTag, isText, Text } from 'domhandler';
import { DomUtils } from 'htmlparser2';
import type { getWebViewSegmentParagraphs } from './nativeInteractions';
import { segmentCommentMarkers } from './segmentHighlight';

export type WebViewSegmentParagraphs = ReturnType<
  typeof getWebViewSegmentParagraphs
>;

/** Wrap only text leaves so a range crossing a link or bold span preserves its markup. */
export function decorateWebViewSegments(
  nodes: ChildNode[],
  paragraphs: WebViewSegmentParagraphs,
): void {
  for (const p of DomUtils.findAll(
    (node) => node.name === 'p' && paragraphs.has(node.attribs['data-pid']),
    nodes,
  )) {
    const pid = p.attribs['data-pid'];
    const paragraph = paragraphs.get(pid);
    if (!paragraph || DomUtils.textContent(p) !== paragraph.text) continue;
    const annotations = paragraph.annotations;
    const markers = segmentCommentMarkers(annotations);
    let offset = 0;
    function decorate(children: ChildNode[]): ChildNode[] {
      return children.flatMap((child): ChildNode[] => {
        if (!isText(child)) {
          if (isTag(child)) {
            // The exact ranges below own the marker, including nested HTML/API marks.
            if (
              child.attribs['data-segment-node-id'] ||
              child.attribs.class?.split(/\s+/).includes('highlight-wrap')
            ) {
              child.attribs.class = (child.attribs.class ?? '')
                .split(/\s+/)
                .filter(
                  (name) =>
                    name !== 'segment-interactable' &&
                    name !== 'segment-liked' &&
                    name !== 'segment-comments',
                )
                .join(' ');
              if (child.attribs['data-segment-node-id']) {
                delete child.attribs['data-segment-node-id'];
                delete child.attribs['data-pid'];
              }
            }
            child.children = decorate(child.children);
          }
          return [child];
        }
        const start = offset;
        offset += child.data.length;
        const ranges = annotations.filter(
          (mark) => mark.start < offset && mark.end > start,
        );
        if (!ranges.length) return [child];
        const cuts = [
          ...new Set([
            start,
            offset,
            ...ranges.flatMap((mark) => [
              Math.max(start, mark.start),
              Math.min(offset, mark.end),
            ]),
          ]),
        ].sort((a, b) => a - b);
        const pieces: ChildNode[] = [];
        for (let i = 1; i < cuts.length; i++) {
          const from = cuts[i - 1];
          const to = cuts[i];
          const text = new Text(child.data.slice(from - start, to - start));
          // The terminal piece opens the thread advertised by its bubble, even
          // when a shorter, un-commented underline ends at the same position.
          const marker = markers.get(to);
          const hit =
            marker ??
            ranges.find((mark) => mark.start <= from && mark.end >= to);
          if (!hit) {
            pieces.push(text);
            continue;
          }
          const liked =
            hit.run.type === 'segment'
              ? hit.run.segInfo?.is_like || hit.run.masterSegInfo?.is_like
              : hit.run.highlight?.reaction?.isLiked;
          pieces.push(
            new Element(
              'span',
              {
                class:
                  'segment-interactable' +
                  (liked ? ' segment-liked' : '') +
                  (marker ? ' segment-comments' : ''),
                'data-pid': pid,
                'data-segment-node-id': hit.run.id,
              },
              [text],
            ),
          );
        }
        return pieces;
      });
    }
    p.children = decorate(p.children);
  }
}
