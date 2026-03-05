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

  // 1. 注入脚本：不再使用定时器强制抓取，而是定义一个辅助函数或者保持空白
  const INJECTED_JS = `true;`; // 只是为了启用 injectedJavaScript

  const handleCookies = async (cookies: string) => {
    // 关键：只有当包含 z_c0 (登录 Token) 时才认为是有效的登录 Cookie
    // if (cookies.includes('z_c0')) {
    console.log('🍪 捕获到完整 Cookie:', cookies);
    const hasDc0 = cookies.includes('d_c0');
    const hasZc0 = cookies.includes('z_c0');
    console.log(`📊 Cookie 状态: d_c0=${hasDc0}, z_c0=${hasZc0}`);

    await SecureStore.setItemAsync('user_cookies', cookies);
    console.log('✅ 登录 Cookie 已保存至 SecureStore');

    // 成功后延迟跳转，确保存储生效
    setTimeout(() => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/profile');
      }
    }, 800);
    // }
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
        injectedJavaScript={INJECTED_JS}
        onMessage={(event) => {
          handleCookies(event.nativeEvent.data);
        }}
        onNavigationStateChange={(navState) => {
          console.log('🌐 导航至:', navState.url);

          // 如果检测到跳转到了首页、热榜或个人主页，说明登录可能已经成功
          const isSuccessPage =
            navState.url === 'https://www.zhihu.com/' ||
            navState.url.includes('zhihu.com/hot') ||
            navState.url.includes('zhihu.com/people/');

          if (isSuccessPage && !navState.loading) {
            console.log('🚀 检测到登录成功迹象，正在获取最终 Cookie...');
            webViewRef.current?.injectJavaScript(`window.ReactNativeWebView.postMessage(document.cookie)`);
          }
        }}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={(syntheticEvent) => {
          setLoading(false);
          const { nativeEvent } = syntheticEvent;
          // 每次页面加载完成都尝试抓取一次，以防万一
          if (!nativeEvent.loading) {
            webViewRef.current?.injectJavaScript(`window.ReactNativeWebView.postMessage(document.cookie)`);
          }
        }}
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