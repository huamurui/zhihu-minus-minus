export const RICH_CONTENT_BODY_FONT_SIZE = 17;
export const RICH_CONTENT_PARAGRAPH_SPACING = 14;
export const RICH_CONTENT_LIST_INDENT = 20;
export const RICH_CONTENT_LIST_ITEM_SPACING = 6;
export const RICH_CONTENT_INLINE_FORMULA_HEIGHT = 22;
export const RICH_CONTENT_BLOCK_FORMULA_HEIGHT = 60;
export const RICH_CONTENT_UNKNOWN_IMAGE_HEIGHT = 200;

export interface RichContentHeadingMetrics {
  fontSize: number;
  lineHeight: number;
  marginTop: number;
  marginBottom: number;
}

export interface RichContentMetrics {
  body: {
    fontSize: number;
    lineHeight: number;
  };
  headings: Record<
    'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6',
    RichContentHeadingMetrics
  >;
  codeFontSize: number;
  captionFontSize: number;
}

/**
 * Renderer-independent typography used by both the RNRH baseline and the
 * EnrichedText experiment. Keep numeric tuning here so the two backends do
 * not silently drift when appearance settings change.
 */
export function createRichContentMetrics(
  fontSizeScale: number,
  lineHeightScale: number,
): RichContentMetrics {
  const heading = (
    fontSize: number,
    marginTop: number,
    marginBottom: number,
  ): RichContentHeadingMetrics => ({
    fontSize: fontSize * fontSizeScale,
    lineHeight: fontSize * lineHeightScale,
    marginTop,
    marginBottom,
  });

  return {
    body: {
      fontSize: RICH_CONTENT_BODY_FONT_SIZE * fontSizeScale,
      lineHeight: RICH_CONTENT_BODY_FONT_SIZE * lineHeightScale,
    },
    headings: {
      h1: heading(21, 24, 10),
      h2: heading(19, 20, 8),
      h3: heading(17, 16, 6),
      h4: heading(16, 14, 6),
      h5: heading(14, 12, 4),
      h6: heading(12, 10, 4),
    },
    codeFontSize: 14 * fontSizeScale,
    captionFontSize: 13 * fontSizeScale,
  };
}
