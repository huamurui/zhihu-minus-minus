import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { Modal, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import Colors from '@/constants/Colors';
import { useVerificationStore } from '@/store/useVerificationStore';
import { BouncyButton } from './BouncyButton';
import { Text, View } from './Themed';

export const VerificationModal = () => {
  const queryClient = useQueryClient();
  const { isVisible, verificationUrl, hide } = useVerificationStore();

  const handleNavigationStateChange = (navState: any) => {
    // 知乎验证成功后通常会自动跳转回之前的页面或者知乎首页
    // 如果 URL 中不再包含 'unhuman' 且不是验证码相关的 URL，可以认为验证成功
    if (
      navState.url &&
      !navState.url.includes('unhuman') &&
      !navState.url.includes('captcha') &&
      (navState.url.includes('zhihu.com') || navState.url === 'about:blank')
    ) {
      // 延迟关闭以确保用户看到成功的反馈（如果页面有的话）
      setTimeout(() => {
        hide();
        // 恢复所有活跃的查询。这会让之前因为 40352 停掉或者已过期的查询重新加载。
        queryClient.refetchQueries({ type: 'active' });
      }, 1000);
    }
  };

  if (!verificationUrl) return null;

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={hide}
    >
      <SafeAreaView style={styles.container}>
        <StatusBar
          style="dark"
          backgroundColor={Colors.light.backgroundSecondary}
        />
        <View style={styles.header}>
          <Text
            lightColor={Colors.light.text}
            darkColor={Colors.dark.textInverse}
            style={styles.title}
          >
            安全验证
          </Text>
          <BouncyButton onPress={hide} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#666" />
          </BouncyButton>
        </View>
        <WebView
          style={styles.webView}
          source={{ uri: verificationUrl }}
          onNavigationStateChange={handleNavigationStateChange}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          incognito={false} // 不要用无痕，这样验证后的 cookie 才能保存到系统
        />
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  header: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
    position: 'relative',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
  },
  closeButton: {
    position: 'absolute',
    right: 15,
    padding: 5,
  },
  webView: {
    backgroundColor: Colors.light.backgroundSecondary,
  },
});
