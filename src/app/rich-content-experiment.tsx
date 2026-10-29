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

interface FlowTraceSummary {
  flowId: string;
  heightCount: number;
  layoutCount: number;
  measureCount: number | null;
  firstHeightMs: number | null;
  lastHeightMs: number | null;
  firstLayoutMs: number | null;
  lastLayoutMs: number | null;
  rebuildMs: number | null;
  superMeasureMs: number | null;
  measureMs: number | null;
  parseMs: number | null;
  spannableMs: number | null;
  setTextMs: number | null;
  propsToMeasureMs: number | null;
  propsToDispatchMs: number | null;
  propsToSizeRequestMs: number | null;
}

function aggregateFlowSummaries(
  events: readonly ZhihuNativePerformanceEvent[],
): FlowTraceSummary[] {
  const map = new Map<string, FlowTraceSummary>();
  for (const event of events) {
    if (!event.flowId || event.flowId === 'ir') continue;
    let entry = map.get(event.flowId);
    if (!entry) {
      entry = {
        flowId: event.flowId,
        heightCount: 0,
        layoutCount: 0,
        measureCount: null,
        firstHeightMs: null,
        lastHeightMs: null,
        firstLayoutMs: null,
        lastLayoutMs: null,
        rebuildMs: null,
        superMeasureMs: null,
        measureMs: null,
        parseMs: null,
        spannableMs: null,
        setTextMs: null,
        propsToMeasureMs: null,
        propsToDispatchMs: null,
        propsToSizeRequestMs: null,
      };
      map.set(event.flowId, entry);
    }
    if (event.phase === 'height') {
      entry.heightCount += 1;
      if (
        entry.firstHeightMs === null ||
        event.elapsedMs < entry.firstHeightMs
      ) {
        entry.firstHeightMs = event.elapsedMs;
      }
      if (entry.lastHeightMs === null || event.elapsedMs > entry.lastHeightMs) {
        entry.lastHeightMs = event.elapsedMs;
      }
      if (event.measureCount != null) {
        entry.measureCount = Math.max(
          entry.measureCount ?? 0,
          event.measureCount,
        );
      }
      if (event.nativeRebuildMs != null) {
        entry.rebuildMs = Math.max(entry.rebuildMs ?? 0, event.nativeRebuildMs);
      }
      if (event.nativeSuperMeasureMs != null) {
        entry.superMeasureMs = Math.max(
          entry.superMeasureMs ?? 0,
          event.nativeSuperMeasureMs,
        );
      }
      if (event.nativeMeasureMs != null) {
        entry.measureMs = Math.max(entry.measureMs ?? 0, event.nativeMeasureMs);
      }
      if (event.nativeParseMs != null) {
        entry.parseMs = Math.max(entry.parseMs ?? 0, event.nativeParseMs);
      }
      if (event.nativeSpannableMs != null) {
        entry.spannableMs = Math.max(
          entry.spannableMs ?? 0,
          event.nativeSpannableMs,
        );
      }
      if (event.nativeSetTextMs != null) {
        entry.setTextMs = Math.max(entry.setTextMs ?? 0, event.nativeSetTextMs);
      }
      if (event.nativePropsToMeasureMs != null) {
        entry.propsToMeasureMs = Math.max(
          entry.propsToMeasureMs ?? 0,
          event.nativePropsToMeasureMs,
        );
      }
      if (event.nativePropsToDispatchMs != null) {
        entry.propsToDispatchMs = Math.max(
          entry.propsToDispatchMs ?? 0,
          event.nativePropsToDispatchMs,
        );
      }
      if (event.nativePropsToSizeRequestMs != null) {
        entry.propsToSizeRequestMs = Math.max(
          entry.propsToSizeRequestMs ?? 0,
          event.nativePropsToSizeRequestMs,
        );
      }
    } else if (event.phase === 'layout') {
      entry.layoutCount += 1;
      if (
        entry.firstLayoutMs === null ||
        event.elapsedMs < entry.firstLayoutMs
      ) {
        entry.firstLayoutMs = event.elapsedMs;
      }
      if (entry.lastLayoutMs === null || event.elapsedMs > entry.lastLayoutMs) {
        entry.lastLayoutMs = event.elapsedMs;
      }
    }
  }
  return Array.from(map.values());
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
  const [showFlowDetails, setShowFlowDetails] = useState(true);
  const [mountIndex, setMountIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [trace, setTrace] = useState<ZhihuNativePerformanceTrace | undefined>();
  const [traceEvents, setTraceEvents] = useState<ZhihuNativePerformanceEvent[]>(
    [],
  );
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: account or cookie changes must clear existing content and active traces.
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
  const flowSummaries = aggregateFlowSummaries(traceEvents);

  const formatMs = (value: number | null | undefined) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? `${value.toFixed(2)} ms`
      : '—';

  const maximum = (values: readonly (number | null | undefined)[]) => {
    const numbers = values.filter(
      (value): value is number =>
        typeof value === 'number' && Number.isFinite(value) && value >= 0,
    );
    return numbers.length > 0 ? `${Math.max(...numbers).toFixed(2)} ms` : '—';
  };

  const sumMs = (values: readonly (number | null | undefined)[]) => {
    const numbers = values.filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0,
    );
    return numbers.length > 0
      ? `${numbers.reduce((a, b) => a + b, 0).toFixed(2)} ms`
      : '—';
  };

  const sumAndMax = (values: readonly (number | null | undefined)[]) => {
    const numbers = values.filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0,
    );
    if (numbers.length === 0) return '—';
    const total = numbers.reduce((a, b) => a + b, 0);
    const maxVal = Math.max(...numbers);
    return `合计 ${total.toFixed(2)} ms / 最大 ${maxVal.toFixed(2)} ms`;
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
                  style={
                    selectedType === type ? { color: onPrimary } : undefined
                  }
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
              {
                color: foreground,
                borderColor: border,
                backgroundColor: surface,
              },
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
            <Text style={styles.hint}>
              当前构建缺少原生文字模块，无法进行此对照。
            </Text>
          ) : null}
          <View
            style={[
              styles.controls,
              { borderColor: border, backgroundColor: surface },
            ]}
          >
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
                <>
                  <View
                    style={[
                      styles.controls,
                      { borderColor: border, backgroundColor: surface },
                    ]}
                  >
                    <Text style={styles.controlLabel}>
                      本次布局计时（共 {flowSummaries.length} 个文字 Flow）
                    </Text>
                    <Text type="secondary" style={styles.hint}>
                      JS 起点 → IR 准备：
                      {maximum(irEvents.map((event) => event.elapsedMs))}
                      {'\n'}JS 起点 → 高度事件，首次 / 最晚：
                      {firstAndLast(heightEvents)}（{heightEvents.length}{' '}
                      个事件）
                      {'\n'}JS 起点 → 匹配布局，首次 / 最晚：
                      {firstAndLast(layoutEvents)}（{layoutEvents.length}{' '}
                      个事件）
                      {'\n'}────────────────────────
                      {'\n'}【原生文字排版与测量核心耗时】
                      {'\n'}rebuild()（Spannable + setText）：
                      {sumAndMax(flowSummaries.map((f) => f.rebuildMs))}
                      {'\n'}rebuild() 细分（parse / spannable / setText 合计）：
                      {sumMs(flowSummaries.map((f) => f.parseMs))} /{' '}
                      {sumMs(flowSummaries.map((f) => f.spannableMs))} /{' '}
                      {sumMs(flowSummaries.map((f) => f.setTextMs))}
                      {'\n'}super.onMeasure()（真实排版测量）：
                      {sumAndMax(flowSummaries.map((f) => f.superMeasureMs))}
                      {'\n'}显式二次 measure()：
                      {maximum(flowSummaries.map((f) => f.measureMs))}
                      {'\n'}────────────────────────
                      {'\n'}【异步调度与派发耗时】
                      {'\n'}原生 props 批次起点 → 测量结束：
                      {maximum(flowSummaries.map((f) => f.propsToMeasureMs))}
                      {'\n'}原生 props 批次起点 → 请求尺寸更新：
                      {maximum(
                        flowSummaries.map((f) => f.propsToSizeRequestMs),
                      )}
                      {'\n'}原生 props 批次起点 → 高度事件派发：
                      {maximum(flowSummaries.map((f) => f.propsToDispatchMs))}
                    </Text>
                    <Text type="secondary" style={styles.hint}>
                      仅统计顶层文字流。rebuild 与 super.onMeasure 包含各 flow
                      合计与单 flow 最大耗时。原生和 JS 时钟不直接相减，iOS 的
                      props 批次起点位于各属性 setter 之后。尺寸更新请求不代表
                      Fabric Commit 完成，匹配布局也不代表屏幕已绘制。最多保留
                      1024 个事件。
                    </Text>
                  </View>
                  {flowSummaries.length > 0 ? (
                    <View
                      style={[
                        styles.controls,
                        { borderColor: border, backgroundColor: surface },
                      ]}
                    >
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setShowFlowDetails((prev) => !prev)}
                        style={styles.detailToggle}
                      >
                        <Text style={styles.controlLabel}>
                          各 Flow 排版与事件明细（共 {flowSummaries.length} 个
                          Flow）
                        </Text>
                        <Text type="secondary" style={styles.hint}>
                          {showFlowDetails ? '收起 ▲' : '展开 ▼'}
                        </Text>
                      </Pressable>
                      {showFlowDetails ? (
                        <View style={styles.flowList}>
                          {flowSummaries.map((flow) => (
                            <View
                              key={flow.flowId}
                              style={[styles.flowItem, { borderColor: border }]}
                            >
                              <Text style={styles.flowTitle}>
                                {flow.flowId}（高度 {flow.heightCount} 次 / 布局{' '}
                                {flow.layoutCount} 次 / 测量{' '}
                                {flow.measureCount ?? 1} 次）
                              </Text>
                              <Text type="secondary" style={styles.hint}>
                                rebuild: {formatMs(flow.rebuildMs)} (parse:{' '}
                                {formatMs(flow.parseMs)}, span:{' '}
                                {formatMs(flow.spannableMs)}, setText:{' '}
                                {formatMs(flow.setTextMs)}){'\n'}super.measure:{' '}
                                {formatMs(flow.superMeasureMs)} | 二次 measure:{' '}
                                {formatMs(flow.measureMs)}
                                {'\n'}props → dispatch:{' '}
                                {formatMs(flow.propsToDispatchMs)} | JS起点 →
                                首次高度 {formatMs(flow.firstHeightMs)} →
                                匹配布局 {formatMs(flow.lastLayoutMs)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </>
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
  detailToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  flowList: {
    gap: 8,
    marginTop: 4,
  },
  flowItem: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
    gap: 2,
  },
  flowTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  hint: { fontSize: 12, lineHeight: 18 },
  title: { fontSize: 17, fontWeight: '700' },
  body: { paddingHorizontal: 16, paddingTop: 14 },
});
