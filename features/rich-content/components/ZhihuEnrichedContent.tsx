import React, { useMemo } from 'react';
import {
  EnrichedText,
  type EnrichedTextHtmlStyle,
} from 'react-native-enriched-html';
import { useThemeColor } from '@/components/Themed';
import { useSettingsStore } from '@/store/useSettingsStore';
import {
  type EnrichedNormalizationResult,
  normalizeZhihuHtmlForEnriched,
} from '../normalization/normalizeZhihuHtml';

export interface ZhihuEnrichedContentProps {
  htmlContent: string;
  contentWidth: number;
  onLinkPress?: (url: string) => void;
  onNormalized?: (result: EnrichedNormalizationResult) => void;
}

const withNearOpaqueAlpha = (color: string) =>
  /^#[\da-f]{6}$/i.test(color) ? `${color}fe` : color;

/**
 * Experimental Renderer V2 backend. It is intentionally not wired into the
 * production ZhihuContent selection path yet.
 */
export const ZhihuEnrichedContent = React.memo(
  ({
    htmlContent,
    contentWidth,
    onLinkPress,
    onNormalized,
  }: ZhihuEnrichedContentProps) => {
    const textColor = useThemeColor({}, 'text');
    const primaryColor = useThemeColor({}, 'primary');
    const borderColor = useThemeColor({}, 'border');
    const { fontSizeScale, lineHeightScale } = useSettingsStore();

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
        h1: { fontSize: 21 * fontSizeScale, bold: true },
        h2: { fontSize: 19 * fontSizeScale, bold: true },
        h3: { fontSize: 17 * fontSizeScale, bold: true },
        h4: { fontSize: 16 * fontSizeScale, bold: true },
        h5: { fontSize: 14 * fontSizeScale, bold: true },
        h6: { fontSize: 12 * fontSizeScale, bold: true },
        blockquote: {
          borderColor: primaryColor,
          borderWidth: 3,
          gapWidth: 14,
          color: withNearOpaqueAlpha(textColor),
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
    }, [borderColor, fontSizeScale, primaryColor, textColor]);

    return (
      <EnrichedText
        selectable
        useHtmlNormalizer={false}
        selectionColor={`${primaryColor}55`}
        onLinkPress={({ url }) => onLinkPress?.(url)}
        htmlStyle={htmlStyle}
        style={{
          width: contentWidth,
          color: textColor,
          fontSize: 17 * fontSizeScale,
          lineHeight: 17 * lineHeightScale,
        }}
      >
        {normalized.html}
      </EnrichedText>
    );
  },
);
