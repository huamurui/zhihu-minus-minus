import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native';
import * as Sentry from '@sentry/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { type Href, Stack, useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { vars } from 'nativewind';
import { useEffect, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { RootSiblingParent } from 'react-native-root-siblings';
import { ClipboardLinkModal } from '@/components/ClipboardLinkModal';
import { CollectionSelectorModal } from '@/components/CollectionSelectorModal';
import { CollectionToastOverlay } from '@/components/CollectionToastOverlay';
import { DoubleTapActionSheet } from '@/components/DoubleTapActionSheet';
import { GradientMaskOverlay } from '@/components/GradientMaskOverlay';
import { useRuntimeThemeColors } from '@/components/Themed';
import { UpdateChecker } from '@/components/UpdateChecker';
import { VerificationModal } from '@/components/VerificationModal';
import { useQueryConnectivity } from '@/hooks/useQueryConnectivity';
import {
  useSyncThemeWithNativeWind,
  useThemeStore,
} from '@/store/useThemeStore';
import { themeVariables } from '@/utils/themeVariables';
import { isExpoInternalUrl, parseZhihuUrl } from '@/utils/url';
import '../global.css';
import * as Clipboard from 'expo-clipboard';
import { AppState, type AppStateStatus, Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTelemetryStore } from '@/store/useTelemetryStore';
import { consumeAppClipboardText } from '@/utils/clipboard';
import { createAppQueryClient } from '@/utils/queryClient';
import { initializeTelemetry, setTelemetryEnabled } from '@/utils/telemetry';

initializeTelemetry();

// 保持启动页显示，直到资源加载完成
SplashScreen.preventAutoHideAsync();

const queryClient = createAppQueryClient();

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

function RootLayout() {
  useQueryConnectivity(queryClient);
  const router = useRouter();
  const isDark = useThemeStore((state) => state.isDark);
  const hasThemeHydrated = useThemeStore((state) => state.hasHydrated);
  const telemetryEnabled = useTelemetryStore((state) => state.enabled);
  const hasTelemetryHydrated = useTelemetryStore((state) => state.hasHydrated);
  const appThemeColors = useRuntimeThemeColors();
  const currentTint = appThemeColors.primary;
  const baseNavigationTheme = isDark ? DarkTheme : DefaultTheme;
  const theme = {
    ...baseNavigationTheme,
    colors: {
      ...baseNavigationTheme.colors,
      primary: currentTint,
      background: appThemeColors.background,
      card: appThemeColors.backgroundSecondary,
      text: appThemeColors.text,
      border: appThemeColors.border,
      notification: appThemeColors.danger,
    },
  };

  // Sync NativeWind dark mode with zustand store
  useSyncThemeWithNativeWind();

  useEffect(() => {
    if (!hasTelemetryHydrated) return;
    void setTelemetryEnabled(telemetryEnabled);
  }, [hasTelemetryHydrated, telemetryEnabled]);

  // 默认开启感应自动旋转
  useEffect(() => {
    async function enableAutoRotation() {
      try {
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.DEFAULT,
        );
      } catch {
        console.warn('Failed to enable default screen auto-rotation');
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
        } catch {
          console.warn('Failed to read clipboard on app active');
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
    if (hasThemeHydrated) {
      void SplashScreen.hideAsync();
    }
  }, [hasThemeHydrated]);
  // throw new Error('test')
  return (
    <GestureHandlerRootView
      // Native fade transitions make both screens translucent. Keep an opaque,
      // live-themed backdrop so they cannot reveal a stale native window color.
      style={[
        { flex: 1, backgroundColor: appThemeColors.background },
        vars(themeVariables(appThemeColors)),
      ]}
    >
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <RootSiblingParent>
            <ThemeProvider value={theme}>
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
                    backgroundColor: appThemeColors.backgroundSecondary,
                  },
                  headerTitleStyle: {
                    color: appThemeColors.text,
                    fontWeight: 'bold',
                  },
                  headerTintColor: currentTint,
                  headerShadowVisible: false,
                  headerBackButtonDisplayMode: 'minimal',
                }}
              >
                {/* 开发工具自带嵌套导航；生产环境会由 dev layout 重定向 */}
                <Stack.Screen name="dev" options={{ headerShown: false }} />

                {/* 底部 Tab 主框架 */}
                <Stack.Screen
                  name="(tabs)"
                  options={{ headerShown: false, title: '知乎' }}
                />

                {/* 登录页：建议做成从底部弹出的 Modal */}
                <Stack.Screen
                  name="login/index"
                  options={{
                    presentation: 'modal',
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

              {/* 首次双击正文的快捷动作引导 */}
              <DoubleTapActionSheet />

              {/* 全局收藏提醒和弹窗 */}
              <CollectionToastOverlay />
              <CollectionSelectorModal />
              <UpdateChecker />
            </ThemeProvider>
          </RootSiblingParent>
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
export default Sentry.wrap(RootLayout);
