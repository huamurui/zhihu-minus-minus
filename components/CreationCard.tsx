import { Text, View } from '@/components/Themed';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

export const CreationCard = ({ item, type }: { item: any, type: 'answer' | 'article' | 'question' }) => {
  const router = useRouter();

  const handlePress = () => {
    router.push(`/${type}/${item.id}`);
  };

  return (
    <Pressable onPress={handlePress}>
      <View type="surface" style={styles.card}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title || item.question?.title || '未知内容'}
        </Text>
        <Text type="secondary" style={styles.excerpt} numberOfLines={3}>
          {item.excerpt?.replace(/<[^>]+>/g, '') || item.content?.replace(/<[^>]+>/g, '').substring(0, 100) || ''}
        </Text>
        <View style={[styles.footer, { backgroundColor: 'transparent' }]}>
          <Text type="secondary" style={styles.statText}>{item.voteup_count || 0} 赞同 · {item.comment_count || 0} 评论</Text>
          <Text type="secondary" style={styles.statText}>{item.updated_time ? new Date(item.updated_time * 1000).toLocaleDateString() : (item.created_time ? new Date(item.created_time * 1000).toLocaleDateString() : '')}</Text>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: { padding: 15, marginBottom: 2, marginTop: 1 },
  title: { fontSize: 16, fontWeight: 'bold', marginBottom: 8, lineHeight: 22 },
  excerpt: { fontSize: 14, lineHeight: 20 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  statText: { fontSize: 12 }
});