import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { type Href, useRouter } from 'expo-router';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, Image, Linking, StyleSheet } from 'react-native';
import {
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
import {
  Text,
  useRuntimeThemeColors,
  useThemeColor,
  View,
} from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { useSettingsStore } from '@/store/useSettingsStore';
import type {
  ZhihuSegmentInfo,
  ZhihuSegmentMark,
  ZhihuSegmentReaction,
} from '@/types/zhihu';
import { showToast } from '@/utils/toast';
import {
  extractZhihuRedirectTarget,
  getSafeExternalUrl,
  parseZhihuUrl,
} from '@/utils/url';
import { getZhihuErrorStatus } from '@/utils/zhihuError';
import type {
  ZhihuDocument,
  ZhihuInlineRun,
  ZhihuLinkCardBlock,
} from '../document';
import { serializeZhihuDocumentHtml } from '../documentHtml';
import {
  getZhihuDocumentPreviewImages,
  walkZhihuDocument,
} from '../documentTraversal';
import {
  getNativeHighlightDisplayText,
  resolveNativeAnswerSegment,
  resolveNativeAnswerSelection,
} from '../nativeInteractions';
import type { RichTextFlow } from '../richText';
import { createSelectionReactionOptions } from '../selectionReaction';
import type {
  LinkCardProps,
  RichContentRenderer,
  ZhihuContentProps,
} from '../types';
import ZhihuDOMContent, { type TextSelectionInfo } from './ZhihuDOMContent';
import {
  isRichTextNativeAvailable,
  ZhihuNativeContent,
  type ZhihuNativeContentSelection,
  type ZhihuNativeSegmentAction,
} from './ZhihuNativeContent';

export type { RichContentRenderer, ZhihuContentProps } from '../types';

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

export const LinkCard: React.FC<LinkCardProps> = React.memo(
  ({ url, title, image, cardInfo, onPress, surfaceColor }) => {
    const metadata = useMemo(() => parseLinkCardMetadata(cardInfo), [cardInfo]);
    const display = asRecord(metadata?.display) as LinkCardDisplay | null;
    const displayTitle = getString(display?.title);
    const providedTitle = getString(title);
    const usableTitle = !isLikelyUrl(providedTitle) ? providedTitle : undefined;
    const cardUrl = getString(display?.card_open_url) || url;
    const description = stripHtml(getString(display?.desc));
    const internalPath = useMemo(() => parseZhihuUrl(cardUrl), [cardUrl]);
    const isInternal = internalPath !== null;
    const themeColors = useRuntimeThemeColors();
    const primaryColor = themeColors.link;
    const cardBorderColor = useThemeColor({}, 'contentBorderStrong');

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
        } catch (err: unknown) {
          if (getZhihuErrorStatus(err) === 404) {
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

    const getLinkTypeIcon = (): React.ComponentProps<
      typeof Ionicons
    >['name'] => {
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
                  name={getLinkTypeIcon()}
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
              style={[{ backgroundColor: themeColors.backgroundSecondary }]}
            />
          )}
        </BouncyButton>
      </View>
    );
  },
);

type SegmentInteraction = ZhihuSegmentReaction & {
  mark?: ZhihuSegmentMark;
};

interface ActiveSegment {
  pid: string;
  text: string;
  reactionText: string;
  copyText: string;
  is_like: boolean;
  like_count: number;
  comment_count: number;
  seg_ids?: string[] | string;
  startIndex: number;
  endIndex: number;
}

/** DOM segment spans are emitted only for source text with inline formatting. */
function sourceInlineText(runs: readonly ZhihuInlineRun[]): string | undefined {
  let text = '';
  for (const run of runs) {
    const value =
      'children' in run
        ? sourceInlineText(run.children)
        : run.type === 'text' || run.type === 'inlineCode'
          ? run.text
          : undefined;
    if (value === undefined) return undefined;
    text += value;
  }
  return text;
}

export const ZhihuContent: React.FC<ZhihuContentProps> = React.memo(
  ({
    content,
    contentArray,
    document: sourceDocument,
    segmentInfos,
    linkCardInfo,
    objectId,
    type,
    onRefresh,
    renderer,
    renderPlaceholder,
    onLayoutReady,
    initialContentWidth,
    fontSizeScale: fontSizeOverride,
    lineHeightScale: lineHeightOverride,
    typographyOptions,
    useNative,
    selectable = true,
    variant = 'default',
  }) => {
    const colorScheme = useColorScheme();
    const settings = useSettingsStore();
    const fontSizeScale = fontSizeOverride ?? settings.fontSizeScale;
    const lineHeightScale = lineHeightOverride ?? settings.lineHeightScale;
    const selectedRenderer: RichContentRenderer =
      renderer ??
      (useNative && settings.richContentRenderer === 'webview'
        ? 'native-v2'
        : settings.richContentRenderer);
    const document = useMemo(
      () =>
        sourceDocument
          ? { ...sourceDocument, id: `${type}:${objectId}` }
          : undefined,
      [sourceDocument, type, objectId],
    );
    const documentHtml = useMemo(
      () =>
        document &&
        (selectedRenderer === 'webview' || !isRichTextNativeAvailable())
          ? serializeZhihuDocumentHtml(document)
          : undefined,
      [document, selectedRenderer],
    );
    const documentImages = useMemo(
      () =>
        document
          ? getZhihuDocumentPreviewImages(document).map((image) => image.url)
          : undefined,
      [document],
    );
    const themeColors = useRuntimeThemeColors();
    const textSecondaryColor = useThemeColor({}, 'textSecondary');
    const contentBorderColor = useThemeColor({}, 'contentBorder');
    const inverseTextColor = themeColors.onPrimary;
    const surfaceColor = useThemeColor({}, 'surface');
    const router = useRouter();

    const [activeSegment, setActiveSegment] = useState<ActiveSegment | null>(
      null,
    );
    const [modalVisible, setModalVisible] = useState(false);
    const [nativeHighlight, setNativeHighlight] = useState<{
      text: string;
      sourceUrl?: string;
    } | null>(null);
    const [viewerVisible, setViewerVisible] = useState(false);
    const [viewerImage, setViewerImage] = useState<string | null>(null);
    const [viewerImages, setViewerImages] = useState<string[]>([]);
    const [actionSheetUrl, setActionSheetUrl] = useState<string | null>(null);
    const handleInternalLink = useCallback(
      (url: string) => {
        if (!url) return;
        // 先解码知乎跳转链接（link.zhihu.com?target=...），拿到真实 URL
        const realUrl = extractZhihuRedirectTarget(url);
        const internalPath = parseZhihuUrl(realUrl);
        if (internalPath && internalPath !== '/') {
          router.push(internalPath as Href);
        } else {
          const externalUrl = getSafeExternalUrl(realUrl);
          if (externalUrl)
            Linking.openURL(externalUrl).catch(() =>
              console.error('Failed to open rich content URL'),
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
      mutationFn: async ({
        answerId,
        segment,
      }: {
        answerId: string;
        segment: ActiveSegment;
      }) => {
        const { is_like, seg_ids, reactionText, pid, startIndex, endIndex } =
          segment;
        if (!seg_ids || (Array.isArray(seg_ids) && seg_ids.length === 0)) {
          throw new Error('段落缺少有效的 seg_id');
        }

        if (is_like) {
          return unreactAnswerSegment(answerId, seg_ids);
        } else {
          return reactAnswerSegment(
            answerId,
            seg_ids,
            reactionText,
            pid,
            startIndex || 0,
            endIndex || 0,
          );
        }
      },
      onSuccess: (result, { answerId, segment }) => {
        if (
          interactionSource.current.objectId !== answerId ||
          interactionSource.current.type !== 'answer'
        )
          return;
        onRefresh?.();
        setActiveSegment((current) => {
          if (
            !current ||
            current.pid !== segment.pid ||
            current.startIndex !== segment.startIndex ||
            current.endIndex !== segment.endIndex ||
            current.seg_ids !== segment.seg_ids
          )
            return current;
          return {
            ...current,
            is_like: !segment.is_like,
            seg_ids: segment.is_like
              ? segment.seg_ids
              : result.segmentIds
                ? [...result.segmentIds]
                : undefined,
            like_count: Math.max(
              0,
              segment.like_count + (segment.is_like ? -1 : 1),
            ),
          };
        });
        showToast(segment.is_like ? '已取消赞同' : '已赞同');
      },
      onError: () => {
        showToast('操作失败，请重试');
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
      (
        pid: string,
        segment: ZhihuSegmentInfo,
        interaction: SegmentInteraction,
        copyText?: string,
      ) => {
        const mark = interaction.mark;
        const startIndex = mark?.start_index ?? 0;
        const endIndex = mark?.end_index ?? segment.text.length;
        if (type !== 'answer') {
          setNativeHighlight({
            text: copyText ?? segment.text.slice(startIndex, endIndex),
          });
          return;
        }
        setActiveSegment({
          pid,
          text: segment?.text || '',
          reactionText: segment.text.slice(startIndex, endIndex),
          copyText: copyText ?? segment.text.slice(startIndex, endIndex),
          is_like: !!interaction.is_like,
          like_count: interaction.like_count || 0,
          comment_count: interaction.comment_count || 0,
          seg_ids:
            interaction.seg_ids ||
            mark?.seg_info?.seg_ids ||
            mark?.master_seg_info?.seg_ids,
          startIndex,
          endIndex,
        });
        setModalVisible(true);
      },
      [type],
    );

    const primaryColor = useThemeColor({}, 'primary');
    const onImagePressCallback = useCallback(
      (src: string, gallery?: readonly string[]) => {
        setViewerImage(src);
        setViewerImages(gallery?.includes(src) ? [...gallery] : [src]);
        setViewerVisible(true);
      },
      [],
    );
    const onImageLongPressCallback = useCallback((src: string) => {
      setActionSheetUrl(src);
    }, []);
    const onSegmentPressCallback = useCallback(
      (pid: string, nodeId?: string) => {
        if (document) {
          const runs = [...walkZhihuDocument(document)].filter(
            (node) =>
              node.type === 'segment' &&
              node.paragraphId === pid &&
              (nodeId === undefined || node.id === nodeId),
          );
          // Older PID-only events must not guess among several mark ranges.
          if (runs.length !== 1 || runs[0].type !== 'segment') return;
          const run = runs[0];
          const text = sourceInlineText(run.children);
          if (!text?.trim()) return;
          const resolved = resolveNativeAnswerSegment(
            {
              nodeId: run.id,
              paragraphId: pid,
              start: run.range.start,
              end: run.range.end,
              text,
              segment: run,
            },
            { objectId, type, segmentInfos, document },
          );
          if (resolved)
            handlePress(pid, resolved.segment, resolved.interaction);
          else setNativeHighlight({ text });
          return;
        }
        const segment = segmentMap.get(pid);
        if (segment) {
          const interaction = findActiveInteraction(segment);
          if (interaction) {
            handlePress(pid, segment, interaction);
          }
        }
      },
      [
        document,
        objectId,
        type,
        segmentInfos,
        segmentMap,
        findActiveInteraction,
        handlePress,
      ],
    );
    const onNativeSegmentPressCallback = useCallback(
      (action: ZhihuNativeSegmentAction, document: ZhihuDocument) => {
        if (document.id !== `${type}:${objectId}`) return;
        const resolved = resolveNativeAnswerSegment(action, {
          objectId,
          type,
          segmentInfos,
          document,
        });
        if (resolved) {
          setNativeHighlight(null);
          handlePress(
            resolved.pid,
            resolved.segment,
            resolved.interaction,
            getNativeHighlightDisplayText(action, document) ?? action.text,
          );
        } else if (action.segment) {
          const text =
            getNativeHighlightDisplayText(action, document) ?? action.text;
          if (text.trim())
            setNativeHighlight({
              text,
              sourceUrl:
                action.segment.type === 'segmentHighlight'
                  ? action.segment.highlight?.sourceUrl
                  : undefined,
            });
        }
      },
      [objectId, type, segmentInfos, handlePress],
    );
    const renderNativeLinkCard = useCallback(
      (card: ZhihuLinkCardBlock) => (
        <LinkCard
          url={card.url}
          title={card.title}
          image={card.image?.url}
          cardInfo={{
            display: {
              ...(!isLikelyUrl(card.title) && { title: card.title }),
              card_open_url: card.url,
              desc: card.description,
              image: { image_url: card.image?.url },
            },
          }}
          onPress={handleInternalLink}
          surfaceColor={surfaceColor}
          colorScheme={colorScheme}
        />
      ),
      [handleInternalLink, surfaceColor, colorScheme],
    );

    // --- Segment reaction from text selection ---
    const [textSelection, setTextSelection] =
      useState<TextSelectionInfo | null>(null);
    const interactionSource = useRef({
      content,
      contentArray,
      document,
      objectId,
      type,
      selectedRenderer,
    });

    useEffect(() => {
      const previous = interactionSource.current;
      if (
        previous.content === content &&
        previous.contentArray === contentArray &&
        previous.document === document &&
        previous.objectId === objectId &&
        previous.type === type &&
        previous.selectedRenderer === selectedRenderer
      )
        return;
      interactionSource.current = {
        content,
        contentArray,
        document,
        objectId,
        type,
        selectedRenderer,
      };
      setTextSelection(null);
      setModalVisible(false);
      setActiveSegment(null);
      setNativeHighlight(null);
    }, [content, contentArray, document, objectId, type, selectedRenderer]);

    const onTextSelectedCallback = useCallback(
      (info: TextSelectionInfo | null) => {
        setTextSelection(info);
      },
      [],
    );
    const onNativeTextSelectedCallback = useCallback(
      (
        selection: ZhihuNativeContentSelection,
        flow: RichTextFlow,
        document: ZhihuDocument,
      ) => {
        if (document.id !== `${type}:${objectId}`) return;
        setTextSelection(
          resolveNativeAnswerSelection(selection, flow, {
            objectId,
            type,
            document,
            segmentInfos,
          }),
        );
      },
      [objectId, type, segmentInfos],
    );

    const currentTextSelection = useRef(textSelection);
    currentTextSelection.current = textSelection;
    const createReactionMutation = useMutation(
      createSelectionReactionOptions({
        getSource: () => interactionSource.current,
        getSelection: () => currentTextSelection.current,
        clearSelection: () => setTextSelection(null),
        refresh: onRefresh,
        notifySuccess: () => showToast('已赞同此段落'),
        notifyError: () => showToast('操作失败，请重试'),
      }),
    );
    const renderWebViewContent = () => (
      <ZhihuDOMContent
        htmlContent={documentHtml ?? content ?? ''}
        contentArray={document ? undefined : contentArray}
        segmentInfosStr={JSON.stringify(segmentInfos)}
        linkCardInfoStr={JSON.stringify(linkCardInfo || {})}
        colorScheme={colorScheme}
        onReady={onLayoutReady}
        onImagePress={(src) => onImagePressCallback(src, documentImages)}
        onImageLongPress={onImageLongPressCallback}
        onLinkPress={handleInternalLink}
        onSegmentPress={onSegmentPressCallback}
        onTextSelected={type === 'answer' ? onTextSelectedCallback : undefined}
        selectable={selectable}
        variant={variant}
        fontSizeScale={fontSizeScale}
        lineHeightScale={lineHeightScale}
        typographyOptions={typographyOptions}
      />
    );

    return (
      <View className="bg-transparent">
        {selectedRenderer === 'native-v2' ? (
          <ZhihuNativeContent
            content={content || ''}
            contentArray={contentArray}
            document={document}
            objectId={objectId}
            type={type}
            segmentInfos={segmentInfos}
            linkCardInfo={linkCardInfo}
            variant={variant}
            fontSizeScale={fontSizeScale}
            lineHeightScale={lineHeightScale}
            options={typographyOptions}
            onLinkPress={handleInternalLink}
            onImagePress={onImagePressCallback}
            onImageLongPress={onImageLongPressCallback}
            onSegmentPress={onNativeSegmentPressCallback}
            onSelectionChange={onNativeTextSelectedCallback}
            renderLinkCard={renderNativeLinkCard}
            selectable={selectable}
            renderFallback={renderWebViewContent}
            renderPlaceholder={renderPlaceholder}
            onLayoutReady={onLayoutReady}
            initialContentWidth={initialContentWidth}
          />
        ) : (
          renderWebViewContent()
        )}

        <ActionSheet
          visible={modalVisible && Boolean(activeSegment)}
          onClose={() => setModalVisible(false)}
          hapticFeedback={false}
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
                      ? themeColors.danger
                      : undefined,
                    disabled:
                      toggleSegmentLikeMutation.isPending ||
                      !activeSegment.seg_ids,
                    onPress: () => {
                      if (activeSegment)
                        toggleSegmentLikeMutation.mutate({
                          answerId: objectId,
                          segment: activeSegment,
                        });
                    },
                  },
                  {
                    key: 'comments',
                    icon: 'chatbubble-outline' as const,
                    label: `${activeSegment.comment_count || 0} 评论`,
                    disabled: !activeSegment.seg_ids,
                    onPress: () => {
                      const { seg_ids, text, startIndex, endIndex } =
                        activeSegment;
                      const segmentId = Array.isArray(seg_ids)
                        ? seg_ids.join(',')
                        : seg_ids;
                      const selected = text.slice(startIndex, endIndex);
                      const queryParams = [
                        `type=${type}`,
                        segmentId
                          ? `segmentId=${encodeURIComponent(segmentId)}`
                          : null,
                        `pid=${encodeURIComponent(activeSegment.pid)}`,
                        `startOffset=${startIndex}`,
                        `endOffset=${endIndex}`,
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
                    key: 'copy',
                    icon: 'copy-outline' as const,
                    label: '复制',
                    onPress: async () => {
                      await Clipboard.setStringAsync(activeSegment.copyText);
                      showToast('已复制');
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

        <ActionSheet
          visible={Boolean(nativeHighlight)}
          onClose={() => setNativeHighlight(null)}
          title="知识点"
          subtitle={nativeHighlight?.text}
          options={
            nativeHighlight
              ? [
                  {
                    key: 'copy',
                    icon: 'copy-outline' as const,
                    label: '复制',
                    onPress: async () => {
                      await Clipboard.setStringAsync(nativeHighlight.text);
                      showToast('已复制');
                    },
                  },
                  ...(nativeHighlight.sourceUrl
                    ? [
                        {
                          key: 'source',
                          icon: 'open-outline' as const,
                          label: '查看来源',
                          onPress: () =>
                            handleInternalLink(nativeHighlight.sourceUrl || ''),
                        },
                      ]
                    : []),
                ]
              : []
          }
        />

        <ImagePreviewModal
          visible={viewerVisible && Boolean(viewerImage)}
          imageUrls={
            viewerImage
              ? viewerImages.includes(viewerImage)
                ? viewerImages
                : [viewerImage]
              : []
          }
          initialIndex={
            viewerImage ? Math.max(0, viewerImages.indexOf(viewerImage)) : 0
          }
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
              <BouncyButton
                className="flex-row items-center p-2 rounded-full bg-transparent"
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
              </BouncyButton>
              <BouncyButton
                className="flex-row items-center rounded-full px-4 py-1.5"
                style={{
                  backgroundColor: primaryColor,
                }}
                onPress={() => {
                  if (textSelection)
                    createReactionMutation.mutate({
                      source: interactionSource.current,
                      selection: textSelection,
                    });
                }}
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
              </BouncyButton>
            </View>
          </View>
        )}
      </View>
    );
  },
);
