import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet } from 'react-native';
import Animated, { SharedTransition } from 'react-native-reanimated';
import { LikeButton } from './LikeButton';
import { Text, View } from './Themed';

const slowTransition = SharedTransition.duration(600);

export const FeedCard = ({ item }: { item: any }) => {
  const router = useRouter();
  const isQuestionType = item.type === 'questions';

  return (
    <View type="surface" style={[styles.card, isQuestionType && { paddingBottom: 10 }]}>
      {/* 动态动作提示 (针对关注流) */}
      {item.actionText && (
        <Text type="secondary" style={styles.actionTextRow}>
          {item.actionText}
        </Text>
      )}

      {/* 热区1：点击作者头像/姓名 -> 用户页 */}
      <Pressable
        onPress={() => router.push({
          pathname: `/user/${item.author.url_token || item.author.id}`,
          params: { avatar: item.author.avatar }
        } as any)}
        style={styles.authorRow}
      >
        <Animated.Image 
          source={{ uri: item.author.avatar }} 
          style={styles.avatar} 
          sharedTransitionTag={`avatar-${item.author.url_token || item.author.id}`}
        />
        <Text type="secondary" style={styles.authorName}>{item.author.name}</Text>
      </Pressable>

      {/* 热区2：点击标题 -> 详情页 */}
      {item.title ? (
        <Pressable 
          onPress={() => {
            const id = isQuestionType || !item.questionId ? item.id : item.questionId;
            router.push({
              pathname: `/question/${id}`,
              params: { title: item.title }
            } as any);
          }} 
          style={styles.titleRow}
        >
          <Animated.View 
            sharedTransitionTag={`title-${item.questionId || item.id}`}
            sharedTransitionStyle={slowTransition}
          >
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
          </Animated.View>
        </Pressable>
      ) : null}

      {/* 热区3：点击内容摘要 -> 详情页 */}
      <Pressable 
        onPress={() => {
          const routeType = item.type.slice(0, -1);
          router.push({
            pathname: `/${routeType}/${item.id}`,
            params: { title: item.title, questionId: item.questionId }
          } as any);
        }} 
        style={styles.contentRow}
      >
        <View style={{ flex: 1, backgroundColor: 'transparent' }}>
          <Text type="secondary" style={styles.excerpt} numberOfLines={3}>
            {item.excerpt}
          </Text>
        </View>
        {item.image && (
          <Animated.Image 
            source={{ uri: item.image }} 
            style={styles.cover} 
            sharedTransitionTag={`image-${item.id}`}
          />
        )}
      </Pressable>

      {/* 热区4：底部操作栏 - 问题关注类动态不显示 */}
      {!isQuestionType && (
        <View style={[styles.footer, { backgroundColor: 'transparent' }]}>
          <LikeButton
            id={item.id}
            count={item.voteCount}
            voted={item.voted}
            type={item.type}
          />

          {/* 点击评论按钮 -> 评论页 */}
          <Pressable
            onPress={() => router.push(`/comments/${item.id}` as any)}
            style={styles.commentBtn}
          >
            <Ionicons name="chatbubble-outline" size={16} color="#888" />
            <Text style={styles.actionText}>{item.commentCount} 评论</Text>
          </Pressable>

          <Pressable style={styles.moreBtn}>
            <Ionicons name="ellipsis-horizontal" size={16} color="#888" />
          </Pressable>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { padding: 15, marginBottom: 8 },
  authorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  avatar: { width: 22, height: 22, borderRadius: 11 },
  authorName: { marginLeft: 8, fontSize: 13 },
  titleRow: { marginBottom: 6 },
  title: { fontSize: 18, fontWeight: 'bold', lineHeight: 24 },
  contentRow: { flexDirection: 'row', marginTop: 4 },
  excerpt: { fontSize: 15, lineHeight: 22 },
  cover: { width: 100, height: 70, borderRadius: 6, marginLeft: 10 },
  footer: { flexDirection: 'row', marginTop: 15, alignItems: 'center' },
  commentBtn: { flexDirection: 'row', alignItems: 'center', marginLeft: 20 },
  actionText: { color: '#888', marginLeft: 4, fontSize: 13 },
  actionTextRow: { fontSize: 13, marginBottom: 8, color: '#999' },
  moreBtn: { marginLeft: 'auto' }
});