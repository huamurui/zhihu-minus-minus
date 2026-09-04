import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type Href, useRouter } from 'expo-router';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Dimensions,
  type GestureResponderEvent,
  Image,
  Linking,
  Pressable,
  View as RNView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import RenderHtml, {
  type CustomBlockRenderer,
  defaultSystemFonts,
  useNormalizedUrl,
  useRendererProps,
} from 'react-native-render-html';
import { SvgUri } from 'react-native-svg';
import {
  createSegmentReaction,
  getAnswer,
  reactAnswerSegment,
  unreactAnswerSegment,
} from '@/api/zhihu/answer';
import { getArticle } from '@/api/zhihu/article';
import { getPin } from '@/api/zhihu/pin';
import { getQuestion } from '@/api/zhihu/question';
import { BouncyButton } from '@/components/BouncyButton';
import { ImageActionBottomSheet } from '@/components/ImageActionBottomSheet';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { ActionSheet } from '@/components/overlays/ActionSheet';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { typography } from '@/constants/designTokens';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { ZhihuSegmentInfo } from '@/types/zhihu';
import { showToast } from '@/utils/toast';
import { extractZhihuRedirectTarget, parseZhihuUrl } from '@/utils/url';
import ZhihuDOMContent, { type TextSelectionInfo } from './ZhihuDOMContent';

export interface ZhihuContentProps {
  content?: string;
  contentArray?: any[];
  segmentInfos?: ZhihuSegmentInfo[];
  linkCardInfo?: Record<string, unknown>;
  objectId: string;
  type: 'answer' | 'article' | 'pin' | 'question';
  onRefresh?: () => void;
  useNative?: boolean;
}

interface LinkCardDisplay {
  title?: unknown;
  card_open_url?: unknown;
  desc?: unknown;
  content?: unknown;
  [key: string]: unknown;
}

interface LinkCardMetadata {
  display?: LinkCardDisplay;
  [key: string]: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseLinkCardMetadata(value: unknown): LinkCardMetadata | null {
  if (typeof value === 'string') {
    try {
      return asRecord(JSON.parse(value)) as LinkCardMetadata | null;
    } catch {
      return null;
    }
  }
  return asRecord(value) as LinkCardMetadata | null;
}

function getLinkCardMetadata(
  linkCardInfo: Record<string, unknown> | undefined,
  ...urls: Array<string | undefined>
): LinkCardMetadata | null {
  if (!linkCardInfo) return null;
  for (const url of urls) {
    if (!url) continue;
    const metadata = parseLinkCardMetadata(linkCardInfo[url]);
    if (metadata) return metadata;
  }
  return null;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isLikelyUrl(value: string | undefined): boolean {
  return !!value && /^(?:https?:)?\/\//i.test(value.trim());
}

function getImageUrl(value: unknown): string | undefined {
  const candidate = getString(value);
  if (!candidate || !isLikelyUrl(candidate)) return undefined;
  return candidate.startsWith('//') ? `https:${candidate}` : candidate;
}

function stripHtml(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return (
    value
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim() || undefined
  );
}

function getLinkCardImage(display: LinkCardDisplay | null): string | undefined {
  if (!display) return undefined;
  const content = asRecord(display.content);
  return (
    getImageUrl(display.image_url) ||
    getImageUrl(display.cover_url) ||
    getImageUrl(display.thumbnail) ||
    getImageUrl(content?.image_url) ||
    getImageUrl(content?.cover_url) ||
    getImageUrl(content?.thumbnail) ||
    getImageUrl(content?.url) ||
    getImageUrl(content?.src)
  );
}

interface LinkCardElementLike {
  name?: string;
  tagName?: string;
  attributes?: Record<string, string | undefined>;
  attribs?: Record<string, string | undefined>;
}

function isLinkCardElement(element: LinkCardElementLike): boolean {
  const tagName = element?.name || element?.tagName;
  const attributes = element?.attributes || element?.attribs || {};
  return (
    tagName === 'a' &&
    (attributes.class?.includes('LinkCard') ||
      attributes['data-draft-type'] === 'link-card')
  );
}

export const LinkCard: React.FC<{
  url: string;
  title?: string;
  image?: string;
  cardInfo?: unknown;
  onPress: (url: string) => void;
  surfaceColor: string;
  colorScheme: 'light' | 'dark';
}> = React.memo(
  ({ url, title, image, cardInfo, onPress, surfaceColor, colorScheme }) => {
    const metadata = useMemo(() => parseLinkCardMetadata(cardInfo), [cardInfo]);
    const display = asRecord(metadata?.display) as LinkCardDisplay | null;
    const displayTitle = getString(display?.title);
    const providedTitle = getString(title);
    const usableTitle = !isLikelyUrl(providedTitle) ? providedTitle : undefined;
    const cardUrl = getString(display?.card_open_url) || url;
    const description = stripHtml(getString(display?.desc));
    const internalPath = useMemo(() => parseZhihuUrl(cardUrl), [cardUrl]);
    const isInternal = internalPath !== null;
    const primaryColor = useThemeColor({}, 'primary');
    const cardBorderColor = useThemeColor({}, 'contentBorderStrong');
    const cardShadowColor = useThemeColor({}, 'shadow');

    const parsedId = useMemo(() => {
      if (!internalPath) return null;
      const match = internalPath.match(
        /^\/(question|answer|article|pin)\/(\d+)$/,
      );
      if (match) {
        return {
          type: match[1] as 'question' | 'answer' | 'article' | 'pin',
          id: match[2],
        };
      }
      return null;
    }, [internalPath]);

    const { data: fetchedData } = useQuery({
      queryKey: ['linkcard', parsedId?.type, parsedId?.id],
      queryFn: async () => {
        if (!parsedId) return null;
        try {
          if (parsedId.type === 'answer') return await getAnswer(parsedId.id);
          if (parsedId.type === 'question')
            return await getQuestion(parsedId.id);
          if (parsedId.type === 'article') return await getArticle(parsedId.id);
          if (parsedId.type === 'pin') return await getPin(parsedId.id);
          return null;
        } catch (err: any) {
          if (err.response?.status === 404) {
            return null;
          }
          throw err;
        }
      },
      enabled: !!parsedId && !displayTitle,
      staleTime: 10 * 60 * 1000,
      retry: false,
    });

    const fetchedTitle =
      displayTitle ||
      usableTitle ||
      fetchedData?.question?.title ||
      fetchedData?.title ||
      fetchedData?.excerpt_title;

    const fetchedImage =
      getImageUrl(image) ||
      getLinkCardImage(display) ||
      getImageUrl(fetchedData?.cover_url);

    const fetchedSubtitle =
      description ||
      fetchedData?.author?.name ||
      fetchedData?.question?.title ||
      null;

    const fetchedStat =
      fetchedData?.voteup_count != null
        ? `${fetchedData.voteup_count} 赞同`
        : fetchedData?.like_count != null
          ? `${fetchedData.like_count} 喜欢`
          : fetchedData?.answer_count != null
            ? `${fetchedData.answer_count} 回答`
            : null;

    const getLinkTypeIcon = () => {
      if (url.includes('/question/')) return 'help-circle';
      if (url.includes('/answer/')) return 'chatbubble-ellipses';
      if (url.includes('/pin/')) return 'navigate';
      return 'link';
    };

    return (
      <View className="w-full" style={{ overflow: 'visible' }}>
        <BouncyButton
          onPress={() => onPress(cardUrl)}
          className="w-full p-3 rounded-xl my-3"
          style={[
            {
              backgroundColor: surfaceColor,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: cardBorderColor,
              shadowColor: cardShadowColor,
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.05,
              shadowRadius: 4,
              elevation: 2,
            },
          ]}
        >
          <View className="bg-transparent" pointerEvents="none">
            {fetchedTitle ? (
              <Text
                className="text-[15px] font-bold leading-5 mb-1.5"
                numberOfLines={2}
              >
                {fetchedTitle}
              </Text>
            ) : (
              <Text className="text-[14px] leading-5 mb-1.5" numberOfLines={1}>
                {url}
              </Text>
            )}
            {fetchedSubtitle && (
              <Text type="secondary" className="text-xs mb-1" numberOfLines={1}>
                {fetchedSubtitle}
              </Text>
            )}
            {!description && (
              <View className="flex-row items-center bg-transparent">
                <Ionicons
                  name={getLinkTypeIcon() as any}
                  size={14}
                  color={primaryColor}
                />
                <Text type="secondary" className="text-xs ml-1">
                  {fetchedStat || (isInternal ? '知乎内容' : '外部链接')}
                </Text>
              </View>
            )}
          </View>
          {fetchedImage && (
            <Image
              source={{ uri: fetchedImage }}
              className="w-full h-[120px] rounded-lg mt-2.5"
              style={[
                { backgroundColor: Colors[colorScheme].backgroundSecondary },
              ]}
            />
          )}
        </BouncyButton>
      </View>
    );
  },
);

interface TextSlice {
  text: string;
  interaction?: any;
  isLiked?: boolean;
}

function sliceParagraphText(
  fullText: string,
  marks: ZhihuSegmentInfo['marks'] | undefined,
): TextSlice[] {
  if (!fullText) return [];
  if (!marks || marks.length === 0) {
    return [{ text: fullText }];
  }

  const sortedMarks = [...marks].sort((a, b) => a.start_index - b.start_index);
  const slices: TextSlice[] = [];
  let currentIndex = 0;

  for (const mark of sortedMarks) {
    const { start_index, end_index } = mark;
    const interaction =
      mark.seg_info?.like_count ||
      mark.seg_info?.comment_count ||
      mark.seg_info?.is_like
        ? mark.seg_info
        : mark.master_seg_info?.like_count ||
            mark.master_seg_info?.comment_count ||
            mark.master_seg_info?.is_like
          ? mark.master_seg_info
          : null;

    if (!interaction) continue;

    if (start_index > currentIndex) {
      slices.push({ text: fullText.slice(currentIndex, start_index) });
    }

    if (end_index > start_index) {
      slices.push({
        text: fullText.slice(start_index, end_index),
        interaction: { ...interaction, mark },
        isLiked: !!interaction.is_like,
      });
      currentIndex = end_index;
    }
  }

  if (currentIndex < fullText.length) {
    slices.push({ text: fullText.slice(currentIndex) });
  }

  return slices.length > 0 ? slices : [{ text: fullText }];
}

function getTNodeText(node: any): string {
  if (!node) return '';
  if (typeof node.data === 'string') return node.data;
  if (node.children && Array.isArray(node.children)) {
    return node.children.map(getTNodeText).join('');
  }
  if (node.init?.children && Array.isArray(node.init.children)) {
    return node.init.children.map(getTNodeText).join('');
  }
  return '';
}

const P_Renderer: CustomBlockRenderer = ({ TDefaultRenderer, ...props }) => {
  const { tnode } = props;
  const rendererProps = useRendererProps('p');
  const textColor = useThemeColor({}, 'text');
  const lightPrimaryColor = useThemeColor({}, 'primary_60');

  if (!rendererProps) return <TDefaultRenderer {...props} />;

  const {
    segmentMap,
    onPress,
    fontSizeScale = 1.0,
    lineHeightScale = 1.5,
  } = rendererProps as any;

  const pid = tnode.attributes['data-pid'];
  const segment = pid ? segmentMap.get(pid) : null;
  const fullText = segment?.text || getTNodeText(tnode) || '';
  const slices = sliceParagraphText(fullText, segment?.marks);
  const hasAnyInteraction = slices.some((s) => s.interaction);

  if (!hasAnyInteraction) {
    return <TDefaultRenderer {...props} />;
  }

  const textFontSize = typography.fontSize.subtitle * fontSizeScale;
  const textLineHeight = typography.fontSize.subtitle * lineHeightScale;

  return (
    <Text
      style={[
        props.style as any,
        {
          color: textColor,
          fontSize: textFontSize,
          lineHeight: textLineHeight,
          marginBottom: 14,
          marginTop: 0,
        },
      ]}
    >
      {slices.map((slice, idx) => {
        if (slice.interaction) {
          return (
            <Text
              // biome-ignore lint/suspicious/noArrayIndexKey: slices 是单个 segment 一次性切分出的结果,同一 segment 的切分稳定;slice.text 会重复,不能当 key。
              key={idx}
              onPress={() => onPress(pid, segment, slice.interaction)}
              style={{
                color: textColor,
                fontSize: textFontSize,
                lineHeight: textLineHeight,
                textDecorationLine: 'underline',
                textDecorationStyle: 'dashed',
                textDecorationColor: lightPrimaryColor,
              }}
            >
              {slice.text}
            </Text>
          );
        }
        return (
          <Text
            // biome-ignore lint/suspicious/noArrayIndexKey: 同上,与相邻分支共用一次 slices.map。
            key={idx}
            style={{
              color: textColor,
              fontSize: textFontSize,
              lineHeight: textLineHeight,
            }}
          >
            {slice.text}
          </Text>
        );
      })}
    </Text>
  );
};

const LazyImage: React.FC<{
  src: string;
  style: any;
  resizeMode: 'contain' | 'cover' | 'stretch' | 'center';
  resizeMethod?: 'auto' | 'resize' | 'scale';
  colorScheme: 'light' | 'dark';
}> = ({ src, style, resizeMode, resizeMethod, colorScheme }) => {
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<RNView>(null);
  const timerRef = useRef<any>(null);
  const placeholderColor = useThemeColor({}, 'contentPlaceholder');

  useEffect(() => {
    if (visible) return;

    const checkVisibility = () => {
      containerRef.current?.measureInWindow((_x, y, _width, height) => {
        if (y === undefined) return;
        const { height: screenHeight } = Dimensions.get('window');
        // Load when it's within viewport + 400px scroll-ahead buffer
        if (y < screenHeight + 400 && y + height > -400) {
          setVisible(true);
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }
      });
    };

    checkVisibility();
    timerRef.current = setInterval(checkVisibility, 400);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [visible]);

  return (
    <RNView
      ref={containerRef}
      style={[style, { backgroundColor: placeholderColor }]}
      className="rounded-xl justify-center items-center overflow-hidden"
    >
      {visible ? (
        <Image
          source={{ uri: src }}
          style={StyleSheet.absoluteFill}
          resizeMode={resizeMode}
          resizeMethod={resizeMethod}
          className="rounded-xl"
        />
      ) : (
        <ActivityIndicator
          size="small"
          color={Colors[colorScheme].textTertiary}
        />
      )}
    </RNView>
  );
};

const IMG_Renderer: CustomBlockRenderer = ({ tnode }) => {
  const { src, width: attrWidth, height: attrHeight, eeimg } = tnode.attributes;
  const rendererProps = useRendererProps('img');
  const [svgError, setSvgError] = useState(false);

  if (!rendererProps) return null;
  const {
    onPress,
    onLongPress,
    width: contentWidth,
    colorScheme,
  } = rendererProps as any;
  const themeColors = Colors[colorScheme === 'dark' ? 'dark' : 'light'];

  const originalWidth = parseInt(attrWidth as string, 10) || 0;
  const originalHeight = parseInt(attrHeight as string, 10) || 0;

  if (!src || src.startsWith('data:image/svg')) {
    return null;
  }

  const isFormula =
    src.includes('zhihu.com/equation') || eeimg === '1' || eeimg === '2';
  const alt = tnode.attributes.alt || '';

  // 优先级：eeimg=2 为块级，eeimg=1 为行内；如果缺失则根据源码内容启发式判断
  const isBlockFormula =
    eeimg === '2' ||
    (!eeimg && (alt.includes('\\begin') || alt.includes('\\\\')));

  let displayHeight = 200;
  let displayWidth: number | string = contentWidth;

  if (originalWidth > 0 && originalHeight > 0) {
    if (isFormula && originalHeight < 100 && originalWidth < contentWidth) {
      // 小公式保持原比例，不拉伸到全屏
      displayWidth = originalWidth;
      displayHeight = originalHeight;
    } else {
      displayHeight = (contentWidth * originalHeight) / originalWidth;
    }
  } else if (isFormula) {
    // 默认高度估计
    displayHeight = isBlockFormula ? 60 : 22;
    displayWidth = isBlockFormula
      ? contentWidth
      : Math.min(contentWidth, Math.max(40, alt.length * 8));
  }

  const imageStyle: any = {
    width: displayWidth,
    height: displayHeight,
  };

  // 如果是公式，且是暗色模式，使用 tintColor 将黑色公式变为白色
  if (isFormula && colorScheme === 'dark') {
    imageStyle.tintColor = themeColors.textInverse;
  }

  // 确保 src 有协议
  const finalSrc = src.startsWith('//') ? `https:${src}` : src;

  if (isFormula && !isBlockFormula) {
    return (
      <Text onPress={() => onPress(finalSrc)}>
        {svgError ? (
          <Text
            style={{
              color: themeColors.text,
              fontSize: 16,
            }}
          >
            {alt || '公式'}
          </Text>
        ) : (
          <SvgUri
            uri={finalSrc}
            width={displayWidth}
            height={displayHeight}
            color={themeColors.text}
            onError={() => setSvgError(true)}
          />
        )}
      </Text>
    );
  }

  return (
    <View
      className={
        isFormula
          ? `my-1.5 items-center bg-transparent ${isBlockFormula ? 'w-full' : ''}`
          : 'my-2.5 items-center w-full bg-transparent'
      }
    >
      <Pressable
        onPress={() => onPress(finalSrc)}
        onLongPress={() => onLongPress?.(finalSrc)}
        className="bg-transparent"
      >
        {isFormula ? (
          svgError ? (
            <Text
              style={{
                color: themeColors.text,
                fontSize: 16,
              }}
            >
              {alt || '公式加载失败'}
            </Text>
          ) : (
            <SvgUri
              uri={finalSrc}
              width={displayWidth}
              height={displayHeight}
              color={themeColors.text}
              onError={() => setSvgError(true)}
            />
          )
        ) : (
          <LazyImage
            src={finalSrc}
            style={imageStyle}
            resizeMode="contain"
            resizeMethod="resize"
            colorScheme={colorScheme}
          />
        )}
      </Pressable>
    </View>
  );
};

const LinkCardRenderer: CustomBlockRenderer = ({
  tnode,
  TDefaultRenderer,
  ...props
}) => {
  const rawUrl = tnode.attributes.href;
  const normalizedUrl = useNormalizedUrl(rawUrl || '');
  const anchorRendererProps = useRendererProps('a');
  const rendererProps = useRendererProps('linkcard');

  if (!isLinkCardElement(tnode)) {
    const onPress =
      anchorRendererProps?.onPress && normalizedUrl
        ? (event: GestureResponderEvent) =>
            anchorRendererProps.onPress?.(
              event,
              normalizedUrl,
              tnode.attributes,
              (tnode.attributes.target as
                | '_blank'
                | '_self'
                | '_parent'
                | '_top'
                | undefined) || '_blank',
            )
        : props.onPress;
    return <TDefaultRenderer tnode={tnode} {...props} onPress={onPress} />;
  }

  if (!rendererProps) {
    return <TDefaultRenderer tnode={tnode} {...props} />;
  }
  const { onLinkCardPress, surfaceColor, colorScheme, linkCardInfo } =
    rendererProps as any;

  const url = rawUrl ? extractZhihuRedirectTarget(rawUrl) : rawUrl;
  const metadata = getLinkCardMetadata(linkCardInfo, rawUrl, url);
  const draftTitle = tnode.attributes['data-draft-title'];
  const textTitle = getTNodeText(tnode).trim();
  const title = !isLikelyUrl(draftTitle)
    ? draftTitle
    : !isLikelyUrl(textTitle)
      ? textTitle
      : undefined;

  if (url) {
    return (
      <View style={{ width: '100%' }}>
        <LinkCard
          url={url}
          title={title}
          image={tnode.attributes['data-draft-cover']}
          cardInfo={metadata}
          onPress={onLinkCardPress}
          surfaceColor={surfaceColor}
          colorScheme={colorScheme}
        />
      </View>
    );
  }

  return <TDefaultRenderer tnode={tnode} {...props} />;
};

const renderers = {
  p: P_Renderer,
  img: IMG_Renderer,
  a: LinkCardRenderer,
};

const IGNORED_DOM_TAGS = ['noscript'];
const SYSTEM_FONTS = [...defaultSystemFonts, 'Inter', 'Roboto'];

export const ZhihuContent: React.FC<ZhihuContentProps> = React.memo(
  ({
    content,
    contentArray,
    segmentInfos,
    linkCardInfo,
    objectId,
    type,
    onRefresh,
    useNative,
  }) => {
    const colorScheme = useColorScheme();
    const { width } = useWindowDimensions();
    const { useWebView, fontSizeScale, lineHeightScale } = useSettingsStore();
    const textColor = useThemeColor({}, 'text');
    const textSecondaryColor = useThemeColor({}, 'textSecondary');
    const borderColor = useThemeColor({}, 'border');
    const contentBorderColor = useThemeColor({}, 'contentBorder');
    const shadowColor = useThemeColor({}, 'shadow');
    const inverseTextColor = useThemeColor({}, 'textInverse');
    const surfaceColor = useThemeColor({}, 'surface');
    const router = useRouter();

    const [activeSegment, setActiveSegment] = useState<{
      pid: string;
      text: string;
      is_like: boolean;
      like_count: number;
      comment_count: number;
      seg_ids?: string[];
      startIndex?: number;
      endIndex?: number;
    } | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [viewerVisible, setViewerVisible] = useState(false);
    const [viewerImage, setViewerImage] = useState<string | null>(null);
    const [actionSheetUrl, setActionSheetUrl] = useState<string | null>(null);
    const [shouldRender, setShouldRender] = useState(true);
    const [domReady, setDomReady] = useState(false);
    const [useNativeFallback, setUseNativeFallback] = useState(false);

    // 延迟解析 HTML 已不再需要，直接渲染以保证丝滑
    React.useEffect(() => {
      setShouldRender(true);
    }, []);

    // 备选方案：如果 DOM 组件加载太慢或失败，回退到原生渲染
    React.useEffect(() => {
      if (useWebView && !useNative && !contentArray && content && !domReady) {
        const timer = setTimeout(() => {
          if (!domReady) {
            console.log(
              'DOM component timeout, falling back to native rendering',
            );
            setUseNativeFallback(true);
          }
        }, 3500);
        return () => clearTimeout(timer);
      }
    }, [content, domReady, contentArray, useWebView, useNative]);

    const handleInternalLink = useCallback(
      (url: string) => {
        if (!url) return;
        // 先解码知乎跳转链接（link.zhihu.com?target=...），拿到真实 URL
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

    const segmentMap = useMemo(() => {
      const map = new Map<string, ZhihuSegmentInfo>();
      segmentInfos?.forEach((info) => {
        map.set(info.pid, info);
      });
      return map;
    }, [segmentInfos]);

    const toggleSegmentLikeMutation = useMutation({
      mutationFn: async () => {
        if (!activeSegment) return;
        const { is_like, seg_ids, text, pid, startIndex, endIndex } =
          activeSegment;
        const segId = Array.isArray(seg_ids) ? seg_ids[0] : (seg_ids as any);

        if (is_like) {
          return unreactAnswerSegment(objectId, segId);
        } else {
          return reactAnswerSegment(
            objectId,
            segId,
            text,
            pid,
            startIndex || 0,
            endIndex || 0,
          );
        }
      },
      onSuccess: () => {
        onRefresh?.();
        if (activeSegment) {
          setActiveSegment({
            ...activeSegment,
            is_like: !activeSegment.is_like,
            like_count: activeSegment.is_like
              ? activeSegment.like_count - 1
              : activeSegment.like_count + 1,
          });
          showToast(activeSegment.is_like ? '已取消赞同' : '已赞同');
        }
      },
    });

    const findActiveInteraction = useCallback(
      (segment: ZhihuSegmentInfo | null | undefined) => {
        const marks = segment?.marks;
        if (!marks || marks.length === 0) return null;
        for (const mark of marks) {
          if (mark.seg_info?.is_like) return { ...mark.seg_info, mark };
          if (mark.master_seg_info?.is_like)
            return { ...mark.master_seg_info, mark };
        }
        for (const mark of marks) {
          if (mark.master_seg_info) return { ...mark.master_seg_info, mark };
        }
        const firstInfo = marks[0].seg_info || marks[0].master_seg_info;
        return firstInfo ? { ...firstInfo, mark: marks[0] } : null;
      },
      [],
    );

    const handlePress = useCallback(
      (pid: string, segment: ZhihuSegmentInfo, interaction: any) => {
        const mark = interaction.mark;
        setActiveSegment({
          pid,
          text: segment?.text || '',
          is_like: !!interaction.is_like,
          like_count: interaction.like_count || 0,
          comment_count: interaction.comment_count || 0,
          seg_ids:
            interaction.seg_ids ||
            mark?.seg_info?.seg_ids ||
            (mark as any)?.master_seg_info?.seg_ids,
          startIndex: mark?.start_index || 0,
          endIndex: mark?.end_index || segment?.text.length || 0,
        });
        setModalVisible(true);
      },
      [],
    );

    const domVisitors = useMemo(
      () => ({
        onElement: (element: any) => {
          if (element.name === 'img') {
            const { attribs } = element;
            const originalToken = attribs['data-original-token']?.trim();
            let actualSrc = (
              attribs['data-actualsrc'] ||
              attribs['data-original'] ||
              attribs.src ||
              ''
            ).trim();

            if (actualSrc && originalToken) {
              const tokenRegex = /v2-[a-fA-F0-9]{32}/;
              if (tokenRegex.test(actualSrc)) {
                actualSrc = actualSrc.replace(tokenRegex, originalToken);
              }
            }

            if (actualSrc) {
              // 确保有协议
              attribs.src = actualSrc.startsWith('//')
                ? `https:${actualSrc}`
                : actualSrc;
            }
            if (attribs['data-rawwidth'])
              attribs.width = attribs['data-rawwidth'];
            if (attribs['data-rawheight'])
              attribs.height = attribs['data-rawheight'];
          }
          if (element.name === 'p') {
            const pid = element.attribs['data-pid'];
            const segment = pid ? segmentMap.get(pid) : null;
            const interaction = findActiveInteraction(segment);
            if (
              interaction &&
              (interaction.like_count > 0 ||
                interaction.comment_count > 0 ||
                interaction.is_like)
            ) {
              element.attribs.class = `${element.attribs.class || ''} segment-interactable`;
              if (interaction.is_like) {
                element.attribs.class += ' segment-liked';
              }
            }
          }
        },
      }),
      [segmentMap, findActiveInteraction],
    );

    const renderersProps = useMemo(
      () => ({
        p: {
          segmentMap,
          onPress: handlePress,
          fontSizeScale,
          lineHeightScale,
        },
        a: {
          onPress: (_event: any, href: string) => handleInternalLink(href),
        },
        linkcard: {
          onLinkCardPress: handleInternalLink,
          surfaceColor,
          colorScheme,
          linkCardInfo,
        },
        img: {
          onPress: (src: string) => {
            setViewerImage(src);
            setViewerVisible(true);
          },
          onLongPress: (src: string) => {
            setActionSheetUrl(src);
          },
          width: width - 40,
          colorScheme,
        },
      }),
      [
        segmentMap,
        handlePress,
        linkCardInfo,
        colorScheme,
        handleInternalLink,
        surfaceColor,
        width,
        fontSizeScale,
        lineHeightScale,
      ],
    );

    const primaryColor = useThemeColor({}, 'primary');
    const lightPrimaryColor = useThemeColor({}, 'primary_40');

    const classesStyles = useMemo(
      () => ({
        'segment-interactable': {
          textDecorationLine: 'underline',
          textDecorationStyle: 'dashed',
          textDecorationColor: lightPrimaryColor,
        },
        'segment-liked': {
          textDecorationLine: 'underline',
          textDecorationStyle: 'dashed',
          textDecorationColor: lightPrimaryColor,
        },
      }),
      [lightPrimaryColor],
    );

    const tagsStyles = useMemo(
      () => ({
        p: {
          color: textColor,
          fontSize: 17 * fontSizeScale,
          lineHeight: 17 * lineHeightScale,
          marginBottom: 14,
          marginTop: 0,
        },
        b: { color: textColor, fontWeight: 'bold' },
        strong: { color: textColor, fontWeight: 'bold' },
        img: { borderRadius: 12, marginVertical: 10, display: 'inline' },
        blockquote: {
          borderLeftWidth: 3,
          borderLeftColor: primaryColor,
          paddingLeft: 14,
          paddingRight: 10,
          backgroundColor: `${surfaceColor}60`,
          paddingVertical: 10,
          marginVertical: 12,
          borderRadius: 4,
          color: textColor,
          opacity: 0.85,
        },
        h1: {
          color: textColor,
          fontSize: 21 * fontSizeScale,
          fontWeight: 'bold',
          marginTop: 24,
          marginBottom: 10,
          lineHeight: 21 * lineHeightScale,
        },
        h2: {
          color: textColor,
          fontSize: 19 * fontSizeScale,
          fontWeight: 'bold',
          marginTop: 20,
          marginBottom: 8,
          lineHeight: 19 * lineHeightScale,
        },
        h3: {
          color: textColor,
          fontSize: 17 * fontSizeScale,
          fontWeight: 'bold',
          marginTop: 16,
          marginBottom: 6,
          lineHeight: 17 * lineHeightScale,
        },
        ul: { paddingLeft: 20, color: textColor, marginVertical: 8 },
        ol: { paddingLeft: 20, color: textColor, marginVertical: 8 },
        li: {
          marginBottom: 6,
          color: textColor,
          fontSize: 17 * fontSizeScale,
          lineHeight: 17 * lineHeightScale,
        },
        hr: {
          height: 1,
          backgroundColor: contentBorderColor,
          marginVertical: 20,
        },
        figure: { marginVertical: 12, alignItems: 'center' },
        figcaption: {
          color: textSecondaryColor,
          fontSize: 13 * fontSizeScale,
          marginTop: 6,
          textAlign: 'center',
          opacity: 0.7,
        },
        span: { color: textColor },
        div: { color: textColor },
        a: { color: primaryColor, textDecorationLine: 'none' },
        code: {
          backgroundColor: borderColor,
          borderRadius: 4,
          paddingHorizontal: 5,
          paddingVertical: 2,
          fontFamily: 'monospace',
          fontSize: 14 * fontSizeScale,
        },
      }),
      [
        textColor,
        textSecondaryColor,
        borderColor,
        contentBorderColor,
        surfaceColor,
        fontSizeScale,
        lineHeightScale,
        primaryColor,
      ],
    );

    const defaultTextProps = useMemo(() => ({ selectable: true }), []);

    const renderPinContent = () => {
      if (!contentArray) return null;
      return contentArray.map((item, index) => {
        if (item.type === 'text') {
          return (
            <RenderHtml
              // biome-ignore lint/suspicious/noArrayIndexKey: contentArray 是想法正文的解析结果,按原文顺序混排文本/图片/链接卡片。PinContentItem 没有 id,内容本身也不保证唯一,index 是这里唯一稳定的标识。
              key={index}
              contentWidth={width - 40}
              source={{ html: `<div>${item.content}</div>` }}
              renderers={renderers as any}
              tagsStyles={tagsStyles as any}
              classesStyles={classesStyles as any}
              domVisitors={domVisitors}
              systemFonts={SYSTEM_FONTS}
              renderersProps={renderersProps as any}
              ignoredDomTags={IGNORED_DOM_TAGS}
              defaultTextProps={defaultTextProps}
            />
          );
        }
        if (item.type === 'image') {
          return (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: 同上,与相邻分支共用一次 contentArray.map。
              key={index}
              className="my-2.5 items-center w-full bg-transparent"
            >
              <Pressable
                onPress={() => {
                  setViewerImage(item.url);
                  setViewerVisible(true);
                }}
              >
                <Image
                  source={{ uri: item.url }}
                  className="rounded-xl"
                  style={{ width: width - 40, height: 250 }}
                  resizeMode="cover"
                />
              </Pressable>
            </View>
          );
        }
        if (item.type === 'link_card') {
          return (
            <LinkCard
              // biome-ignore lint/suspicious/noArrayIndexKey: 同上,与相邻分支共用一次 contentArray.map。
              key={index}
              url={item.url}
              title={item.data_draft_title}
              image={item.data_draft_cover}
              onPress={handleInternalLink}
              surfaceColor={surfaceColor}
              colorScheme={colorScheme}
            />
          );
        }
        return null;
      });
    };

    const onReadyCallback = useCallback(() => setDomReady(true), []);
    const onImagePressCallback = useCallback((src: string) => {
      setViewerImage(src);
      setViewerVisible(true);
    }, []);
    const onSegmentPressCallback = useCallback(
      (pid: string) => {
        const segment = segmentMap.get(pid);
        if (segment) {
          const interaction = findActiveInteraction(segment);
          if (interaction) {
            handlePress(pid, segment, interaction);
          }
        }
      },
      [segmentMap, findActiveInteraction, handlePress],
    );

    // --- Segment reaction from text selection ---
    const [textSelection, setTextSelection] =
      useState<TextSelectionInfo | null>(null);

    const onTextSelectedCallback = useCallback(
      (info: TextSelectionInfo | null) => {
        setTextSelection(info);
      },
      [],
    );

    const createReactionMutation = useMutation({
      mutationFn: async () => {
        if (!textSelection) return;
        return createSegmentReaction(
          objectId,
          textSelection.text,
          textSelection.startParagraphId,
          textSelection.startOffset,
          textSelection.endParagraphId,
          textSelection.endOffset,
        );
      },
      onSuccess: () => {
        showToast('已赞同此段落');
        setTextSelection(null);
        onRefresh?.();
      },
      onError: () => {
        showToast('操作失败，请重试');
      },
    });
    const domStyle = useMemo(
      () => ({ backgroundColor: 'transparent', minHeight: 400 }),
      [],
    );

    if (!shouldRender && !contentArray) {
      return (
        <View className="h-[200px] justify-center items-center bg-transparent">
          <ActivityIndicator size="small" color={primaryColor} />
        </View>
      );
    }

    return (
      <View className="bg-transparent">
        {contentArray ? (
          renderPinContent()
        ) : !useWebView || useNativeFallback || useNative ? (
          <View className="px-1">
            <RenderHtml
              contentWidth={width - 40}
              source={{ html: `<div>${content}</div>` }}
              renderers={renderers as any}
              tagsStyles={tagsStyles as any}
              classesStyles={classesStyles as any}
              domVisitors={domVisitors}
              systemFonts={SYSTEM_FONTS}
              renderersProps={renderersProps as any}
              ignoredDomTags={IGNORED_DOM_TAGS}
              defaultTextProps={defaultTextProps}
            />
          </View>
        ) : (
          <View style={{ minHeight: 400 }}>
            {!domReady && !useNativeFallback && (
              <View className="absolute inset-0 z-10 justify-center items-center bg-transparent">
                <ActivityIndicator size="small" color={primaryColor} />
                <Text type="secondary" className="mt-4 text-xs opacity-50">
                  正在建立连接...
                </Text>
              </View>
            )}
            <ZhihuDOMContent
              htmlContent={content || ''}
              segmentInfosStr={JSON.stringify(segmentInfos)}
              linkCardInfoStr={JSON.stringify(linkCardInfo || {})}
              colorScheme={colorScheme}
              onReady={onReadyCallback}
              onImagePress={onImagePressCallback}
              onImageLongPress={(src) => setActionSheetUrl(src)}
              onLinkPress={handleInternalLink}
              onSegmentPress={onSegmentPressCallback}
              onTextSelected={
                type === 'answer' ? onTextSelectedCallback : undefined
              }
              style={domStyle}
            />
          </View>
        )}

        <ActionSheet
          visible={modalVisible && Boolean(activeSegment)}
          onClose={() => setModalVisible(false)}
          title="段落操作"
          subtitle={(() => {
            if (!activeSegment) return undefined;
            const { text, startIndex, endIndex } = activeSegment;
            const selected = text
              .slice(startIndex || 0, endIndex || text.length)
              .trim();
            return selected || text;
          })()}
          options={
            activeSegment
              ? [
                  {
                    key: 'like',
                    icon: activeSegment.is_like
                      ? ('heart' as const)
                      : ('heart-outline' as const),
                    label: `${activeSegment.like_count || 0} 赞同`,
                    color: activeSegment.is_like
                      ? Colors[colorScheme].danger
                      : undefined,
                    disabled: toggleSegmentLikeMutation.isPending,
                    onPress: () => toggleSegmentLikeMutation.mutate(),
                  },
                  {
                    key: 'comments',
                    icon: 'chatbubble-outline' as const,
                    label: `${activeSegment.comment_count || 0} 评论`,
                    onPress: () => {
                      const { seg_ids, text, startIndex, endIndex } =
                        activeSegment;
                      const segmentId = Array.isArray(seg_ids)
                        ? seg_ids[0]
                        : seg_ids;
                      const selected = text
                        .slice(startIndex || 0, endIndex || text.length)
                        .trim();
                      const queryParams = [
                        `type=${type}`,
                        segmentId ? `segmentId=${segmentId}` : null,
                        selected
                          ? `text=${encodeURIComponent(selected)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join('&');
                      router.push(`/comments/${objectId}?${queryParams}`);
                    },
                  },
                  {
                    key: 'discussion',
                    icon: 'chatbubbles-outline' as const,
                    label: '查看详细讨论',
                    onPress: () => {
                      const { text, startIndex, endIndex } = activeSegment;
                      const selected = text
                        .slice(startIndex || 0, endIndex || text.length)
                        .trim();
                      const queryParams = [
                        `type=${type}`,
                        selected
                          ? `text=${encodeURIComponent(selected)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join('&');
                      router.push(`/comments/${objectId}?${queryParams}`);
                    },
                  },
                ]
              : []
          }
        />

        <ImagePreviewModal
          visible={viewerVisible && Boolean(viewerImage)}
          imageUrls={viewerImage ? [viewerImage] : []}
          onClose={() => setViewerVisible(false)}
        />

        <ImageActionBottomSheet
          visible={Boolean(actionSheetUrl)}
          imageUrl={actionSheetUrl}
          onClose={() => setActionSheetUrl(null)}
        />

        {textSelection && type === 'answer' && (
          <View
            className="mt-3 rounded-2xl overflow-hidden"
            style={[
              {
                backgroundColor: surfaceColor,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: contentBorderColor,
                shadowColor,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.08,
                shadowRadius: 8,
                elevation: 4,
              },
            ]}
          >
            <View className="px-4 pt-3 pb-2 bg-transparent">
              <Text type="secondary" className="text-xs mb-1.5">
                已选中文字
              </Text>
              <Text
                className="text-[15px] leading-5"
                numberOfLines={2}
                style={{ fontStyle: 'italic' }}
              >
                "{textSelection.text}"
              </Text>
            </View>
            <View
              className="flex-row items-center justify-between px-4 py-2.5 bg-transparent"
              style={{
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: contentBorderColor,
              }}
            >
              <Pressable
                className="flex-row items-center bg-transparent"
                onPress={() => setTextSelection(null)}
              >
                <Ionicons
                  name="close-circle-outline"
                  size={18}
                  color={textSecondaryColor}
                />
                <Text type="secondary" className="text-sm ml-1">
                  取消
                </Text>
              </Pressable>
              <Pressable
                className="flex-row items-center rounded-full px-4 py-1.5"
                style={{
                  backgroundColor: primaryColor,
                }}
                onPress={() => createReactionMutation.mutate()}
                disabled={createReactionMutation.isPending}
              >
                {createReactionMutation.isPending ? (
                  <ActivityIndicator size="small" color={inverseTextColor} />
                ) : (
                  <>
                    <Ionicons name="heart" size={16} color={inverseTextColor} />
                    <Text
                      className="text-sm font-bold ml-1"
                      style={{ color: inverseTextColor }}
                    >
                      赞同
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        )}
      </View>
    );
  },
);
