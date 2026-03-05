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
  Text,
  View,
} from 'react-native';

// 导入我们之前定义的组件和 Store
import apiClient from '@/api/client';
import { useThemeStore } from '@/store/useThemeStore';

export default function ProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isDark, toggleTheme } = useThemeStore();

  // 定义主题颜色映射
  const theme = {
    bg: isDark ? '#000' : '#f6f6f6',
    card: isDark ? '#1a1a1a' : '#fff',
    text: isDark ? '#fff' : '#1a1a1a',
    subText: isDark ? '#888' : '#999',
    border: isDark ? '#333' : '#eee',
    accent: '#0084ff',
  };

  // 1. 获取个人详细信息 (使用 API 抓取真实数据)
  const { data: me, isLoading, refetch } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/members/self?include=answer_count,articles_count,follower_count,following_count,headline,description,voteup_count,thanked_count');
        return res.data;
      } catch (e) {
        // 如果未登录或 Cookie 失效，这里会抛错
        return null;
      }
    },
  });

  // 每次页面获得焦点时刷新数据 (例如从登录页回来)
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [])
  );

  // 退出登录逻辑
  const handleLogout = () => {
    Alert.alert('退出登录', '确定要退出当前账号吗喵？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确定退出',
        style: 'destructive',
        onPress: async () => {
          await SecureStore.deleteItemAsync('user_cookies');
          queryClient.setQueryData(['me'], null); // 清除缓存
          router.replace('/login');
        },
      },
    ]);
  };

  // 切换主题并触发震动
  const onToggleTheme = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleTheme();
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={theme.accent} />
      }
    >
      {/* 1. 顶部用户信息区 */}
      <View style={[styles.header, { backgroundColor: theme.card }]}>
        {me ? (
          <Pressable style={styles.userInfoRow} onPress={() => router.push(`/user/${me.id}`)}>
            <Image source={{ uri: me.avatar_url }} style={styles.avatar} />
            <View style={styles.userText}>
              <Text style={[styles.userName, { color: theme.text }]}>{me.name}</Text>
              <Text style={[styles.headline, { color: theme.subText }]} numberOfLines={1}>
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
            <View style={styles.userText}>
              <Text style={[styles.userName, { color: theme.text }]}>点击登录</Text>
              <Text style={[styles.headline, { color: theme.subText }]}>登录后开启更多精彩内容</Text>
            </View>
          </Pressable>
        )}

        {/* 2. 数据战绩统计 */}
        <View style={styles.statsGrid}>
          <StatItem count={me?.answer_count || 0} label="回答" theme={theme} />
          <StatItem count={me?.articles_count || 0} label="文章" theme={theme} />
          <StatItem count={me?.following_count || 0} label="关注" theme={theme} />
          <StatItem count={me?.follower_count || 0} label="粉丝" theme={theme} />
        </View>
      </View>

      {/* 3. 我的资产 (收纳盒) */}
      <View style={[styles.menuSection, { backgroundColor: theme.card, marginTop: 12 }]}>
        <MenuItem icon="bookmark-outline" title="我的收藏" color="#ff9800" theme={theme} />
        <MenuItem icon="heart-outline" title="我的点赞" color="#f44336" theme={theme} />
        <MenuItem icon="time-outline" title="最近浏览" color="#2196f3" theme={theme} />
      </View>

      {/* 4. 通用设置 */}
      <View style={[styles.menuSection, { backgroundColor: theme.card, marginTop: 12 }]}>
        {/* 亮暗模式切换 */}
        <View style={styles.menuItem}>
          <View style={styles.menuLeft}>
            <View style={[styles.iconBox, { backgroundColor: isDark ? '#333' : '#f0f0f0' }]}>
              <Ionicons name={isDark ? "moon" : "sunny"} size={20} color={isDark ? "#ffcf40" : "#ff9800"} />
            </View>
            <Text style={[styles.menuTitle, { color: theme.text }]}>夜间模式</Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={onToggleTheme}
            trackColor={{ false: "#ddd", true: theme.accent }}
            thumbColor="#fff"
          />
        </View>

        <MenuItem icon="notifications-outline" title="消息通知" theme={theme} onPress={() => router.push('/notifications' as any)} />
        <MenuItem icon="settings-outline" title="更多设置" theme={theme} />
        <MenuItem icon="help-circle-outline" title="反馈与建议" theme={theme} />
      </View>

      {/* 5. 退出登录按钮 */}
      {me && (
        <Pressable style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>退出账号</Text>
        </Pressable>
      )}

      <View style={{ height: 50 }} />
    </ScrollView>
  );
}

// --- 子组件：数据统计项 ---
function StatItem({ count, label, theme }: any) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statNum, { color: theme.text }]}>{count}</Text>
      <Text style={[styles.statLabel, { color: theme.subText }]}>{label}</Text>
    </View>
  );
}

// --- 子组件：菜单项 ---
function MenuItem({ icon, title, color = "#666", theme, right, onPress }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        pressed && { backgroundColor: theme.bg },
      ]}
    >
      <View style={styles.menuLeft}>
        <View style={[styles.iconBox, { backgroundColor: color + '15' }]}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
        <Text style={[styles.menuTitle, { color: theme.text }]}>{title}</Text>
      </View>
      {right ? right : <Ionicons name="chevron-forward" size={16} color="#ccc" />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // 头部样式
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
  // 统计网格
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
  // 菜单列表
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
  // 退出登录
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
});