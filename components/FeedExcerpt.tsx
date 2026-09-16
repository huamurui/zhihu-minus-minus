import { type Href, useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { Linking } from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { LinkCard } from '@/features/rich-content';
import { extractZhihuRedirectTarget, parseZhihuUrl } from '@/utils/url';
import { Text, View } from './Themed';

function parseExcerpt(html: string): { text: string; links: string[] } {
  const links: string[] = [];
  const linkRegex = /<a[^>]*data-draft-type="link-card"[^>]*href="([^"]*)"/gi;
  while (true) {
    const m = linkRegex.exec(html);
    if (m === null) break;
    links.push(m[1]);
  }
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { text, links };
}

interface PinContentItem {
  type: string;
  content?: string;
  url?: string;
  data_draft_title?: string;
  data_draft_cover?: string;
}

function parsePinContent(contentArray: PinContentItem[]): {
  text: string;
  links: PinContentItem[];
} {
  const textBlocks: string[] = [];
  const links: PinContentItem[] = [];
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
  contentArray?: PinContentItem[];
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
    if (html && isString(html))
      return { text: parseExcerpt(html).text, links: parseExcerpt(html).links };
    return { text: html || null, links: [] as string[] };
  }, [html, contentArray]);

  const handleLinkPress = useCallback(
    (url: string) => {
      if (!url) return;
      const realUrl = extractZhihuRedirectTarget(url);
      const internalPath = parseZhihuUrl(realUrl);
      if (internalPath && internalPath !== '/') {
        router.push(internalPath as Href);
      } else {
        Linking.openURL(realUrl).catch((err) =>
          console.error('Failed to open URL:', err),
        );
      }
    },
    [router],
  );

  if (!parsed.text && parsed.links.length === 0) return null;

  const limitLines = numberOfLines === 0 ? undefined : numberOfLines;

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
