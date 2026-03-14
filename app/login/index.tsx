import { Text, View } from '@/components/Themed';
import { useAuthStore } from '@/store/useAuthStore';
import CookieManager from '@react-native-cookies/cookies';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { useColorScheme } from '@/components/useColorScheme';

import Colors from '@/constants/Colors';
export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const webViewRef = useRef<WebView>(null);
  const borderColor = Colors[colorScheme].border;

  const handleCookies = async (web_cookie: string) => {
    console.log(web_cookie, '1111')
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

      console.log(`📊 Cookie 状态: d_c0=${hasDc0}, z_c0=${hasZc0}, __zse_ck=${hasZseCk}`);

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
    <View style={styles.container}>
      {/* 顶部标题栏 */}
      <View type="surface" style={[styles.header, { borderBottomColor: borderColor }]}>
        <Pressable
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(tabs)');
            }
          }}>
          <Text style={styles.closeBtn}>取消</Text>
        </Pressable>
        <Text style={styles.title}>登录知乎</Text>
        <View style={{ width: 40, backgroundColor: 'transparent' }} />
      </View>

      <WebView
        ref={webViewRef}
        source={{ uri: 'https://www.zhihu.com/signin' }}
        onMessage={(event) => {
          handleCookies(event.nativeEvent.data);
        }}
        onNavigationStateChange={(navState) => {
          const { url } = navState;
          console.log('🌐 导航至:', url);

          // 核心逻辑：登录成功后跳转到首页 -> 强制跳转到特定问题页面进行反爬环境验证
          if (url === 'https://www.zhihu.com/' || url === 'https://www.zhihu.com') {
            console.log('🔄 检测到登录成功，正在进行反爬环境模拟...');
            // 修改 Webview 内部的 URL，触发环境检测脚本加载
            webViewRef.current?.injectJavaScript(`window.location.href = 'https://www.zhihu.com/question/11474985081'`);
            return;
          }

          // 如果到达了目标验证页面，等待 JS 执行完成后抓取 Cookie
          if (url.includes('question/11474985081')) {
            console.log('🎯 已到达验证页面，等待获取 __zse_ck...');
            // todo，目前加密还有问题，zse-ck 的 cookie 并没有帮助解开更多 api 限制，故先不管这里。
            // 延迟 3-5 秒，确保 知乎的 zse-ck 脚本运行完毕并设置了 Cookie
            // setTimeout(() => {
            webViewRef.current?.injectJavaScript(`window.ReactNativeWebView.postMessage(document.cookie)`);
            // }, 4000);
          }
        }}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
      />

      {loading && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#0084ff" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    paddingTop: 10,
  },
  closeBtn: { color: '#0084ff', fontSize: 16 },
  title: { fontSize: 16, fontWeight: 'bold' },
  loader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});