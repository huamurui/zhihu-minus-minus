import * as Clipboard from 'expo-clipboard';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Image,
  PixelRatio,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SvgUri } from 'react-native-svg';
import { useRuntimeThemeColors } from '@/components/Themed';
import { PaneModal as Modal } from '@/features/adaptive-layout/PaneModal';
import {
  isRichTextNativeAvailable,
  RichTextNativeView,
} from '@/modules/zhihu-rich-text';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { ZhihuContentSegment, ZhihuSegmentInfo } from '@/types/zhihu';
import {
  getImageResizeMethod,
  getServedImageSize,
  isLongImage,
  LONG_IMAGE_CROP_ASPECT,
} from '@/utils/imageDecode';
import { getCachedImageSource } from '@/utils/imageSource';
import {
  cropLongImage,
  isNativeImageViewerAvailable,
  type LongImageCrop,
} from '@/utils/nativeImageViewer';
import { getZhihuVideoRoute } from '@/utils/zhihuVideoRoute';
import {
  compileZhihuDocument,
  getRichTextSelectionText,
  mapRichTextSelection,
} from '../compileRichText';
import type {
  ZhihuBlock,
  ZhihuDocument,
  ZhihuFormula,
  ZhihuInlineRun,
  ZhihuLinkCardBlock,
  ZhihuSegmentHighlightRun,
  ZhihuSegmentRun,
} from '../document';
import {
  getZhihuDocumentPreviewImages,
  walkZhihuDocument,
} from '../documentTraversal';
import { flowLayoutIdentity } from '../flowLayout';
import { DAILY_AVATAR_SIZE, type RichContentVariant } from '../imagePolicy';
import {
  type NativePartBatch,
  prepareNativeParts,
  shouldPrepareNativePartsProgressively,
} from '../nativePartPreparation';
import {
  normalizeZhihuContentSegments,
  normalizeZhihuDocument,
} from '../normalization/normalizeZhihuDocument';
import {
  createRichContentMetrics,
  RICH_CONTENT_PARAGRAPH_SPACING,
  RICH_CONTENT_UNKNOWN_IMAGE_HEIGHT,
} from '../presentation';
import type {
  RichTextDecoration,
  RichTextFlow,
  RichTextPart,
  RichTextSelectionMapping,
} from '../richText';
import { segmentCommentIcon } from '../segmentCommentIcon';
import type { RichContentLoadingPhase, RichContentObjectType } from '../types';
import { NativeTable } from './NativeTable';

export { isRichTextNativeAvailable } from '@/modules/zhihu-rich-text';

export interface ZhihuNativeTypographyOptions {
  justify?: boolean;
  integerMeasure?: boolean;
  decorations?: boolean;
  decorationKind?: RichTextDecoration['kind'];
}

export interface ZhihuNativeContentSelection {
  flowId: string;
  textVersion: string;
  start: number;
  end: number;
  mapping: RichTextSelectionMapping | null;
}

export interface ZhihuNativeSegmentAction {
  nodeId: string;
  paragraphId?: string;
  start: number;
  end: number;
  text: string;
  segment?: ZhihuSegmentRun | ZhihuSegmentHighlightRun;
}

export interface ZhihuNativeContentProps {
  content: string;
  contentArray?: readonly ZhihuContentSegment[];
  /** Already normalized JSON document; bypasses both HTML and pin normalization. */
  document?: ZhihuDocument;
  objectId: string;
  type: RichContentObjectType;
  segmentInfos?: readonly ZhihuSegmentInfo[];
  linkCardInfo?: Readonly<Record<string, unknown>>;
  variant?: RichContentVariant;
  selectable?: boolean;
  suppressDoubleTapSelection?: boolean;
  fontSizeScale?: number;
  lineHeightScale?: number;
  options?: ZhihuNativeTypographyOptions;
  onLinkPress?: (url: string) => void;
  /** `originals[i]` is the full-size image for `gallery[i]`, when known. */
  onImagePress?: (
    url: string,
    gallery: readonly string[],
    originals?: readonly (string | undefined)[],
  ) => void;
  onImageLongPress?: (url: string) => void;
  onSelectionChange?: (
    selection: ZhihuNativeContentSelection,
    flow: RichTextFlow,
    document: ZhihuDocument,
  ) => void;
  onSegmentPress?: (
    action: ZhihuNativeSegmentAction,
    document: ZhihuDocument,
  ) => void;
  /** Reuse the host's Zhihu metadata and query-backed card behavior. */
  renderLinkCard?: (card: ZhihuLinkCardBlock) => React.ReactNode;
  /** The host supplies a complete adapter on unsupported clients. */
  renderFallback: () => React.ReactNode;
  /** Keep the host's preview visible until the native layout is measured. */
  renderPlaceholder?: (phase: RichContentLoadingPhase) => React.ReactNode;
  /** Stage long documents at their existing native selection boundaries. */
  progressive?: boolean;
  /** Keep an adjacent pager page warm without compiling its offscreen tail. */
  pauseProgressiveTail?: boolean;
  /** Read immediately before each tail batch. Hosts stop expanding after the first reader interaction. */
  canExpandProgressiveTail?: () => boolean;
  onFirstContentLayout?: () => void;
  onLayoutReady?: () => void;
  /** Exact inner width already known by the host, before the first onLayout. */
  initialContentWidth?: number;
}

interface FlowEvent {
  flowId: string;
  textVersion: string;
  start: number;
  end: number;
}

interface ActionEvent extends FlowEvent {
  kind: 'link' | 'segment' | 'attachment' | 'attachmentLongPress';
  id: string;
  url?: string;
}

function eventPayload<T>(event: T & { readonly nativeEvent?: T }): T {
  return event.nativeEvent ?? event;
}

function inlineText(runs: readonly ZhihuInlineRun[]): string {
  return runs
    .map((run) => {
      if ('children' in run) return inlineText(run.children);
      if ('text' in run) return run.text;
      if (run.type === 'lineBreak') return '\n';
      if (run.type === 'inlineFormula') return run.formula.latex || '[公式]';
      if (run.type === 'inlineImage') return run.alt || '[图片]';
      if (run.type === 'footnoteReference') return `[${run.label}]`;
      return run.fallbackText;
    })
    .join('');
}

function blockText(block: ZhihuBlock): string {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
      return inlineText(block.children);
    case 'quote':
      return block.blocks.map(blockText).join('\n');
    case 'list':
      return block.items
        .map((item) => item.blocks.map(blockText).join('\n'))
        .join('\n');
    case 'code':
      return block.text;
    case 'unsupported':
      return block.fallbackText;
    case 'image':
      return block.caption ? inlineText(block.caption) : block.alt || '[图片]';
    case 'blockFormula':
      return block.formula.latex || '[公式]';
    case 'video':
      return block.title || '[视频]';
    case 'linkCard':
      return block.title;
    case 'table':
      return block.body
        .map((row) =>
          row.cells
            .map((cell) => cell.blocks.map(blockText).join('\n'))
            .join('\t'),
        )
        .join('\n');
    case 'divider':
      return '';
  }
}

const defaultTypography: ZhihuNativeTypographyOptions = {};

interface FlowViewProps {
  flow: RichTextFlow;
  manualImages: boolean;
  contentWidth: number;
  configJson: string;
  fontSize: number;
  lineHeight: number;
  selectable: boolean;
  suppressDoubleTapSelection?: boolean;
  options: ZhihuNativeTypographyOptions;
  linkColor: string;
  onSelection: (event: FlowEvent, flow: RichTextFlow) => void;
  onAction: (event: ActionEvent, flow: RichTextFlow) => void;
  onMeasured?: (flow: RichTextFlow) => void;
  pendingNested?: Set<RichTextFlow>;
}

const measuredFlowHeights = new Map<string, number>();

function flowMeasureKey(
  flow: RichTextFlow,
  width: number,
  configJson: string,
): string {
  return `${flow.id}:${flow.textVersion}:${width}:${configJson}`;
}

const NativeFlow = React.memo(function NativeFlow({
  flow,
  manualImages,
  contentWidth,
  configJson,
  fontSize,
  lineHeight,
  selectable,
  suppressDoubleTapSelection = false,
  options,
  linkColor,
  onSelection,
  onAction,
  onMeasured,
  pendingNested,
}: FlowViewProps) {
  const [requested, setRequested] = useState<{
    flow: RichTextFlow;
    ids: ReadonlySet<string>;
  } | null>(null);
  const attachments = useMemo(
    () =>
      manualImages
        ? flow.attachments.map((item) =>
            item.kind === 'image' &&
            item.role !== 'avatar' &&
            !(requested?.flow === flow && requested.ids.has(item.id))
              ? { ...item, url: undefined }
              : item,
          )
        : flow.attachments,
    [flow, manualImages, requested],
  );
  const flowJson = useMemo(
    () =>
      JSON.stringify({
        id: flow.id,
        textVersion: flow.textVersion,
        text: flow.text,
        spans: flow.spans,
        paragraphs: flow.paragraphs,
        attachments,
        // Source mapping remains in JS; neither native backend consumes it.
        decorations:
          options.decorations === false
            ? []
            : flow.decorations.map((decoration) => ({
                ...decoration,
                color: decoration.color || linkColor,
                kind: options.decorationKind || decoration.kind,
              })),
      }),
    [attachments, flow, linkColor, options.decorationKind, options.decorations],
  );
  const measureKey = flowMeasureKey(flow, contentWidth, configJson);
  const geometryKey = useMemo(
    () => `${contentWidth}:${configJson}:${flowLayoutIdentity(flow)}`,
    [flow, contentWidth, configJson],
  );
  const [measuredHeight, setMeasuredHeight] = useState<{
    key: string;
    geometryKey: string;
    height: number;
    verified: boolean;
  } | null>(() => {
    const height = measuredFlowHeights.get(measureKey);
    return height
      ? { key: measureKey, geometryKey, height, verified: false }
      : null;
  });
  const verifiedGeometry =
    measuredHeight?.verified === true &&
    measuredHeight.geometryKey === geometryKey;
  const currentInput = useRef({ flow, measureKey, onMeasured, pendingNested });
  useLayoutEffect(() => {
    currentInput.current = { flow, measureKey, onMeasured, pendingNested };
    // These views are discovered as the block renders, with its actual cell or
    // caption width. Register at commit, before any native layout event arrives.
    if (!pendingNested || verifiedGeometry) return;
    pendingNested.add(flow);
    return () => {
      pendingNested.delete(flow);
    };
  }, [flow, measureKey, onMeasured, pendingNested, verifiedGeometry]);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const initialHeight =
    Math.ceil(flow.text.length / Math.max(1, contentWidth / fontSize)) *
      lineHeight +
    flow.paragraphs.length * RICH_CONTENT_PARAGRAPH_SPACING;
  const height =
    measuredHeight?.key === measureKey ||
    (measuredHeight?.verified && measuredHeight.geometryKey === geometryKey)
      ? measuredHeight.height
      : initialHeight;
  // An isolated blank between media must also be allowed below body line height.
  const minimumHeight = flow.paragraphs.every(
    (paragraph) => paragraph.emptyLine,
  )
    ? 1
    : lineHeight;

  return (
    <RichTextNativeView
      flowJson={flowJson}
      configJson={configJson}
      contentWidth={contentWidth}
      layoutKey={measureKey}
      selectable={selectable}
      suppressDoubleTapSelection={suppressDoubleTapSelection}
      style={{ width: contentWidth, height: Math.max(minimumHeight, height) }}
      onHeightChange={(raw) => {
        if (!mounted.current || currentInput.current.measureKey !== measureKey)
          return;
        const event = eventPayload(raw);
        if (
          event.flowId === flow.id &&
          event.textVersion === flow.textVersion &&
          event.layoutKey === measureKey &&
          Number.isFinite(event.height) &&
          event.height > 0
        ) {
          setMeasuredHeight({
            key: measureKey,
            geometryKey,
            height: event.height,
            verified: true,
          });
          if (measuredFlowHeights.size >= 128)
            measuredFlowHeights.delete(
              measuredFlowHeights.keys().next().value || '',
            );
          measuredFlowHeights.set(measureKey, event.height);
          const current = currentInput.current;
          current.pendingNested?.delete(current.flow);
          current.onMeasured?.(current.flow);
        }
      }}
      onSelectionChange={(raw) => {
        if (mounted.current && currentInput.current.flow === flow)
          onSelection(eventPayload(raw), flow);
      }}
      onAction={(raw) => {
        if (!mounted.current || currentInput.current.flow !== flow) return;
        const event = eventPayload(raw);
        if (event.flowId !== flow.id || event.textVersion !== flow.textVersion)
          return;
        if (
          manualImages &&
          (event.kind === 'attachment' ||
            event.kind === 'attachmentLongPress') &&
          attachments.some(
            (item) =>
              item.id === event.id && item.kind === 'image' && !item.url,
          )
        ) {
          if (event.kind === 'attachment') {
            setRequested((previous) => ({
              flow,
              ids: new Set(previous?.flow === flow ? previous.ids : []).add(
                event.id,
              ),
            }));
          }
          return;
        }
        onAction(event, flow);
      }}
    />
  );
});

function FormulaBlock({
  formula,
  width,
  color,
}: {
  formula: ZhihuFormula;
  width: number;
  color: string;
}) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const image = formula.image;
  const uri = image?.offlineUri || image?.url;
  const height = Math.min(160, image?.height || 56);
  const formulaWidth = Math.min(width, image?.width || width);
  return (
    <ScrollView horizontal contentContainerStyle={styles.formula}>
      {uri && failedUri !== uri ? (
        /(?:svg|\/equation(?:\?|$))/i.test(uri) ? (
          <SvgUri
            uri={uri}
            width={formulaWidth}
            height={height}
            onError={() => setFailedUri(uri)}
          />
        ) : (
          <Image
            source={getCachedImageSource(uri)}
            resizeMode="contain"
            style={{ width: formulaWidth, height }}
            onError={() => setFailedUri(uri)}
          />
        )
      ) : (
        <Text selectable style={[styles.formulaFallback, { color }]}>
          {formula.latex || '[公式暂不可显示]'}
        </Text>
      )}
    </ScrollView>
  );
}

interface BlockViewProps {
  manualImages: boolean;
  enableSegmentTap?: boolean;
  block: ZhihuBlock;
  width: number;
  fontSize: number;
  lineHeight: number;
  textColor: string;
  secondaryColor: string;
  linkColor: string;
  surfaceColor: string;
  borderColor: string;
  onLink: (url: string) => void;
  onImage?: (url: string) => void;
  onImageLongPress?: (url: string) => void;
  configJson: string;
  selectable: boolean;
  suppressDoubleTapSelection?: boolean;
  options: ZhihuNativeTypographyOptions;
  onFlowAction: (event: ActionEvent, flow: RichTextFlow) => void;
  onFlowSelection?: (event: FlowEvent, flow: RichTextFlow) => void;
  renderLinkCard?: (card: ZhihuLinkCardBlock) => React.ReactNode;
  textAlign?: 'left' | 'center' | 'right';
  followsEmptyParagraph?: boolean;
  pendingNested?: Set<RichTextFlow>;
  onNestedMeasured?: () => void;
}

function isEmptyParagraph(block: ZhihuBlock | undefined): boolean {
  return block?.type === 'paragraph' && block.empty === true;
}

function NativeParagraph(props: BlockViewProps) {
  const {
    block,
    fontSize,
    lineHeight,
    followsEmptyParagraph,
    enableSegmentTap,
  } = props;
  const compiled = useMemo(
    () =>
      compileZhihuDocument(
        { id: `${block.id}:nested`, blocks: [block] },
        {
          fontSize,
          lineHeight,
          paragraphSpacing: 0,
          continuesEmptyParagraph: followsEmptyParagraph,
          enableSegmentTap,
        },
      ),
    [block, fontSize, lineHeight, followsEmptyParagraph, enableSegmentTap],
  );
  const configJson = useMemo(() => {
    const config: unknown = JSON.parse(props.configJson);
    return JSON.stringify({
      ...(config && typeof config === 'object' ? config : {}),
      fontSize,
      lineHeight,
      textColor: props.textColor,
      textAlign: props.textAlign ?? 'left',
      justify: props.textAlign ? false : (props.options.justify ?? false),
    });
  }, [
    props.configJson,
    props.textColor,
    props.textAlign,
    props.options.justify,
    fontSize,
    lineHeight,
  ]);
  return (
    <View style={{ width: props.width }}>
      {compiled.parts.map((part) =>
        part.type === 'flow' ? (
          <NativeFlow
            key={part.flow.id}
            flow={part.flow}
            manualImages={props.manualImages}
            contentWidth={props.width}
            configJson={configJson}
            fontSize={fontSize}
            lineHeight={lineHeight}
            selectable={props.selectable}
            suppressDoubleTapSelection={props.suppressDoubleTapSelection}
            options={props.options}
            linkColor={props.linkColor}
            onSelection={(event, flow) => props.onFlowSelection?.(event, flow)}
            onAction={props.onFlowAction}
            pendingNested={props.pendingNested}
            onMeasured={props.onNestedMeasured}
          />
        ) : null,
      )}
    </View>
  );
}

/**
 * The top of a long image, cut natively at the width it is shown at.
 * undefined while cutting; null when there is nothing to cut or it failed.
 */
function useLongImageCrop(
  url: string | null,
  targetWidth: number,
): LongImageCrop | null | undefined {
  const key = url ? `${url}|${targetWidth}` : null;
  const [result, setResult] = useState<{
    key: string;
    crop: LongImageCrop | null;
  } | null>(null);
  useEffect(() => {
    if (!url || !key) return;
    let current = true;
    cropLongImage(url, LONG_IMAGE_CROP_ASPECT, targetWidth).then(
      (crop) => current && setResult({ key, crop }),
      () => current && setResult({ key, crop: null }),
    );
    return () => {
      current = false;
    };
  }, [key, url, targetWidth]);
  if (!key) return null;
  return result?.key === key ? result.crop : undefined;
}

const NativeBlock = React.memo(function NativeBlockView(props: BlockViewProps) {
  const {
    block,
    manualImages,
    width,
    fontSize,
    lineHeight,
    textColor,
    secondaryColor,
    linkColor,
    surfaceColor,
    borderColor,
    onLink,
    onImage,
    onImageLongPress,
  } = props;
  const [requestedImageUri, setRequestedImageUri] = useState<string | null>(
    null,
  );
  const imageUri =
    block.type === 'image'
      ? block.resource.offlineUri || block.resource.url
      : null;
  const deferImage =
    block.type === 'image' &&
    block.role !== 'avatar' &&
    manualImages &&
    requestedImageUri !== imageUri;
  const [failedImageUri, setFailedImageUri] = useState<string | null>(null);
  const [naturalImageSize, setNaturalImageSize] = useState<{
    uri: string;
    width: number;
    height: number;
  } | null>(null);
  // Very long images show only their top, like the official app: drawn whole
  // they would need a bitmap taller than the GPU accepts and blur.
  const longImageUrl =
    block.type === 'image' &&
    block.role !== 'avatar' &&
    block.layout !== 'small' &&
    !block.resource.offlineUri &&
    isNativeImageViewerAvailable() &&
    isLongImage(block.resource.width, block.resource.height)
      ? (block.resource.originalUrl ?? block.resource.url)
      : null;
  const longImage = useLongImageCrop(
    deferImage ? null : longImageUrl,
    PixelRatio.getPixelSizeForLayoutSize(width),
  );
  const textStyle = { color: textColor, fontSize, lineHeight };
  switch (block.type) {
    case 'image': {
      const uri = block.resource.offlineUri || block.resource.url;
      const dimensions =
        naturalImageSize?.uri === uri ? naturalImageSize : block.resource;
      const aspect =
        dimensions.width && dimensions.height
          ? dimensions.width / dimensions.height
          : null;
      const imageWidth =
        block.role === 'avatar'
          ? DAILY_AVATAR_SIZE
          : block.layout === 'small'
            ? Math.min(width, block.resource.width ?? width / 2)
            : width;
      const imageHeight =
        block.role === 'avatar'
          ? DAILY_AVATAR_SIZE
          : aspect
            ? imageWidth / aspect
            : RICH_CONTENT_UNKNOWN_IMAGE_HEIGHT;
      return (
        <View style={[styles.block, { width }]}>
          <Pressable
            onPress={() =>
              deferImage ? setRequestedImageUri(uri) : onImage?.(uri)
            }
            onLongPress={deferImage ? undefined : () => onImageLongPress?.(uri)}
            accessibilityRole={deferImage ? 'button' : 'imagebutton'}
            accessibilityLabel={
              deferImage ? '点击加载图片' : block.alt || '正文图片'
            }
            style={
              block.role === 'avatar'
                ? {
                    width: imageWidth,
                    height: imageHeight,
                    borderRadius: imageWidth / 2,
                    overflow: 'hidden',
                  }
                : undefined
            }
          >
            {deferImage ? (
              <View
                style={[
                  styles.deferredImage,
                  {
                    width: imageWidth,
                    height: longImageUrl
                      ? imageWidth * LONG_IMAGE_CROP_ASPECT
                      : imageHeight,
                    backgroundColor: surfaceColor,
                  },
                ]}
              >
                <Text style={{ color: secondaryColor }}>点击加载图片</Text>
              </View>
            ) : failedImageUri === uri ? (
              <View
                style={[
                  styles.imageFallback,
                  { backgroundColor: surfaceColor },
                ]}
              >
                <Text style={{ color: secondaryColor }}>
                  {block.alt || '图片暂不可显示'}
                </Text>
              </View>
            ) : /svg/i.test(uri) ? (
              <SvgUri
                uri={uri}
                width={imageWidth}
                height={imageHeight}
                onError={() => setFailedImageUri(uri)}
              />
            ) : longImageUrl && longImage !== null ? (
              <View
                testID="native-long-image"
                style={[
                  styles.longImage,
                  {
                    width: imageWidth,
                    height: longImage
                      ? (imageWidth * longImage.cropHeight) /
                        longImage.cropWidth
                      : imageWidth * LONG_IMAGE_CROP_ASPECT,
                    backgroundColor: surfaceColor,
                  },
                ]}
              >
                {longImage ? (
                  <Image
                    source={getCachedImageSource(longImage.uri)}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                    onError={() => setFailedImageUri(uri)}
                  />
                ) : null}
                <View style={styles.longImageBadge}>
                  <Text style={styles.longImageBadgeText}>长图</Text>
                </View>
              </View>
            ) : (
              <Image
                source={getCachedImageSource(uri)}
                style={{
                  width: imageWidth,
                  height: imageHeight,
                  borderRadius: 8,
                }}
                resizeMode="contain"
                // Decide from the file actually fetched, not the original's size.
                resizeMethod={getImageResizeMethod({
                  ...getServedImageSize(
                    block.resource.url,
                    block.resource.width,
                    block.resource.height,
                  ),
                  displayPixels:
                    PixelRatio.getPixelSizeForLayoutSize(imageWidth),
                })}
                onError={() => setFailedImageUri(uri)}
                onLoad={(event) => {
                  const { width: loadedWidth, height: loadedHeight } =
                    event.nativeEvent.source;
                  if (loadedWidth > 0 && loadedHeight > 0)
                    setNaturalImageSize({
                      uri,
                      width: loadedWidth,
                      height: loadedHeight,
                    });
                }}
              />
            )}
          </Pressable>
          {block.caption ? (
            <NativeParagraph
              {...props}
              fontSize={fontSize * 0.8}
              lineHeight={lineHeight * 0.8}
              textColor={secondaryColor}
              block={{
                id: `${block.id}:caption`,
                type: 'paragraph',
                children: block.caption,
              }}
            />
          ) : null}
        </View>
      );
    }
    case 'blockFormula':
      return block.formula.image ? (
        <View style={[styles.block, { width }]}>
          <NativeParagraph
            {...props}
            textAlign="center"
            block={{
              id: `${block.id}:display`,
              type: 'paragraph',
              children: [
                {
                  id: `${block.id}:attachment`,
                  type: 'inlineFormula',
                  formula: block.formula,
                },
              ],
            }}
          />
        </View>
      ) : (
        <FormulaBlock formula={block.formula} width={width} color={textColor} />
      );
    case 'video': {
      const route = getZhihuVideoRoute({
        ...block,
        resourceUrl: block.resource?.url,
      });
      return route ? (
        <Pressable
          onPress={() => onLink(route)}
          accessibilityRole="button"
          accessibilityLabel={
            block.title ? `播放视频：${block.title}` : '播放视频'
          }
          style={[styles.block, { width }]}
        >
          <View
            pointerEvents="none"
            style={[styles.videoCover, { backgroundColor: surfaceColor }]}
          >
            {block.poster && !manualImages ? (
              <Image
                testID="rich-content-video-cover"
                source={getCachedImageSource(
                  block.poster.offlineUri ?? block.poster.url,
                )}
                accessible={false}
                resizeMode="cover"
                style={StyleSheet.absoluteFill}
              />
            ) : null}
            <View pointerEvents="none" style={styles.videoPlayButton}>
              <Text style={styles.videoPlayIcon}>▶</Text>
            </View>
          </View>
          <Text style={{ color: linkColor, fontSize, marginTop: 6 }}>
            {block.title || '播放视频'}
          </Text>
        </Pressable>
      ) : (
        <Text style={[styles.block, { color: secondaryColor, fontSize }]}>
          视频不可用
        </Text>
      );
    }
    case 'linkCard':
      if (props.renderLinkCard) return props.renderLinkCard(block);
      return (
        <Pressable
          onPress={() => onLink(block.url)}
          accessibilityRole="link"
          style={[
            styles.mediaCard,
            { borderColor, backgroundColor: surfaceColor },
          ]}
        >
          <Text
            numberOfLines={2}
            style={[styles.cardTitle, { color: textColor }]}
          >
            {block.title || block.url}
          </Text>
          {block.description ? (
            <Text style={[styles.caption, { color: secondaryColor }]}>
              {block.description}
            </Text>
          ) : null}
          <Text
            numberOfLines={1}
            style={[styles.caption, { color: linkColor }]}
          >
            {block.url}
          </Text>
          {block.image && !manualImages ? (
            <Image
              source={getCachedImageSource(block.image.url)}
              style={{ width: width - 26, height: 120 }}
              resizeMode="cover"
            />
          ) : null}
        </Pressable>
      );
    case 'table':
      return (
        <NativeTable
          block={block}
          width={width}
          borderColor={borderColor}
          surfaceColor={surfaceColor}
          caption={
            block.caption ? (
              <NativeParagraph
                {...props}
                textColor={secondaryColor}
                block={{
                  id: `${block.id}:caption`,
                  type: 'paragraph',
                  children: block.caption,
                }}
              />
            ) : undefined
          }
          renderCell={(cell, contentWidth) =>
            cell.blocks.map((child, childIndex) => (
              <NativeBlock
                key={child.id}
                {...props}
                followsEmptyParagraph={isEmptyParagraph(
                  cell.blocks[childIndex - 1],
                )}
                width={contentWidth}
                textAlign={
                  cell.alignment && cell.alignment !== 'default'
                    ? cell.alignment
                    : undefined
                }
                block={
                  cell.isHeader && child.type === 'paragraph'
                    ? {
                        ...child,
                        children: [
                          {
                            id: `${child.id}:header`,
                            type: 'strong',
                            children: child.children,
                          },
                        ],
                      }
                    : child
                }
              />
            ))
          }
        />
      );
    case 'code':
      return (
        <ScrollView
          horizontal
          style={[styles.code, { backgroundColor: surfaceColor }]}
        >
          <Text
            selectable
            style={[
              textStyle,
              {
                fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                fontSize: fontSize * 0.82,
              },
            ]}
          >
            {block.text}
          </Text>
        </ScrollView>
      );
    case 'divider':
      return (
        <View style={[styles.divider, { backgroundColor: borderColor }]} />
      );
    case 'quote':
      return (
        <View style={[styles.quote, { borderColor: linkColor }]}>
          {block.blocks.map((child, childIndex) => (
            <NativeBlock
              key={child.id}
              {...props}
              followsEmptyParagraph={isEmptyParagraph(
                block.blocks[childIndex - 1],
              )}
              block={child}
              width={width - 18}
              textColor={secondaryColor}
            />
          ))}
        </View>
      );
    case 'list':
      return (
        <View style={styles.block}>
          {block.items.map((item, index) => (
            <View key={item.id} style={styles.tableRow}>
              <Text style={textStyle}>
                {block.ordered ? `${(block.start || 1) + index}. ` : '• '}
              </Text>
              <View style={{ flex: 1 }}>
                {item.blocks.map((child, childIndex) => (
                  <NativeBlock
                    key={child.id}
                    {...props}
                    followsEmptyParagraph={isEmptyParagraph(
                      item.blocks[childIndex - 1],
                    )}
                    block={child}
                    width={width - 24}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      );
    case 'paragraph':
    case 'heading':
      return <NativeParagraph {...props} />;
    case 'unsupported':
      return (
        <Text selectable style={[textStyle, styles.block]}>
          {block.fallbackText || `[暂不支持的 ${block.sourceType} 内容]`}
        </Text>
      );
  }
});

const NativePartGroup = React.memo(function NativePartGroup({
  parts,
  renderPart,
}: {
  parts: readonly RichTextPart[];
  renderPart: (part: RichTextPart) => React.ReactElement;
}) {
  return <>{parts.map(renderPart)}</>;
});

function pendingFlowMeasurements(
  batch: NativePartBatch,
  measured: ReadonlyMap<string, string>,
  width: number,
  configJson: string,
) {
  let hasText = false;
  const pending = new Set<string>();
  for (const group of batch.groups) {
    for (const part of group) {
      if (part.type !== 'flow') continue;
      hasText = true;
      const key = flowMeasureKey(part.flow, width, configJson);
      if (measured.get(part.flow.id) !== key) pending.add(key);
    }
  }
  return { hasText, pending };
}

type NativeDocumentInput = Pick<
  ZhihuNativeContentProps,
  | 'content'
  | 'contentArray'
  | 'document'
  | 'objectId'
  | 'type'
  | 'variant'
  | 'segmentInfos'
  | 'linkCardInfo'
>;

interface ReadyNativeDocument {
  identity: string;
  revision: number;
  input: NativeDocumentInput;
}

/** Keep a measured document visible while its replacement prepares offscreen. */
export const ZhihuNativeContent = React.memo(function ZhihuNativeContent(
  props: ZhihuNativeContentProps,
) {
  const { width: windowWidth } = useWindowDimensions();
  const measuredHostWidth = useRef<{
    windowWidth: number;
    width: number;
  } | null>(null);
  const identity = JSON.stringify([
    props.type,
    props.objectId,
    props.variant ?? 'default',
    ...(props.document ? [props.document.id] : []),
  ]);
  const arraySignature = useMemo(
    () => JSON.stringify(props.contentArray),
    [props.contentArray],
  );
  const committedSource = useRef({
    identity,
    content: props.content,
    arraySignature,
    contentArray: props.contentArray,
    document: props.document,
    revision: 0,
  });
  let source = committedSource.current;
  if (
    source.identity !== identity ||
    source.content !== props.content ||
    source.arraySignature !== arraySignature ||
    source.document !== props.document
  ) {
    source = {
      identity,
      content: props.content,
      arraySignature,
      contentArray: props.contentArray,
      document: props.document,
      revision: source.revision + 1,
    };
  }
  useLayoutEffect(() => {
    committedSource.current = source;
  }, [source]);
  // Equivalent JSON from a fresh response must not invalidate native layout.
  const contentArray = source.contentArray;
  const input = useMemo(
    () => ({
      content: props.content,
      contentArray,
      document: props.document,
      objectId: props.objectId,
      type: props.type,
      variant: props.variant,
      segmentInfos: props.segmentInfos,
      linkCardInfo: props.linkCardInfo,
    }),
    [
      props.content,
      contentArray,
      props.document,
      props.objectId,
      props.type,
      props.variant,
      props.segmentInfos,
      props.linkCardInfo,
    ],
  );
  const revision = source.revision;
  const [ready, setReady] = useState<ReadyNativeDocument | null>(null);
  const displayed = ready?.identity === identity ? ready : null;
  const replacing = displayed !== null && displayed.revision !== revision;

  useEffect(() => {
    setReady((previous) =>
      previous?.identity === identity &&
      previous.revision === revision &&
      previous.input !== input
        ? { ...previous, input }
        : previous,
    );
  }, [identity, revision, input]);

  const rememberVisible = useCallback(() => {
    if (
      committedSource.current.identity !== identity ||
      committedSource.current.revision !== revision
    )
      return;
    setReady((previous) =>
      previous?.identity === identity && previous.revision === revision
        ? previous
        : { identity, revision, input },
    );
    props.onFirstContentLayout?.();
  }, [identity, revision, input, props.onFirstContentLayout]);

  const onReady = useCallback(() => {
    if (
      committedSource.current.identity !== identity ||
      committedSource.current.revision !== revision
    )
      return;
    // A refresh is completely measured offscreen before its first visible frame.
    if (replacing) rememberVisible();
    props.onLayoutReady?.();
  }, [identity, revision, replacing, rememberVisible, props.onLayoutReady]);

  if (!isRichTextNativeAvailable()) return <>{props.renderFallback()}</>;

  const requested = { identity, revision, input };
  const layers = replacing ? [displayed, requested] : [requested];
  return (
    <View
      testID="native-content-host"
      style={styles.content}
      onLayout={({ nativeEvent: { layout } }) => {
        if (Number.isFinite(layout.width) && layout.width > 0)
          measuredHostWidth.current = { windowWidth, width: layout.width };
      }}
    >
      {layers.map((layer) => {
        const latest = layer.revision === revision;
        const visible = !replacing || !latest;
        const interactive = latest && visible;
        const isCurrent = () =>
          committedSource.current.identity === layer.identity &&
          committedSource.current.revision === layer.revision;
        return (
          <View
            key={`${layer.identity}:${layer.revision}`}
            testID={
              visible ? 'native-visible-document' : 'native-pending-document'
            }
            pointerEvents={interactive ? 'auto' : 'none'}
            accessibilityElementsHidden={!visible}
            importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
            style={[
              styles.content,
              !visible && { position: 'absolute', top: 0, left: 0, opacity: 0 },
            ]}
          >
            <NativeDocumentContent
              {...props}
              {...layer.input}
              revision={layer.revision}
              initialContentWidth={
                measuredHostWidth.current?.windowWidth === windowWidth
                  ? measuredHostWidth.current.width
                  : props.initialContentWidth
              }
              interactive={interactive}
              selectable={interactive && props.selectable !== false}
              pauseProgressiveTail={!latest || props.pauseProgressiveTail}
              onFirstContentLayout={interactive ? rememberVisible : undefined}
              onLayoutReady={latest ? onReady : undefined}
              onLinkPress={
                interactive
                  ? (url) => isCurrent() && props.onLinkPress?.(url)
                  : undefined
              }
              onImagePress={
                interactive
                  ? (url, gallery, originals) =>
                      isCurrent() &&
                      props.onImagePress?.(url, gallery, originals)
                  : undefined
              }
              onImageLongPress={
                interactive
                  ? (url) => isCurrent() && props.onImageLongPress?.(url)
                  : undefined
              }
              onSegmentPress={
                interactive
                  ? (action, document) =>
                      isCurrent() && props.onSegmentPress?.(action, document)
                  : undefined
              }
              onSelectionChange={
                interactive
                  ? (selection, flow, document) =>
                      isCurrent() &&
                      props.onSelectionChange?.(selection, flow, document)
                  : undefined
              }
            />
          </View>
        );
      })}
    </View>
  );
});

/** Native V2 text flows with React Native media boundaries. */
const NativeDocumentContent = React.memo(function NativeDocumentContent({
  revision,
  content,
  contentArray,
  document,
  objectId,
  type,
  segmentInfos,
  linkCardInfo,
  variant = 'default',
  selectable = true,
  suppressDoubleTapSelection = false,
  fontSizeScale,
  lineHeightScale,
  options = defaultTypography,
  onLinkPress,
  onImagePress,
  onImageLongPress,
  onSelectionChange,
  onSegmentPress,
  renderLinkCard,
  renderFallback,
  renderPlaceholder,
  progressive = false,
  pauseProgressiveTail = false,
  canExpandProgressiveTail,
  onFirstContentLayout,
  onLayoutReady,
  initialContentWidth,
  interactive = true,
}: ZhihuNativeContentProps & { revision: number; interactive?: boolean }) {
  const dimensions = useWindowDimensions();
  const settings = useSettingsStore();
  const manualImages = settings.imageLoadingMode === 'manual';
  const themeColors = useRuntimeThemeColors();
  const textColor = themeColors.text;
  const secondaryColor = themeColors.textSecondary;
  const linkColor = themeColors.link;
  const surfaceColor = themeColors.backgroundSecondary;
  const borderColor = themeColors.border;
  // Prepare the document immediately, but defer native layout until its actual
  // container width is available. A fixed-width host can avoid this first wait.
  const [availableWidth, setAvailableWidth] = useState(() =>
    initialContentWidth !== undefined &&
    Number.isFinite(initialContentWidth) &&
    initialContentWidth > 0
      ? initialContentWidth
      : 0,
  );
  const [measuredContainerWidth, setMeasuredContainerWidth] = useState<
    number | null
  >(null);
  const measuredContainerWidthRef = useRef<number | null>(null);
  const [footnoteSelection, setFootnoteSelection] = useState<{
    document: ZhihuDocument;
    id: string;
  } | null>(null);
  const metrics = useMemo(
    () =>
      createRichContentMetrics(
        fontSizeScale ?? settings.fontSizeScale,
        lineHeightScale ?? settings.lineHeightScale,
      ),
    [
      fontSizeScale,
      lineHeightScale,
      settings.fontSizeScale,
      settings.lineHeightScale,
    ],
  );
  const { fontSize, lineHeight } = metrics.body;
  const scaledEm = fontSize * dimensions.fontScale;
  const enableSegmentTap =
    type !== 'answer' || settings.enableSegmentTap !== false;
  const width =
    options.integerMeasure && availableWidth > 0
      ? Math.max(scaledEm, Math.floor(availableWidth / scaledEm) * scaledEm)
      : availableWidth;
  const normalized = useMemo(() => {
    if (document) return { document, diagnostics: [] };
    const normalizationOptions = {
      documentId: `${type}:${objectId}`,
      variant,
      segmentInfos,
      linkCardInfo,
      removeImageWatermark: settings.removeImageWatermark,
    };
    return contentArray
      ? normalizeZhihuContentSegments(contentArray, normalizationOptions)
      : normalizeZhihuDocument(content, normalizationOptions);
  }, [
    content,
    contentArray,
    document,
    linkCardInfo,
    objectId,
    segmentInfos,
    settings.removeImageWatermark,
    type,
    variant,
  ]);
  const gradual = useMemo(
    () =>
      progressive &&
      shouldPrepareNativePartsProgressively(
        normalized.document,
        content.length,
      ),
    [progressive, normalized.document, content.length],
  );
  // Estimate only when starting a compiler. A keyboard/viewport resize must not
  // restart a live cursor; native measurements still follow the actual width.
  const viewportHint = useRef({ width: 0, height: 0, fontScale: 1 });
  viewportHint.current = {
    width: availableWidth || dimensions.width,
    height: dimensions.height,
    fontScale: dimensions.fontScale,
  };
  const committedPartCount = useRef(0);
  const compiled = useMemo(
    () =>
      prepareNativeParts(
        normalized.document,
        {
          fontSize,
          lineHeight,
          enableSegmentTap,
          paragraphSpacing: RICH_CONTENT_PARAGRAPH_SPACING,
        },
        gradual,
        committedPartCount.current,
        Boolean(document),
        viewportHint.current,
      ),
    [
      normalized.document,
      fontSize,
      lineHeight,
      enableSegmentTap,
      gradual,
      document,
    ],
  );
  const [continuation, setContinuation] = useState<{
    compiled: typeof compiled;
    batch: NativePartBatch;
  } | null>(null);
  useEffect(() => {
    setContinuation((previous) =>
      previous && previous.compiled !== compiled ? null : previous,
    );
  }, [compiled]);
  const batch =
    continuation?.compiled === compiled ? continuation.batch : compiled.first;
  const getGallery = useMemo(() => {
    let images: ReturnType<typeof getZhihuDocumentPreviewImages> | undefined;
    return () =>
      (images ??= getZhihuDocumentPreviewImages(normalized.document));
  }, [normalized.document]);
  const handleImage = useCallback(
    (url: string) => {
      if (!onImagePress) return;
      const images = getGallery();
      onImagePress(
        url,
        images.map((image) => image.url),
        images.map((image) => image.originalUrl),
      );
    },
    [onImagePress, getGallery],
  );
  const getSegment = useMemo(() => {
    let segments:
      | Map<string, ZhihuSegmentRun | ZhihuSegmentHighlightRun>
      | undefined;
    return (id: string) => {
      if (!segments) {
        segments = new Map();
        for (const node of walkZhihuDocument(normalized.document)) {
          if (node.type === 'segment' || node.type === 'segmentHighlight')
            segments.set(node.id, node);
        }
      }
      return segments.get(id);
    };
  }, [normalized.document]);
  const configJson = useMemo(
    () =>
      JSON.stringify({
        fontSize,
        lineHeight,
        paragraphSpacing: RICH_CONTENT_PARAGRAPH_SPACING,
        textColor,
        secondaryColor,
        linkColor,
        justify: options.justify ?? false,
        fontScale: dimensions.fontScale,
        commentIcon: segmentCommentIcon,
      }),
    [
      fontSize,
      lineHeight,
      linkColor,
      options.justify,
      secondaryColor,
      textColor,
      dimensions.fontScale,
    ],
  );
  const documentLayoutPrefix = `${normalized.document.id}:${revision}`;
  // Integer measurement can keep the text width fixed while captions and
  // other blocks resize. Reuse only the still-valid top-level flow heights.
  const textGeometry = useMemo(
    () => ({
      key: `${documentLayoutPrefix}:${width}:${configJson}`,
      flows: new Map<string, string>(),
    }),
    [documentLayoutPrefix, width, configJson],
  );
  // A suspended render may prepare a new geometry while the visible one is
  // still receiving native events. Each owns its measurements until commit.
  const geometry = useMemo(
    () => ({
      key: `${textGeometry.key}:${availableWidth}`,
      flows: textGeometry.flows,
      firstNested: new Set<RichTextFlow>(),
      tailNested: new Set<RichTextFlow>(),
      bodyMeasured: false,
      endMeasured: false,
      revealed: false,
      notified: false,
    }),
    [textGeometry, availableWidth],
  );
  const [revealedLayout, setRevealedLayout] = useState<typeof geometry | null>(
    null,
  );
  const committed = useRef({ compiled, batch, geometry });
  useLayoutEffect(() => {
    committed.current = { compiled, batch, geometry };
    committedPartCount.current = batch.count;
  }, [compiled, batch, geometry]);

  const initialParts = useMemo(
    () => (compiled.first.done ? null : new Set(compiled.first.groups.flat())),
    [compiled],
  );
  const firstMeasurements = useMemo(
    () =>
      pendingFlowMeasurements(
        compiled.first,
        geometry.flows,
        width,
        configJson,
      ),
    [compiled, geometry, width, configJson],
  );
  const completeMeasurements = useMemo(
    () =>
      !batch.done
        ? null
        : batch === compiled.first
          ? firstMeasurements
          : pendingFlowMeasurements(batch, geometry.flows, width, configJson),
    [batch, compiled, firstMeasurements, geometry, width, configJson],
  );
  const measurements = useRef({
    first: firstMeasurements,
    complete: completeMeasurements,
  });
  useLayoutEffect(() => {
    // Native may have measured the visible tree since React started this render.
    for (const key of geometry.flows.values()) {
      firstMeasurements.pending.delete(key);
      completeMeasurements?.pending.delete(key);
    }
    measurements.current = {
      first: firstMeasurements,
      complete: completeMeasurements,
    };
  }, [geometry, firstMeasurements, completeMeasurements]);

  const checkLayout = useCallback(() => {
    if (
      committed.current.compiled !== compiled ||
      committed.current.geometry !== geometry ||
      measuredContainerWidthRef.current !== availableWidth ||
      availableWidth <= 0
    )
      return;

    const { first, complete } = measurements.current;
    if (!geometry.revealed) {
      const firstMeasured = first.hasText
        ? first.pending.size === 0
        : geometry.bodyMeasured;
      if (!firstMeasured || geometry.firstNested.size > 0) return;
      geometry.revealed = true;
      setRevealedLayout(geometry);
      onFirstContentLayout?.();
    }

    if (
      complete?.pending.size === 0 &&
      geometry.firstNested.size === 0 &&
      geometry.tailNested.size === 0 &&
      !geometry.notified &&
      (compiled.first.done || geometry.endMeasured)
    ) {
      geometry.notified = true;
      onLayoutReady?.();
    }
  }, [compiled, geometry, availableWidth, onFirstContentLayout, onLayoutReady]);

  useLayoutEffect(checkLayout, [checkLayout]);

  const onFlowMeasured = useCallback(
    (flow: RichTextFlow) => {
      if (
        committed.current.compiled !== compiled ||
        committed.current.geometry !== geometry
      )
        return;
      const key = flowMeasureKey(flow, width, configJson);
      geometry.flows.set(flow.id, key);
      measurements.current.first.pending.delete(key);
      measurements.current.complete?.pending.delete(key);
      checkLayout();
    },
    [compiled, geometry, width, configJson, checkLayout],
  );
  const initialLayoutReady =
    measuredContainerWidth === availableWidth && revealedLayout === geometry;
  useEffect(() => {
    if (!initialLayoutReady || pauseProgressiveTail || batch.done) return;
    let active = true;
    const frame = requestAnimationFrame(() => {
      if (
        !active ||
        committed.current.geometry !== geometry ||
        committed.current.compiled !== compiled ||
        committed.current.batch !== batch
      )
        return;
      const allowLargerBatch =
        Platform.OS === 'android' && canExpandProgressiveTail?.() === true;
      setContinuation({
        compiled,
        batch: compiled.next(batch, allowLargerBatch),
      });
    });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
    };
  }, [
    batch,
    compiled,
    geometry,
    initialLayoutReady,
    pauseProgressiveTail,
    canExpandProgressiveTail,
  ]);
  // A known width hint can start native layout, but still needs confirmation
  // from this container. Content-only layouts don't wait for media downloads.
  const loadingPhase: RichContentLoadingPhase =
    availableWidth <= 0 || measuredContainerWidth !== availableWidth
      ? 'container-layout'
      : firstMeasurements.hasText
        ? 'text-layout'
        : 'content-layout';
  const handleLink = useCallback(
    (url: string) => {
      if (url.startsWith('zhihu-rich-footnote:')) {
        const definitionId = url.slice('zhihu-rich-footnote:'.length);
        try {
          setFootnoteSelection({
            document: normalized.document,
            id: decodeURIComponent(definitionId),
          });
        } catch {
          return;
        }
        return;
      }
      setFootnoteSelection(null);
      onLinkPress?.(url);
    },
    [normalized.document, onLinkPress],
  );
  const handleSelection = useCallback(
    (event: FlowEvent, flow: RichTextFlow) => {
      if (committed.current.compiled !== compiled) return;
      if (event.flowId !== flow.id || event.textVersion !== flow.textVersion)
        return;
      if (event.start === -1 && event.end === -1) {
        onSelectionChange?.(
          { ...event, mapping: null },
          flow,
          normalized.document,
        );
        return;
      }
      if (
        !Number.isInteger(event.start) ||
        !Number.isInteger(event.end) ||
        event.start < 0 ||
        event.end < event.start ||
        event.end > flow.text.length
      )
        return;
      onSelectionChange?.(
        {
          ...event,
          mapping: mapRichTextSelection(flow, event.start, event.end),
        },
        flow,
        normalized.document,
      );
    },
    [compiled, normalized.document, onSelectionChange],
  );
  const handleAction = useCallback(
    (event: ActionEvent, flow: RichTextFlow) => {
      if (committed.current.compiled !== compiled) return;
      if (event.flowId !== flow.id || event.textVersion !== flow.textVersion)
        return;
      if (event.kind === 'link') {
        const span = flow.spans.find(
          (candidate) =>
            candidate.kind === 'link' && candidate.nodeId === event.id,
        );
        if (span?.url) handleLink(span.url);
      } else if (event.kind === 'segment') {
        const decoration = flow.decorations.find(
          (candidate) => candidate.actionId === event.id,
        );
        if (!decoration) return;
        const segment = getSegment(event.id);
        const mapping = mapRichTextSelection(
          flow,
          decoration.start,
          decoration.end,
        );
        onSegmentPress?.(
          {
            nodeId: event.id,
            paragraphId: mapping?.start.paragraphId,
            start: mapping?.start.offset ?? decoration.start,
            end: mapping?.end.offset ?? decoration.end,
            text: getRichTextSelectionText(
              flow,
              decoration.start,
              decoration.end,
            ),
            segment,
          },
          normalized.document,
        );
      } else {
        const attachment = flow.attachments.find(
          (candidate) => candidate.id === event.id,
        );
        if (attachment?.url && attachment.kind === 'image') {
          if (event.kind === 'attachmentLongPress')
            onImageLongPress?.(attachment.url);
          else handleImage(attachment.url);
        }
      }
    },
    [
      compiled,
      handleLink,
      onImageLongPress,
      handleImage,
      onSegmentPress,
      normalized.document,
      getSegment,
    ],
  );
  const renderPart = useCallback(
    (part: RichTextPart) =>
      part.type === 'flow' ? (
        <NativeFlow
          key={part.flow.id}
          flow={part.flow}
          manualImages={manualImages}
          contentWidth={width}
          configJson={configJson}
          fontSize={fontSize}
          lineHeight={lineHeight}
          selectable={selectable}
          suppressDoubleTapSelection={suppressDoubleTapSelection}
          options={options}
          linkColor={linkColor}
          onSelection={handleSelection}
          onAction={handleAction}
          onMeasured={onFlowMeasured}
        />
      ) : (
        <NativeBlock
          key={part.block.id}
          block={part.block}
          manualImages={manualImages}
          enableSegmentTap={enableSegmentTap}
          width={availableWidth}
          fontSize={fontSize}
          lineHeight={lineHeight}
          textColor={textColor}
          secondaryColor={secondaryColor}
          linkColor={linkColor}
          surfaceColor={surfaceColor}
          borderColor={borderColor}
          onLink={handleLink}
          onImage={handleImage}
          onImageLongPress={onImageLongPress}
          configJson={configJson}
          selectable={selectable}
          suppressDoubleTapSelection={suppressDoubleTapSelection}
          options={options}
          onFlowAction={handleAction}
          onFlowSelection={handleSelection}
          pendingNested={
            !initialParts || initialParts.has(part)
              ? geometry.firstNested
              : geometry.tailNested
          }
          onNestedMeasured={checkLayout}
          renderLinkCard={renderLinkCard}
        />
      ),
    [
      manualImages,
      width,
      configJson,
      fontSize,
      lineHeight,
      selectable,
      suppressDoubleTapSelection,
      options,
      linkColor,
      handleSelection,
      handleAction,
      onFlowMeasured,
      geometry,
      initialParts,
      checkLayout,
      enableSegmentTap,
      availableWidth,
      textColor,
      secondaryColor,
      surfaceColor,
      borderColor,
      handleLink,
      handleImage,
      onImageLongPress,
      renderLinkCard,
    ],
  );
  const footnote = normalized.document.footnotes?.find(
    (definition) =>
      footnoteSelection?.document === normalized.document &&
      definition.id === footnoteSelection.id,
  );
  const footnoteText = footnote?.blocks.map(blockText).join('\n\n') || '';
  const available = isRichTextNativeAvailable();

  if (!available) return <>{renderFallback()}</>;

  return (
    <View
      testID="native-content-layout"
      key={`${documentLayoutPrefix}:${configJson}`}
      onLayout={(event) => {
        if (
          committed.current.compiled !== compiled ||
          committed.current.geometry !== geometry
        )
          return;
        const available = event.nativeEvent.layout.width;
        if (!Number.isFinite(available) || available <= 0) return;
        measuredContainerWidthRef.current = available;
        setAvailableWidth(available);
        setMeasuredContainerWidth(available);
        checkLayout();
      }}
      style={styles.content}
    >
      {!initialLayoutReady ? (
        renderPlaceholder ? (
          renderPlaceholder(loadingPhase)
        ) : (
          <View
            testID="native-content-placeholder"
            accessibilityLabel="正文正在加载"
            accessibilityRole="progressbar"
            style={{ width: '100%', gap: lineHeight - fontSize }}
          >
            {[1, 2, 3, 4].map((line) => (
              <View
                key={line}
                style={{
                  width: line === 4 ? '65%' : '100%',
                  height: fontSize,
                  backgroundColor: borderColor,
                  borderRadius: 3,
                  opacity: 0.4,
                }}
              />
            ))}
          </View>
        )
      ) : null}
      {availableWidth > 0 ? (
        <View
          testID="native-content-body"
          onLayout={(event) => {
            if (
              event.nativeEvent.layout.width !== availableWidth ||
              committed.current.compiled !== compiled ||
              committed.current.geometry !== geometry
            )
              return;
            geometry.bodyMeasured = true;
            checkLayout();
          }}
          accessibilityElementsHidden={!initialLayoutReady}
          importantForAccessibility={
            initialLayoutReady ? 'auto' : 'no-hide-descendants'
          }
          pointerEvents={initialLayoutReady ? 'auto' : 'none'}
          style={[
            styles.content,
            { width: availableWidth },
            !initialLayoutReady && {
              position: 'absolute',
              top: 0,
              left: 0,
              opacity: 0,
            },
          ]}
        >
          {batch.groups.map((group, slot) => (
            <NativePartGroup
              // biome-ignore lint/suspicious/noArrayIndexKey: each group owns a fixed range within this keyed document revision; metadata can renumber block IDs.
              key={slot}
              parts={group}
              renderPart={renderPart}
            />
          ))}
          {batch.done && !compiled.first.done ? (
            <View
              key={geometry.key}
              testID="native-content-end"
              accessible={false}
              collapsable={false}
              style={{ width: availableWidth, height: 0 }}
              onLayout={({ nativeEvent: { layout } }) => {
                if (
                  layout.width !== availableWidth ||
                  committed.current.compiled !== compiled ||
                  committed.current.geometry !== geometry
                )
                  return;
                geometry.endMeasured = true;
                checkLayout();
              }}
            />
          ) : null}
        </View>
      ) : null}
      <Modal
        visible={interactive && Boolean(footnote)}
        transparent
        animationType="fade"
        onRequestClose={() => setFootnoteSelection(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[styles.footnotePanel, { backgroundColor: surfaceColor }]}
          >
            <Text style={[styles.cardTitle, { color: textColor }]}>
              脚注 {footnote?.label}
            </Text>
            <ScrollView>
              {footnote?.blocks.map((block) => (
                <NativeBlock
                  manualImages={manualImages}
                  key={block.id}
                  block={block}
                  enableSegmentTap={enableSegmentTap}
                  width={Math.min(availableWidth, dimensions.width - 80)}
                  fontSize={fontSize}
                  lineHeight={lineHeight}
                  textColor={textColor}
                  secondaryColor={secondaryColor}
                  linkColor={linkColor}
                  surfaceColor={surfaceColor}
                  borderColor={borderColor}
                  onLink={handleLink}
                  onImage={handleImage}
                  onImageLongPress={onImageLongPress}
                  configJson={configJson}
                  selectable={selectable}
                  options={options}
                  onFlowAction={handleAction}
                  renderLinkCard={renderLinkCard}
                />
              ))}
            </ScrollView>
            <View style={styles.footnoteActions}>
              <Pressable
                onPress={() => {
                  void Clipboard.setStringAsync(footnoteText);
                }}
              >
                <Text style={{ color: linkColor }}>复制</Text>
              </Pressable>
              <Pressable onPress={() => setFootnoteSelection(null)}>
                <Text style={{ color: linkColor }}>返回正文</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  videoCover: {
    width: '100%',
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  videoPlayButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00000088',
  },
  videoPlayIcon: { color: '#ffffff', fontSize: 24 },
  content: { width: '100%', alignItems: 'center' },
  block: { marginVertical: 10 },
  imageFallback: {
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  deferredImage: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 8,
  },
  longImage: { borderRadius: 8, overflow: 'hidden' },
  longImageBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  longImageBadgeText: { color: '#fff', fontSize: 11, lineHeight: 15 },
  caption: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  formula: { alignItems: 'center', paddingVertical: 12 },
  formulaFallback: { fontFamily: 'monospace', fontSize: 17, padding: 12 },
  mediaCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    marginVertical: 10,
    width: '100%',
  },
  cardTitle: { fontSize: 16, lineHeight: 23, fontWeight: '700' },
  tableRow: { flexDirection: 'row' },
  code: { padding: 12, borderRadius: 8, marginVertical: 10, width: '100%' },
  quote: { borderLeftWidth: 3, paddingLeft: 15, marginVertical: 10 },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
    marginVertical: 18,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#00000055',
    justifyContent: 'center',
    padding: 24,
  },
  footnotePanel: { borderRadius: 16, padding: 20, maxHeight: '70%', gap: 16 },
  footnoteActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
});
