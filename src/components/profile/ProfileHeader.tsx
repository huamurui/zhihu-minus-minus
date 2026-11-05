import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import type { ZhihuMember } from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { FollowButton } from '@/components/FollowButton';
import { InitialContentReveal } from '@/components/InitialContentReveal';
import { ProfileCover } from '@/components/profile/ProfileCover';
import { ProfileImage } from '@/components/profile/ProfileImage';
import { useRuntimeThemeColors } from '@/components/Themed';
import { useSettingsStore } from '@/store/useSettingsStore';
import { formatCount } from '@/utils/formatCount';
import { PROFILE_COVER_SCROLL_DISTANCE } from '@/utils/profileScroll';

interface ProfileHeaderProps {
  user: ZhihuMember;
  initialAvatar?: string;
  initialName?: string;
  initialHeadline?: string;
  isLoading?: boolean;
  isMe: boolean;
  followLoading: boolean;
  topInset: number;
  onFollow: () => void;
  onFollowers: () => void;
  onFollowing: () => void;
  onMutual: () => void;
}

/** The caller measures this whole header, including any expanded biography. */
const ProfileContentReveal =
  Platform.OS === 'android'
    ? InitialContentReveal
    : ({ children }: { children: React.ReactNode; ready?: boolean }) => (
        <>{children}</>
      );

export function ProfileHeader({
  user,
  initialAvatar,
  initialName,
  initialHeadline,
  isLoading = false,
  isMe,
  followLoading,
  topInset,
  onFollow,
  onFollowers,
  onFollowing,
  onMutual,
}: ProfileHeaderProps) {
  const colors = useRuntimeThemeColors();
  const fontSizeScale = useSettingsStore((state) => state.fontSizeScale);
  const lineHeightScale = useSettingsStore((state) => state.lineHeightScale);
  const styles = useMemo(
    () => createStyles(fontSizeScale, lineHeightScale),
    [fontSizeScale, lineHeightScale],
  );
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null);
  const identity = user.id || user.url_token || '';
  const isExpanded = expandedProfile === identity;
  const headline = (user.headline ?? initialHeadline)?.trim();
  const description = user.description?.trim();
  const hasDescription = !!description && description !== headline;
  const canExpandDescription =
    !!description &&
    (description.length > 110 || description.split('\n').length > 3);
  const avatarUri = user.avatar_url || initialAvatar;
  const name = user.name || initialName || '';
  const showLoadingDetails = Platform.OS === 'android' && isLoading;

  return (
    <View
      pointerEvents="box-none"
      style={{ backgroundColor: colors.background }}
    >
      <ProfileCover
        coverUrl={user.cover_url}
        height={topInset + PROFILE_COVER_SCROLL_DISTANCE}
      />

      <View pointerEvents="box-none" style={styles.body}>
        <View pointerEvents="box-none" style={styles.identityRow}>
          <View
            pointerEvents="none"
            style={[
              styles.avatarFrame,
              {
                borderColor: colors.background,
                backgroundColor: colors.backgroundSecondary,
              },
            ]}
            accessible
            accessibilityRole="image"
            accessibilityLabel={`${name || '用户'}的头像`}
          >
            {avatarUri ? (
              <ProfileImage uri={avatarUri} style={styles.avatar} />
            ) : (
              <Ionicons name="person" size={34} color={colors.textTertiary} />
            )}
          </View>
          {!isMe && !isLoading && (
            <FollowButton
              following={Boolean(user.is_following)}
              loading={followLoading}
              accessibilityLabel={
                user.is_following
                  ? `取消关注${user.name || '用户'}`
                  : `关注${user.name || '用户'}`
              }
              onPress={onFollow}
              style={{ minHeight: 40, marginBottom: 2 }}
            />
          )}
        </View>

        <Text
          pointerEvents="none"
          style={[
            styles.name,
            { color: colors.text },
            isLoading && !name
              ? { minHeight: (30 * fontSizeScale * lineHeightScale) / 1.5 }
              : undefined,
          ]}
        >
          {name}
        </Text>
        <ProfileContentReveal ready={!isLoading}>
          {user.url_token ? (
            <Text
              pointerEvents="none"
              style={[styles.handle, { color: colors.textSecondary }]}
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              @{user.url_token}
            </Text>
          ) : showLoadingDetails ? (
            <View
              style={styles.loadingHandle}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <View
                style={[
                  styles.loadingLine,
                  { width: '28%', backgroundColor: colors.border },
                ]}
              />
            </View>
          ) : null}
          {headline ? (
            <Text
              pointerEvents="none"
              style={[styles.headline, { color: colors.text }]}
            >
              {headline}
            </Text>
          ) : showLoadingDetails ? (
            <View
              style={styles.loadingHeadline}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <View
                style={[
                  styles.loadingLine,
                  { width: '65%', backgroundColor: colors.border },
                ]}
              />
            </View>
          ) : null}
          {hasDescription && (
            <View pointerEvents="box-none" style={styles.descriptionBlock}>
              <Text
                pointerEvents="none"
                style={[styles.description, { color: colors.textSecondary }]}
                numberOfLines={
                  canExpandDescription && !isExpanded ? 3 : undefined
                }
              >
                {description}
              </Text>
              {canExpandDescription && (
                <BouncyButton
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isExpanded }}
                  onPress={() =>
                    setExpandedProfile(isExpanded ? null : identity)
                  }
                  style={styles.expandButton}
                >
                  <Text style={[styles.expandText, { color: colors.link }]}>
                    {isExpanded ? '收起简介' : '展开简介'}
                  </Text>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={13}
                    color={colors.link}
                  />
                </BouncyButton>
              )}
            </View>
          )}
          {showLoadingDetails && !hasDescription ? (
            <View
              style={styles.loadingDescription}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <View
                style={[
                  styles.loadingLine,
                  { width: '85%', backgroundColor: colors.border },
                ]}
              />
              <View
                style={[
                  styles.loadingLine,
                  { width: '52%', backgroundColor: colors.border },
                ]}
              />
            </View>
          ) : null}

          {isLoading ? (
            <View
              pointerEvents="none"
              style={styles.stats}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <View style={styles.stat} />
            </View>
          ) : (
            <View pointerEvents="box-none" style={styles.stats}>
              <BouncyButton
                accessibilityRole="button"
                accessibilityLabel={`${user.following_count || 0} 关注`}
                onPress={onFollowing}
                style={styles.stat}
              >
                <Text
                  style={[styles.statText, { color: colors.textSecondary }]}
                >
                  <Text style={[styles.statValue, { color: colors.text }]}>
                    {formatCount(user.following_count)}
                  </Text>{' '}
                  关注
                </Text>
              </BouncyButton>
              <BouncyButton
                accessibilityRole="button"
                accessibilityLabel={`${user.follower_count || 0} 关注者`}
                onPress={onFollowers}
                style={styles.stat}
              >
                <Text
                  style={[styles.statText, { color: colors.textSecondary }]}
                >
                  <Text style={[styles.statValue, { color: colors.text }]}>
                    {formatCount(user.follower_count)}
                  </Text>{' '}
                  关注者
                </Text>
              </BouncyButton>
              <View pointerEvents="none" style={styles.stat}>
                <Text
                  style={[styles.statText, { color: colors.textSecondary }]}
                  accessibilityLabel={`${user.voteup_count || 0} 获赞`}
                >
                  <Text style={[styles.statValue, { color: colors.text }]}>
                    {formatCount(user.voteup_count)}
                  </Text>{' '}
                  获赞
                </Text>
              </View>
            </View>
          )}

          {!isMe && (user.mutual_followees_count || 0) > 0 && (
            <BouncyButton
              accessibilityRole="button"
              accessibilityLabel={`${user.mutual_followees_count} 位共同关注`}
              onPress={onMutual}
              style={styles.mutual}
            >
              <Ionicons
                name="people-outline"
                size={16}
                color={colors.textSecondary}
              />
              <Text
                style={[styles.mutualText, { color: colors.textSecondary }]}
              >
                {formatCount(user.mutual_followees_count)} 位共同关注
              </Text>
              <Ionicons
                name="chevron-forward"
                size={13}
                color={colors.textTertiary}
              />
            </BouncyButton>
          )}
        </ProfileContentReveal>
      </View>
    </View>
  );
}

function createStyles(fontScale: number, lineHeightScale: number) {
  const type = (fontSize: number, lineHeight: number) => ({
    fontSize: fontSize * fontScale,
    lineHeight: (lineHeight * fontScale * lineHeightScale) / 1.5,
  });
  return StyleSheet.create({
    body: { paddingHorizontal: 20, paddingBottom: 6 },
    identityRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      gap: 12,
      marginTop: -40,
      marginBottom: 10,
    },
    avatarFrame: {
      width: 88,
      height: 88,
      borderRadius: 44,
      borderWidth: 4,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
      flexShrink: 0,
    },
    avatar: { width: 80, height: 80, borderRadius: 40 },
    name: { ...type(24, 30), fontWeight: '800', letterSpacing: -0.4 },
    handle: { ...type(13, 18), marginTop: 2 },
    headline: { ...type(14, 22), marginTop: 10 },
    loadingLine: { height: 8 * fontScale, borderRadius: 4, opacity: 0.45 },
    loadingHandle: {
      height: type(13, 18).lineHeight,
      marginTop: 2,
      justifyContent: 'center',
    },
    loadingHeadline: {
      height: type(14, 22).lineHeight,
      marginTop: 10,
      justifyContent: 'center',
    },
    loadingDescription: {
      height: type(13, 20).lineHeight * 2,
      marginTop: 7,
      justifyContent: 'space-around',
    },
    descriptionBlock: { marginTop: 7 },
    description: type(13, 20),
    expandButton: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 3,
      minHeight: 40,
    },
    expandText: type(12, 18),
    stats: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: 18,
      marginTop: 5,
    },
    stat: { minHeight: 44, justifyContent: 'center', paddingVertical: 8 },
    statText: type(13, 20),
    statValue: { fontWeight: '700' },
    mutual: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      minHeight: 40,
      gap: 6,
      paddingVertical: 5,
    },
    mutualText: { ...type(12, 18), flexShrink: 1 },
  });
}
