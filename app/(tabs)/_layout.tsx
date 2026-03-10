import { getMe } from '@/api/zhihu';
import { useAuthStore } from '@/store/useAuthStore';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons'; // 通用图标库
import { useQuery } from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

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

  return (
    <Tabs
      screenOptions={{
        // 1. 正确关掉文字
        tabBarShowLabel: false,
        // 2. 核心：让每个单元格内容完全居中
        tabBarItemStyle: {
          justifyContent: 'center',
          alignItems: 'center',
          height: 64, // 保持和 tabBarStyle 高度一致
        },
        tabBarActiveTintColor: Colors[colorScheme].tint,
        tabBarInactiveTintColor: Colors[colorScheme].textSecondary,
        // 3. 整个背板样式
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
          height: 58,
          bottom: 24, // 稍微拉高一点，更有悬浮感
          left: 20,
          right: 20,
          borderRadius: 32,
          margin: 12,
          paddingBottom: 0, // 关键：去除默认的底部边距
          overflow: 'hidden',
          // 给悬浮窗加点投影
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.1,
          shadowRadius: 12,
        },
        // 4. 背景模糊
        tabBarBackground: () => (
          <BlurView
            intensity={130}
            tint={colorScheme}
            style={StyleSheet.absoluteFill}
          />
        ),
        headerShown: false,
      }}>

      <Tabs.Screen
        name="index"
        options={{
          title: '首页',
          tabBarIcon: ({ color, focused }) => (
            <View style={[
              styles.iconWrapper,
              focused && { backgroundColor: Colors[colorScheme].tint + '15' }
            ]}>
              <Ionicons name={focused ? "home" : "home-outline"} size={24} color={color} />
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="publish"
        options={{
          title: '',
          tabBarIcon: ({ color, focused }) => (
            <View style={[
              styles.iconWrapper,
              focused && { backgroundColor: Colors[colorScheme].tint + '15' }
            ]}>
              <Ionicons name={focused ? "add-circle" : "add"} size={focused ? 26 : 24} color={color} />
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: '我的',
          tabBarIcon: ({ color, focused }) => (
            <View style={[
              styles.iconWrapper,
              focused && { backgroundColor: Colors[colorScheme].tint + '15' }
            ]}>
              <Ionicons name={focused ? "person" : "person-outline"} size={24} color={color} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrapper: {
    width: 100,
    height: 48,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    top: 10,
  }
});