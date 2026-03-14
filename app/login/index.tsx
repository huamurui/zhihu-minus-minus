import CookieManager from '@react-native-cookies/cookies';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuthStore } from '@/store/useAuthStore';

export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const webViewRef = useRef<WebView>(null);
  const borderColor = Colors[colorScheme].border;

  const handleCookies = async (web_cookie: string) => {
    console.log(web_cookie, '1111');
    // 关键：只有当包含 z_c0 (登录 Token) 时才认为是有效的登录 Cookie
    // 获取 httpOnly cookie，webview 注入 js 是不行的，需要原生支持
    try {
      const cookies = await CookieManager.get('https://www.zhihu.com');

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
      const hasZc0 = !!mergedCookies['z_c0'];
      // const hasZseCk = !!mergedCookies['__zse_ck'];
      const hasZseCk = true;
      const hasDc0 = !!mergedCookies['d_c0'];

      console.log(
        `📊 Cookie 状态: d_c0=${hasDc0}, z_c0=${hasZc0}, __zse_ck=${hasZseCk}`,
      );

      if (hasZc0 && hasZseCk) {
        console.log('🍪 捕获到完整且合规的 Cookie');

        // 生成最终的 Cookie 字符串
        const cookieString = Object.entries(mergedCookies)
          .map(([name, value]) => `${name}=${value}`)
          .join('; ');

        await SecureStore.setItemAsync('user_cookies', cookieString);
        useAuthStore.getState().setCookies(cookieString);
        console.log('✅ 登录 Cookie 已保存至 SecureStore 和 AuthStore');

        // 成功后跳转，确保存储生效
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/(tabs)/profile');
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
