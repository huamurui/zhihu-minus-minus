import { useColorScheme } from '@/components/useColorScheme';
import { useThemeStore } from '@/store/useThemeStore';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

// 保持启动页显示，直到资源加载完成
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = useThemeStore((state) => state.isDark);
  const theme = isDark ? DarkTheme : DefaultTheme;

  // 这里简单处理：如果以后需要加载字体，可以写在这里
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={theme}>
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: isDark ? '#1a1a1a' : '#ffffff',
            },
            headerTitleStyle: {
              color: isDark ? '#ffffff' : '#1a1a1a',
              fontWeight: 'bold',
            },
            headerTintColor: '#0084ff',
            headerShadowVisible: false,
          }}>
          {/* 底部 Tab 主框架 */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

          {/* 文章详情页：从右侧推入 */}
          <Stack.Screen
            name="article/[id]"
            options={{
              headerTitle: '正文',
              headerBackTitle: '返回',
            }}
          />

          {/* 登录页：建议做成从底部弹出的 Modal */}
          <Stack.Screen
            name="login"
            options={{
              presentation: 'modal',
              headerTitle: '登录知乎',
              headerLeft: () => null, // 登录页左侧通常留空或放“取消”
            }}
          />

          {/* 其他 Modal 弹窗 */}
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: '提示' }} />
        </Stack>

        {/* 全局状态栏控制 */}
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}