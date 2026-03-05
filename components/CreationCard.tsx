import { useThemeStore } from '@/store/useThemeStore';
import { StyleSheet, Text, View } from 'react-native';

export const CreationCard = ({ item, type }: { item: any, type: 'answer' | 'article' }) => {
  const { isDark } = useThemeStore();
  const theme = {
    card: isDark ? '#1a1a1a' : '#fff',
    text: isDark ? '#eee' : '#1a1a1a',
    sub: '#888'
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
        {item.title || item.question?.title}
      </Text>
      <Text style={[styles.excerpt, { color: theme.sub }]} numberOfLines={3}>
        {item.excerpt?.replace(/<[^>]+>/g, '')}
      </Text>
      <View style={styles.footer}>
        <Text style={styles.statText}>{item.voteup_count} 赞同 · {item.comment_count} 评论</Text>
        <Text style={styles.statText}>{item.updated_time ? new Date(item.updated_time * 1000).toLocaleDateString() : ''}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { padding: 15, marginBottom: 2, marginTop: 1 },
  title: { fontSize: 16, fontWeight: 'bold', marginBottom: 8, lineHeight: 22 },
  excerpt: { fontSize: 14, lineHeight: 20 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  statText: { fontSize: 12, color: '#999' }
});