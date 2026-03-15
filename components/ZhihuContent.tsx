import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import type React from 'react';
import { useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
} from 'react-native';
import RenderHtml, {
  type CustomBlockRenderer,
  defaultSystemFonts,
} from 'react-native-render-html';
import { reactAnswerSegment, unreactAnswerSegment } from '@/api/zhihu/answer';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { showToast } from '@/utils/toast';
import { Text, View } from './Themed';

interface SegmentInfo {
  pid: string;
  text: string;
  marks: Array<{
    start_index: number;
    end_index: number;
    seg_info?: {
      like_count: number;
      comment_count: number;
      is_like: boolean;
      seg_ids?: string[];
    };
    master_seg_info?: {
      like_count: number;
      comment_count: number;
      is_like: boolean;
      seg_ids?: string[];
    };
  }>;
}

interface ZhihuContentProps {
  content?: string;
  contentArray?: any[];
  segmentInfos?: SegmentInfo[];
  objectId: string;
  type: 'answer' | 'article' | 'pin';
  onRefresh?: () => void;
}

export const ZhihuContent: React.FC<ZhihuContentProps> = ({
  content,
  contentArray,
  segmentInfos,
  objectId,
  type,
  onRefresh,
}) => {
  const colorScheme = useColorScheme();
  const { width } = useWindowDimensions();
  const textColor = Colors[colorScheme].text;
  const surfaceColor = Colors[colorScheme].surface;
  const router = useRouter();
  const queryClient = useQueryClient();

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

  const segmentMap = useMemo(() => {
    const map = new Map<string, SegmentInfo>();
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
      // 更新本地状态以立即响应
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

  // 辅助函数：从复杂的 segmentInfos 中挑出最合适的交互数据
  const findActiveInteraction = (segment: SegmentInfo | null | undefined) => {
    const marks = segment?.marks;
    if (!marks || marks.length === 0) return null;

    // 1. 优先寻找已经点赞过的，确保 UI 能显示“已赞”且“取消点赞”能操作到正确的 ID
    for (const mark of marks) {
      if (mark.seg_info?.is_like) return { ...mark.seg_info, mark };
      if (mark.master_seg_info?.is_like)
        return { ...mark.master_seg_info, mark };
    }

    // 2. 其次选择包含主信息的数据段
    for (const mark of marks) {
      if (mark.master_seg_info) return { ...mark.master_seg_info, mark };
    }

    // 3. 最后保底选第一个
    const firstInfo = marks[0].seg_info || marks[0].master_seg_info;
    return firstInfo ? { ...firstInfo, mark: marks[0] } : null;
  };

  const domVisitors = useMemo(
    () => ({
      onElement: (element: any) => {
        // 修复图片逻辑
        if (element.name === 'img') {
          const { attribs } = element;
          // 优先使用原图，其次是高清图，最后是当前 src
          const actualSrc =
            attribs['data-actualsrc'] ||
            attribs['data-original'] ||
            attribs.src;

          // 如果 src 是占位图，强制替换
          if (
            actualSrc &&
            (attribs.src?.startsWith('data:image') || !attribs.src)
          ) {
            attribs.src = actualSrc;
          }

          // 映射属性以便渲染器使用
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
            element.attribs.class =
              (element.attribs.class || '') + ' segment-interactable';
            if (interaction.is_like) {
              element.attribs.class += ' segment-liked';
            }
          }
        }
      },
    }),
    [segmentMap],
  );

  const P_Renderer: CustomBlockRenderer = ({ TDefaultRenderer, ...props }) => {
    const pid = props.tnode.attributes['data-pid'];
    const segment = pid ? segmentMap.get(pid) : null;

    // 找出该段落最合适的交互数据
    const interaction = findActiveInteraction(segment);
    const hasInteraction =
      interaction &&
      (interaction.like_count > 0 ||
        interaction.comment_count > 0 ||
        interaction.is_like);
    const isLiked = interaction?.is_like;

    const handlePress = () => {
      if (hasInteraction && interaction) {
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
      }
    };

    const isActive = activeSegment?.pid === pid && modalVisible;

    return (
      <Pressable
        onPress={handlePress}
        className="flex-row items-start bg-transparent overflow-visible rounded-xl py-1.5 px-2 -mx-2 my-1"
        style={[
          isActive && {
            backgroundColor: Colors[colorScheme].primaryTransparent,
          },
          !isActive &&
          isLiked && { backgroundColor: 'rgba(0, 132, 255, 0.05)' },
        ]}
      >
        <TDefaultRenderer {...props} />
      </Pressable>
    );
  };

  const IMG_Renderer: CustomBlockRenderer = ({ tnode }) => {
    const { src, width: attrWidth, height: attrHeight } = tnode.attributes;
    const contentWidth = width - 40;

    // 计算比例。知乎通常会提供 data-rawwidth/height，我们在 domVisitors 里已经映射到了 width/height
    const originalWidth = parseInt(attrWidth as string) || 0;
    const originalHeight = parseInt(attrHeight as string) || 0;

    if (!src || src.startsWith('data:image/svg')) {
      return null;
    }

    // 计算实际显示高度
    let displayHeight = 200; // 默认高度
    if (originalWidth > 0 && originalHeight > 0) {
      displayHeight = (contentWidth * originalHeight) / originalWidth;
    }

    const handleImagePress = () => {
      setViewerImage(src);
      setViewerVisible(true);
    };

    return (
      <View className="my-2.5 items-center w-full bg-transparent">
        <Pressable onPress={handleImagePress}>
          <Image
            source={{ uri: src }}
            className="rounded-xl bg-[rgba(150,150,150,0.1)]"
            style={{
              width: contentWidth,
              height: displayHeight,
            }}
            resizeMode="cover"
          />
        </Pressable>
      </View>
    );
  };

  const LinkCard: React.FC<{
    url: string;
    title?: string;
    image?: string;
    type?: string;
  }> = ({ url, title, image, type }) => {
    const isInternal = url.includes('zhihu.com');

    // 简易解析知乎链接类型
    const getLinkTypeIcon = () => {
      if (url.includes('/question/')) return 'help-circle';
      if (url.includes('/answer/')) return 'chatbubble-ellipses';
      if (url.includes('/pin/')) return 'navigate';
      return 'link';
    };

    const handlePress = () => {
      // TODO: 实现更精细的内部跳转逻辑
      router.push(url as any);
    };

    return (
      <Pressable
        onPress={handlePress}
        className="flex-row items-center p-3 rounded-xl my-2.5"
        style={[
          {
            backgroundColor: surfaceColor,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: 'rgba(150,150,150,0.15)',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 4,
            elevation: 2,
          },
        ]}
      >
        <View className="flex-1 mr-2.5 bg-transparent">
          <Text className="text-[15px] font-bold leading-5 mb-1.5" numberOfLines={2}>
            {title || url}
          </Text>
          <View className="flex-row items-center bg-transparent">
            <Ionicons
              name={getLinkTypeIcon() as any}
              size={14}
              color={Colors[colorScheme].primary}
            />
            <Text type="secondary" className="text-xs ml-1">
              {isInternal ? '知乎内部链接' : '外部链接'}
            </Text>
          </View>
        </View>
        {image && (
          <Image
            source={{ uri: image }}
            className="w-[60px] h-[60px] rounded-lg"
            style={[
              { backgroundColor: Colors[colorScheme].backgroundSecondary },
            ]}
          />
        )}
      </Pressable>
    );
  };

  const A_Renderer: CustomBlockRenderer = ({
    tnode,
    TDefaultRenderer,
    ...props
  }) => {
    const isLinkCard =
      tnode.attributes.class?.includes('LinkCard') ||
      tnode.attributes['data-draft-type'] === 'link-card';
    const url = tnode.attributes.href;

    if (isLinkCard && url) {
      // 这里的 title 可能在子节点中
      return (
        <LinkCard url={url} title={tnode.attributes['data-draft-title']} />
      );
    }

    return <TDefaultRenderer tnode={tnode} {...props} />;
  };

  const renderers = useMemo(
    () => ({
      p: P_Renderer,
      img: IMG_Renderer,
      a: A_Renderer,
    }),
    [P_Renderer, IMG_Renderer, A_Renderer],
  );

  // 注意：这部分的样式供 react-native-render-html 使用，只能接受 StyleSheet Object，不识别 className
  const classesStyles = useMemo(
    () => ({
      'segment-interactable': {
        textDecorationLine: 'underline',
        textDecorationColor: Colors[colorScheme].primaryTransparent,
      },
      'segment-liked': {},
    }),
    [colorScheme],
  );

  const tagsStyles = useMemo(
    () => ({
      p: { color: textColor, fontSize: 18, lineHeight: 28, marginBottom: 20 },
      b: { color: Colors[colorScheme].primary, fontWeight: 'bold' },
      img: { borderRadius: 12, marginVertical: 10 },
      blockquote: {
        borderLeftWidth: 4,
        borderLeftColor: Colors[colorScheme].primary,
        paddingLeft: 18,
        backgroundColor: surfaceColor + '80', // 添加半透明底色
        paddingVertical: 12,
        marginVertical: 15,
        fontStyle: 'italic',
        color: textColor,
      },
      h1: {
        color: textColor,
        fontSize: 22,
        fontWeight: 'bold',
        marginVertical: 20,
        lineHeight: 30,
      },
      h2: {
        color: textColor,
        fontSize: 20,
        fontWeight: 'bold',
        marginVertical: 18,
        lineHeight: 28,
      },
      h3: {
        color: textColor,
        fontSize: 18,
        fontWeight: 'bold',
        marginVertical: 15,
        lineHeight: 26,
      },
      ul: { paddingLeft: 20, color: textColor, marginVertical: 10 },
      ol: { paddingLeft: 20, color: textColor, marginVertical: 10 },
      li: { marginBottom: 8, color: textColor, fontSize: 17, lineHeight: 26 },
      hr: {
        height: 1,
        backgroundColor: 'rgba(150,150,150,0.2)',
        marginVertical: 25,
      },
      figure: { marginVertical: 15, alignItems: 'center' },
      figcaption: {
        color: '#999',
        fontSize: 13,
        marginTop: 8,
        textAlign: 'center',
        fontStyle: 'italic',
      },
      span: { color: textColor },
      div: { color: textColor },
      a: { color: Colors[colorScheme].primary, textDecorationLine: 'none' },
      code: {
        backgroundColor: Colors[colorScheme].border,
        borderRadius: 4,
        paddingHorizontal: 4,
        fontFamily: 'monospace',
        fontSize: 14,
      },
    }),
    [textColor, surfaceColor, colorScheme],
  );

  const systemFonts = [...defaultSystemFonts, 'Inter', 'Roboto'];

  // 处理 Pin 内容数组的渲染
  const renderPinContent = () => {
    if (!contentArray) return null;
    return contentArray.map((item, index) => {
      if (item.type === 'text') {
        return (
          <RenderHtml
            key={index}
            contentWidth={width - 40}
            source={{ html: `<div>${item.content}</div>` }}
            renderers={renderers as any}
            tagsStyles={tagsStyles as any}
            classesStyles={classesStyles as any}
            domVisitors={domVisitors}
            systemFonts={systemFonts}
          />
        );
      }
      if (item.type === 'image') {
        return (
          <View key={index} className="my-2.5 items-center w-full bg-transparent">
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
          <LinkCard key={index} url={item.url} title={item.data_draft_title} />
        );
      }
      return null;
    });
  };

  return (
    <View className="bg-transparent">
      {contentArray ? (
        renderPinContent()
      ) : (
        <RenderHtml
          contentWidth={width - 40}
          source={{ html: content || '' }}
          renderers={renderers as any}
          tagsStyles={tagsStyles as any}
          classesStyles={classesStyles as any}
          domVisitors={domVisitors}
          systemFonts={systemFonts}
          ignoredDomTags={['noscript']}
          defaultTextProps={{
            selectable: true,
            selectionColor: '#0084ff',
          }}
        />
      )}

      {/* 交互气泡弹窗 */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
          <View className="flex-1 bg-black/10 justify-center items-center">
            <TouchableWithoutFeedback>
              <View
                className="p-4 rounded-[20px] w-4/5"
                style={[
                  {
                    backgroundColor: surfaceColor,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.15,
                    shadowRadius: 12,
                    elevation: 8,
                  },
                ]}
              >
                <View className="flex-row items-center justify-around mb-4 bg-transparent">
                  <Pressable
                    className="flex-row items-center bg-transparent"
                    onPress={() => toggleSegmentLikeMutation.mutate()}
                    disabled={toggleSegmentLikeMutation.isPending}
                  >
                    <Ionicons
                      name={activeSegment?.is_like ? 'heart' : 'heart-outline'}
                      size={24}
                      color={activeSegment?.is_like ? '#ff4d4f' : textColor}
                    />
                    <Text
                      className="text-[15px] font-semibold ml-2"
                      style={[activeSegment?.is_like && { color: '#ff4d4f' }]}
                    >
                      {activeSegment?.like_count || 0} 赞同
                    </Text>
                  </Pressable>
                  <View className="w-[1px] h-5 bg-[rgba(150,150,150,0.2)]" />
                  <Pressable
                    className="flex-row items-center bg-transparent"
                    onPress={() => {
                      setModalVisible(false);
                      const { seg_ids } = activeSegment || {};
                      const segId = Array.isArray(seg_ids)
                        ? seg_ids[0]
                        : seg_ids;
                      router.push(
                        `/comments/${objectId}?type=${type}${segId ? `&segmentId=${segId}` : ''}`,
                      );
                    }}
                  >
                    <Ionicons
                      name="chatbubble-outline"
                      size={22}
                      color={Colors[colorScheme].primary}
                    />
                    <Text className="text-[15px] font-semibold ml-2">
                      {activeSegment?.comment_count || 0} 评论
                    </Text>
                  </Pressable>
                </View>
                <Pressable
                  className="flex-row items-center justify-center py-2.5 bg-transparent"
                  style={{
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: 'rgba(150,150,150,0.1)',
                  }}
                  onPress={() => {
                    setModalVisible(false);
                    router.push(`/comments/${objectId}?type=${type}`);
                  }}
                >
                  <Text type="primary" className="text-sm font-bold mr-1">
                    查看详细讨论
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={Colors[colorScheme].primary}
                  />
                </Pressable>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* 图片全屏查看器 */}
      <Modal
        visible={viewerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerVisible(false)}
      >
        <View className="flex-1 bg-black justify-center items-center">
          <TouchableWithoutFeedback onPress={() => setViewerVisible(false)}>
            <View className="absolute inset-0" />
          </TouchableWithoutFeedback>

          {viewerImage && (
            <Image
              source={{ uri: viewerImage }}
              className="w-full h-full"
              resizeMode="contain"
            />
          )}

          <TouchableOpacity
            className="absolute right-5 w-[44px] h-[44px] rounded-[22px] bg-black/50 justify-center items-center z-10"
            style={{ top: 50 }}
            onPress={() => setViewerVisible(false)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
};