import { Text, View, useThemeColor } from '@/components/Themed';
import { useAuthStore } from '@/store/useAuthStore';
import CookieManager from '@react-native-cookies/cookies';
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

  const handleCookies = async () => {
    // 关键：只有当包含 z_c0 (登录 Token) 时才认为是有效的登录 Cookie
    // 获取 httpOnly cookie，webview 注入 js 是不行的，需要原生支持
    try {
      const cookies = await CookieManager.get('https://www.zhihu.com');

      // CookieManager.get 返回的是一个对象 { [name: string]: Cookie }
      if (cookies && cookies['z_c0']) {
        console.log('🍪 捕获到完整 Cookie (包含 z_c0)');

        // 将对象转换为 key=value; 格式的字符串，方便 axios 使用
        const cookieString = Object.values(cookies)
          .map(c => `${c.name}=${c.value}`)
          .join('; ');

        const hasDc0 = !!cookies['d_c0'];
        const hasZc0 = !!cookies['z_c0'];
        console.log(`📊 Cookie 状态: d_c0=${hasDc0}, z_c0=${hasZc0}`);

        await SecureStore.setItemAsync('user_cookies', cookieString);
        useAuthStore.getState().setCookies(cookieString);
        console.log('✅ 登录 Cookie 已保存至 SecureStore 和 AuthStore');

        // 成功后延迟跳转，确保存储生效
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/(tabs)/profile');
        }
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
          handleCookies();
        }}
        onNavigationStateChange={(navState) => {
          console.log('🌐 导航至:', navState.url);
          handleCookies();
          // 如果检测到跳转到了首页、热榜或个人主页，说明登录可能已经成功
          const isSuccessPage =
            navState.url === 'https://www.zhihu.com/' ||
            navState.url.includes('zhihu.com/hot') ||
            navState.url.includes('zhihu.com/people/');

        }}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={(syntheticEvent) => {
          setLoading(false);
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