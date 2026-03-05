import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet } from 'react-native';
import { LikeButton } from './LikeButton';
import { Text, View } from './Themed';

export const FeedCard = ({ item }: { item: any }) => {
  const router = useRouter();

  return (
    <View type="surface" style={styles.card}>
      {/* 热区1：点击作者头像/姓名 -> 用户页 */}
      <Pressable
        onPress={() => router.push(`/user/${item.author.id}`)}
        style={styles.authorRow}
      >
        <Image source={{ uri: item.author.avatar }} style={styles.avatar} />
        <Text type="secondary" style={styles.authorName}>{item.author.name}</Text>
      </Pressable>
      {/* 热区2：点击标题 -> 问题详情页 */}
      {/* todo
        questionId 可能在不同接口里字段名不一样，需要适配,有些地方可能不存在，要好好找存在的，现在应用里使用的接口乱七八糟，之后考虑重新一个个看看知乎的接口
      */}
      <Pressable onPress={() => router.push(`/question/${item.questionId}`)} style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
      </Pressable>

      {/* 热区3：点击内容摘要 -> 回答详情页 */}
      <Pressable onPress={() => router.push(`/answer/${item.id}`)} style={styles.contentRow}>
        <View style={{ flex: 1, backgroundColor: 'transparent' }}>
          <Text type="secondary" style={styles.excerpt} numberOfLines={3}>
            {item.excerpt}
          </Text>
        </View>
        {item.image && <Image source={{ uri: item.image }} style={styles.cover} />}
      </Pressable>

      {/* 热区4：底部操作栏 */}
      <View style={[styles.footer, { backgroundColor: 'transparent' }]}>
        <LikeButton count={item.voteCount} />

        {/* 点击评论按钮 -> 评论页 */}
        <Pressable
          onPress={() => router.push(`/comments/${item.id}`)}
          style={styles.commentBtn}
        >
          <Ionicons name="chatbubble-outline" size={16} color="#888" />
          <Text style={styles.actionText}>{item.commentCount} 评论</Text>
        </Pressable>

        <Pressable style={styles.moreBtn}>
          <Ionicons name="ellipsis-horizontal" size={16} color="#888" />
        </Pressable>
      </View>
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
  moreBtn: { marginLeft: 'auto' }
});