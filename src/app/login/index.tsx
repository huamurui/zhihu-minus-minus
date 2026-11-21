import { useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { getMe } from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import {
  type LoginMode,
  OfficialLoginWebView,
} from '@/components/OfficialLoginWebView';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useLoginCookieCapture } from '@/hooks/useLoginCookieCapture';
import {
  getAuthSessionVersion,
  saveAuthState,
  useAuthStore,
} from '@/store/useAuthStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useVerificationStore } from '@/store/useVerificationStore';
import {
  finishNativeLoginFlow,
  syncNativeSessionCookies,
} from '@/utils/authSession';
import { showToast } from '@/utils/toast';

export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [loginMode, setLoginMode] = useState<LoginMode>('mobile');
  const [capturing, setCapturing] = useState(false);
  const [saveFailedVersion, setSaveFailedVersion] = useState<number | null>(
    null,
  );
  const borderColor = Colors[colorScheme].border;
  const capturingSessionRef = useRef(false);
  const abandonedRef = useRef(false);
  useEffect(() => {
    abandonedRef.current = false;
    return () => {
      abandonedRef.current = true;
      finishNativeLoginFlow();
    };
  }, []);

  const persistAndFinishLogin = async (savingSessionVersion: number) => {
    if (
      abandonedRef.current ||
      getAuthSessionVersion() !== savingSessionVersion
    )
      return;
    const saved = await saveAuthState();
    if (
      abandonedRef.current ||
      getAuthSessionVersion() !== savingSessionVersion
    )
      return;
    if (!saved) {
      setSaveFailedVersion(savingSessionVersion);
      showToast('登录状态未保存，请检查存储空间后重试');
      return;
    }
    setSaveFailedVersion(null);
    useVerificationStore.getState().hide(); // 登录成功后强制关闭验证弹窗
    queryClient.clear(); // 清理缓存，强制重新拉取数据 (解决 feed 不更新问题)
    console.log('✅ 登录会话已保存');

    // Ignore late WebView navigation events while the screen is closing.
    abandonedRef.current = true;
    if (router.canGoBack()) {
      router.back();
    } else {
      const useNativeIOSBottomTabs =
        Platform.OS === 'ios' &&
        useSettingsStore.getState().useNativeIOSBottomTabs;
      if (useNativeIOSBottomTabs) {
        router.replace('/(tabs)/profile');
      } else {
        // 使用参数跳转，确保回到主容器 index.tsx 从而保留自定义 TabBar
        router.replace({
          pathname: '/(tabs)',
          params: { tab: 'profile' },
        });
      }
    }
  };

  const retrySavingSession = async () => {
    if (
      abandonedRef.current ||
      capturingSessionRef.current ||
      saveFailedVersion === null
    )
      return;
    if (getAuthSessionVersion() !== saveFailedVersion) {
      setSaveFailedVersion(null);
      showToast('登录会话已变化，请重新登录');
      return;
    }
    capturingSessionRef.current = true;
    try {
      await persistAndFinishLogin(saveFailedVersion);
    } finally {
      capturingSessionRef.current = false;
    }
  };

  const acceptLoginCookies = async (cookieString: string) => {
    if (
      abandonedRef.current ||
      capturingSessionRef.current ||
      saveFailedVersion !== null
    )
      return;
    capturingSessionRef.current = true;
    setCapturing(true);
    try {
      useAuthStore.getState().setCookies(cookieString);
      const loginSessionVersion = getAuthSessionVersion();
      // Native writes are serialized and stop when this session changes.
      try {
        await syncNativeSessionCookies(cookieString);
      } catch {
        console.warn('⚠️ 无法同步原生登录会话');
      }
      if (
        abandonedRef.current ||
        getAuthSessionVersion() !== loginSessionVersion
      )
        return;

      try {
        const me = await getMe();
        if (
          abandonedRef.current ||
          getAuthSessionVersion() !== loginSessionVersion
        )
          return;
        if (me) {
          const authState = useAuthStore.getState();
          authState.addAccount(authState.cookies || cookieString, me);
        }
      } catch {
        if (
          abandonedRef.current ||
          getAuthSessionVersion() !== loginSessionVersion
        )
          return;
        console.error('⚠️ 预抓取用户信息失败（不影响登录）');
      }

      await persistAndFinishLogin(getAuthSessionVersion());
    } catch {
      if (!abandonedRef.current) {
        showToast('登录状态未更新，请先恢复已保存账号或稍后重试');
      }
    } finally {
      capturingSessionRef.current = false;
      if (!abandonedRef.current) setCapturing(false);
    }
  };

  const cookieCapture = useLoginCookieCapture(acceptLoginCookies);

  return (
    <View className="flex-1">
      <Stack.Screen options={{ title: '登录知乎' }} />
      {saveFailedVersion !== null && (
        <BouncyButton onPress={() => void retrySavingSession()} className="p-3">
          <Text type="primary">登录状态保存失败，点此重试</Text>
        </BouncyButton>
      )}
      {/* 顶部标题栏 */}
      <View
        type="surface"
        className="h-[60px] flex-row items-center justify-between px-[15px] pt-[10px]"
        style={{ borderBottomWidth: 1, borderBottomColor: borderColor }}
      >
        <BouncyButton
          className="p-2 rounded-full"
          onPress={() => {
            abandonedRef.current = true;
            cookieCapture.cancel();
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(tabs)');
            }
          }}
        >
          <Text type="primary" className="text-base">
            取消
          </Text>
        </BouncyButton>
        <Text className="text-base font-bold">登录知乎</Text>
        <BouncyButton
          accessibilityRole="button"
          disabled={capturing || saveFailedVersion !== null}
          onPress={() => {
            if (!capturingSessionRef.current) {
              cookieCapture.cancel();
              setLoginMode(loginMode === 'mobile' ? 'qr' : 'mobile');
            }
          }}
          className="p-2"
        >
          <Text type="primary" className="text-base">
            {loginMode === 'mobile' ? '扫码登录' : '手机登录'}
          </Text>
        </BouncyButton>
      </View>

      {loginMode === 'qr' && (
        <Text className="px-4 py-2">
          用另一台设备上的知乎 App 扫描网页二维码，可双指放大。
        </Text>
      )}
      <OfficialLoginWebView
        key={loginMode}
        mode={loginMode}
        onLoginRedirect={() => {
          if (
            !abandonedRef.current &&
            !capturingSessionRef.current &&
            saveFailedVersion === null
          ) {
            cookieCapture.start();
          }
        }}
      />
    </View>
  );
}
