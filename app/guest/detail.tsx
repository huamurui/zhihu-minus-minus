import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FeedItem } from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { ZhihuContent } from '@/features/rich-content';

export default function GuestDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const params = useLocalSearchParams();

  const textColor = Colors[colorScheme].text;
  const secondaryTextColor = Colors[colorScheme].textSecondary;
  const borderColor = Colors[colorScheme].border;
  const backgroundColor = Colors[colorScheme].background;
  const cardBg = Colors[colorScheme].backgroundSecondary;
  const tintColor = useThemeColor({}, 'primary');

  // 安全解析传递进来的 Feed 项数据
  const item = useMemo<FeedItem | null>(() => {
    try {
      if (params.item) {
        return JSON.parse(params.item as string);
      }
    } catch (e) {
      console.error('[GuestDetail] Failed to parse item data:', e);
    }
    return null;
  }, [params.item]);

  if (!item) {
    return (
      <View
        style={[styles.centerContainer, { backgroundColor }]}
        type="default"
      >
        <Stack.Screen options={{ headerShown: false }} />
        <Ionicons
          name="alert-circle-outline"
          size={48}
          color={secondaryTextColor}
        />
        <Text type="secondary" className="mt-3 text-center">
          加载预览失败喵
        </Text>
        <Pressable
          className="mt-6 px-6 py-2.5 rounded-full"
          style={{ backgroundColor: tintColor }}
          onPress={() => router.back()}
        >
          <Text className="text-white font-bold">返回上一页</Text>
        </Pressable>
      </View>
    );
  }

  // 判断卡片类型：问题、回答、文章或想法
  const isArticle = item.type === 'articles';
  const isPin = item.type === 'pins';
  const isAnswer = item.type === 'answers';
  const isVideo = item.type === 'videos';
  const isQuestion = item.type === 'questions';

  const typeLabel = isVideo
    ? '知乎视频'
    : isArticle
      ? '专栏文章'
      : isPin
        ? '精选想法'
        : isAnswer
          ? '知乎回答'
          : '热门问题';

  const routeType = isArticle
    ? 'article'
    : isPin
      ? 'pin'
      : isVideo
        ? 'video'
        : isQuestion
          ? 'question'
          : 'answer';

  const navigateToComments = () => {
    router.push(
      `/comments/${item.id}?type=${routeType}&count=${item.commentCount || 0}`,
    );
  };

  return (
    <View style={[styles.container, { backgroundColor }]} type="default">
      <Stack.Screen options={{ headerShown: false }} />

      {/* 顶部标题导航栏 */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top,
            backgroundColor,
            borderBottomColor: borderColor,
            borderBottomWidth: StyleSheet.hairlineWidth,
          },
        ]}
        className="flex-row items-center justify-between px-[15px]"
      >
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 justify-center items-center"
        >
          <Ionicons name="chevron-back" size={28} color={textColor} />
        </Pressable>
        <Text className="text-[17px] font-bold">游客预览</Text>
        <View
          className="px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${tintColor}15` }}
        >
          <Text
            className="text-[11px] font-medium"
            style={{ color: tintColor }}
          >
            {typeLabel}
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          entering={FadeIn.duration(400)}
          className="bg-transparent"
        >
          {/* 热榜排名的特殊处理 */}
          {item.rank && (
            <View className="flex-row px-5 pt-5 pb-2 bg-transparent items-center">
              <View
                className="w-6 h-6 rounded-md items-center justify-center mr-2"
                style={{ backgroundColor: item.rank <= 3 ? '#ff9607' : '#999' }}
              >
                <Text className="text-white text-xs font-bold">
                  {item.rank}
                </Text>
              </View>
              <Text type="secondary" className="text-xs">
                热榜排行 · 热度 {item.hotValue || '未知'}
              </Text>
            </View>
          )}

          {/* 1. 标题 (如果有) */}
          {item.title ? (
            <Text
              className="text-[22px] font-bold leading-8 px-5 pt-5 pb-3"
              style={{ color: textColor }}
            >
              {item.title}
            </Text>
          ) : null}

          {/* 2. 作者卡片 (如果有) */}
          {item.author ? (
            <View className="flex-row items-center px-5 py-3 bg-transparent">
              <Image
                source={{ uri: item.author.avatar }}
                className="w-10 h-10 rounded-full"
              />
              <View className="ml-3 flex-1 bg-transparent">
                <Text
                  className="text-[15px] font-bold"
                  style={{ color: textColor }}
                >
                  {item.author.name}
                </Text>
                {item.author.headline ? (
                  <Text
                    type="secondary"
                    className="text-xs mt-0.5"
                    numberOfLines={1}
                    style={{ color: secondaryTextColor }}
                  >
                    {item.author.headline}
                  </Text>
                ) : (
                  <Text
                    type="secondary"
                    className="text-xs mt-0.5"
                    style={{ color: secondaryTextColor }}
                  >
                    知乎优秀内容创作者
                  </Text>
                )}
              </View>
            </View>
          ) : null}

          {/* 2.5 获赞与评论数据展示栏 (在游客详情页展示当前卡片已缓存的数据) */}
          {((item.voteCount !== undefined && item.voteCount > 0) ||
            (item.commentCount !== undefined && item.commentCount > 0)) && (
            <View className="flex-row px-5 py-1 mb-2 bg-transparent gap-3 items-center">
              {item.voteCount !== undefined && item.voteCount > 0 && (
                <View
                  className="flex-row items-center px-3 py-1.5 rounded-full"
                  style={{ backgroundColor: `${tintColor}08` }}
                >
                  <Ionicons
                    name="caret-up-circle-outline"
                    size={15}
                    color={tintColor}
                  />
                  <Text
                    className="text-xs font-semibold ml-1"
                    style={{ color: tintColor }}
                  >
                    {item.voteCount} 赞同
                  </Text>
                </View>
              )}
              {!isVideo &&
                item.commentCount !== undefined &&
                item.commentCount > 0 && (
                  <BouncyButton
                    onPress={navigateToComments}
                    className="flex-row items-center px-3 py-1.5 rounded-full"
                    style={{ backgroundColor: `${secondaryTextColor}08` }}
                  >
                    <Ionicons
                      name="chatbubble-ellipses-outline"
                      size={14}
                      color={secondaryTextColor}
                    />
                    <Text
                      className="text-xs font-semibold ml-1"
                      style={{ color: secondaryTextColor }}
                    >
                      {item.commentCount} 评论
                    </Text>
                  </BouncyButton>
                )}
            </View>
          )}

          {/* 3. 卡片横幅图片 (如果有) */}
          {item.image && (
            <View className="px-5 my-3 rounded-lg overflow-hidden bg-transparent">
              <Image
                source={{ uri: item.image }}
                className="w-full h-[180px] rounded-lg"
                resizeMode="cover"
              />
            </View>
          )}

          {/* 4. 预览正文 (若存在完整 HTML 内容，使用原生 RenderHtml 渲染，否则退回到摘要) */}
          <View className="px-5 mt-3 bg-transparent">
            {item.content ? (
              <ZhihuContent
                content={
                  typeof item.content === 'string' ? item.content : undefined
                }
                contentArray={
                  Array.isArray(item.content) ? item.content : undefined
                }
                objectId={item.id}
                type={isArticle ? 'article' : isPin ? 'pin' : 'answer'}
                useNative={true}
              />
            ) : (
              <Text
                style={[
                  styles.excerptText,
                  { color: textColor, lineHeight: 28 },
                ]}
              >
                {item.excerpt || '暂无预览内容'}
              </Text>
            )}
          </View>

          {/* 4.5 查看全部评论大按钮 */}
          {!isVideo &&
            item.commentCount !== undefined &&
            item.commentCount > 0 && (
              <View className="px-5 mt-6 mb-2 bg-transparent">
                <BouncyButton
                  onPress={navigateToComments}
                  className="w-full h-12 rounded-xl flex-row items-center justify-center border"
                  style={{
                    borderColor: tintColor,
                    backgroundColor: `${tintColor}05`,
                  }}
                >
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={16}
                    color={tintColor}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    className="font-bold text-[14px]"
                    style={{ color: tintColor }}
                  >
                    查看全部 {item.commentCount} 条评论
                  </Text>
                </BouncyButton>
              </View>
            )}
        </Animated.View>

        {/* 5. 游客提示卡片 */}
        <Animated.View
          entering={FadeInDown.delay(100).duration(500)}
          className="mx-5 mt-8 p-6 rounded-[24px] items-center border"
          style={{
            backgroundColor: cardBg,
            borderColor,
          }}
        >
          {/* 闪耀或探索图标 */}
          <View
            className="w-12 h-12 rounded-full items-center justify-center mb-4"
            style={{ backgroundColor: `${tintColor}12` }}
          >
            <Ionicons name="sparkles-outline" size={22} color={tintColor} />
          </View>
          <Text
            type="secondary"
            className="text-[13px] text-center mb-6 leading-5 px-3"
            style={{ color: secondaryTextColor }}
          >
            录后后可以发表精彩热评、点赞优质回答，并一键关注您喜爱的创作者哦~
          </Text>

          {/* 登录按钮 */}
          <BouncyButton
            onPress={() => router.push('/login')}
            className="w-full h-12 rounded-full items-center justify-center mb-3.5"
            style={{ backgroundColor: tintColor }}
          >
            <Text className="text-white text-base font-bold">
              立即登录参与互动
            </Text>
          </BouncyButton>

          {/* 返回首页 */}
          <BouncyButton
            onPress={() => router.back()}
            className="w-full h-11 rounded-full items-center justify-center border"
            style={{
              borderColor,
              backgroundColor: 'transparent',
            }}
          >
            <Text
              style={{ color: secondaryTextColor }}
              className="text-sm font-semibold"
            >
              继续以游客身份浏览首页
            </Text>
          </BouncyButton>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    height: 56 + 32, // standard heights adjusted
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  excerptText: {
    fontSize: 17,
    letterSpacing: 0.3,
  },
});
