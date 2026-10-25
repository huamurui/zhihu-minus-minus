import CookieManager from '@preeternal/react-native-cookie-manager';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { getMe } from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { LoginWebView } from '@/components/LoginWebView';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import {
  getAuthSessionVersion,
  saveAuthState,
  useAuthStore,
} from '@/store/useAuthStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useVerificationStore } from '@/store/useVerificationStore';
import { syncNativeSessionCookies } from '@/utils/authSession';
import { showToast } from '@/utils/toast';

export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const queryClient = useQueryClient();
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

    // 成功后跳转，确保存储生效
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

  const handleCookies = async (web_cookie: string) => {
    if (abandonedRef.current || capturingSessionRef.current) return;
    capturingSessionRef.current = true;
    // 关键：只有当包含 z_c0 (登录 Token) 时才认为是有效的登录 Cookie
    // 获取 httpOnly cookie，webview 注入 js 是不行的，需要原生支持
    const capturingVersion = getAuthSessionVersion();
    try {
      const cookies = await CookieManager.get('https://www.zhihu.com', true);

      if (abandonedRef.current || getAuthSessionVersion() !== capturingVersion)
        return;

      // 合并 web_cookie (来自 document.cookie) 和 CookieManager 的结果
      const mergedCookies: Record<string, string> = {};

      // 1. 解析 web_cookie (document.cookie)
      if (web_cookie) {
        web_cookie.split(';').forEach((pair) => {
          const [name, ...valueParts] = pair.trim().split('=');
          if (name) {
            mergedCookies[name] = valueParts.join('=');
          }
        });
      }

      // 2. 合并 CookieManager 的结果 (优先级更高)
      if (cookies) {
        Object.values(cookies).forEach((c) => {
          mergedCookies[c.name] = c.value;
        });
      }

      // 只有当包含 z_c0 (登录 Token) 时且不为空时才认为是有效的登录 Cookie
      // 额外检查 __zse_ck 以确保环境验证成功 (知乎反爬字段)
      const hasZc0 = !!mergedCookies.z_c0;
      // const hasZseCk = !!mergedCookies['__zse_ck'];
      const hasZseCk = true;
      const hasDc0 = !!mergedCookies.d_c0;

      console.log(
        `📊 Cookie 状态: d_c0=${hasDc0}, z_c0=${hasZc0}, __zse_ck=${hasZseCk}`,
      );

      if (hasZc0 && hasZseCk) {
        console.log('🍪 捕获到完整且合规的 Cookie');

        // 生成最终的 Cookie 字符串
        const cookieString = Object.entries(mergedCookies)
          .map(([name, value]) => `${name}=${value}`)
          .join('; ');

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

        // 🟢 预抓取用户信息，确保账号列表立即完整
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
      } else if (hasZc0 && !hasZseCk) {
        console.log('⚠️ 捕获到 z_c0 但缺失 __zse_ck，请在验证页面稍候...');
      }
    } catch {
      if (!abandonedRef.current) {
        console.error('❌ 获取 Cookie 失败');
        showToast('登录状态未更新，请先恢复已保存账号或稍后重试');
      }
    } finally {
      capturingSessionRef.current = false;
    }
  };

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
        <View className="w-10 bg-transparent" />
      </View>

      <LoginWebView onCookies={(cookies) => void handleCookies(cookies)} />
    </View>
  );
}
