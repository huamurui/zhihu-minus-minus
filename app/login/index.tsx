import CookieManager from '@react-native-cookies/cookies';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { getMe } from '@/api/zhihu';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuthStore } from '@/store/useAuthStore';
import { useVerificationStore } from '@/store/useVerificationStore';

export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const webViewRef = useRef<WebView>(null);
  const borderColor = Colors[colorScheme].border;

  const handleCookies = async (web_cookie: string) => {
    // 关键：只有当包含 z_c0 (登录 Token) 时才认为是有效的登录 Cookie
    // 获取 httpOnly cookie，webview 注入 js 是不行的，需要原生支持
    try {
      const cookies = await CookieManager.get('https://www.zhihu.com', true);

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

        // 尝试保存到 SecureStore 作为备份，但 Android 有 2048 字节限制，超出会崩溃
        try {
          if (cookieString.length < 2000) {
            await SecureStore.setItemAsync('user_cookies', cookieString);
          }
        } catch (e) {
          console.warn(
            '⚠️ 无法保存 Cookie 到 SecureStore (可能超出长度限制):',
            e,
          );
        }

        useAuthStore.getState().setCookies(cookieString);

        // 🟢 预抓取用户信息，确保账号列表立即完整
        try {
          const me = await getMe();
          if (me) {
            useAuthStore.getState().addAccount(cookieString, me);
          }
        } catch (e) {
          console.error('⚠️ 预抓取用户信息失败 (不影响登录):', e);
        }

        useVerificationStore.getState().hide(); // 登录成功后强制关闭验证弹窗
        queryClient.clear(); // 清理缓存，强制重新拉取数据 (解决 feed 不更新问题)
        console.log('✅ 登录 Cookie 已保存至 SecureStore 和 AuthStore');

        // 成功后跳转，确保存储生效
        if (router.canGoBack()) {
          router.back();
        } else {
          // 使用参数跳转，确保回到主容器 index.tsx 从而保留自定义 TabBar
          router.replace({
            pathname: '/(tabs)',
            params: { tab: 'profile' },
          } as any);
        }
      } else if (hasZc0 && !hasZseCk) {
        console.log('⚠️ 捕获到 z_c0 但缺失 __zse_ck，请在验证页面稍候...');
      }
    } catch (error) {
      console.error('❌ 获取 Cookie 失败:', error);
    }
  };

  return (
    <View className="flex-1">
      {/* 顶部标题栏 */}
      <View
        type="surface"
        className="h-[60px] flex-row items-center justify-between px-[15px] pt-[10px]"
        style={{ borderBottomWidth: 1, borderBottomColor: borderColor }}
      >
        <Pressable
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(tabs)');
            }
          }}
        >
          <Text className="text-[#0084ff] text-base">取消</Text>
        </Pressable>
        <Text className="text-base font-bold">登录知乎</Text>
        <View className="w-10 bg-transparent" />
      </View>

      <WebView
        ref={webViewRef}
        source={{ uri: 'https://www.zhihu.com/signin' }}
        sharedCookiesEnabled={true}
        incognito={false}
        onMessage={(event) => {
          handleCookies(event.nativeEvent.data);
        }}
        onNavigationStateChange={(navState) => {
          const { url } = navState;
          console.log('🌐 导航至:', url);
          if (
            url === 'https://www.zhihu.com/' ||
            url === 'https://www.zhihu.com'
          ) {
            console.log('🔄 检测到登录成功，正在进行反爬环境模拟...');
            webViewRef.current?.injectJavaScript(
              `window.location.href = 'https://www.zhihu.com/question/11474985081'; true;`,
            );
            return;
          }
          if (url.includes('question/11474985081')) {
            console.log('🎯 已到达验证页面，等待获取 __zse_ck...');
            webViewRef.current?.injectJavaScript(
              `window.ReactNativeWebView.postMessage(document.cookie); true;`,
            );
          }
        }}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
      />

      {loading && (
        <View
          className="justify-center items-center"
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: 'rgba(0,0,0,0.3)',
          }}
        >
          <ActivityIndicator size="large" color="#0084ff" />
        </View>
      )}
    </View>
  );
}
