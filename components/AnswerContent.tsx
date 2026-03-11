import { StyleSheet, useWindowDimensions, Pressable, Modal, FlatList, TouchableWithoutFeedback } from 'react-native';
import RenderHtml, { CustomBlockRenderer, defaultSystemFonts } from 'react-native-render-html';
import { View, Text, useThemeColor } from './Themed';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reactAnswerSegment, unreactAnswerSegment } from '@/api/zhihu/answer';

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

interface AnswerContentProps {
  content: string;
  segmentInfos?: SegmentInfo[];
  answerId: string;
  onRefresh?: () => void;
}

export const AnswerContent: React.FC<AnswerContentProps> = ({ content, segmentInfos, answerId, onRefresh }) => {
  const { width } = useWindowDimensions();
  const textColor = useThemeColor({}, 'text');
  const surfaceColor = useThemeColor({}, 'surface');
  const backgroundColor = useThemeColor({}, 'background');
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeSegment, setActiveSegment] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const segmentMap = useMemo(() => {
    const map = new Map<string, SegmentInfo>();
    segmentInfos?.forEach(info => {
      map.set(info.pid, info);
    });
    return map;
  }, [segmentInfos]);

  const toggleSegmentLikeMutation = useMutation({
    mutationFn: async () => {
      if (!activeSegment) return;
      const { is_like, seg_ids, text, pid, startIndex, endIndex } = activeSegment;
      const segId = Array.isArray(seg_ids) ? seg_ids[0] : seg_ids;
      
      if (is_like) {
        return unreactAnswerSegment(answerId, segId);
      } else {
        return reactAnswerSegment(answerId, segId, text, pid, startIndex, endIndex);
      }
    },
    onSuccess: () => {
      onRefresh?.();
      // 更新本地状态以立即响应
      if (activeSegment) {
        setActiveSegment({ ...activeSegment, is_like: !activeSegment.is_like, like_count: activeSegment.is_like ? activeSegment.like_count - 1 : activeSegment.like_count + 1 });
      }
    }
  });

  const domVisitors = useMemo(() => ({
    onElement: (element: any) => {
      if (element.name === 'p') {
        const pid = element.attribs['data-pid'];
        const segment = pid ? segmentMap.get(pid) : null;
        const interaction = segment?.marks?.[0]?.seg_info || segment?.marks?.[0]?.master_seg_info;
        
        if (interaction && (interaction.like_count > 0 || interaction.comment_count > 0)) {
          element.attribs.class = (element.attribs.class || '') + ' segment-interactable';
          if (interaction.is_like) {
            element.attribs.class += ' segment-liked';
          }
        }
      }
    }
  }), [segmentMap]);

  const P_Renderer: CustomBlockRenderer = ({ TDefaultRenderer, ...props }) => {
    const pid = props.tnode.attributes['data-pid'];
    const segment = pid ? segmentMap.get(pid) : null;

    // 找出该段落的交互数据 (通常取 marks 中的第一个)
    const interaction = segment?.marks?.[0]?.seg_info || segment?.marks?.[0]?.master_seg_info;
    const hasInteraction = interaction && (interaction.like_count > 0 || interaction.comment_count > 0);
    const isLiked = interaction?.is_like;

    const handlePress = () => {
      if (hasInteraction) {
        const mark = segment?.marks?.[0];
        setActiveSegment({ 
          ...interaction, 
          text: segment?.text, 
          pid,
          seg_ids: interaction.seg_ids || mark?.seg_info?.seg_ids || (mark as any)?.master_seg_info?.seg_ids,
          startIndex: mark?.start_index || 0,
          endIndex: mark?.end_index || segment?.text.length || 0
        });
        setModalVisible(true);
      }
    };

    const isActive = activeSegment?.pid === pid && modalVisible;

    return (
      <Pressable 
        onPress={handlePress}
        style={[
          styles.paragraphContainer,
          isActive && styles.activeParagraph,
          !isActive && isLiked && { backgroundColor: 'rgba(0, 132, 255, 0.05)' }
        ]}
      >
        <TDefaultRenderer {...props} />
      </Pressable>
    );
  };

  const renderers = {
    p: P_Renderer,
  };

  const classesStyles = {
    'segment-interactable': {
      textDecorationLine: 'underline',
      textDecorationColor: 'rgba(0, 132, 255, 0.25)', // 调浅划线颜色
    },
    'segment-liked': {
      // 在 P_Renderer 里处理背景色更灵活，这里可以留空
    }
  };

  const tagsStyles = {
    p: { color: textColor, fontSize: 18, lineHeight: 28, marginBottom: 20 },
    b: { color: '#0084ff', fontWeight: 'bold' },
    img: { borderRadius: 12, marginVertical: 10 },
    blockquote: {
      borderLeftWidth: 4,
      borderLeftColor: '#0084ff',
      paddingLeft: 18,
      backgroundColor: surfaceColor + '80', // 添加半透明底色
      paddingVertical: 12,
      marginVertical: 15,
      fontStyle: 'italic',
      color: textColor,
    },
    h1: { color: textColor, fontSize: 22, fontWeight: 'bold', marginVertical: 20, lineHeight: 30 },
    h2: { color: textColor, fontSize: 20, fontWeight: 'bold', marginVertical: 18, lineHeight: 28 },
    h3: { color: textColor, fontSize: 18, fontWeight: 'bold', marginVertical: 15, lineHeight: 26 },
    ul: { paddingLeft: 20, color: textColor, marginVertical: 10 },
    ol: { paddingLeft: 20, color: textColor, marginVertical: 10 },
    li: { marginBottom: 8, color: textColor, fontSize: 17, lineHeight: 26 },
    hr: { height: 1, backgroundColor: 'rgba(150,150,150,0.2)', marginVertical: 25 },
    figure: { marginVertical: 15, alignItems: 'center' },
    figcaption: { color: '#999', fontSize: 13, marginTop: 8, textAlign: 'center', fontStyle: 'italic' },
    span: { color: textColor },
    div: { color: textColor },
    a: { color: '#0084ff', textDecorationLine: 'none' },
    code: { 
      backgroundColor: 'rgba(150,150,150,0.1)', 
      borderRadius: 4, 
      paddingHorizontal: 4, 
      fontFamily: 'monospace',
      fontSize: 14,
    },
  } as const;

  const systemFonts = [...defaultSystemFonts, 'Inter', 'Roboto'];

  return (
    <View style={styles.contentWrapper}>
      <RenderHtml
        contentWidth={width - 40}
        source={{ html: content }}
        renderers={renderers}
        tagsStyles={tagsStyles as any}
        classesStyles={classesStyles as any}
        domVisitors={domVisitors}
        systemFonts={systemFonts}
        defaultTextProps={{
          selectable: true,
          selectionColor: '#0084ff',
        }}
      />

      {/* 交互气泡弹窗 */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.bubbleContainer, { backgroundColor: surfaceColor }]}>
                <View style={styles.bubbleStats}>
                  <Pressable 
                    style={styles.statItem} 
                    onPress={() => toggleSegmentLikeMutation.mutate()}
                    disabled={toggleSegmentLikeMutation.isPending}
                  >
                    <Ionicons 
                      name={activeSegment?.is_like ? "heart" : "heart-outline"} 
                      size={24} 
                      color={activeSegment?.is_like ? "#ff4d4f" : textColor} 
                    />
                    <Text style={[styles.statLabel, activeSegment?.is_like && { color: "#ff4d4f" }]}>
                      {activeSegment?.like_count || 0} 赞同
                    </Text>
                  </Pressable>
                  <View style={styles.statDivider} />
                  <Pressable 
                    style={styles.statItem}
                    onPress={() => {
                      setModalVisible(false);
                      const { seg_ids } = activeSegment || {};
                      const segId = Array.isArray(seg_ids) ? seg_ids[0] : seg_ids;
                      router.push(`/comments/${answerId}?type=answer${segId ? `&segmentId=${segId}` : ''}`);
                    }}
                  >
                    <Ionicons name="chatbubble-outline" size={22} color="#0084ff" />
                    <Text style={styles.statLabel}>{activeSegment?.comment_count || 0} 评论</Text>
                  </Pressable>
                </View>
                <Pressable 
                  style={styles.bubbleAction} 
                  onPress={() => {
                    setModalVisible(false);
                    router.push(`/comments/${answerId}?type=answer`);
                  }}
                >
                  <Text style={styles.bubbleActionText}>查看详细讨论</Text>
                  <Ionicons name="chevron-forward" size={16} color="#0084ff" />
                </Pressable>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  contentWrapper: {
    backgroundColor: 'transparent',
  },
  paragraphContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'transparent',
    overflow: 'visible',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginHorizontal: -8,
    marginVertical: 4,
  },
  activeParagraph: {
    backgroundColor: 'rgba(0, 132, 255, 0.1)',
    shadowColor: '#0084ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubbleContainer: {
    padding: 16,
    borderRadius: 20,
    width: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  bubbleStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  statLabel: {
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
  statDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(150,150,150,0.2)',
  },
  bubbleAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150,150,150,0.1)',
    backgroundColor: 'transparent',
  },
  bubbleActionText: {
    color: '#0084ff',
    fontSize: 14,
    fontWeight: 'bold',
    marginRight: 4,
  },
});
