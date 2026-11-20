import { commentBubble, commentBubblePath } from '@/constants/commentBubble';

export const segmentCommentIcon = {
  path: commentBubblePath(commentBubble.markerWeight),
  viewBoxSize: commentBubble.viewBoxSize,
  size: 7.5,
  // Positive values move the icon toward the text and down from its underline.
  insetX: 0,
  offsetY: -1,
} as const;

export const segmentUnderlineOffset = 3;

export const segmentCommentMaskUrl = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${segmentCommentIcon.viewBoxSize} ${segmentCommentIcon.viewBoxSize}"><path d="${segmentCommentIcon.path}"/></svg>`,
)}`;
