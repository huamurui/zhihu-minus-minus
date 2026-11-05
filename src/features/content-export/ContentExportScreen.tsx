import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewProps } from 'react-native-webview';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, useRuntimeThemeColors } from '@/components/Themed';
import { ThemedSwitch } from '@/components/ThemedSwitch';
import { useSettingsStore } from '@/store/useSettingsStore';
import { saveExport, saveExportImages, shareExport } from './files';
import { useImageExport } from './ImageExportRenderer';
import { serializeExportHtml, serializeExportMarkdown } from './serializers';
import type {
  ExportFormat,
  ExportProgress,
  ExportRenderOptions,
  ExportTarget,
} from './types';
import { exportErrorMessage, useContentExport } from './useContentExport';

const FORMATS: readonly {
  id: ExportFormat;
  title: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  {
    id: 'markdown',
    title: 'Markdown',
    description: '笔记与编辑',
    icon: 'document-text-outline',
  },
  { id: 'html', title: 'HTML', description: '离线阅读', icon: 'globe-outline' },
  {
    id: 'pdf',
    title: 'PDF',
    description: '保存与打印',
    icon: 'document-outline',
  },
  {
    id: 'image',
    title: '长图',
    description: '分享与相册',
    icon: 'image-outline',
  },
];

function progressLabel(progress: ExportProgress): string {
  const label = {
    source: '正在读取正文',
    assets: '正在准备图片',
    render: '正在生成文件',
    merge: '正在合成长图',
    write: '正在写入文件',
  }[progress.phase];
  return progress.total
    ? `${label} ${progress.completed ?? 0} / ${progress.total}`
    : `${label}…`;
}

export function ContentExportScreen({
  target,
  active,
}: {
  target: ExportTarget;
  active: boolean;
}) {
  const colors = useRuntimeThemeColors();
  const insets = useSafeAreaInsets();
  const fontSizeScale = useSettingsStore((state) => state.fontSizeScale);
  const lineHeightScale = useSettingsStore((state) => state.lineHeightScale);
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const [images, setImages] = useState(true);
  const [readingStyle, setReadingStyle] = useState(false);
  const [acceptPartial, setAcceptPartial] = useState(false);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const deliveryLock = useRef(false);
  const [notice, setNotice] = useState<string>();
  const [preview, setPreview] = useState('');
  const [previewError, setPreviewError] = useState(false);
  const { capture, renderer } = useImageExport();
  const job = useContentExport(target, active, capture);
  const options: ExportRenderOptions = useMemo(
    () => ({
      includeImages: images,
      fontSizeScale: readingStyle ? fontSizeScale : 1,
      lineHeightScale: readingStyle ? lineHeightScale : 1.6,
      palette: readingStyle
        ? {
            background: colors.background,
            text: colors.text,
            secondary: colors.textSecondary,
            link: colors.link,
            border: colors.border,
            surface: colors.backgroundSecondary,
          }
        : undefined,
    }),
    [images, readingStyle, fontSizeScale, lineHeightScale, colors],
  );
  const source = job.source;
  useEffect(() => {
    setPreview('');
    setPreviewError(false);
    if (!source) return;
    let alive = true;
    const timer = setTimeout(() => {
      try {
        const next =
          format === 'markdown'
            ? serializeExportMarkdown(source, {
                ...options,
                includeImages: true,
                allowRemoteImages: true,
              })
            : serializeExportHtml(source, {
                ...options,
                allowRemoteImages: false,
              });
        if (alive) setPreview(next);
      } catch {
        if (alive) setPreviewError(true);
      }
    }, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [source, format, options]);
  const busy = Boolean(job.progress) || deliveryBusy;
  const generationBlocked =
    busy || (source?.completeness === 'partial' && !acceptPartial);
  const change = (action: () => void) => {
    if (busy) return;
    job.resetOutput();
    setNotice(undefined);
    action();
  };
  const deliver = async (action: 'share' | 'save' | 'gallery') => {
    if (!job.result || deliveryLock.current) return;
    deliveryLock.current = true;
    setDeliveryBusy(true);
    setNotice(undefined);
    try {
      const context = job.resultContext();
      context.assertActive();
      if (action === 'gallery') {
        await saveExportImages(job.result, context);
        context.assertActive();
        setNotice('图片已保存到相册');
      } else if (action === 'save') {
        const saved = await saveExport(job.result, context);
        context.assertActive();
        setNotice(
          saved
            ? Platform.OS === 'ios'
              ? '已打开系统保存/分享面板'
              : '文件已保存到所选目录'
            : '已取消保存',
        );
      } else {
        await shareExport(job.result, context);
        context.assertActive();
        setNotice('已打开系统分享');
      }
    } catch (error) {
      setNotice(exportErrorMessage(error, '保存或分享失败，请重试'));
    } finally {
      deliveryLock.current = false;
      setDeliveryBusy(false);
    }
  };
  const selectedName = FORMATS.find((item) => item.id === format)?.title ?? '';
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        nestedScrollEnabled
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 28 },
        ]}
      >
        {job.reading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.link} />
            <Text>正在读取完整正文…</Text>
          </View>
        ) : null}
        {source ? (
          <>
            <Text style={styles.title}>{source.title}</Text>
            <Text type="secondary">
              {source.author || '作者未提供'} ·{' '}
              {source.completeness === 'complete'
                ? '已读取完整正文'
                : '当前仅有部分正文'}
            </Text>
            {source.warnings.map((warning) => (
              <Text key={warning} type="secondary">
                {warning}
              </Text>
            ))}
            {source.completeness === 'partial' ? (
              <View style={styles.option}>
                <Text style={styles.optionText}>
                  允许导出当前部分内容（文件中会保留说明）
                </Text>
                <ThemedSwitch
                  accessibilityLabel="允许导出部分内容"
                  value={acceptPartial}
                  onValueChange={setAcceptPartial}
                  disabled={busy}
                />
              </View>
            ) : null}
            <View style={styles.formats} accessibilityRole="radiogroup">
              {FORMATS.map((item) => (
                <BouncyButton
                  key={item.id}
                  accessibilityRole="radio"
                  accessibilityLabel={item.title}
                  accessibilityState={{
                    selected: format === item.id,
                    disabled: busy,
                  }}
                  disabled={busy}
                  onPress={() => change(() => setFormat(item.id))}
                  style={[
                    styles.format,
                    {
                      borderColor:
                        format === item.id ? colors.link : colors.border,
                      backgroundColor: colors.backgroundSecondary,
                    },
                  ]}
                >
                  <Ionicons name={item.icon} size={22} color={colors.link} />
                  <View style={styles.formatText}>
                    <Text style={styles.formatTitle}>{item.title}</Text>
                    <Text type="secondary" style={styles.small}>
                      {item.description}
                    </Text>
                  </View>
                </BouncyButton>
              ))}
            </View>
            <View style={styles.option}>
              <View style={styles.optionText}>
                <Text>
                  {format === 'markdown' ? '附带离线图片' : '包含正文图片'}
                </Text>
                <Text type="secondary" style={styles.small}>
                  {format === 'markdown'
                    ? images
                      ? '生成 ZIP：正文 .md 与 assets 图片目录'
                      : '生成 .md，保留远程图片链接'
                    : '图片准备失败时可重试或选择缺图导出'}
                </Text>
              </View>
              <ThemedSwitch
                accessibilityLabel={
                  format === 'markdown' ? '附带离线图片' : '包含正文图片'
                }
                value={images}
                onValueChange={(value) => change(() => setImages(value))}
                disabled={busy}
              />
            </View>
            {format !== 'markdown' ? (
              <View style={styles.option}>
                <View style={styles.optionText}>
                  <Text>跟随阅读设置</Text>
                  <Text type="secondary" style={styles.small}>
                    关闭时使用浅色阅读版
                  </Text>
                </View>
                <ThemedSwitch
                  accessibilityLabel="跟随阅读设置"
                  value={readingStyle}
                  onValueChange={(value) =>
                    change(() => setReadingStyle(value))
                  }
                  disabled={busy}
                />
              </View>
            ) : null}
            {format === 'image' ? (
              <Text type="secondary">
                自动合成一张长图，超长内容分为少量图片；多图分享时打包为 ZIP。
              </Text>
            ) : null}
            {format === 'pdf' ? (
              <Text type="secondary">
                按 A4 分页，标题、表格和图片可能随平台排版略有差异。
              </Text>
            ) : null}
            <Text style={styles.sectionTitle}>内容预览</Text>
            <Text type="secondary" style={styles.small}>
              图片在生成时准备；这里展示内容结构，分页与分图以生成文件为准。
            </Text>
            {previewError ? (
              <Text type="secondary">预览暂时不可用，可尝试生成文件。</Text>
            ) : !preview ? (
              <ActivityIndicator color={colors.link} />
            ) : format === 'markdown' ? (
              <ScrollView
                style={[
                  styles.preview,
                  { backgroundColor: colors.backgroundSecondary },
                ]}
                nestedScrollEnabled
              >
                <Text selectable style={styles.markdown}>
                  {preview.slice(0, 12000)}
                  {preview.length > 12000
                    ? '\n\n（预览已截短，导出仍包含全部已读取正文）'
                    : ''}
                </Text>
              </ScrollView>
            ) : (
              <View style={styles.preview}>
                <WebView<WebViewProps>
                  nestedScrollEnabled
                  source={{ html: preview }}
                  originWhitelist={['*']}
                  javaScriptEnabled={false}
                  domStorageEnabled={false}
                  sharedCookiesEnabled={false}
                  thirdPartyCookiesEnabled={false}
                  allowFileAccess={false}
                  onShouldStartLoadWithRequest={(request) =>
                    request.url === 'about:blank'
                  }
                  setSupportMultipleWindows={false}
                  textZoom={100}
                  style={{
                    flex: 1,
                    backgroundColor: colors.backgroundSecondary,
                  }}
                />
              </View>
            )}
            {job.progress ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.link} />
                <Text accessibilityLiveRegion="polite">
                  {progressLabel(job.progress)}
                </Text>
                <BouncyButton
                  accessibilityRole="button"
                  onPress={job.resetOutput}
                >
                  <Text type="primary">取消导出</Text>
                </BouncyButton>
              </View>
            ) : null}
            {job.missing.length ? (
              <View
                style={[
                  styles.warning,
                  { backgroundColor: colors.backgroundSecondary },
                ]}
              >
                <Text style={styles.sectionTitle}>部分图片未能准备好</Text>
                {job.missing.map((warning) => (
                  <Text key={warning} type="secondary">
                    {warning}
                  </Text>
                ))}
                <BouncyButton
                  accessibilityRole="button"
                  disabled={generationBlocked}
                  onPress={() => {
                    void job.generate(format, options);
                  }}
                  style={styles.secondary}
                >
                  <Text type="primary">重新准备</Text>
                </BouncyButton>
                <BouncyButton
                  accessibilityRole="button"
                  disabled={generationBlocked}
                  onPress={job.continueWithoutImages}
                  style={styles.secondary}
                >
                  <Text type="primary">继续缺图导出</Text>
                </BouncyButton>
              </View>
            ) : null}
            {job.result ? (
              <View style={styles.result}>
                <Text style={styles.sectionTitle}>文件已生成</Text>
                {format === 'image' ? (
                  <Text type="secondary">
                    {job.result.files.length === 1
                      ? '已自动合并为一张长图'
                      : `内容较长，已自动合并为 ${job.result.files.length} 张长图`}
                  </Text>
                ) : null}
                {job.result.files.map((file) => (
                  <Text key={file.uri}>{file.name}</Text>
                ))}
                {job.result.warnings.map((warning) => (
                  <Text key={warning} type="secondary">
                    {warning}
                  </Text>
                ))}
                <BouncyButton
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    void deliver('share');
                  }}
                  style={[styles.primary, { backgroundColor: colors.primary }]}
                >
                  <Text style={{ color: colors.onPrimary }}>分享文件</Text>
                </BouncyButton>
                <BouncyButton
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    void deliver('save');
                  }}
                  style={[styles.secondary, { borderColor: colors.border }]}
                >
                  <Text type="primary">保存到文件</Text>
                </BouncyButton>
                {format === 'image' ? (
                  <BouncyButton
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => {
                      void deliver('gallery');
                    }}
                    style={styles.secondary}
                  >
                    <Text type="primary">
                      {job.result.files.length === 1
                        ? '保存到相册'
                        : '全部保存到相册'}
                    </Text>
                  </BouncyButton>
                ) : null}
                <Text type="secondary" style={styles.small}>
                  文件暂存在应用缓存，请保存到文件或相册后长期保留。
                </Text>
              </View>
            ) : null}
            {!job.result && !job.missing.length ? (
              <BouncyButton
                accessibilityRole="button"
                accessibilityLabel={`生成 ${selectedName}`}
                disabled={generationBlocked}
                onPress={() => {
                  setNotice(undefined);
                  void job.generate(format, options);
                }}
                style={[
                  styles.primary,
                  {
                    backgroundColor: colors.primary,
                    opacity: generationBlocked ? 0.5 : 1,
                  },
                ]}
              >
                <Text style={{ color: colors.onPrimary }}>
                  生成 {selectedName}
                </Text>
              </BouncyButton>
            ) : null}
            <Text type="secondary" style={styles.small}>
              保留作者、正文与原文链接。
            </Text>
          </>
        ) : null}
        {job.error ? (
          <View accessibilityLiveRegion="polite" style={styles.result}>
            <Text type="danger">{job.error}</Text>
            {!source ? (
              <BouncyButton
                accessibilityRole="button"
                onPress={job.retrySource}
                style={styles.secondary}
              >
                <Text type="primary">重新读取正文</Text>
              </BouncyButton>
            ) : null}
          </View>
        ) : null}
        {notice ? (
          <Text accessibilityLiveRegion="polite" type="secondary">
            {notice}
          </Text>
        ) : null}
      </ScrollView>
      {renderer}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, gap: 14 },
  title: { fontSize: 22, fontWeight: '700' },
  loading: { alignItems: 'center', padding: 20, gap: 12 },
  formats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  format: {
    flexGrow: 1,
    flexBasis: '45%',
    padding: 14,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  formatText: { flexShrink: 1 },
  formatTitle: { fontSize: 16, fontWeight: '600' },
  small: { fontSize: 12, lineHeight: 18 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 52,
  },
  optionText: { flex: 1 },
  sectionTitle: { fontSize: 17, fontWeight: '600' },
  preview: { height: 300, borderRadius: 10, overflow: 'hidden' },
  markdown: {
    fontFamily: 'monospace',
    padding: 14,
    fontSize: 13,
    lineHeight: 21,
  },
  primary: {
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 48,
  },
  secondary: {
    padding: 12,
    alignItems: 'center',
    borderRadius: 12,
    minHeight: 44,
  },
  result: { gap: 12 },
  warning: { padding: 16, borderRadius: 12, gap: 10 },
});
