import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  Text,
  type TextStyle,
  useWindowDimensions,
  View,
} from 'react-native';
import { ContentActionButton } from '@/components/ContentActionButton';
import { useRuntimeThemeColors } from '@/components/Themed';
import type { ZhihuStructuredContent as ZhihuStructuredContentData } from '@/types/zhihu';
import { getCachedImageSource } from '@/utils/imageSource';
import type {
  ZhihuBlock,
  ZhihuFormula,
  ZhihuImageResource,
  ZhihuInlineRun,
} from '../document';
import { getZhihuDocumentPreviewImages } from '../documentTraversal';
import {
  getStructuredContentSegmentInfos,
  normalizeZhihuStructuredContent,
} from '../structuredContent';
import { ZhihuContent } from './ZhihuContent';
import { ZhihuNativeContent } from './ZhihuNativeContent';

export interface ZhihuStructuredContentProps {
  content: ZhihuStructuredContentData;
  documentId: string;
  renderer: 'shared' | 'blocks' | 'native-v2';
  /** Real answer ID for the common body host; documentId scopes expansion. */
  objectId?: string;
  onRefresh?: () => void;
  /** Preview actual source segments; expanding never mutates their text or marks. */
  previewSegmentCount?: number;
  resources?: Readonly<Record<string, ZhihuImageResource>>;
  onLinkPress?: (url: string) => void;
  onImagePress?: (url: string, gallery: readonly string[]) => void;
  selectable?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  loadMoreError?: string;
  onLoadMore?: () => void;
  /** Automatic production paging keeps retry controls and hides normal paging. */
  showLoadMoreControl?: boolean;
  expandLabel?: string;
  collapseLabel?: string;
  showFallbackNotice?: boolean;
}

interface InlineFormulaProps {
  formula: ZhihuFormula;
  color: string;
  width: number;
  selectable: boolean;
}

function InlineFormula({
  formula,
  color,
  width,
  selectable,
}: InlineFormulaProps) {
  const image = formula.image;
  const uri = image?.offlineUri ?? image?.url;
  const [failedUri, setFailedUri] = useState<string | undefined>();
  if (!uri || failedUri === uri)
    return (
      <Text selectable={selectable} style={{ color }}>
        {formula.latex || '[公式]'}
      </Text>
    );
  const rawWidth = image?.width && image.width > 0 ? image.width : 50;
  const rawHeight = image?.height && image.height > 0 ? image.height : 24;
  const scale = Math.min(1, width / rawWidth);
  return (
    <Image
      source={getCachedImageSource(uri)}
      accessibilityLabel={formula.latex || '公式'}
      resizeMode="contain"
      style={{ width: rawWidth * scale, height: rawHeight * scale }}
      onError={() => setFailedUri(uri)}
    />
  );
}

/** Source segments control paging; the common body host controls reading. */
export const ZhihuStructuredContent = React.memo(
  function ZhihuStructuredContent({
    content,
    documentId,
    renderer,
    objectId,
    onRefresh,
    previewSegmentCount = 3,
    resources,
    onLinkPress,
    onImagePress,
    selectable = true,
    expanded,
    onExpandedChange,
    hasMore = false,
    isLoadingMore = false,
    loadMoreError,
    onLoadMore,
    showLoadMoreControl = true,
    expandLabel = '展开全部分段',
    collapseLabel = '收起分段',
    showFallbackNotice = true,
  }: ZhihuStructuredContentProps) {
    const colors = useRuntimeThemeColors();
    const dimensions = useWindowDimensions();
    const [width, setWidth] = useState(Math.max(1, dimensions.width - 32));
    const [expandedDocument, setExpandedDocument] = useState<string | null>(
      null,
    );
    const isExpanded = expanded ?? expandedDocument === documentId;
    const previewCount = Number.isSafeInteger(previewSegmentCount)
      ? Math.max(1, previewSegmentCount)
      : 3;
    const completeDocument = useMemo(
      () =>
        normalizeZhihuStructuredContent(content, {
          documentId,
          resources,
        }),
      [content, documentId, resources],
    );
    const document = useMemo(
      () =>
        isExpanded
          ? completeDocument
          : {
              ...completeDocument,
              blocks: completeDocument.blocks.slice(0, previewCount),
            },
      [completeDocument, isExpanded, previewCount],
    );
    const completeSegmentInfos = useMemo(
      () => getStructuredContentSegmentInfos(content),
      [content],
    );
    const segmentInfos = useMemo(() => {
      const visiblePids = new Set(
        document.blocks.flatMap((block) =>
          block.type === 'paragraph' && block.paragraphId
            ? [block.paragraphId]
            : [],
        ),
      );
      return completeSegmentInfos.filter((info) => visiblePids.has(info.pid));
    }, [completeSegmentInfos, document]);
    const previewImages = useMemo(
      () => getZhihuDocumentPreviewImages(document).map((image) => image.url),
      [document],
    );
    const textStyle: TextStyle = {
      color: colors.text,
      fontSize: 17,
      lineHeight: 25.5,
    };
    const Control = renderer === 'shared' ? ContentActionButton : Pressable;

    function inline(runs: readonly ZhihuInlineRun[]): React.ReactNode {
      return runs.map((run) => {
        switch (run.type) {
          case 'text':
            return <Text key={run.id}>{run.text}</Text>;
          case 'strong':
            return (
              <Text key={run.id} style={{ fontWeight: '700' }}>
                {inline(run.children)}
              </Text>
            );
          case 'link':
            return (
              <Text
                key={run.id}
                accessibilityRole="link"
                style={{ color: colors.link }}
                onPress={onLinkPress ? () => onLinkPress(run.url) : undefined}
              >
                {inline(run.children)}
              </Text>
            );
          case 'inlineFormula':
            return (
              <InlineFormula
                key={run.id}
                formula={run.formula}
                color={colors.text}
                width={width}
                selectable={selectable}
              />
            );
          case 'lineBreak':
            return <Text key={run.id}>{'\n'}</Text>;
          case 'unsupported':
            return <Text key={run.id}>{run.fallbackText}</Text>;
          default:
            return 'children' in run ? (
              <Text key={run.id}>{inline(run.children)}</Text>
            ) : (
              <Text key={run.id}>[暂不支持的行内内容]</Text>
            );
        }
      });
    }

    function blocks(items: readonly ZhihuBlock[]): React.ReactNode {
      return items.map((block) => {
        switch (block.type) {
          case 'paragraph':
            return (
              <Text
                key={block.id}
                selectable={selectable}
                style={[textStyle, { marginBottom: 12 }]}
              >
                {inline(block.children)}
              </Text>
            );
          case 'heading':
            return (
              <Text
                key={block.id}
                selectable={selectable}
                style={[
                  textStyle,
                  {
                    fontSize: 26 - block.level * 2,
                    fontWeight: '700',
                    marginBottom: 12,
                  },
                ]}
              >
                {inline(block.children)}
              </Text>
            );
          case 'list':
            return (
              <View key={block.id} style={{ marginBottom: 12 }}>
                {block.items.map((item, index) => (
                  <View key={item.id} style={{ flexDirection: 'row' }}>
                    <Text style={[textStyle, { width: 24 }]}>
                      {block.ordered ? `${(block.start ?? 1) + index}.` : '•'}
                    </Text>
                    <View style={{ flex: 1 }}>{blocks(item.blocks)}</View>
                  </View>
                ))}
              </View>
            );
          case 'image': {
            const rawWidth =
              block.resource.width && block.resource.width > 0
                ? block.resource.width
                : width;
            const rawHeight =
              block.resource.height && block.resource.height > 0
                ? block.resource.height
                : 120;
            const imageWidth =
              block.layout === 'small'
                ? Math.min(width, block.resource.width ?? width / 2)
                : width;
            return (
              <View key={block.id} style={{ marginBottom: 12 }}>
                <Pressable
                  disabled={!onImagePress}
                  accessibilityRole={onImagePress ? 'button' : undefined}
                  accessibilityLabel={onImagePress ? '查看正文图片' : undefined}
                  onPress={() =>
                    onImagePress?.(block.resource.url, previewImages)
                  }
                >
                  <Image
                    source={getCachedImageSource(
                      block.resource.offlineUri ?? block.resource.url,
                    )}
                    accessibilityLabel={block.alt || '正文图片'}
                    resizeMode="contain"
                    style={{
                      width: imageWidth,
                      height: rawHeight * (imageWidth / rawWidth),
                    }}
                  />
                </Pressable>
                {block.caption?.length ? (
                  <Text
                    selectable={selectable}
                    style={[textStyle, { color: colors.textSecondary }]}
                  >
                    {inline(block.caption)}
                  </Text>
                ) : null}
              </View>
            );
          }
          case 'divider':
            return (
              <View
                key={block.id}
                style={{
                  height: 1,
                  marginVertical: 12,
                  backgroundColor: colors.border,
                }}
              />
            );
          case 'linkCard':
            return (
              <Pressable
                key={block.id}
                accessibilityRole="link"
                accessibilityLabel={block.title}
                disabled={!onLinkPress}
                onPress={() => onLinkPress?.(block.url)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  marginBottom: 12,
                  borderRadius: 12,
                  backgroundColor: colors.backgroundSecondary,
                }}
              >
                {block.image ? (
                  <Image
                    source={getCachedImageSource(
                      block.image.offlineUri ?? block.image.url,
                    )}
                    style={{ width: 48, height: 48, borderRadius: 6 }}
                    resizeMode="cover"
                  />
                ) : null}
                <Text style={[textStyle, { color: colors.link, flex: 1 }]}>
                  {block.title}
                </Text>
              </Pressable>
            );
          case 'blockFormula':
            return (
              <Text
                key={block.id}
                selectable={selectable}
                style={[textStyle, { marginBottom: 12 }]}
              >
                <InlineFormula
                  formula={block.formula}
                  color={colors.text}
                  width={width}
                  selectable={selectable}
                />
              </Text>
            );
          case 'unsupported':
            return (
              <Text
                key={block.id}
                selectable={selectable}
                style={[textStyle, { marginBottom: 12 }]}
              >
                {block.fallbackText || '[暂不支持的分段]'}
              </Text>
            );
          default:
            return (
              <Text key={block.id} selectable={selectable} style={textStyle}>
                [暂不支持的分段]
              </Text>
            );
        }
      });
    }

    const renderBlocks = () => (
      <View testID="structured-content-blocks">{blocks(document.blocks)}</View>
    );
    const renderFallback = () => (
      <View>
        {showFallbackNotice ? (
          <Text style={{ color: colors.textSecondary, marginBottom: 12 }}>
            当前客户端未包含原生文本模块，使用 JSON 分段展示
          </Text>
        ) : null}
        {renderBlocks()}
      </View>
    );

    return (
      <View
        onLayout={(event) => {
          const nextWidth = event.nativeEvent.layout.width;
          if (Number.isFinite(nextWidth) && nextWidth > 0) setWidth(nextWidth);
        }}
      >
        {renderer === 'shared' ? (
          <ZhihuContent
            document={document}
            objectId={objectId ?? documentId}
            type="answer"
            segmentInfos={segmentInfos}
            onRefresh={onRefresh}
            selectable={selectable}
          />
        ) : renderer === 'native-v2' ? (
          <View testID="structured-content-native">
            <ZhihuNativeContent
              content=""
              document={document}
              objectId={documentId}
              type="answer"
              selectable={selectable}
              onLinkPress={onLinkPress}
              onImagePress={onImagePress}
              renderFallback={renderFallback}
            />
          </View>
        ) : (
          renderBlocks()
        )}
        {(isExpanded || (renderer === 'shared' && loadMoreError)) &&
        (loadMoreError || isLoadingMore || (hasMore && showLoadMoreControl)) ? (
          <View style={{ marginTop: 12 }}>
            {loadMoreError ? (
              <Text style={{ color: colors.textSecondary, marginBottom: 8 }}>
                {loadMoreError}
              </Text>
            ) : null}
            {onLoadMore && (showLoadMoreControl || loadMoreError) ? (
              <Control
                accessibilityRole="button"
                accessibilityState={{ busy: isLoadingMore }}
                disabled={isLoadingMore}
                onPress={onLoadMore}
                style={{ padding: 10, alignItems: 'center' }}
              >
                {isLoadingMore ? (
                  <ActivityIndicator color={colors.link} />
                ) : (
                  <Text style={{ color: colors.link }}>
                    {loadMoreError ? '重新加载正文' : '加载更多正文'}
                  </Text>
                )}
              </Control>
            ) : isLoadingMore ? (
              <ActivityIndicator color={colors.link} />
            ) : null}
          </View>
        ) : null}
        {content.segments.length > previewCount || hasMore || isExpanded ? (
          <Control
            testID="structured-content-toggle"
            accessibilityRole="button"
            accessibilityState={{ expanded: isExpanded }}
            hitSlop={renderer === 'shared' ? 8 : undefined}
            onPress={() => {
              if (expanded === undefined)
                setExpandedDocument(isExpanded ? null : documentId);
              onExpandedChange?.(!isExpanded);
            }}
            style={
              renderer === 'shared'
                ? {
                    alignSelf: 'flex-end',
                    backgroundColor: 'transparent',
                    paddingVertical: 6,
                    paddingHorizontal: 2,
                    marginTop: 4,
                  }
                : {
                    backgroundColor: colors.primary,
                    borderRadius: 8,
                    padding: 10,
                    alignItems: 'center',
                    marginTop: 8,
                  }
            }
          >
            <Text
              style={
                renderer === 'shared'
                  ? { color: colors.link, fontSize: 13 }
                  : { color: colors.onPrimary }
              }
            >
              {isExpanded ? collapseLabel : expandLabel}
            </Text>
          </Control>
        ) : null}
      </View>
    );
  },
);
