import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useRef } from 'react';
import { Platform, StyleSheet, View, type ViewInstance } from 'react-native';
import Animated from 'react-native-reanimated';
import { useColorScheme } from '@/components/useColorScheme';
import { colors } from '@/constants/designTokens';
import {
  useTitleTransition,
  useTitleTransitionSource,
} from '@/features/adaptive-layout/TitleTransition';
import { usePaneRouter as useRouter } from '@/features/adaptive-layout/usePaneRouter';
import { useAuthStore } from '@/store/useAuthStore';
import { getCachedImageSource } from '@/utils/imageSource';
import { BouncyButton } from './BouncyButton';
import { useContentCardSurface } from './contentCardSurface';
import { Text } from './Themed';

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

/** 前三名用方块角标，颜色由深到浅；之后的排名是橙色数字。 */
const RANK_BADGE_COLORS = [
  colors.light.hotRankFirst,
  colors.light.hotRankSecond,
  colors.light.hotRankThird,
];

const HotCardComponent = ({ item }: { item: HotItem }) => {
  const router = useRouter();
  const transitionTitle = useTitleTransition();
  const titleRef = useRef<ViewInstance>(null);
  const titleSource = useTitleTransitionSource(item.id);
  const currentId = useRef(item.id);
  currentId.current = item.id;
  const { cookies } = useAuthStore();
  const colorScheme = useColorScheme();
  const surface = useContentCardSurface({ radius: 14, gap: 8 });
  const isGuest = !cookies;

  const rankBadgeColor = RANK_BADGE_COLORS[item.rank - 1];
  const labelColor =
    colorScheme === 'dark'
      ? item.labelArea?.night_color || colors.light.hotLabel
      : item.labelArea?.normal_color || colors.light.hotLabel;
  const imageSource = useMemo(
    () => getCachedImageSource(item.image),
    [item.image],
  );
  const labelText =
    item.labelArea?.type === 'text' ? item.labelArea.text : undefined;
  const hasTrend = item.labelArea?.type === 'trend';
  const sourceTitle = <Text style={styles.title}>{item.title}</Text>;

  return (
    <BouncyButton
      accessibilityRole="button"
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
          });
        } else if (Platform.OS === 'android') {
          transitionTitle(
            titleRef,
            item.questionId,
            item.title,
            () => {
              if (currentId.current !== item.id) return;
              router.push({
                pathname: '/question/[id]',
                params: { id: item.questionId, title: item.title },
              });
            },
            () => currentId.current === item.id,
            titleSource.onSourceHiddenChange,
            sourceTitle,
          );
        } else {
          router.push({
            pathname: '/question/[id]',
            params: { id: item.questionId, title: item.title },
          });
        }
      }}
      style={[styles.row, surface]}
    >
      <View style={styles.rankColumn}>
        {rankBadgeColor ? (
          <View style={[styles.rankBadge, { backgroundColor: rankBadgeColor }]}>
            <Text style={styles.rankBadgeText}>{item.rank}</Text>
          </View>
        ) : (
          <Text
            style={[styles.rank, { color: colors.light.hotLabel }]}
            numberOfLines={1}
          >
            {item.rank}
          </Text>
        )}
        {labelText ? (
          <View style={[styles.label, { borderColor: labelColor }]}>
            <Text style={[styles.labelText, { color: labelColor }]}>
              {labelText}
            </Text>
          </View>
        ) : null}
        {hasTrend ? (
          <View accessibilityLabel="热度上升" accessible style={styles.trend}>
            <Ionicons name="trending-up" size={13} color={labelColor} />
          </View>
        ) : null}
      </View>
      <View style={styles.textColumn}>
        <View
          ref={titleRef}
          collapsable={false}
          style={titleSource.hidden ? { opacity: 0 } : undefined}
        >
          {sourceTitle}
        </View>
        {item.hotValue ? (
          <Text type="secondary" style={styles.hotValue} numberOfLines={1}>
            {item.hotValue}
          </Text>
        ) : null}
      </View>
      {imageSource ? (
        <Animated.Image
          fadeDuration={0}
          source={imageSource}
          style={styles.image}
          resizeMode="cover"
          accessible={false}
        />
      ) : null}
    </BouncyButton>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rankColumn: {
    minWidth: 24,
    alignItems: 'center',
    gap: 4,
  },
  rankBadge: {
    minWidth: 20,
    minHeight: 20,
    paddingHorizontal: 2,
    paddingVertical: 1,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
  },
  // 显式传给 Themed.Text，确保它按实际字号和行高应用阅读偏好。
  rank: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  label: {
    paddingHorizontal: 2,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  labelText: { fontSize: 10, lineHeight: 14, fontWeight: '700' },
  trend: { alignItems: 'center' },
  textColumn: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  hotValue: { marginTop: 6, fontSize: 13 },
  image: {
    width: 60,
    height: 60,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.05)',
  },
});

export const HotCard = React.memo(
  HotCardComponent,
  (previous, next) =>
    previous.item.id === next.item.id &&
    previous.item.questionId === next.item.questionId &&
    previous.item.title === next.item.title &&
    previous.item.excerpt === next.item.excerpt &&
    previous.item.image === next.item.image &&
    previous.item.hotValue === next.item.hotValue &&
    previous.item.rank === next.item.rank &&
    previous.item.answerCount === next.item.answerCount &&
    previous.item.labelArea?.type === next.item.labelArea?.type &&
    previous.item.labelArea?.text === next.item.labelArea?.text &&
    previous.item.labelArea?.trend === next.item.labelArea?.trend &&
    previous.item.labelArea?.normal_color ===
      next.item.labelArea?.normal_color &&
    previous.item.labelArea?.night_color === next.item.labelArea?.night_color,
);
HotCard.displayName = 'HotCard';
