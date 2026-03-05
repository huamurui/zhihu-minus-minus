import { Text, View, useThemeColor } from '@/components/Themed';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

export default function LoginScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const webViewRef = useRef<WebView>(null);
  const borderColor = useThemeColor({}, 'border');

  // 1. 更加频繁的检测脚本
  const INJECTED_JS = `
    (function() {
      var lastCookie = "";
      setInterval(function() {
        var currentCookie = document.cookie;
        if (currentCookie !== lastCookie) {
          lastCookie = currentCookie;
          window.ReactNativeWebView.postMessage(currentCookie);
        }
      }, 500);
    })();
  `;

  const handleCookies = async (cookies: string) => {
    // 只要抓到了 z_c0，或者抓到了包含 q_c1 等知乎特有标志的 cookie
    if (cookies.includes('z_c0') || cookies.includes('d_c0')) {
      await SecureStore.setItemAsync('user_cookies', cookies);
      console.log('✅ Cookie 已保存');
      // 这里的延时是为了确保存储完成
      setTimeout(() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/(tabs)/profile');
        }
      }, 500);
    }
  };

  return (
    <View style={styles.container}>
      {/* 顶部加一个手动关闭按钮，防止由于逻辑失效被困在 WebView 里 */}
      <View type="surface" style={[styles.header, { borderBottomColor: borderColor }]}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.closeBtn}>取消</Text>
        </Pressable>
        <Text style={styles.title}>登录知乎</Text>
        <View style={{ width: 40, backgroundColor: 'transparent' }} />
      </View>

      <WebView
        ref={webViewRef}
        source={{ uri: 'https://www.zhihu.com/signin' }}
        injectedJavaScript={INJECTED_JS}
        onMessage={(event) => {
          handleCookies(event.nativeEvent.data);
        }}
        // 2. 关键：监听导航状态变化
        onNavigationStateChange={(navState) => {
          console.log('当前 URL:', navState.url);

          // 如果 URL 变成了知乎首页，或者包含 "signin" 之外的内容，说明跳走了
          if (
            (navState.url === 'https://www.zhihu.com/' ||
              navState.url.includes('zhihu.com/hot')) &&
            !navState.loading
          ) {
            console.log('🚀 检测到页面跳转，尝试收网...');
            // 此时尝试最后一次抓取 Cookie 并强制退出
            webViewRef.current?.injectJavaScript(`window.ReactNativeWebView.postMessage(document.cookie)`);
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