import type React from 'react';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '@/constants/designTokens';
import { useSettingsStore } from '@/store/useSettingsStore';

interface LaTeXRendererProps {
  tex: string;
  inline?: boolean;
  colorScheme: 'light' | 'dark';
  width: number;
}

export const LaTeXRenderer: React.FC<LaTeXRendererProps> = ({
  tex,
  inline = false,
  colorScheme,
  width,
}) => {
  const [height, setHeight] = useState(inline ? 30 : 60);
  const [loading, setLoading] = useState(true);
  const { primaryColor: customPrimaryColor } = useSettingsStore();
  const primaryColor = customPrimaryColor || colors.light.primary;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
      <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
      <style>
        body {
          margin: 0;
          padding: 4px;
          display: flex;
          justify-content: ${inline ? 'flex-start' : 'center'};
          align-items: center;
          background-color: transparent;
          color: ${colors[colorScheme].text};
          overflow: hidden;
        }
        #math {
          font-size: 1.1em;
          white-space: ${inline ? 'nowrap' : 'normal'};
        }
        .katex-display {
          margin: 0;
        }
      </style>
    </head>
    <body>
      <div id="math"></div>
      <script>
        function sendHeight() {
          const height = document.body.offsetHeight || document.documentElement.offsetHeight || document.getElementById('math').scrollHeight;
          window.ReactNativeWebView.postMessage(JSON.stringify({ height }));
        }

        try {
          katex.render(${JSON.stringify(tex)}, document.getElementById('math'), {
            displayMode: ${!inline},
            throwOnError: false,
            trust: true
          });
          // 多次尝试获取正确高度以应对字体加载
          sendHeight();
          setTimeout(sendHeight, 100);
          setTimeout(sendHeight, 500);
          setTimeout(sendHeight, 1000);
        } catch (e) {
          document.getElementById('math').textContent = ${JSON.stringify(tex)};
          sendHeight();
        }
      </script>
    </body>
    </html>
  `;

  return (
    <View
      style={{ width, height, minHeight: height }}
      className="bg-transparent overflow-hidden"
    >
      <WebView
        source={{ html }}
        style={{
          backgroundColor: 'transparent',
          width: '100%',
          height: '100%',
        }}
        scrollEnabled={false}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.height && data.height > 0) {
              setHeight(Math.max(data.height, inline ? 20 : 40));
            }
          } catch (_e) {}
          setLoading(false);
        }}
        onLoadEnd={() => setLoading(false)}
      />
      {loading && (
        <View
          style={StyleSheet.absoluteFill}
          className="justify-center items-center bg-transparent"
        >
          <ActivityIndicator size="small" color={primaryColor} />
        </View>
      )}
    </View>
  );
};
