import { Ionicons } from '@expo/vector-icons';
import CookieManager from '@preeternal/react-native-cookie-manager';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMe, getMemberWithFallback } from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { BottomSheet } from '@/components/overlays/BottomSheet';
import { QueryErrorView } from '@/components/QueryErrorView';
import { Text, useThemeColor, View } from '@/components/Themed';
import { ThemeModeSelector } from '@/components/ThemeModeSelector';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useVerificationStore } from '@/store/useVerificationStore';
import { syncNativeSessionCookies } from '@/utils/authSession';
import { ImpactFeedbackStyle, impactAsync } from '@/utils/haptics';

interface ProfileScreenProps {
  isActive?: boolean;
}

export default function ProfileScreen({ isActive = true }: ProfileScreenProps) {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const accentColor = useThemeColor({}, 'primary');
  const accentBgColor = useThemeColor({}, 'primaryTransparent');
  const _surfaceColor = Colors[colorScheme].surface;
  const _textColor = Colors[colorScheme].text;
  const { enablePrivateMessaging } = useSettingsStore();
  const {
    cookies,
    accounts,
    activeAccountIndex,
    switchAccount,
    removeAccount,
    logout,
  } = useAuthStore();

  const [accountModalVisible, setAccountModalVisible] = React.useState(false);
  const [sessionChanging, setSessionChanging] = React.useState(false);
  const sessionChangeInFlight = React.useRef(false);

  const {
    data: me,
    isLoading: isMeLoading,
    isFetching: isMeFetching,
    isError: isMeError,
    refetch: refetchMe,
  } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const fetchedMe = await getMe();
      const authState = useAuthStore.getState();
      // Complete the one-time SecureStore migration as a normal account once
      // the authenticated member payload is available.
      if (cookies && authState.cookies === cookies && !authState.me) {
        authState.addAccount(cookies, fetchedMe);
      }
      return fetchedMe;
    },
    enabled: !!cookies,
  });

  const memberId = me?.url_token || me?.id;

  const {
    data: member,
    isFetching: isMemberFetching,
    isError: isMemberError,
  } = useQuery({
    queryKey: ['me-detail', memberId],
    queryFn: () => getMemberWithFallback(memberId as string),
    enabled: !!memberId,
  });

  const profile = member || me;

  const isRefreshing = isMeFetching || isMemberFetching;
  const refreshProfile = React.useCallback(async () => {
    if (!cookies) return;
    const meResult = await refetchMe();
    const refreshedMemberId = meResult.data?.url_token || meResult.data?.id;
    if (!refreshedMemberId) return;
    try {
      await queryClient.fetchQuery({
        queryKey: ['me-detail', refreshedMemberId],
        queryFn: () => getMemberWithFallback(refreshedMemberId),
      });
    } catch {
      // The member query exposes its own retry UI below.
    }
  }, [cookies, queryClient, refetchMe]);

  const unreadCount =
    (me?.default_notifications_count || 0) +
    (me?.follow_notifications_count || 0) +
    (me?.vote_thank_notifications_count || 0);

  const wasActive = React.useRef(isActive);
  React.useEffect(() => {
    if (isActive && !wasActive.current && cookies) {
      void refreshProfile();
    }
    wasActive.current = isActive;
  }, [cookies, isActive, refreshProfile]);

  const syncSessionWithFeedback = React.useCallback(
    async (targetCookies: string | null) => {
      try {
        await syncNativeSessionCookies(targetCookies);
      } catch {
        Alert.alert(
          '会话同步失败',
          '账号已经切换，但网页登录状态未能同步。请稍后重试或重新登录。',
        );
      }
    },
    [],
  );

  const performLogout = React.useCallback(async () => {
    if (sessionChangeInFlight.current) return;
    sessionChangeInFlight.current = true;
    setSessionChanging(true);
    useVerificationStore.getState().hide();

    const remainingAccounts = accounts.filter(
      (_, index) => index !== activeAccountIndex,
    );
    const nextCookies = remainingAccounts[0]?.cookies ?? null;

    logout();
    queryClient.clear();
    setAccountModalVisible(false);
    await syncSessionWithFeedback(nextCookies);

    sessionChangeInFlight.current = false;
    setSessionChanging(false);
    if (remainingAccounts.length === 0) {
      router.replace('/login');
    }
  }, [
    accounts,
    activeAccountIndex,
    logout,
    queryClient,
    router,
    syncSessionWithFeedback,
  ]);

  const handleLogout = () => {
    Alert.alert('退出登录', '确定要退出当前账号吗喵？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确定退出',
        style: 'destructive',
        onPress: () => void performLogout(),
      },
    ]);
  };

  const handleSwitchAccount = async (index: number) => {
    if (index === activeAccountIndex || sessionChangeInFlight.current) return;

    void impactAsync(ImpactFeedbackStyle.Medium);
    useVerificationStore.getState().hide();
    sessionChangeInFlight.current = true;
    setSessionChanging(true);

    const targetCookies: string | null =
      index === -1 ? null : (accounts[index]?.cookies ?? null);
    if (index !== -1 && !targetCookies) {
      sessionChangeInFlight.current = false;
      setSessionChanging(false);
      return;
    }

    switchAccount(index);
    queryClient.clear();
    setAccountModalVisible(false);
    await syncSessionWithFeedback(targetCookies);
    sessionChangeInFlight.current = false;
    setSessionChanging(false);
  };

  const handleRemoveAccount = (index: number) => {
    const targetAccount = accounts[index];
    Alert.alert('移除账号', `确定要移除账号「${targetAccount.me?.name}」吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '确定移除',
        style: 'destructive',
        onPress: () => {
          if (index === activeAccountIndex) {
            void performLogout();
          } else {
            removeAccount(index);
          }
        },
      },
    ]);
  };

  const handleAddAccount = async () => {
    if (sessionChangeInFlight.current) return;
    setAccountModalVisible(false);
    // Keep the current app account selected, but start the login WebView with
    // an empty native session. A successful login will write the new cookies.
    try {
      await CookieManager.clearAllStores();
      router.push('/login');
    } catch {
      Alert.alert('无法添加账号', '清理网页登录状态失败，请稍后重试。');
    }
  };

  return (
    <ScrollView
      className="flex-1"
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => void refreshProfile()}
          tintColor={accentColor}
        />
      }
    >
      {/* 顶部用户信息区 */}
      <View
        type="surface"
        className="px-5 pb-5 rounded-b-[24px]"
        style={{ paddingTop: insets.top + 20 }}
      >
        {me ? (
          <BouncyButton
            className="flex-row items-center mb-[25px]"
            onPress={() => router.push(`/user/${me.url_token || me.id}`)}
          >
            <Image
              source={{ uri: me.avatar_url }}
              className="w-16 h-16 rounded-full bg-surface-tertiary dark:bg-surface-tertiary-dark"
            />
            <View className="flex-1 ml-[15px] bg-transparent">
              <Text className="text-[22px] font-bold">{me.name}</Text>
              <Text
                type="secondary"
                className="text-[13px] mt-1"
                numberOfLines={1}
              >
                {me.headline || '点击查看个人主页'}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={Colors[colorScheme].tabIconDefault}
            />
          </BouncyButton>
        ) : cookies && isMeLoading ? (
          <View className="h-24 items-center justify-center bg-transparent">
            <ActivityIndicator color={accentColor} />
          </View>
        ) : cookies && isMeError ? (
          <QueryErrorView
            compact
            message="个人资料加载失败"
            onRetry={() => void refreshProfile()}
          />
        ) : (
          <BouncyButton
            className="flex-row items-center mb-[25px]"
            onPress={() => router.push('/login')}
          >
            <View className="w-16 h-16 rounded-full border border-border dark:border-border-dark justify-center items-center">
              <Ionicons
                name="person"
                size={40}
                color={Colors[colorScheme].tabIconDefault}
              />
            </View>
            <View className="flex-1 ml-[15px] bg-transparent">
              <Text className="text-[22px] font-bold">点击登录</Text>
              <Text type="secondary" className="text-[13px] mt-1">
                登录后开启更多精彩内容
              </Text>
            </View>
          </BouncyButton>
        )}

        {/* 数据战绩统计 */}
        <View className="flex-row justify-between px-2.5 bg-transparent">
          <StatItem
            count={profile?.answer_count || 0}
            label="回答"
            onPress={() =>
              profile &&
              router.push(
                `/user/${profile.url_token || profile.id}?tab=answers`,
              )
            }
          />
          <StatItem
            count={profile?.articles_count || 0}
            label="文章"
            onPress={() =>
              profile &&
              router.push(
                `/user/${profile.url_token || profile.id}?tab=articles`,
              )
            }
          />
          <StatItem
            count={member?.following_count || 0}
            label="关注"
            onPress={() =>
              profile &&
              router.push(`/user/${profile.url_token || profile.id}/following`)
            }
          />
          <StatItem
            count={member?.follower_count || 0}
            label="粉丝"
            onPress={() =>
              profile &&
              router.push(`/user/${profile.url_token || profile.id}/followers`)
            }
          />
        </View>
        {me && isMemberError ? (
          <BouncyButton
            className="items-center mt-3 bg-transparent"
            onPress={() => void refreshProfile()}
          >
            <Text type="secondary" className="text-xs">
              详细统计加载失败，点此重试
            </Text>
          </BouncyButton>
        ) : null}
      </View>

      {/* 我的资产 */}
      <View type="surface" className="rounded-2xl mx-3 mt-3 overflow-hidden">
        <MenuItem
          icon="bookmark-outline"
          title="我的收藏"
          color={Colors[colorScheme].warning}
          onPress={() => router.push('/collections')}
        />
        <MenuItem
          icon="time-outline"
          title="最近浏览"
          color={accentColor}
          onPress={() => router.push('/history')}
        />
      </View>

      {/* 通用设置 */}
      <View type="surface" className="rounded-2xl mx-3 mt-3 overflow-hidden">
        <ThemeModeSelector />

        <MenuItem
          icon="color-palette-outline"
          title="外观与定制"
          color={accentColor}
          onPress={() => router.push('/settings/appearance')}
        />
        <MenuItem
          icon="filter-outline"
          title="过滤与推荐"
          color={accentColor}
          onPress={() => router.push('/settings/filter')}
        />

        <MenuItem
          icon="notifications-outline"
          title="消息通知"
          onPress={() => router.push('/notifications')}
          right={
            unreadCount > 0 ? (
              <View className="flex-row items-center bg-transparent">
                <Text className="bg-[#ff4d4f] text-white text-xs font-bold px-1.5 py-0.5 rounded-[10px] overflow-hidden mr-1">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={Colors[colorScheme].tabIconDefault}
                />
              </View>
            ) : undefined
          }
        />
        {enablePrivateMessaging && (
          <MenuItem
            icon="chatbubbles-outline"
            title="我的私信"
            color="#4caf50"
            onPress={() => router.push('/inbox')}
          />
        )}
        <MenuItem
          icon="people-outline"
          title="切换账号"
          onPress={() => setAccountModalVisible(true)}
          right={
            <View className="flex-row items-center bg-transparent">
              <Text type="secondary" className="mr-1 text-[13px]">
                {accounts.length} 个账号
              </Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={Colors[colorScheme].tabIconDefault}
              />
            </View>
          }
        />
        <MenuItem
          icon="help-circle-outline"
          title="反馈与建议"
          onPress={() => router.push('/feedback')}
        />
      </View>

      {/* 退出登录按钮 */}
      {me && (
        <BouncyButton
          className="mt-[30px] py-[15px] items-center"
          onPress={handleLogout}
          disabled={sessionChanging}
        >
          <Text className="text-[#ff4d4f] text-base font-semibold">
            退出账号
          </Text>
        </BouncyButton>
      )}

      <View className="h-[100px] bg-transparent" />

      <BottomSheet
        visible={accountModalVisible}
        onClose={() => setAccountModalVisible(false)}
        title="切换账号"
        maxHeight="78%"
      >
        <View className="px-5 flex-shrink bg-transparent">
          <ScrollView className="bg-transparent">
            {accounts.map((account, index) => (
              <View
                key={account.me.id}
                className="flex-row items-center bg-transparent"
              >
                <BouncyButton
                  onPress={() => handleSwitchAccount(index)}
                  disabled={sessionChanging}
                  className="flex-row items-center py-4 flex-1 border-b border-gray-100 dark:border-gray-800 bg-transparent"
                >
                  <Image
                    source={{ uri: account.me?.avatar_url }}
                    className="w-12 h-12 rounded-full bg-surface-tertiary dark:bg-surface-tertiary-dark"
                  />
                  <View className="flex-1 ml-4 bg-transparent">
                    <View className="flex-row items-center bg-transparent">
                      <Text className="text-base font-bold">
                        {account.me?.name}
                      </Text>
                      {index === activeAccountIndex && (
                        <View
                          className="ml-2 px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: accentBgColor,
                          }}
                        >
                          <Text
                            className="text-[10px] font-bold"
                            style={{ color: accentColor }}
                          >
                            当前
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text
                      type="secondary"
                      className="text-xs mt-1"
                      numberOfLines={1}
                    >
                      {account.me?.headline || '知乎用户'}
                    </Text>
                  </View>
                  {index === activeAccountIndex && (
                    <Ionicons
                      name="checkmark-circle"
                      size={22}
                      color={accentColor}
                    />
                  )}
                </BouncyButton>
                <BouncyButton
                  onPress={() => handleRemoveAccount(index)}
                  disabled={sessionChanging}
                  className="pl-4 py-4"
                >
                  <Ionicons name="trash-outline" size={20} color="#ff4d4f" />
                </BouncyButton>
              </View>
            ))}

            {/* 游客模式 */}
            <View className="flex-row items-center bg-transparent">
              <BouncyButton
                onPress={() => handleSwitchAccount(-1)}
                disabled={sessionChanging}
                className="flex-row items-center py-4 flex-1 border-b border-gray-100 dark:border-gray-800 bg-transparent"
              >
                <View className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 justify-center items-center">
                  <Ionicons name="person-outline" size={24} color="#666" />
                </View>
                <View className="flex-1 ml-4 bg-transparent">
                  <View className="flex-row items-center bg-transparent">
                    <Text className="text-base font-bold">
                      游客模式 (未登录)
                    </Text>
                    {activeAccountIndex === -1 && (
                      <View
                        className="ml-2 px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: accentBgColor,
                        }}
                      >
                        <Text
                          className="text-[10px] font-bold"
                          style={{ color: accentColor }}
                        >
                          当前
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    type="secondary"
                    className="text-xs mt-1"
                    numberOfLines={1}
                  >
                    不使用任何账号浏览
                  </Text>
                </View>
                {activeAccountIndex === -1 && (
                  <Ionicons
                    name="checkmark-circle"
                    size={22}
                    color={accentColor}
                  />
                )}
              </BouncyButton>
              <View className="pl-4 py-4">
                <Ionicons name="trash-outline" size={20} color="transparent" />
              </View>
            </View>

            <BouncyButton
              onPress={handleAddAccount}
              disabled={sessionChanging}
              className="flex-row items-center py-5 bg-transparent"
            >
              <View className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 justify-center items-center">
                <Ionicons name="add" size={28} color="#666" />
              </View>
              <Text className="text-base ml-4 font-medium">添加账号</Text>
            </BouncyButton>
          </ScrollView>

          <BouncyButton
            onPress={() => setAccountModalVisible(false)}
            className="mt-4 py-4 items-center bg-gray-100 dark:bg-gray-800 rounded-2xl"
          >
            <Text className="text-base font-bold">取消</Text>
          </BouncyButton>
        </View>
      </BottomSheet>
    </ScrollView>
  );
}

interface StatItemProps {
  count: number;
  label: string;
  onPress?: () => void;
}

function StatItem({ count, label, onPress }: StatItemProps) {
  return (
    <BouncyButton
      onPress={onPress}
      disabled={!onPress}
      className="align-center flex-1 bg-transparent"
    >
      <Text className="text-[18px] font-bold text-center">{count}</Text>
      <Text type="secondary" className="text-xs mt-1 text-center">
        {label}
      </Text>
    </BouncyButton>
  );
}

interface MenuItemProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  color?: string;
  right?: React.ReactNode;
  onPress: () => void;
}

function MenuItem({
  icon,
  title,
  color = '#666',
  right,
  onPress,
}: MenuItemProps) {
  return (
    <BouncyButton
      onPress={onPress}
      className="flex-row items-center justify-between py-[15px] px-4"
    >
      <View className="flex-row items-center bg-transparent">
        <View
          className="w-9 h-9 rounded-lg justify-center items-center"
          style={{ backgroundColor: `${color}15` }}
        >
          <Ionicons name={icon} size={20} color={color} />
        </View>
        <Text className="text-base ml-3 font-medium">{title}</Text>
      </View>
      {right ? (
        right
      ) : (
        <Ionicons
          name="chevron-forward"
          size={16}
          color={Colors.light.tabIconDefault}
        />
      )}
    </BouncyButton>
  );
}
