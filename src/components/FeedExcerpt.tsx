import type { Href } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { Linking } from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { usePaneRouter as useRouter } from '@/features/adaptive-layout/usePaneRouter';
import { LinkCard } from '@/features/rich-content';
import type { ZhihuContentSegment } from '@/types/zhihu';
import {
  extractZhihuRedirectTarget,
  getSafeExternalUrl,
  parseZhihuUrl,
} from '@/utils/url';
import { Text, View } from './Themed';

export function stripFeedExcerptTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parseExcerpt(html: string): { text: string; links: string[] } {
  const links: string[] = [];
  const linkRegex = /<a[^>]*data-draft-type="link-card"[^>]*href="([^"]*)"/gi;
  while (true) {
    const m = linkRegex.exec(html);
    if (m === null) break;
    links.push(m[1]);
  }
  return { text: stripFeedExcerptTags(html), links };
}

function parsePinContent(contentArray: readonly ZhihuContentSegment[]): {
  text: string;
  links: ZhihuContentSegment[];
} {
  const textBlocks: string[] = [];
  const links: ZhihuContentSegment[] = [];
  for (const item of contentArray) {
    if (item.type === 'text' && item.content) {
      textBlocks.push(
        item.content.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' '),
      );
    } else if (item.type === 'link_card') {
      links.push(item);
    }
  }
  return { text: textBlocks.join(' ').trim(), links };
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

export const FeedExcerpt: React.FC<{
  html?: string | React.ReactNode;
  contentArray?: readonly ZhihuContentSegment[];
  numberOfLines?: number;
}> = React.memo(({ html, contentArray, numberOfLines = 3 }) => {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const surfaceColor = Colors[colorScheme].backgroundSecondary;

  const parsed = useMemo(() => {
    if (contentArray) {
      const result = parsePinContent(contentArray);
      return {
        text: result.text as React.ReactNode,
        links: result.links.map((l) => l.url || ''),
      };
    }
    if (html && isString(html)) return parseExcerpt(html);
    return { text: html || null, links: [] as string[] };
  }, [html, contentArray]);

  const handleLinkPress = useCallback(
    (url: string) => {
      if (!url) return;
      const realUrl = extractZhihuRedirectTarget(url);
      const internalPath = parseZhihuUrl(realUrl);
      if (internalPath) {
        router.push(internalPath as Href);
      } else {
        const externalUrl = getSafeExternalUrl(realUrl);
        if (!externalUrl) return;
        Linking.openURL(externalUrl).catch(() =>
          console.error('Failed to open external URL'),
        );
      }
    },
    [router],
  );

  const limitLines = numberOfLines === 0 ? undefined : numberOfLines;
  if (!parsed.text && parsed.links.length === 0) return null;

  return (
    <View className="bg-transparent">
      {parsed.text ? (
        isString(parsed.text) ? (
          <Text
            type="secondary"
            className="text-[17px]"
            style={{ lineHeight: 27 }}
            numberOfLines={limitLines}
          >
            {parsed.text}
          </Text>
        ) : (
          <Text
            type="secondary"
            className="text-[17px]"
            style={{ lineHeight: 27 }}
            numberOfLines={limitLines}
          >
            {parsed.text}
          </Text>
        )
      ) : null}
      {parsed.links.map((link, i) => (
        <LinkCard
          // biome-ignore lint/suspicious/noArrayIndexKey: link 不能当 key —— 缺 url 的 link_card 会回落成空串(见上方 parsePinContent 的 map),多张卡片就会撞;正则提取的那条路径也不去重。
          key={i}
          url={link}
          onPress={handleLinkPress}
          surfaceColor={surfaceColor}
          colorScheme={colorScheme}
        />
      ))}
    </View>
  );
});
