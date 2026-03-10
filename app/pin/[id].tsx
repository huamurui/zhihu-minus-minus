import { getPin } from '@/api/zhihu/pin';
import { followMember, unfollowMember } from '@/api/zhihu/member';
import { LikeButton } from '@/components/LikeButton';
import { Text, View, useThemeColor } from '@/components/Themed';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef } from 'react';
import { ActivityIndicator, Animated, Image, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import RenderHtml from 'react-native-render-html';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PinDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const queryClient = useQueryClient();
  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({}, 'border');
  const backgroundColor = useThemeColor({}, 'background');

  // 动画相关
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerVisible = useRef(new Animated.Value(0)).current;

  const { data: pin, isLoading } = useQuery({
    queryKey: ['pin-detail', id],
    queryFn: () => getPin(id as string)
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      if (pin?.author?.is_following) {
        return unfollowMember(pin.author.url_token || pin.author.id);
      } else {
        return followMember(pin.author.url_token || pin.author.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pin-detail', id] });
    }
  });

  const goToProfile = () => {
    const token = pin?.author?.url_token || pin?.author?.id;
    if (token) {
      router.push(`/user/${token}`);
    }
  };

  if (isLoading) return (
    <View type="default" style={styles.center}>
      <ActivityIndicator size="large" color="#0084ff" />
      <Text type="secondary" style={{ marginTop: 10 }}>载入想法中...喵</Text>
    </View>
  );

  return (
    <View type="default" style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* 1. Header */}
      <View style={[styles.header, { paddingTop: insets.top, backgroundColor, borderBottomColor: borderColor }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color={textColor} />
        </Pressable>
        <Text style={styles.headerTitle}>想法详情</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.container}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
      >
        {/* 作者信息栏 */}
        <View style={styles.authorSection}>
          <Pressable onPress={goToProfile} style={styles.authorMain}>
            <Image source={{ uri: pin?.author?.avatar_url }} style={styles.avatar} />
            <View style={styles.authorInfo}>
              <Text style={styles.authorName}>{pin?.author?.name}</Text>
              <Text type="secondary" style={styles.authorHeadline} numberOfLines={1}>{pin?.author?.headline}</Text>
            </View>
          </Pressable>
          <Pressable
            style={[styles.followBtn, pin?.author?.is_following && styles.followBtnActive]}
            onPress={() => followMutation.mutate()}
            disabled={followMutation.isPending}
          >
            <Text style={[styles.followBtnText, pin?.author?.is_following && styles.followBtnTextActive]}>
              {pin?.author?.is_following ? '已关注' : '关注'}
            </Text>
          </Pressable>
        </View>

        {/* 想法详情内容 */}
        <View style={styles.contentBody}>
          <RenderHtml
            contentWidth={width - 40}
            source={{ html: pin?.content_html || '' }}
            tagsStyles={{
              div: { color: textColor, fontSize: 18, lineHeight: 28 },
              p: { color: textColor, fontSize: 18, lineHeight: 28, marginBottom: 15 },
              img: { borderRadius: 12, marginVertical: 10 },
              span: { color: textColor },
            }}
          />
          
          {/* 如果有图片数组但是 HTML 里没渲染出来，可以在这里补充 */}
          
          <Text type="secondary" style={styles.publishDate}>
            发布于 {pin?.created ? new Date(pin.created * 1000).toLocaleString() : '不久前'}
          </Text>
        </View>
      </ScrollView>

      {/* 底部吸底交互栏 */}
      <View
        type="surface"
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
            height: 60 + (insets.bottom > 0 ? insets.bottom : 15)
          }
        ]}
      >
        <View style={styles.voteBox}>
          <LikeButton
            id={pin?.id}
            count={pin?.like_count || 0}
            voted={pin?.relationship?.voting}
            type="pins"
          />
        </View>

        <View style={styles.footerRight}>
          <Pressable style={styles.footerAction} onPress={() => router.push(`/comments/${id}?type=pin`)}>
            <Ionicons name="chatbubble-outline" size={22} color="#888" />
            <Text type="secondary" style={styles.actionCount}>{pin?.comment_count}</Text>
          </Pressable>
          <Pressable style={styles.footerAction}>
            <Ionicons name="share-social-outline" size={22} color="#888" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    height: 90,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontWeight: 'bold' },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  // 作者栏
  authorSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    justifyContent: 'space-between'
  },
  authorMain: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  authorInfo: { marginLeft: 12, flex: 1 },
  authorName: { fontSize: 16, fontWeight: 'bold' },
  authorHeadline: { fontSize: 13, color: '#999', marginTop: 2 },
  followBtn: {
    backgroundColor: '#0084ff15',
    paddingHorizontal: 15,
    paddingVertical: 6,
    borderRadius: 20
  },
  followBtnActive: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#eee'
  },
  followBtnText: { color: '#0084ff', fontWeight: 'bold', fontSize: 14 },
  followBtnTextActive: { color: '#999' },
  // 正文
  contentBody: { paddingHorizontal: 20 },
  publishDate: { color: '#bbb', fontSize: 13, marginTop: 30, fontStyle: 'italic' },
  // 底部工具栏
  footer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  voteBox: { flexDirection: 'row', alignItems: 'center' },
  footerRight: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  footerAction: {
    alignItems: 'center',
    marginLeft: 22,
    flexDirection: 'row'
  },
  actionCount: { marginLeft: 4, color: '#888', fontSize: 13 }
});
