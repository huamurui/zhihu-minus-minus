import { useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewProps } from 'react-native-webview';
import { useThemeColor } from '@/components/Themed';

export type LoginMode = 'mobile' | 'qr';

const ZHIHU_SIGNIN = { uri: 'https://www.zhihu.com/signin' };

const ANDROID_DESKTOP_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Fit the desktop sign-in page even if it declares a device-width viewport.
// Leave other pages (including third-party authorization) to their own layout.
const DESKTOP_VIEWPORT = `
  if (location.origin === 'https://www.zhihu.com' && location.pathname === '/signin') {
    let viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) {
      viewport = document.createElement('meta');
      viewport.name = 'viewport';
      document.head.appendChild(viewport);
    }
    let lastWidth = 0;
    const fitPage = () => {
      const visual = window.visualViewport;
      const width = Math.round(visual ? visual.width * visual.scale : window.innerWidth);
      if (width <= 0 || width === lastWidth) return;
      lastWidth = width;
      viewport.content = 'width=980,initial-scale=' + Math.min(1, width / 980) + ',user-scalable=yes';
    };
    fitPage();
    window.addEventListener('resize', fitPage);
  }
  true;
`;

function isZhihuHomepage(url: string): boolean {
  try {
    const page = new URL(url);
    return page.origin === 'https://www.zhihu.com' && page.pathname === '/';
  } catch {
    return false;
  }
}

export function OfficialLoginWebView({
  mode,
  onLoginRedirect,
}: {
  mode: LoginMode;
  onLoginRedirect: () => void;
}) {
  const primaryColor = useThemeColor({}, 'primary');
  const [loading, setLoading] = useState(true);
  const mounted = useRef(false);
  const webViewRef = useRef<WebView<WebViewProps>>(null);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const desktop = mode === 'qr';
  return (
    <View style={{ flex: 1 }}>
      <WebView<WebViewProps>
        ref={webViewRef}
        source={ZHIHU_SIGNIN}
        sharedCookiesEnabled
        incognito={false}
        contentMode={desktop ? 'desktop' : 'mobile'}
        userAgent={
          desktop && Platform.OS === 'android'
            ? ANDROID_DESKTOP_USER_AGENT
            : undefined
        }
        onLoad={({ nativeEvent: { url } }) => {
          if (!mounted.current) return;
          if (isZhihuHomepage(url)) {
            // Android may deliver onPageFinished before it reports 100% progress.
            onLoginRedirect();
          } else if (desktop) {
            webViewRef.current?.injectJavaScript(DESKTOP_VIEWPORT);
          }
        }}
        onNavigationStateChange={({ url, loading: pageLoading }) => {
          // Android mobile sign-in may leave the homepage before it finishes.
          const checkOnStart = Platform.OS === 'android' && mode === 'mobile';
          if (
            mounted.current &&
            (!pageLoading || checkOnStart) &&
            isZhihuHomepage(url)
          ) {
            onLoginRedirect();
          }
        }}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
      />
      {loading && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.loading]}
        >
          <ActivityIndicator size="large" color={primaryColor} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
});
