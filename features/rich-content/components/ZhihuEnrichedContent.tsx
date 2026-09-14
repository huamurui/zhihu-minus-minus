import React, { useMemo } from 'react';
import {
  EnrichedText,
  type EnrichedTextHtmlStyle,
} from 'react-native-enriched-html';
import { useThemeColor } from '@/components/Themed';
import { useSettingsStore } from '@/store/useSettingsStore';
import {
  type EnrichedNormalizationResult,
  getEnrichedImageLinkSource,
  normalizeZhihuHtmlForEnriched,
} from '../normalization/normalizeZhihuHtml';
import { createRichContentMetrics } from '../presentation';

export interface ZhihuEnrichedContentProps {
  htmlContent: string;
  contentWidth: number;
  onLinkPress?: (url: string) => void;
  onImagePress?: (url: string) => void;
  onNormalized?: (result: EnrichedNormalizationResult) => void;
  selectable?: boolean;
}

const withNearOpaqueAlpha = (color: string) =>
  /^#[\da-f]{6}$/i.test(color) ? `${color}fe` : color;

/**
 * Experimental Renderer V2 backend. ZhihuContent owns navigation and media
 * overlays so every renderer backend uses the same interaction shell.
 */
export const ZhihuEnrichedContent = React.memo(
  ({
    htmlContent,
    contentWidth,
    onLinkPress,
    onImagePress,
    onNormalized,
    selectable = true,
  }: ZhihuEnrichedContentProps) => {
    const textColor = useThemeColor({}, 'text');
    const textSecondaryColor = useThemeColor({}, 'textSecondary');
    const primaryColor = useThemeColor({}, 'primary');
    const borderColor = useThemeColor({}, 'border');
    const { fontSizeScale, lineHeightScale } = useSettingsStore();
    const metrics = useMemo(
      () => createRichContentMetrics(fontSizeScale, lineHeightScale),
      [fontSizeScale, lineHeightScale],
    );

    const normalized = useMemo(
      () =>
        normalizeZhihuHtmlForEnriched(htmlContent, {
          maxImageWidth: contentWidth,
        }),
      [contentWidth, htmlContent],
    );

    React.useEffect(() => {
      onNormalized?.(normalized);
    }, [normalized, onNormalized]);

    const htmlStyle = useMemo<EnrichedTextHtmlStyle>(() => {
      const codeBackgroundColor = withNearOpaqueAlpha(borderColor);

      return {
        h1: { fontSize: metrics.headings.h1.fontSize, bold: true },
        h2: { fontSize: metrics.headings.h2.fontSize, bold: true },
        h3: { fontSize: metrics.headings.h3.fontSize, bold: true },
        h4: { fontSize: metrics.headings.h4.fontSize, bold: true },
        h5: { fontSize: metrics.headings.h5.fontSize, bold: true },
        h6: { fontSize: metrics.headings.h6.fontSize, bold: true },
        blockquote: {
          borderColor: primaryColor,
          borderWidth: 3,
          gapWidth: 14,
          color: withNearOpaqueAlpha(textSecondaryColor),
        },
        codeblock: {
          color: textColor,
          backgroundColor: codeBackgroundColor,
          borderRadius: 4,
        },
        code: { color: textColor, backgroundColor: codeBackgroundColor },
        a: {
          color: primaryColor,
          pressColor: primaryColor,
          textDecorationLine: 'none' as const,
        },
        ul: {
          bulletColor: textColor,
          bulletSize: 8,
          marginLeft: 12,
          gapWidth: 8,
        },
        ol: {
          markerColor: textColor,
          markerFontWeight: 'normal',
          marginLeft: 12,
          gapWidth: 8,
        },
      };
    }, [borderColor, metrics, primaryColor, textColor, textSecondaryColor]);

    const handleLinkPress = React.useCallback(
      ({ url }: { url: string }) => {
        const imageSource = getEnrichedImageLinkSource(url);
        if (imageSource) {
          onImagePress?.(imageSource);
          return;
        }
        onLinkPress?.(url);
      },
      [onImagePress, onLinkPress],
    );

    return (
      <EnrichedText
        selectable={selectable}
        useHtmlNormalizer={false}
        selectionColor={`${primaryColor}55`}
        onLinkPress={handleLinkPress}
        htmlStyle={htmlStyle}
        style={{
          width: contentWidth,
          color: textColor,
          fontSize: metrics.body.fontSize,
          lineHeight: metrics.body.lineHeight,
        }}
      >
        {normalized.html}
      </EnrichedText>
    );
  },
);
