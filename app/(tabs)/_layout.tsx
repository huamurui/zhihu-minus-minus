import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons'; // 通用图标库
import { Tabs } from 'expo-router';
import React from 'react';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].tint,
        tabBarInactiveTintColor: '#888',
        // 让 TabBar 看起来更高级：加点阴影或边框
        tabBarStyle: {
          borderTopWidth: 0.5,
          elevation: 0,
          height: 60,
          paddingBottom: 8,
        },
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
          headerTitleStyle: { fontWeight: 'bold' },
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