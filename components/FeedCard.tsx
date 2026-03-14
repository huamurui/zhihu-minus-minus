import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image, Pressable } from 'react-native';
import Animated, { SharedTransition } from 'react-native-reanimated';
import { LikeButton } from './LikeButton';
import { Text, View } from './Themed';

const slowTransition = SharedTransition.duration(600);

export const FeedCard = ({ item }: { item: any }) => {
  const router = useRouter();
  const isQuestionType = item.type === 'questions';

  return (
    <View
      type="surface"
      className="p-4 mb-2"
      style={isQuestionType ? { paddingBottom: 10 } : undefined}
    >
      {/* 动态动作提示 (针对关注流) */}
      {item.actionText && (
        <Text
          type="secondary"
          className="text-[13px] mb-2 text-tertiary dark:text-tertiary-dark"
        >
          {item.actionText}
        </Text>
      )}

      {/* 热区1：点击作者头像/姓名 -> 用户页 */}
      <Pressable
        onPress={() =>
          router.push({
            pathname: `/user/${item.author.url_token || item.author.id}`,
            params: { avatar: item.author.avatar },
          } as any)
        }
        className="flex-row items-center mb-2"
      >
        <Animated.Image
          source={{ uri: item.author.avatar }}
          className="w-[22px] h-[22px] rounded-full"
          sharedTransitionTag={`avatar-${item.author.url_token || item.author.id}`}
        />
        <Text type="secondary" className="ml-2 text-[13px]">
          {item.author.name}
        </Text>
      </Pressable>

      {/* 热区2：点击标题 -> 详情页 */}
      {item.title ? (
        <Pressable
          onPress={() => {
            if (item.type === 'articles') {
              router.push({
                pathname: `/article/${item.id}`,
                params: { title: item.title },
              } as any);
              return;
            }
            const id =
              isQuestionType || !item.questionId ? item.id : item.questionId;
            router.push({
              pathname: `/question/${id}`,
              params: { title: item.title },
            } as any);
          }}
          className="mb-1.5"
        >
          <Animated.View
            sharedTransitionTag={`title-${item.questionId || item.id}`}
            sharedTransitionStyle={slowTransition}
          >
            <Text
              className="text-lg font-bold leading-6 text-foreground dark:text-foreground-dark"
              numberOfLines={2}
            >
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
            params: { title: item.title, questionId: item.questionId },
          } as any);
        }}
        className="flex-row mt-1"
      >
        <View className="flex-1 bg-transparent">
          <Text
            type="secondary"
            className="text-[15px] leading-[22px]"
            numberOfLines={3}
          >
            {item.excerpt}
          </Text>
        </View>
        {item.image && (
          <Animated.Image
            source={{ uri: item.image }}
            className="w-[100px] h-[70px] rounded-md ml-2.5"
            sharedTransitionTag={`image-${item.id}`}
          />
        )}
      </Pressable>

      {/* 热区4：底部操作栏 - 问题关注类动态不显示 */}
      {!isQuestionType && (
        <View className="flex-row mt-4 items-center bg-transparent">
          <LikeButton
            id={item.id}
            count={item.voteCount}
            voted={item.voted}
            type={item.type as any}
          />

          {/* 点击评论按钮 -> 评论页 */}
          <Pressable
            onPress={() => {
              const type =
                item.type === 'articles'
                  ? 'article'
                  : item.type === 'answers'
                    ? 'answer'
                    : item.type.slice(0, -1);
              router.push(
                `/comments/${item.id}?type=${type}&count=${item.commentCount}`,
              );
            }}
            className="flex-row items-center ml-5"
          >
            <Ionicons name="chatbubble-outline" size={16} color="#888" />
            <Text className="text-[#888] ml-1 text-[13px]">
              {item.commentCount} 评论
            </Text>
          </Pressable>

          <Pressable className="ml-auto">
            <Ionicons name="ellipsis-horizontal" size={16} color="#888" />
          </Pressable>
        </View>
      )}
    </View>
  );
};
