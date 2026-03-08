import { getMe } from '@/api/zhihu';
import { useAuthStore } from '@/store/useAuthStore';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons'; // 通用图标库
import { useQuery } from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { cookies } = useAuthStore();

  // 获取个人信息以显示未读消息红点
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => getMe(),
    enabled: !!cookies,
    refetchInterval: 30000, // 每 30 秒轮询一次未读数
  });

  const unreadCount = (me?.default_notifications_count || 0) +
    (me?.follow_notifications_count || 0) +
    (me?.vote_thank_notifications_count || 0) +
    (me?.messages_count || 0);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].tint,
        tabBarInactiveTintColor: Colors[colorScheme].textSecondary,
        // 让 TabBar 看起来更高级：使用半透明模糊背景
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0, // 移除顶部边框以增强通透感
          elevation: 0,
          height: 60,
          paddingBottom: 8,
          bottom: 0,
          left: 0,
          right: 0,
        },
        tabBarBackground: () => (
          <BlurView
            intensity={80}
            tint={colorScheme}
            style={StyleSheet.absoluteFill}
          />
        ),
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
        // 首页我们自己写了顶部导航，所以把原生的 Header 关掉
        headerShown: false,
      }}>

      <Tabs.Screen
        name="index"
        options={{
          title: '首页',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={24} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="daily"
        options={{
          title: '日报',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "newspaper" : "newspaper-outline"} size={24} color={color} />
          ),
          headerShown: true, // 日报页可以保留原生 Header
          headerTitle: '知乎日报',
          headerTransparent: true, // 让 Header 背景透明以便使用 BlurView
          headerBackground: () => (
            <BlurView
              intensity={80}
              tint={colorScheme}
              style={StyleSheet.absoluteFill}
            />
          ),
          headerStyle: {
            elevation: 0,
            shadowOpacity: 0,
          },
          headerTitleStyle: {
            fontWeight: 'bold',
            color: Colors[colorScheme].text,
          },
          headerTintColor: Colors[colorScheme].tint,
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: '我的',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={24} color={color} />
          ),
          headerShown: false, // 个人中心通常自研沉浸式头部
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({});