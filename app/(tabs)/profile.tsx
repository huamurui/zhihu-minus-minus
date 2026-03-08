import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback } from 'react';
import {
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
} from 'react-native';

// 导入我们之前定义的组件和 Store
import { getMe } from '@/api/zhihu';
import { Text, View, useThemeColor } from '@/components/Themed';
import { useAuthStore } from '@/store/useAuthStore';
import { useThemeStore } from '@/store/useThemeStore';
import CookieManager from '@react-native-cookies/cookies';

export default function ProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isDark, toggleTheme } = useThemeStore();
  const accentColor = useThemeColor({}, 'tint');

  const { cookies } = useAuthStore();
  // 1. 获取个人详细信息 (使用 API 抓取真实数据)
  const { data: me, isLoading, refetch } = useQuery({
    queryKey: ['me'],
    queryFn: () => getMe(),
    enabled: !!cookies, // 只有在已登录（有 cookie）时才触发请求
  });

  const unreadCount =
    (me?.default_notifications_count || 0) +
    (me?.follow_notifications_count || 0) +
    (me?.vote_thank_notifications_count || 0) +
    (me?.messages_count || 0);

  useFocusEffect(
    useCallback(() => {
      if (cookies) {
        refetch();
      }
    }, [cookies, refetch])
  );

  const handleLogout = () => {
    Alert.alert('退出登录', '确定要退出当前账号吗喵？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确定退出',
        style: 'destructive',
        onPress: async () => {
          await SecureStore.deleteItemAsync('user_cookies');
          // webview 中的登录也要退出
          await CookieManager.clearAll();
          useAuthStore.getState().logout();
          queryClient.setQueryData(['me'], null);
          router.replace('/login');
        },
      },
    ]);
  };

  const onToggleTheme = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleTheme();
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={accentColor} />
      }
    >
      {/* 1. 顶部用户信息区 */}
      <View type="surface" style={styles.header}>
        {me ? (
          <Pressable style={styles.userInfoRow} onPress={() => router.push(`/user/${me.url_token || me.id}`)}>
            <Image source={{ uri: me.avatar_url }} style={styles.avatar} />
            <View style={[styles.userText, { backgroundColor: 'transparent' }]}>
              <Text style={styles.userName}>{me.name}</Text>
              <Text type="secondary" style={styles.headline} numberOfLines={1}>
                {me.headline || '点击查看个人主页'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </Pressable>
        ) : (
          <Pressable style={styles.userInfoRow} onPress={() => router.push('/login')}>
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Ionicons name="person" size={40} color="#ccc" />
            </View>
            <View style={[styles.userText, { backgroundColor: 'transparent' }]}>
              <Text style={styles.userName}>点击登录</Text>
              <Text type="secondary" style={styles.headline}>登录后开启更多精彩内容</Text>
            </View>
          </Pressable>
        )}

        {/* 2. 数据战绩统计 */}
        <View style={[styles.statsGrid, { backgroundColor: 'transparent' }]}>
          <StatItem count={me?.answer_count || 0} label="回答" />
          <StatItem count={me?.articles_count || 0} label="文章" />
          <StatItem
            count={me?.following_count || 0}
            label="关注"
            onPress={() => me && router.push(`/user/${me.url_token || me.id}/following`)}
          />
          <StatItem
            count={me?.follower_count || 0}
            label="粉丝"
            onPress={() => me && router.push(`/user/${me.url_token || me.id}/followers`)}
          />
        </View>
      </View>

      {/* 3. 我的资产 (收纳盒) */}
      <View type="surface" style={[styles.menuSection, { marginTop: 12 }]}>
        <MenuItem icon="bookmark-outline" title="我的收藏" color="#ff9800" onPress={() => router.push('/collections' as any)} />
        <MenuItem icon="heart-outline" title="我的点赞" color="#f44336" onPress={() => router.push('/user/likes' as any)} />
        <MenuItem icon="time-outline" title="最近浏览" color="#2196f3" onPress={() => router.push('/history' as any)} />
      </View>

      {/* 4. 通用设置 */}
      <View type="surface" style={[styles.menuSection, { marginTop: 12 }]}>
        <View style={[styles.menuItem, { backgroundColor: 'transparent' }]}>
          <View style={[styles.menuLeft, { backgroundColor: 'transparent' }]}>
            <View style={[styles.iconBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
              <Ionicons name={isDark ? "moon" : "sunny"} size={20} color={isDark ? "#ffcf40" : "#ff9800"} />
            </View>
            <Text style={styles.menuTitle}>夜间模式</Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={onToggleTheme}
            trackColor={{ false: "#ddd", true: accentColor }}
            thumbColor="#fff"
          />
        </View>

        <MenuItem
          icon="notifications-outline"
          title="消息通知"
          onPress={() => router.push('/notifications' as any)}
          right={unreadCount > 0 ? (
            <View style={styles.badgeContainer}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              <Ionicons name="chevron-forward" size={16} color="#ccc" />
            </View>
          ) : undefined}
        />
        <MenuItem icon="settings-outline" title="更多设置" />
        <MenuItem icon="help-circle-outline" title="反馈与建议" />
      </View>

      {/* 5. 退出登录按钮 */}
      {me && (
        <Pressable style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>退出账号</Text>
        </Pressable>
      )}

      <View style={{ height: 100, backgroundColor: 'transparent' }} />
    </ScrollView>
  );
}

function StatItem({ count, label, onPress }: any) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.statItem, { backgroundColor: 'transparent' }]}
    >
      <Text style={styles.statNum}>{count}</Text>
      <Text type="secondary" style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

function MenuItem({ icon, title, color = "#666", right, onPress }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={[styles.menuLeft, { backgroundColor: 'transparent' }]}>
        <View style={[styles.iconBox, { backgroundColor: color + '15' }]}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
        <Text style={styles.menuTitle}>{title}</Text>
      </View>
      {right ? right : <Ionicons name="chevron-forward" size={16} color="#ccc" />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 25,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#eee',
  },
  avatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
  },
  userText: {
    flex: 1,
    marginLeft: 15,
  },
  userName: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  headline: {
    fontSize: 13,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNum: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  menuSection: {
    paddingHorizontal: 16,
    borderRadius: 16,
    marginHorizontal: 12,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuTitle: {
    fontSize: 16,
    marginLeft: 12,
    fontWeight: '500',
  },
  logoutBtn: {
    marginTop: 30,
    paddingVertical: 15,
    alignItems: 'center',
  },
  logoutText: {
    color: '#ff4d4f',
    fontSize: 16,
    fontWeight: '600',
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  badgeText: {
    backgroundColor: '#ff4d4f',
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
    marginRight: 4,
  },
});
