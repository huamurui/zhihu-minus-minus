import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, StyleSheet } from 'react-native';
import { WebView, type WebViewProps } from 'react-native-webview';
import {
  getQqQrLoginUrl,
  isZhihuLoginCompletionUrl,
  LOGIN_COOKIE_SCRIPT,
  QQ_DESKTOP_USER_AGENT,
  ZHIHU_SIGN_IN_URL,
} from '@/utils/loginWebView';
import { showToast } from '@/utils/toast';
import { sanitizeNavigationUrlForLog } from '@/utils/url';
import { BouncyButton } from './BouncyButton';
import { Text, useThemeColor, View } from './Themed';

export function LoginWebView({
  onCookies,
}: {
  onCookies: (cookies: string) => void;
}) {
  const primaryColor = useThemeColor({}, 'primary');
  const webViewRef = useRef<WebView<WebViewProps>>(null);
  const [page, setPage] = useState({
    uri: ZHIHU_SIGN_IN_URL,
    qqQr: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        webViewRef.current?.injectJavaScript(LOGIN_COOKIE_SCRIPT);
      }
    });
    return () => subscription.remove();
  }, []);

  const shouldLoad = (url: string): boolean => {
    const qrUrl = getQqQrLoginUrl(url);
    if (qrUrl && (!page.qqQr || qrUrl !== url)) {
      setLoading(true);
      setPage({ uri: qrUrl, qqQr: true });
      return false;
    }
    if (/^https?:\/\//i.test(url) || url === 'about:blank') return true;

    if (page.qqQr || /^(?:mqq(?:api|opensdkapi)?|wtloginmqq\d*):/i.test(url)) {
      showToast('请使用 QQ 扫描二维码，确认授权后返回本应用');
    } else {
      // Handle this ourselves so WebView never logs a sensitive login URL.
      void Linking.openURL(url).catch(() => {
        showToast('无法打开登录应用，请选择其他登录方式');
      });
    }
    return false;
  };

  return (
    <View className="flex-1">
      {page.qqQr && (
        <View type="surface" className="p-3 gap-2">
          <Text className="font-bold">QQ 扫码登录</Text>
          <Text type="secondary">
            使用 QQ 扫描网页中的二维码并确认授权。同一手机可先截图，再用 QQ
            的“扫一扫 →
            相册”识别；完成后返回本应用。二维码失效时请在网页中刷新。
          </Text>
          <BouncyButton
            onPress={() => {
              setLoading(true);
              setPage({ uri: ZHIHU_SIGN_IN_URL, qqQr: false });
            }}
          >
            <Text type="primary">返回其他登录方式</Text>
          </BouncyButton>
        </View>
      )}
      <View className="flex-1">
        <WebView<WebViewProps>
          // Mount with the desktop UA before the first QQ request is sent.
          key={page.qqQr ? 'qq-qr' : 'zhihu'}
          ref={webViewRef}
          source={{ uri: page.uri }}
          userAgent={page.qqQr ? QQ_DESKTOP_USER_AGENT : undefined}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          domStorageEnabled
          incognito={false}
          originWhitelist={['*']}
          setSupportMultipleWindows={false}
          onShouldStartLoadWithRequest={({ url }) => shouldLoad(url)}
          onOpenWindow={({ nativeEvent: { targetUrl } }) => {
            if (shouldLoad(targetUrl)) {
              setLoading(true);
              setPage((current) => ({ ...current, uri: targetUrl }));
            }
          }}
          injectedJavaScript={LOGIN_COOKIE_SCRIPT}
          onMessage={({ nativeEvent }) => {
            if (isZhihuLoginCompletionUrl(nativeEvent.url)) {
              onCookies(nativeEvent.data);
            }
          }}
          onNavigationStateChange={({ url }) => {
            console.log('🌐 导航至:', sanitizeNavigationUrlForLog(url));
            if (isZhihuLoginCompletionUrl(url)) {
              webViewRef.current?.injectJavaScript(LOGIN_COOKIE_SCRIPT);
            }
          }}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            console.warn('登录页面加载失败');
            setLoading(false);
          }}
          renderError={() => (
            <View className="flex-1 items-center justify-center gap-3">
              <Text>登录页面加载失败，请检查网络后重试</Text>
              <BouncyButton onPress={() => webViewRef.current?.reload()}>
                <Text type="primary">重新加载</Text>
              </BouncyButton>
            </View>
          )}
        />
        {loading && (
          <View
            pointerEvents="none"
            className="justify-center items-center"
            style={{
              ...StyleSheet.absoluteFill,
              backgroundColor: 'rgba(0,0,0,0.3)',
            }}
          >
            <ActivityIndicator size="large" color={primaryColor} />
          </View>
        )}
      </View>
    </View>
  );
}
