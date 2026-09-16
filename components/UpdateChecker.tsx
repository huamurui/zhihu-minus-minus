import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import {
  createDownloadResumable,
  getContentUriAsync,
} from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  type AlertButton,
  Linking,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { AppDialog } from '@/components/overlays/AppDialog';
import { Text, useThemeColor } from '@/components/Themed';
import { showToast } from '@/utils/toast';

const GITHUB_RELEASE_API =
  'https://api.github.com/repos/huamurui/zhihu-minus-minus/releases/latest';
const IGNORED_VERSION_KEY = 'ignored_version_tag';

interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GithubRelease {
  tag_name?: string;
  assets?: GithubReleaseAsset[];
  html_url: string;
  body?: string;
}

export const useCheckUpdate = (
  onUpdate?: (url: string, version: string) => void,
) => {
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    const checkUpdate = async () => {
      // 延迟检查，避免干扰首屏路由
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        const response = await fetch(GITHUB_RELEASE_API);
        const data = (await response.json()) as GithubRelease;

        if (data?.tag_name) {
          const latestVersionTag = data.tag_name;
          const latestVersion = latestVersionTag.replace('v', '');
          const currentVersion = Constants.expoConfig?.version || '0.0.0';
          // const currentVersion = '0.0.0'; // Debug spoof

          // 检查是否已经忽略了此版本
          const ignoredVersion =
            await SecureStore.getItemAsync(IGNORED_VERSION_KEY);
          if (ignoredVersion === latestVersionTag) {
            return;
          }

          if (isVersionNewer(latestVersion, currentVersion)) {
            // 查找 APK 文件
            const apkAsset = data.assets?.find((asset) =>
              asset.name.endsWith('.apk'),
            );

            const buttons: AlertButton[] = [
              { text: '稍后', style: 'cancel' },
              {
                text: '忽略此版本',
                style: 'destructive',
                onPress: async () => {
                  await SecureStore.setItemAsync(
                    IGNORED_VERSION_KEY,
                    latestVersionTag,
                  );
                },
              },
            ];

            if (Platform.OS === 'android' && apkAsset) {
              buttons.push({
                text: '直接更新',
                onPress: () => {
                  if (onUpdateRef.current) {
                    onUpdateRef.current(
                      apkAsset.browser_download_url,
                      latestVersionTag,
                    );
                  } else {
                    downloadAndInstallApk(
                      apkAsset.browser_download_url,
                      latestVersionTag,
                    );
                  }
                },
              });
            }

            buttons.push({
              text: '去下载 (GitHub)',
              onPress: () => {
                const downloadUrl = data.html_url;
                if (Platform.OS === 'android') {
                  WebBrowser.openBrowserAsync(downloadUrl);
                } else {
                  Linking.openURL(downloadUrl);
                }
              },
            });

            Alert.alert(
              '发现新版本',
              `最新版本 ${latestVersionTag} 已发布。\n\n更新内容：\n${data.body || '无更新说明'}`,
              buttons,
            );
          }
        }
      } catch (error) {
        console.error('Failed to check for updates:', error);
      }
    };

    checkUpdate();
  }, []);
};

/**
 * Android APK Download & Install
 */
async function downloadAndInstallApk(
  url: string,
  version: string,
  onProgress?: (progress: number) => void,
  onStatusChange?: (isDownloading: boolean) => void,
) {
  try {
    onStatusChange?.(true);
    onProgress?.(0);
    const filename = `zhihu--_${version}.apk`;

    // Modern API v55: Use Paths class
    const cacheDir = Paths.cache?.uri;
    const docDir = Paths.document?.uri;
    const baseDir = cacheDir || docDir;

    if (!baseDir) {
      console.error(
        '[Update] Paths.cache.uri and Paths.document.uri are both empty',
      );
      throw new Error('Storage directory not found');
    }

    const fileUri =
      (baseDir.endsWith('/') ? baseDir : `${baseDir}/`) + filename;
    console.log('[Update] target path:', fileUri);

    // Modern API v55: Delete if exists to avoid "Destination already exists"
    try {
      const targetFile = new File(fileUri);
      if (typeof targetFile.delete === 'function') {
        await targetFile.delete();
      } else {
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
      }
    } catch (_e) {}

    showToast('开始下载更新...');

    let downloadedUri = '';

    // Always use legacy createDownloadResumable for progress support
    console.log('[Update] Using legacy createDownloadResumable for progress');
    const downloadResumable = createDownloadResumable(
      url,
      fileUri,
      {},
      (downloadProgress) => {
        const progress =
          downloadProgress.totalBytesWritten /
          downloadProgress.totalBytesExpectedToWrite;
        onProgress?.(progress);
      },
    );
    const result = await downloadResumable.downloadAsync();
    downloadedUri = result?.uri || '';

    if (downloadedUri) {
      onProgress?.(1);
      if (Platform.OS === 'android') {
        try {
          const cUri = await getContentUriAsync(downloadedUri);
          console.log('[Update] Content URI:', cUri);

          // android.intent.action.VIEW is the modern way to install APKs
          // FLAG_GRANT_READ_URI_PERMISSION (1) | FLAG_ACTIVITY_NEW_TASK (0x10000000)
          await IntentLauncher.startActivityAsync(
            'android.intent.action.VIEW',
            {
              data: cUri,
              flags: 1 | 0x10000000,
              type: 'application/vnd.android.package-archive',
            },
          );

          // Delay closing the modal to ensure the intent has time to launch
          setTimeout(() => onStatusChange?.(false), 1000);
        } catch (intentError) {
          console.error(
            '[Update] Intent failed, trying fallback sharing:',
            intentError,
          );
          onStatusChange?.(false);
          showToast('直接安装失败，尝试通过分享打开...');
          await Sharing.shareAsync(downloadedUri, {
            mimeType: 'application/vnd.android.package-archive',
            dialogTitle: '安装更新',
          });
        }
      } else {
        onStatusChange?.(false);
        await Sharing.shareAsync(downloadedUri);
      }
    } else {
      onStatusChange?.(false);
    }
  } catch (e: unknown) {
    onStatusChange?.(false);
    console.error('[Update] Error details:', e);
    showToast(`更新失败: ${e instanceof Error ? e.message : '未知错误'}`);
  }
}

/**
 * Simple version comparison
 * @param latest "0.0.6"
 * @param current "0.0.6"
 * @returns true if latest > current
 */
function isVersionNewer(latest: string, current: string): boolean {
  const latestParts = latest.split('.').map(Number);
  const currentParts = current.split('.').map(Number);

  for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
    const latestPart = latestParts[i] || 0;
    const currentPart = currentParts[i] || 0;

    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }

  return false;
}

export const UpdateChecker: React.FC = () => {
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const primaryColor = useThemeColor({}, 'primary');

  useCheckUpdate((url, version) => {
    downloadAndInstallApk(url, version, setDownloadProgress, setIsDownloading);
  });

  if (!isDownloading) return null;

  return (
    <AppDialog
      visible={isDownloading}
      title="正在下载更新"
      icon="cloud-download-outline"
      dismissible={false}
    >
      <View style={styles.progressContent}>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressBar,
              {
                width: `${downloadProgress * 100}%`,
                backgroundColor: primaryColor,
              },
            ]}
          />
        </View>
        <Text style={styles.percentText}>
          {(downloadProgress * 100).toFixed(1)}%
        </Text>
        <Text type="secondary" style={styles.hint}>
          下载完成后将自动启动安装
        </Text>
      </View>
    </AppDialog>
  );
};

const styles = StyleSheet.create({
  progressContent: {
    width: '100%',
    alignItems: 'center',
    marginTop: 22,
  },
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(128,128,128,0.2)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  percentText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 15,
  },
  hint: {
    fontSize: 13,
  },
});
