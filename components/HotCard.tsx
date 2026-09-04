import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { SharedTransition } from 'react-native-reanimated';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { colors } from '@/constants/designTokens';
import { useAuthStore } from '@/store/useAuthStore';
import { BouncyButton } from './BouncyButton';
import { Text, View } from './Themed';

const _slowTransition = SharedTransition.duration(600);

export interface HotItem {
  id: string;
  questionId: string;
  title: string;
  excerpt: string;
  image: string | null;
  hotValue: string;
  rank: number;
  answerCount?: number;
  labelArea?: {
    type: string;
    trend?: number;
    text?: string;
    night_color?: string;
    normal_color?: string;
  } | null;
}

export const HotCard = ({ item }: { item: HotItem }) => {
  const router = useRouter();
  const { cookies } = useAuthStore();
  const colorScheme = useColorScheme();
  const isGuest = !cookies;

  const _isTop3 = item.rank <= 3;

  // Custom Rank Colors
  const rankBgColor =
    item.rank === 1
      ? colors.light.hotRankFirst
      : item.rank === 2
        ? colors.light.hotRankSecond
        : item.rank === 3
          ? colors.light.hotRankThird
          : Colors[colorScheme].backgroundTertiary;
  const rankTextColor =
    item.rank <= 3
      ? colors[colorScheme].textInverse
      : Colors[colorScheme].textSecondary;

  // Dynamic Label Style
  const labelColor =
    colorScheme === 'dark'
      ? item.labelArea?.night_color || colors.light.hotLabel
      : item.labelArea?.normal_color || colors.light.hotLabel;

  return (
    <BouncyButton
      onPress={() => {
        if (isGuest) {
          router.push({
            pathname: '/guest/detail',
            params: {
              item: JSON.stringify({
                id: item.id,
                title: item.title,
                excerpt: item.excerpt,
                image: item.image,
                hotValue: item.hotValue,
                rank: item.rank,
                type: 'questions',
              }),
            },
          } as any);
        } else {
          router.push(`/question/${item.questionId}`);
        }
      }}
      style={{
        backgroundColor: Colors[colorScheme].backgroundSecondary,
        borderRadius: 14,
        shadowColor: colors[colorScheme].cardShadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 10,
        elevation: 3,
      }}
      className="p-4 mb-3 mx-4 "
    >
      <View className="flex-col">
        <View className="flex-row">
          <View className="flex-1 bg-transparent pr-4">
            {/* Title & Rank Badge */}
            <View className="flex-row bg-transparent mb-1">
              <View
                className="w-[20px] h-[20px] rounded-[4px] items-center justify-center mr-2 mt-0.5"
                style={{ backgroundColor: rankBgColor }}
              >
                <Text
                  className="font-extrabold text-[11px]"
                  style={{ color: rankTextColor }}
                >
                  {item.rank}
                </Text>
              </View>
              <Text
                className="text-[17px] font-bold leading-[25px] text-foreground dark:text-foreground-dark flex-1"
                numberOfLines={4}
              >
                {item.title}
              </Text>
            </View>
          </View>

          {/* Image Area */}
          {item.image && (
            <View className="justify-center bg-transparent ml-auto">
              <Animated.Image
                source={{ uri: item.image }}
                className="w-[100px] h-[90px] rounded-[10px]"
                sharedTransitionTag={`image-${item.id}`}
                style={{
                  borderWidth: 0.5,
                  borderColor: 'rgba(0,0,0,0.05)',
                }}
              />
            </View>
          )}
        </View>
        {/* Bottom Info Bar */}
        <View className="flex-row items-center mt-auto pt-2 bg-transparent flex-wrap">
          {item.labelArea &&
            item.labelArea.type === 'text' &&
            item.labelArea.text && (
              <View
                className="px-1.5 py-[2px] rounded mr-2"
                style={{ backgroundColor: `${labelColor}15` }}
              >
                <Text
                  className="text-[11px] font-bold"
                  style={{ color: labelColor }}
                >
                  {item.labelArea.text}
                </Text>
              </View>
            )}
          {item.labelArea && item.labelArea.type === 'trend' && (
            <View
              className="flex-row items-center px-1.5 py-[2px] rounded mr-2"
              style={{ backgroundColor: `${labelColor}15` }}
            >
              <Ionicons name="trending-up" size={12} color={labelColor} />
            </View>
          )}

          {/* 热和新都没有的时候占位 */}
          {(!item.labelArea ||
            (!item.labelArea.type &&
              !item.labelArea.text &&
              !item.labelArea.trend)) && (
            <View
              className="flex-row items-center mt-auto pt-2 bg-transparent flex-wrap"
              style={{ marginRight: 32 }}
            ></View>
          )}

          {item.hotValue ? (
            <Text
              className="text-[12px] font-medium mr-2"
              style={{ color: colors.light.hotLabel }}
            >
              {item.hotValue}
            </Text>
          ) : null}

          {item.answerCount ? (
            <Text className="text-[12px] text-secondary dark:text-secondary-dark font-medium">
              {item.answerCount} 个回答
            </Text>
          ) : null}
        </View>
      </View>
    </BouncyButton>
  );
};
