import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { type Href, useRouter } from 'expo-router';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Image, Linking, StyleSheet } from 'react-native';
import {
  getAnswer,
  reactAnswerSegment,
  unreactAnswerSegment,
} from '@/api/zhihu/answer';
import { getArticle } from '@/api/zhihu/article';
import { isValidAnswerCommentSelection } from '@/api/zhihu/comment';
import { getPin } from '@/api/zhihu/pin';
import { getQuestion } from '@/api/zhihu/question';
import { BouncyButton } from '@/components/BouncyButton';
import { ImageActionBottomSheet } from '@/components/ImageActionBottomSheet';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { ActionSheet } from '@/components/overlays/ActionSheet';
import { ScreenOverlay } from '@/components/overlays/ScreenOverlay';
import {
  Text,
  useRuntimeThemeColors,
  useThemeColor,
  View,
} from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { usePaneActive } from '@/features/adaptive-layout/PaneContext';
import { useSettingsStore } from '@/store/useSettingsStore';
import type {
  ZhihuSegmentInfo,
  ZhihuSegmentMark,
  ZhihuSegmentReaction,
} from '@/types/zhihu';
import { getCachedImageSource } from '@/utils/imageSource';
import { showToast } from '@/utils/toast';
import {
  extractZhihuRedirectTarget,
  getSafeExternalUrl,
  parseZhihuUrl,
} from '@/utils/url';
import { getZhihuErrorStatus } from '@/utils/zhihuError';
import type { ZhihuDocument, ZhihuLinkCardBlock } from '../document';
import { serializeZhihuDocumentHtml } from '../documentHtml';
import { getZhihuDocumentPreviewImages } from '../documentTraversal';
import {
  getNativeHighlightDisplayText,
  getWebViewSegmentParagraphs,
  resolveNativeAnswerSegment,
  resolveNativeAnswerSelection,
} from '../nativeInteractions';
import { normalizeZhihuDocument } from '../normalization/normalizeZhihuDocument';
import type { RichTextFlow } from '../richText';
import { createSelectionReactionOptions } from '../selectionReaction';
import type {
  LinkCardProps,
  RichContentRenderer,
  ZhihuContentProps,
} from '../types';
import { SelectionActions } from './SelectionActions';
import { SelectionCommentSheet } from './SelectionCommentSheet';
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

interface LinkCardContentSummary {
  question?: { title?: string };
  title?: string;
  excerpt_title?: string;
  cover_url?: string;
  author?: { name?: string };
  voteup_count?: number;
  like_count?: number;
  answer_count?: number;
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
    const manualImages =
      useSettingsStore((state) => state.imageLoadingMode) === 'manual';
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

    const { data: fetchedData } = useQuery<LinkCardContentSummary | null>({
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
          {fetchedImage && !manualImages && (
            <Image
              source={getCachedImageSource(fetchedImage)}
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
    progressive,
    pauseProgressiveTail,
    canExpandProgressiveTail,
    onFirstContentLayout,
    onLayoutReady,
    initialContentWidth,
    fontSizeScale: fontSizeOverride,
    lineHeightScale: lineHeightOverride,
    typographyOptions,
    useNative,
    selectable = true,
    suppressDoubleTapSelection = false,
    variant = 'default',
  }) => {
    const colorScheme = useColorScheme();
    const paneActive = usePaneActive();
    const selectionEnabled = selectable && paneActive;
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
    const segmentTapEnabled =
      type !== 'answer' || settings.enableSegmentTap !== false;
    const webSegmentDocument = useMemo(() => {
      if (selectedRenderer !== 'webview' && isRichTextNativeAvailable())
        return undefined;
      if (document) return document;
      if (
        type !== 'answer' ||
        !content ||
        (!segmentInfos?.length && !content.includes('highlight-wrap'))
      )
        return undefined;
      return normalizeZhihuDocument(content, {
        documentId: `${type}:${objectId}`,
        segmentInfos,
      }).document;
    }, [selectedRenderer, document, type, content, segmentInfos, objectId]);
    const webSegmentParagraphs = useMemo(
      () =>
        webSegmentDocument && getWebViewSegmentParagraphs(webSegmentDocument),
      [webSegmentDocument],
    );
    // Counts can change without invalidating the source of an open selection.
    const segmentSourceTexts = useMemo(
      () =>
        JSON.stringify(segmentInfos?.map(({ pid, text }) => [pid, text]) ?? []),
      [segmentInfos],
    );
    const documentImages = useMemo(
      () =>
        document
          ? getZhihuDocumentPreviewImages(document).map((image) => image.url)
          : undefined,
      [document],
    );
    const themeColors = useRuntimeThemeColors();
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
    useEffect(() => {
      if (!segmentTapEnabled) {
        setModalVisible(false);
        setActiveSegment(null);
        setNativeHighlight(null);
      }
    }, [segmentTapEnabled]);
    const [viewerVisible, setViewerVisible] = useState(false);
    const [viewerImage, setViewerImage] = useState<string | null>(null);
    const [viewerImages, setViewerImages] = useState<string[]>([]);
    const [viewerOriginals, setViewerOriginals] = useState<
      readonly (string | undefined)[] | undefined
    >(undefined);
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
          activeSource.current?.objectId !== answerId ||
          activeSource.current.type !== 'answer'
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

    const onImagePressCallback = useCallback(
      (
        src: string,
        gallery?: readonly string[],
        originals?: readonly (string | undefined)[],
      ) => {
        const inGallery = Boolean(gallery?.includes(src));
        setViewerImage(src);
        setViewerImages(inGallery && gallery ? [...gallery] : [src]);
        setViewerOriginals(inGallery ? originals : undefined);
        setViewerVisible(true);
      },
      [],
    );
    const onImageLongPressCallback = useCallback((src: string) => {
      setActionSheetUrl(src);
    }, []);
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
    const onSegmentPressCallback = useCallback(
      (pid: string, nodeId?: string) => {
        if (!segmentTapEnabled || !nodeId || !webSegmentDocument) return;
        const paragraph = webSegmentParagraphs?.get(pid);
        const mark = paragraph?.annotations.find(
          ({ run }) => run.id === nodeId,
        );
        if (!mark || !paragraph) return;
        const { run, start, end } = mark;
        onNativeSegmentPressCallback(
          {
            paragraphId: pid,
            nodeId: run.id,
            start,
            end,
            text: paragraph.text.slice(start, end),
            segment: run,
          },
          webSegmentDocument,
        );
      },
      [
        segmentTapEnabled,
        webSegmentParagraphs,
        webSegmentDocument,
        onNativeSegmentPressCallback,
      ],
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
    // Focusing the composer collapses the system selection. Keep the original
    // excerpt for the draft until the reader closes it or changes answers.
    const [commentSelection, setCommentSelection] =
      useState<TextSelectionInfo | null>(null);
    const contentSource = useMemo(
      () => ({
        content,
        contentArray,
        document,
        objectId,
        type,
        selectedRenderer,
      }),
      [content, contentArray, document, objectId, type, selectedRenderer],
    );
    const selectionSource = useMemo(
      () => ({ ...contentSource, selectionEnabled, segmentSourceTexts }),
      [contentSource, selectionEnabled, segmentSourceTexts],
    );
    const activeSource = useRef<typeof selectionSource | null>(null);
    useLayoutEffect(() => {
      activeSource.current = selectionSource;
      setTextSelection(null);
      setCommentSelection(null);
      return () => {
        activeSource.current = null;
      };
    }, [selectionSource]);
    const previousContentSource = useRef(contentSource);
    useEffect(() => {
      if (previousContentSource.current === contentSource) return;
      previousContentSource.current = contentSource;
      setModalVisible(false);
      setActiveSegment(null);
      setNativeHighlight(null);
    }, [contentSource]);

    const onTextSelectedCallback = useCallback(
      (info: TextSelectionInfo | null) => {
        if (activeSource.current === selectionSource && selectionEnabled)
          setTextSelection(info);
      },
      [selectionSource, selectionEnabled],
    );
    const onNativeTextSelectedCallback = useCallback(
      (
        selection: ZhihuNativeContentSelection,
        flow: RichTextFlow,
        document: ZhihuDocument,
      ) => {
        if (document.id !== `${type}:${objectId}`) return;
        onTextSelectedCallback(
          resolveNativeAnswerSelection(selection, flow, {
            objectId,
            type,
            document,
            segmentInfos,
          }),
        );
      },
      [objectId, type, segmentInfos, onTextSelectedCallback],
    );

    const currentTextSelection = useRef(textSelection);
    currentTextSelection.current = textSelection;
    const createReactionMutation = useMutation(
      createSelectionReactionOptions({
        getSource: () => activeSource.current,
        getSelection: () => currentTextSelection.current,
        clearSelection: () => setTextSelection(null),
        refresh: onRefresh,
        notifySuccess: () => showToast('已赞同此段落'),
        notifyError: () => showToast('操作失败，请重试'),
      }),
    );
    const handleWebViewReady = useCallback(() => {
      onFirstContentLayout?.();
      onLayoutReady?.();
    }, [onFirstContentLayout, onLayoutReady]);
    const renderWebViewContent = () => (
      <ZhihuDOMContent
        key={`${type}:${objectId}`}
        htmlContent={documentHtml ?? content ?? ''}
        contentArray={document ? undefined : contentArray}
        segmentParagraphs={webSegmentParagraphs}
        segmentSourceTexts={segmentSourceTexts}
        segmentTapEnabled={segmentTapEnabled}
        linkCardInfoStr={JSON.stringify(linkCardInfo || {})}
        colorScheme={colorScheme}
        onReady={handleWebViewReady}
        onImagePress={(src) => onImagePressCallback(src, documentImages)}
        onImageLongPress={onImageLongPressCallback}
        onLinkPress={handleInternalLink}
        onSegmentPress={onSegmentPressCallback}
        onTextSelected={type === 'answer' ? onTextSelectedCallback : undefined}
        selectable={selectionEnabled}
        suppressDoubleTapSelection={suppressDoubleTapSelection}
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
            onSegmentPress={
              segmentTapEnabled ? onNativeSegmentPressCallback : undefined
            }
            onSelectionChange={onNativeTextSelectedCallback}
            renderLinkCard={renderNativeLinkCard}
            selectable={selectionEnabled}
            suppressDoubleTapSelection={suppressDoubleTapSelection}
            renderFallback={renderWebViewContent}
            renderPlaceholder={renderPlaceholder}
            progressive={progressive}
            pauseProgressiveTail={pauseProgressiveTail}
            canExpandProgressiveTail={canExpandProgressiveTail}
            onFirstContentLayout={onFirstContentLayout}
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
                    icon: 'comment-bubble' as const,
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
                    icon: 'comment-bubble' as const,
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
          originalUrls={
            viewerImage && viewerImages.includes(viewerImage)
              ? viewerOriginals
              : undefined
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

        {commentSelection && type === 'answer' && selectionEnabled && (
          <SelectionCommentSheet
            answerId={objectId}
            selection={commentSelection}
            onClose={() => setCommentSelection(null)}
            onPosted={() => {
              if (activeSource.current !== selectionSource) return;
              setCommentSelection(null);
              onRefresh?.();
              showToast('已发布划线评论');
            }}
          />
        )}
        {!commentSelection &&
          textSelection &&
          type === 'answer' &&
          selectionEnabled && (
            <ScreenOverlay owner={textSelection}>
              <SelectionActions
                text={textSelection.text}
                pending={createReactionMutation.isPending}
                onComment={
                  isValidAnswerCommentSelection(objectId, textSelection)
                    ? () => {
                        if (
                          activeSource.current !== selectionSource ||
                          currentTextSelection.current !== textSelection
                        )
                          return;
                        setCommentSelection(textSelection);
                        setTextSelection(null);
                      }
                    : undefined
                }
                onCancel={() => {
                  if (
                    activeSource.current === selectionSource &&
                    currentTextSelection.current === textSelection
                  )
                    setTextSelection(null);
                }}
                onLike={() => {
                  if (
                    activeSource.current === selectionSource &&
                    currentTextSelection.current === textSelection
                  ) {
                    createReactionMutation.mutate({
                      source: selectionSource,
                      selection: textSelection,
                    });
                  }
                }}
              />
            </ScreenOverlay>
          )}
      </View>
    );
  },
);
