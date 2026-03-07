import { Text, View } from '@/components/Themed';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

export const CreationCard = ({ item, type, onPress, excerpt }: {
  item: any,
  type: 'answer' | 'article' | 'question' | 'pin' | 'video',
  onPress?: () => void,
  excerpt?: string
}) => {
  const router = useRouter();
  const [expanded, setExpanded] = React.useState(false);

  const handlePress = () => {
    if (type === 'pin') {
      setExpanded(!expanded);
      return;
    }
    if (onPress) {
      onPress();
      return;
    }
    if (type === 'video') {
      router.push({ pathname: '/video/[id]', params: { id: item.id } } as any);
    } else {
      router.push({ pathname: `/${type}/[id]`, params: { id: item.id } } as any);
    }
  };

  const getFullContent = () => {
    if (!item) return '';
    if (type === 'pin' && Array.isArray(item.content)) {
      return item.content
        .map((c: any) => {
          if (c.type === 'text') return c.content;
          if (c.type === 'link_card') return `[链接: ${c.data_draft_title || '查看详情'}]`;
          return '';
        })
        .join('\n')
        .replace(/<[^>]+>/g, '');
    }
    const content = item.content || item.excerpt || '';
    if (typeof content === 'string') {
      return content.replace(/<[^>]+>/g, '');
    }
    return '';
  };

  const getExcerpt = () => {
    if (excerpt !== undefined) return excerpt;
    if (!item) return '';

    if (type === 'pin') {
      if (Array.isArray(item.content)) {
        return item.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.content)
          .join('')
          .replace(/<[^>]+>/g, '')
          .substring(0, 100);
      }
      if (typeof item.content === 'string') {
        return item.content.replace(/<[^>]+>/g, '').substring(0, 100);
      }
    }

    const content = item.excerpt || item.content || '';
    if (typeof content === 'string') {
      return content.replace(/<[^>]+>/g, '').substring(0, 100);
    }
    return '';
  };

  const getTitle = () => {
    if (type === 'pin') return '发布了想法';
    if (type === 'video') return item.title || '发布了视频';
    return item.title || item.question?.title || '未知内容';
  };

  const content = expanded ? getFullContent() : getExcerpt();
  const showExpandButton = !expanded && getFullContent().length > 100;

  return (
    <Pressable onPress={handlePress}>
      <View type="surface" style={styles.card}>
        <Text style={styles.title} numberOfLines={expanded ? undefined : 2}>
          {getTitle()}
        </Text>
        <View style={{ backgroundColor: 'transparent' }}>
          <Text type="secondary" style={styles.excerpt} numberOfLines={expanded ? undefined : 3}>
            {content}
          </Text>
          {showExpandButton && (
            <Pressable onPress={() => setExpanded(true)} style={styles.expandBtn}>
              <Text style={styles.expandText}>展开全文</Text>
            </Pressable>
          )}
          {expanded && (
            <Pressable onPress={() => setExpanded(false)} style={styles.expandBtn}>
              <Text style={styles.expandText}>收起</Text>
            </Pressable>
          )}
        </View>
        <View style={[styles.footer, { backgroundColor: 'transparent' }]}>
          <Text type="secondary" style={styles.statText}>
            {type === 'question'
              ? `${item.answer_count || 0} 回答 · ${item.follower_count || 0} 关注`
              : `${item.voteup_count || item.reaction_count || 0} 赞同 · ${item.comment_count || 0} 评论`
            }
          </Text>
          <Text type="secondary" style={styles.statText}>
            {item.updated_time || item.updated || item.created_time || item.created
              ? new Date((item.updated_time || item.updated || item.created_time || item.created) * 1000).toLocaleDateString()
              : ''}
          </Text>
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
  statText: { fontSize: 12 },
  expandBtn: { marginTop: 8 },
  expandText: { fontSize: 14, color: '#007AFF' }
});