import { Redirect, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAnswer } from '@/api/zhihu/answer';
import { getArticle } from '@/api/zhihu/article';
import { Text, useThemeColor } from '@/components/Themed';
import {
  isRichTextNativeAvailable,
  ZhihuNativeContent,
  type ZhihuNativePerformanceEvent,
  type ZhihuNativePerformanceTrace,
} from '@/features/rich-content';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { ZhihuSegmentInfo } from '@/types/zhihu';
import { richContentExperimentEnabled } from '@/utils/richContentExperiment';

type ContentType = 'answer' | 'article';

interface LoadedContent {
  type: ContentType;
  id: string;
  content: string;
  title: string;
  segmentInfos?: readonly ZhihuSegmentInfo[];
  linkCardInfo?: Readonly<Record<string, unknown>>;
  possiblyIncomplete: boolean;
  session: number;
}

function parseContentTarget(
  input: string,
  selectedType: ContentType,
): { type: ContentType; id: string } | null {
  const value = input.trim();
  if (/^\d{1,25}$/.test(value)) return { type: selectedType, id: value };

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (host === 'www.zhihu.com' || host === 'zhihu.com') {
      const answer = url.pathname.match(
        /^\/(?:question\/\d+\/)?answer\/(\d{1,25})\/?$/,
      );
      if (answer) return { type: 'answer', id: answer[1] };
    }
    if (host === 'zhuanlan.zhihu.com') {
      const article = url.pathname.match(/^\/p\/(\d{1,25})\/?$/);
      if (article) return { type: 'article', id: article[1] };
    }
  } catch {
    return null;
  }
  return null;
}

export default function RichContentExperimentRoute() {
  if (!richContentExperimentEnabled) return <Redirect href="/" />;
  return <RichContentExperimentScreen />;
}

function RichContentExperimentScreen() {
  const insets = useSafeAreaInsets();
  const primary = useThemeColor({}, 'primary');
  const onPrimary = useThemeColor({}, 'onPrimary');
  const background = useThemeColor({}, 'background');
  const surface = useThemeColor({}, 'backgroundSecondary');
  const border = useThemeColor({}, 'border');
  const foreground = useThemeColor({}, 'text');
  const secondary = useThemeColor({}, 'textSecondary');
  const fontSizeScale = useSettingsStore((state) => state.fontSizeScale);
  const lineHeightScale = useSettingsStore((state) => state.lineHeightScale);
  const cookies = useAuthStore((state) => state.cookies);
  const activeAccountIndex = useAuthStore((state) => state.activeAccountIndex);
  const [input, setInput] = useState('');
  const [selectedType, setSelectedType] = useState<ContentType>('answer');
  const [content, setContent] = useState<LoadedContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nativeAutoSize, setNativeAutoSize] = useState(false);
  const [mountIndex, setMountIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [trace, setTrace] = useState<ZhihuNativePerformanceTrace | undefined>();
  const [traceEvents, setTraceEvents] = useState<ZhihuNativePerformanceEvent[]>([]);
  const requestRef = useRef<AbortController | null>(null);
  const activeRenderKey = useRef<string | null>(null);
  const traceIdRef = useRef(0);
  const traceEventsRef = useRef<ZhihuNativePerformanceEvent[]>([]);
  const traceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeAvailable = isRichTextNativeAvailable();

  const clearTrace = () => {
    traceIdRef.current += 1;
    if (traceTimerRef.current) clearTimeout(traceTimerRef.current);
    traceTimerRef.current = null;
    traceEventsRef.current = [];
    setTraceEvents([]);
    setTrace(undefined);
  };

  const startTrace = () => {
    const traceId = ++traceIdRef.current;
    if (traceTimerRef.current) clearTimeout(traceTimerRef.current);
    traceTimerRef.current = null;
    traceEventsRef.current = [];
    setTraceEvents([]);
    setTrace({
      startedAt: performance.now(),
      onEvent: (event) => {
        if (traceIdRef.current !== traceId || !Number.isFinite(event.elapsedMs))
          return;
        if (traceEventsRef.current.length >= 1024) return;
        traceEventsRef.current.push(event);
        if (traceTimerRef.current) return;
        // Do not re-render the screen for each flow while measuring layout.
        traceTimerRef.current = setTimeout(() => {
          traceTimerRef.current = null;
          if (traceIdRef.current === traceId)
            setTraceEvents([...traceEventsRef.current]);
        }, 1000);
      },
    });
  };

  useEffect(() => {
    setContent(null);
    activeRenderKey.current = null;
    traceEventsRef.current = [];
    setTraceEvents([]);
    setTrace(undefined);
    setLoading(false);
    setError(null);
    setReady(false);
    return () => {
      requestRef.current?.abort();
      requestRef.current = null;
      traceIdRef.current += 1;
      if (traceTimerRef.current) clearTimeout(traceTimerRef.current);
      traceTimerRef.current = null;
    };
  }, [cookies, activeAccountIndex]);

  const loadContent = async () => {
    const target = parseContentTarget(input, selectedType);
    if (!target) {
      setError('请输入回答或文章 ID，或对应的知乎网页链接。');
      return;
    }
    requestRef.current?.abort();
    const controller = new AbortController();
    const session = getAuthSessionVersion();
    requestRef.current = controller;
    setSelectedType(target.type);
    setContent(null);
    activeRenderKey.current = null;
    clearTrace();
    setReady(false);
    setError(null);
    setLoading(true);
    try {
      let loaded: LoadedContent;
      if (target.type === 'answer') {
        const result = await getAnswer(target.id, undefined, {
          signal: controller.signal,
        });
        loaded = {
          type: 'answer',
          id: target.id,
          content: result.content,
          title: result.question?.title || '回答正文',
          segmentInfos: result.segment_infos,
          linkCardInfo: result.link_card_info,
          possiblyIncomplete:
            result.content_need_truncated === true || result.paid_info != null,
          session,
        };
      } else {
        const result = await getArticle(target.id, {
          signal: controller.signal,
        });
        loaded = {
          type: 'article',
          id: target.id,
          content: result.content,
          title: result.title || '文章正文',
          linkCardInfo: result.link_card_info,
          possiblyIncomplete: false,
          session,
        };
      }
      if (
        controller.signal.aborted ||
        requestRef.current !== controller ||
        getAuthSessionVersion() !== session
      )
        return;
      if (typeof loaded.content !== 'string' || !loaded.content.trim()) {
        setError('知乎没有返回可显示的正文。');
        return;
      }
      startTrace();
      setContent(loaded);
    } catch {
      if (!controller.signal.aborted && requestRef.current === controller)
        setError('获取正文失败，请检查链接、网络和登录状态后重试。');
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  };

  const visibleContent =
    content?.session === getAuthSessionVersion() ? content : null;
  const renderKey = visibleContent
    ? `${visibleContent.type}:${visibleContent.id}:${nativeAutoSize}:${mountIndex}`
    : null;
  activeRenderKey.current = renderKey;
  const irEvents = traceEvents.filter((event) => event.phase === 'ir-ready');
  const heightEvents = traceEvents.filter((event) => event.phase === 'height');
  const layoutEvents = traceEvents.filter((event) => event.phase === 'layout');
  const maximum = (values: readonly (number | null | undefined)[]) => {
    const numbers = values.filter(
      (value): value is number =>
        typeof value === 'number' && Number.isFinite(value) && value >= 0,
    );
    return numbers.length > 0 ? `${Math.max(...numbers).toFixed(2)} ms` : '—';
  };
  const firstAndLast = (events: readonly ZhihuNativePerformanceEvent[]) => {
    if (events.length === 0) return '—';
    const times = events.map((event) => event.elapsedMs);
    return `${Math.min(...times).toFixed(2)} / ${Math.max(...times).toFixed(2)} ms`;
  };

  return (
    <View style={[styles.screen, { backgroundColor: background }]}>
      <Stack.Screen options={{ title: '知乎正文 Fabric 实验' }} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
        <View style={styles.header}>
          <Text type="secondary" style={styles.hint}>
            输入回答或文章链接；也可以先选择类型，再输入数字 ID。
          </Text>
          <View style={styles.row}>
            {(['answer', 'article'] as const).map((type) => (
              <Pressable
                key={type}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedType === type }}
                onPress={() => setSelectedType(type)}
                style={[
                  styles.button,
                  { borderColor: border },
                  selectedType === type && { backgroundColor: primary },
                ]}
              >
                <Text
                  style={selectedType === type ? { color: onPrimary } : undefined}
                >
                  {type === 'answer' ? '回答' : '文章'}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="知乎链接或数字 ID"
            placeholderTextColor={secondary}
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.input,
              { color: foreground, borderColor: border, backgroundColor: surface },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: loading }}
            disabled={loading}
            onPress={() => void loadContent()}
            style={[
              styles.button,
              { backgroundColor: primary, opacity: loading ? 0.6 : 1 },
            ]}
          >
            {loading ? (
              <ActivityIndicator color={onPrimary} />
            ) : (
              <Text style={{ color: onPrimary }}>获取正文</Text>
            )}
          </Pressable>
          {error ? <Text style={styles.hint}>{error}</Text> : null}
          {!nativeAvailable ? (
            <Text style={styles.hint}>当前构建缺少原生文字模块，无法进行此对照。</Text>
          ) : null}
          <View style={[styles.controls, { borderColor: border, backgroundColor: surface }]}>
            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>Fabric 原生尺寸（实验）</Text>
              <Switch
                value={nativeAutoSize}
                onValueChange={(value) => {
                  activeRenderKey.current = null;
                  setReady(false);
                  if (visibleContent && nativeAvailable) startTrace();
                  setNativeAutoSize(value);
                }}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !visibleContent }}
              disabled={!visibleContent}
              onPress={() => {
                activeRenderKey.current = null;
                setReady(false);
                startTrace();
                setMountIndex((value) => value + 1);
              }}
              style={[
                styles.button,
                { borderColor: border, opacity: visibleContent ? 1 : 0.5 },
              ]}
            >
              <Text>重新挂载正文</Text>
            </Pressable>
            <Text type="secondary" style={styles.hint}>
              切换模式或重新挂载会复用同一份正文；不重新请求，也不更改阅读设置。
            </Text>
          </View>
          {visibleContent ? (
            <>
              <Text style={styles.title}>{visibleContent.title}</Text>
              {visibleContent.possiblyIncomplete ? (
                <Text type="secondary" style={styles.hint}>
                  此回答可能包含付费或截断内容，当前仅展示接口返回的正文。
                </Text>
              ) : null}
              {nativeAvailable ? (
                <Text type="secondary" style={styles.hint}>
                  {ready ? '正文布局就绪' : '正文正在布局'}
                </Text>
              ) : null}
              {nativeAvailable && trace ? (
                <View style={[styles.controls, { borderColor: border, backgroundColor: surface }]}>
                  <Text style={styles.controlLabel}>本次布局计时</Text>
                  <Text type="secondary" style={styles.hint}>
                    JS 起点 → IR 准备：{maximum(irEvents.map((event) => event.elapsedMs))}
                    {'\n'}JS 起点 → 高度事件，首次 / 最晚：{firstAndLast(heightEvents)}（{heightEvents.length} 个事件）
                    {'\n'}JS 起点 → 匹配布局，首次 / 最晚：{firstAndLast(layoutEvents)}（{layoutEvents.length} 个事件）
                    {'\n'}原生 props 批次处理起点 → 测量结束：{maximum(heightEvents.map((event) => event.nativePropsToMeasureMs))}
                    {'\n'}单次原生文字测量：{maximum(heightEvents.map((event) => event.nativeMeasureMs))}
                    {'\n'}原生 props 批次处理起点 → 请求尺寸更新：{maximum(heightEvents.map((event) => event.nativePropsToSizeRequestMs))}
                    {'\n'}原生 props 批次处理起点 → 高度事件派发：{maximum(heightEvents.map((event) => event.nativePropsToDispatchMs))}
                  </Text>
                  <Text type="secondary" style={styles.hint}>
                    仅统计顶层文字流，后续附件重排也会产生事件；原生数字为各流最长耗时。原生和 JS 时钟不直接相减，iOS 的 props 批次起点位于各属性 setter 之后。尺寸更新请求不代表 Fabric Commit 完成，匹配布局也不代表屏幕已绘制。最多保留 1024 个事件。
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
        {visibleContent && nativeAvailable ? (
          <View style={styles.body}>
            <ZhihuNativeContent
              key={renderKey}
              content={visibleContent.content}
              objectId={visibleContent.id}
              type={visibleContent.type}
              segmentInfos={visibleContent.segmentInfos}
              linkCardInfo={visibleContent.linkCardInfo}
              nativeAutoSize={nativeAutoSize}
              performanceTrace={trace}
              fontSizeScale={fontSizeScale}
              lineHeightScale={lineHeightScale}
              selectable
              onLayoutReady={() => {
                if (activeRenderKey.current === renderKey) setReady(true);
              }}
              renderFallback={() => <Text>原生正文不可用。</Text>}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  row: { flexDirection: 'row', gap: 8 },
  button: {
    minHeight: 42,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  controls: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  controlLabel: { flex: 1 },
  hint: { fontSize: 12, lineHeight: 18 },
  title: { fontSize: 17, fontWeight: '700' },
  body: { paddingHorizontal: 16, paddingTop: 14 },
});
