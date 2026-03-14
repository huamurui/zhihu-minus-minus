import { Text, View } from '@/components/Themed';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { LikeButton } from './LikeButton';

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
      router.push({ pathname: '/video/[id]', params: { id: item.id, title: item.title } } as any);
    } else {
      router.push({ 
        pathname: `/${type}/[id]`, 
        params: { 
          id: item.id, 
          title: item.title || item.question?.title,
          questionId: item.question?.id 
        } 
      } as any);
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
    <View type="surface" className="p-4 mb-0.5 mt-px">
      <Pressable onPress={handlePress}>
        <Animated.View sharedTransitionTag={`title-${item.question?.id || item.id}`}>
          <Text className="text-base font-bold mb-2 leading-[22px] text-foreground dark:text-foreground-dark" numberOfLines={expanded ? undefined : 2}>
            {getTitle()}
          </Text>
        </Animated.View>
        <View className="bg-transparent">
          <Text type="secondary" className="text-sm leading-5" numberOfLines={expanded ? undefined : 3}>
            {content}
          </Text>
          {showExpandButton && (
            <Pressable onPress={() => setExpanded(true)} className="mt-2">
              <Text className="text-sm text-primary">展开全文</Text>
            </Pressable>
          )}
          {expanded && (
            <Pressable onPress={() => setExpanded(false)} className="mt-2">
              <Text className="text-sm text-primary">收起</Text>
            </Pressable>
          )}
        </View>
      </Pressable>

      <View className="flex-row justify-between mt-4 items-center bg-transparent">
        {type !== 'question' && type !== 'video' ? (
          <View className="flex-row items-center bg-transparent">
            <LikeButton
              id={item.id}
              count={item.voteup_count || item.reaction_count || 0}
              voted={item.relationship?.voting || 0}
              type={type === 'article' ? 'articles' : type === 'pin' ? 'pins' : 'answers'}
            />
            <Pressable
              onPress={() => router.push(`/comments/${item.id}?type=${type}&count=${item.comment_count || 0}`)}
              className="flex-row items-center ml-2.5"
            >
              <Ionicons name="chatbubble-outline" size={16} color="#888" />
              <Text className="text-[#888] ml-1 text-[13px]">{item.comment_count || 0} 评论</Text>
            </Pressable>
          </View>
        ) : (
          <Text type="secondary" className="text-xs text-tertiary dark:text-tertiary-dark">
            {type === 'question'
              ? `${item.answer_count || 0} 回答 · ${item.follower_count || 0} 关注`
              : `${item.voteup_count || 0} 赞同 · ${item.comment_count || 0} 评论`
            }
          </Text>
        )}

        <Text type="secondary" className="text-xs text-tertiary dark:text-tertiary-dark ml-auto">
          {item.updated_time || item.updated || item.created_time || item.created
            ? new Date((item.updated_time || item.updated || item.created_time || item.created) * 1000).toLocaleDateString()
            : ''}
        </Text>
      </View>
    </View>
  );
};