import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native';
import * as Sentry from '@sentry/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { type Href, Stack, useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { RootSiblingParent } from 'react-native-root-siblings';
import { ClipboardLinkModal } from '@/components/ClipboardLinkModal';
import { CollectionSelectorModal } from '@/components/CollectionSelectorModal';
import { CollectionToastOverlay } from '@/components/CollectionToastOverlay';
import { GradientMaskOverlay } from '@/components/GradientMaskOverlay';
import { UpdateChecker } from '@/components/UpdateChecker';
import { useColorScheme } from '@/components/useColorScheme';
import { VerificationModal } from '@/components/VerificationModal';
import {
  useSyncThemeWithNativeWind,
  useThemeStore,
} from '@/store/useThemeStore';
import { isExpoInternalUrl, parseZhihuUrl } from '@/utils/url';
import '../global.css';
import * as Clipboard from 'expo-clipboard';
import { AppState, type AppStateStatus, Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Colors from '@/constants/Colors';
import { useSettingsStore } from '@/store/useSettingsStore';
import { consumeAppClipboardText } from '@/utils/clipboard';

Sentry.init({
  dsn: 'https://93a6099dd49b040d9c516485eb3c72f6@o4511051860672512.ingest.de.sentry.io/4511051866112080',
  debug: __DEV__,
  enableAutoSessionTracking: true,
});

const deviceContext = {
  appVersion: Constants.expoConfig?.version,
  deviceName: Constants.deviceName,
  osVersion: Constants.systemVersion,
  platform: Constants.platform,
};
Sentry.setContext('device', deviceContext);
Sentry.setTag('app_version', deviceContext.appVersion || 'unknown');
Sentry.setTag(
  'platform',
  deviceContext.platform?.ios
    ? 'ios'
    : deviceContext.platform?.android
      ? 'android'
      : 'other',
);

// 保持启动页显示，直到资源加载完成
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        // 如果是人机验证错误（40352），停止自动重试，等待弹窗加载
        if (error?.response?.data?.error?.code === 40352) {
          return false;
        }
        // 其他错误默认重试 2 次 (共三次尝试)
        return failureCount < 2;
      },
      // 这里的配置确保不会因为网络瞬间闪烁在验证期间反复弹窗
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

function RootLayout() {
  const router = useRouter();
  const _colorScheme = useColorScheme();
  const isDark = useThemeStore((state) => state.isDark);
  const theme = isDark ? DarkTheme : DefaultTheme;
  const { primaryColor } = useSettingsStore();
  const currentTint = primaryColor || Colors[isDark ? 'dark' : 'light'].primary;

  // Sync NativeWind dark mode with zustand store
  useSyncThemeWithNativeWind();

  // 默认开启感应自动旋转
  useEffect(() => {
    async function enableAutoRotation() {
      try {
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.DEFAULT,
        );
      } catch (e) {
        console.warn('Failed to enable default screen auto-rotation:', e);
      }
    }
    enableAutoRotation();
  }, []);

  const [clipboardModalVisible, setClipboardModalVisible] = useState(false);
  const [clipboardUrl, setClipboardUrl] = useState('');

  const lastCheckedUrlRef = useRef<string | null>(null);
  const pendingExternalPathRef = useRef<string | null>(null);

  // Observe hot-start links for clipboard de-duplication. Expo Router owns navigation.
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (isExpoInternalUrl(url)) return;

      pendingExternalPathRef.current = parseZhihuUrl(url);
      setClipboardModalVisible(false);
    });

    return () => subscription.remove();
  }, []);

  // Check clipboard for Zhihu links when app becomes active
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background') {
        pendingExternalPathRef.current = null;
        return;
      }

      if (nextAppState === 'active') {
        try {
          const hasText = await Clipboard.hasStringAsync();
          if (hasText) {
            const text = await Clipboard.getStringAsync();
            if (text && consumeAppClipboardText(text)) {
              lastCheckedUrlRef.current = text;
              return;
            }

            if (
              text &&
              text !== lastCheckedUrlRef.current &&
              (text.includes('zhihu.com/') ||
                text.includes('zhuanlan.zhihu.com/'))
            ) {
              lastCheckedUrlRef.current = text;
              const urlMatch = text.match(
                /https?:\/\/(?:www\.|zhuanlan\.)?zhihu\.com\/[^\s]*/,
              );
              const url = urlMatch ? urlMatch[0] : null;
              if (url) {
                const pendingExternalPath = pendingExternalPathRef.current;
                pendingExternalPathRef.current = null;

                if (parseZhihuUrl(url) === pendingExternalPath) {
                  lastCheckedUrlRef.current = text;
                  return;
                }

                setClipboardUrl(url);
                setClipboardModalVisible(true);
              }
            }
          }
        } catch (e) {
          console.warn('Failed to read clipboard on app active', e);
        }
      }
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );
    return () => {
      subscription.remove();
    };
  }, []);

  // 这里简单处理：如果以后需要加载字体，可以写在这里
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);
  // throw new Error('test')
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <RootSiblingParent>
          <ThemeProvider value={theme}>
            <UpdateChecker />
            <ClipboardLinkModal
              visible={clipboardModalVisible}
              url={clipboardUrl}
              onClose={() => setClipboardModalVisible(false)}
              onOpen={() => {
                setClipboardModalVisible(false);
                const path = parseZhihuUrl(clipboardUrl);
                if (path) {
                  router.push(path as Href);
                }
              }}
            />
            <Stack
              screenOptions={{
                headerStyle: {
                  backgroundColor:
                    Colors[isDark ? 'dark' : 'light'].backgroundSecondary,
                },
                headerTitleStyle: {
                  color: Colors[isDark ? 'dark' : 'light'].text,
                  fontWeight: 'bold',
                },
                headerTintColor: currentTint,
                headerShadowVisible: false,
              }}
            >
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
                name="login/index"
                options={{
                  presentation: 'modal',
                  headerTitle: '登录知乎',
                  headerLeft: () => null,
                }}
              />

              <Stack.Screen
                name="feedback/index"
                options={{
                  headerShown: false,
                  presentation: 'card',
                }}
              />

              {/* 发布相关页面：使用全屏 Modal */}
              <Stack.Screen
                name="publish/answer"
                options={{
                  presentation: 'fullScreenModal',
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="publish/article"
                options={{
                  presentation: 'fullScreenModal',
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="publish/pin"
                options={{
                  presentation: 'fullScreenModal',
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="publish/question"
                options={{
                  presentation: 'fullScreenModal',
                  headerShown: false,
                }}
              />

              {/* 问题详情页 */}
              <Stack.Screen
                name="question/[id]/index"
                options={{
                  headerShown: false,
                  animation: 'fade',
                }}
              />

              {/* 回答详情页 */}
              <Stack.Screen
                name="answer/[id]"
                options={{
                  headerShown: false,
                  animation: 'fade',
                }}
              />

              {/* 游客预览页 */}
              <Stack.Screen
                name="guest/detail"
                options={{
                  headerShown: false,
                  animation: 'slide_from_right',
                }}
              />
            </Stack>

            {/* 全局状态栏和底部安全区渐变模糊遮罩 */}
            <GradientMaskOverlay isDark={isDark} />

            {/* 全局状态栏控制 */}
            <StatusBar style={isDark ? 'light' : 'dark'} />

            {/* 人机验证弹窗 */}
            <VerificationModal />

            {/* 全局收藏提醒和弹窗 */}
            <CollectionToastOverlay />
            <CollectionSelectorModal />
          </ThemeProvider>
        </RootSiblingParent>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
export default Sentry.wrap(RootLayout);
