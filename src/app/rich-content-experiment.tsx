import * as Clipboard from 'expo-clipboard';
import { Redirect, Stack } from 'expo-router';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAnswer } from '@/api/zhihu/answer';
import { getArticle } from '@/api/zhihu/article';
import {
  Text,
  useRuntimeThemeColors,
  useThemeColor,
} from '@/components/Themed';
import {
  clearMeasuredFlowHeightCache,
  compileZhihuDocument,
  createRichContentMetrics,
  getMeasuredFlowHeightCacheSize,
  isRichTextNativeAvailable,
  normalizeZhihuDocument,
  RICH_CONTENT_PARAGRAPH_SPACING,
  type ZhihuBlock,
  type ZhihuDocument,
  type ZhihuInlineRun,
  ZhihuNativeContent,
  type ZhihuNativePerformanceEvent,
  type ZhihuNativePerformanceTrace,
} from '@/features/rich-content';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { ZhihuSegmentInfo } from '@/types/zhihu';
import { richContentExperimentEnabled } from '@/utils/richContentExperiment';

type ContentType = 'answer' | 'article';
type FlowCountMode = 'default' | '1' | '50';
type RendererMode = 'rich-text' | 'pure-rn-text';

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

interface StatSummary {
  median: number;
  mean: number;
  min: number;
  max: number;
  p95: number;
}

function computeStats(values: number[]): StatSummary {
  if (values.length === 0) {
    return { median: 0, mean: 0, min: 0, max: 0, p95: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = Number((sum / sorted.length).toFixed(2));
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2))
      : Number(sorted[mid].toFixed(2));
  const p95Index = Math.min(
    sorted.length - 1,
    Math.floor((sorted.length - 1) * 0.95),
  );
  const p95 = Number(sorted[p95Index].toFixed(2));
  return {
    median,
    mean,
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
    p95,
  };
}

function computeStatsForMetric(
  values: (number | null | undefined)[],
): StatSummary {
  const valid = values.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
  return computeStats(valid);
}

function makeSingleFlowDocument(doc: ZhihuDocument): ZhihuDocument {
  const allRuns: ZhihuInlineRun[] = [];
  for (const block of doc.blocks) {
    if ('children' in block && Array.isArray(block.children)) {
      if (allRuns.length > 0)
        allRuns.push({
          id: `sep-${allRuns.length}`,
          type: 'text',
          text: '\n\n',
        });
      allRuns.push(...block.children);
    } else if (block.type === 'quote') {
      for (const child of block.blocks) {
        if ('children' in child && Array.isArray(child.children)) {
          if (allRuns.length > 0)
            allRuns.push({
              id: `sep-${allRuns.length}`,
              type: 'text',
              text: '\n\n',
            });
          allRuns.push(...child.children);
        }
      }
    }
  }
  return {
    ...doc,
    id: `${doc.id}:1-flow`,
    blocks: [
      {
        id: 'single-paragraph',
        type: 'paragraph',
        children:
          allRuns.length > 0
            ? allRuns
            : [{ id: 'fallback-text', type: 'text', text: ' ' }],
      },
    ],
  };
}

function make50FlowsDocument(doc: ZhihuDocument): ZhihuDocument {
  const paragraphBlocks = doc.blocks.filter((b) => b.type === 'paragraph');
  const source = paragraphBlocks.length > 0 ? paragraphBlocks : doc.blocks;
  const blocks: ZhihuBlock[] = [];
  for (let i = 0; i < 50; i++) {
    const template = source[i % source.length];
    blocks.push({
      ...template,
      id: `flow-50-${i}`,
    });
  }
  return {
    ...doc,
    id: `${doc.id}:50-flows`,
    blocks,
  };
}

interface FlowTraceSummary {
  flowId: string;
  heightCount: number;
  layoutCount: number;
  rawLayoutCount: number;
  measureCount: number | null;
  setViewSizeCount: number | null;
  schedulePostWaitMs: number | null;
  heightPostWaitMs: number | null;
  firstHeightMs: number | null;
  lastHeightMs: number | null;
  firstLayoutMs: number | null;
  lastLayoutMs: number | null;
  firstRawLayoutMs: number | null;
  lastRawLayoutMs: number | null;
  propsSetMs: number | null;
  firstMeasureMs: number | null;
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
        rawLayoutCount: 0,
        measureCount: null,
        setViewSizeCount: null,
        schedulePostWaitMs: null,
        heightPostWaitMs: null,
        firstHeightMs: null,
        lastHeightMs: null,
        firstLayoutMs: null,
        lastLayoutMs: null,
        firstRawLayoutMs: null,
        lastRawLayoutMs: null,
        propsSetMs: null,
        firstMeasureMs: null,
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
    if (event.phase === 'native-props-set') {
      entry.propsSetMs =
        entry.propsSetMs == null
          ? event.elapsedMs
          : Math.min(entry.propsSetMs, event.elapsedMs);
    } else if (event.phase === 'native-first-measure') {
      entry.firstMeasureMs =
        entry.firstMeasureMs == null
          ? event.elapsedMs
          : Math.min(entry.firstMeasureMs, event.elapsedMs);
    } else if (event.phase === 'height') {
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
      if (event.setViewSizeCount != null) {
        entry.setViewSizeCount = Math.max(
          entry.setViewSizeCount ?? 0,
          event.setViewSizeCount,
        );
      }
      if (event.schedulePostWaitMs != null) {
        entry.schedulePostWaitMs = Math.max(
          entry.schedulePostWaitMs ?? 0,
          event.schedulePostWaitMs,
        );
      }
      if (event.heightPostWaitMs != null) {
        entry.heightPostWaitMs = Math.max(
          entry.heightPostWaitMs ?? 0,
          event.heightPostWaitMs,
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
    } else if (event.phase === 'raw-layout') {
      entry.rawLayoutCount += 1;
      if (
        entry.firstRawLayoutMs === null ||
        event.elapsedMs < entry.firstRawLayoutMs
      ) {
        entry.firstRawLayoutMs = event.elapsedMs;
      }
      if (
        entry.lastRawLayoutMs === null ||
        event.elapsedMs > entry.lastRawLayoutMs
      ) {
        entry.lastRawLayoutMs = event.elapsedMs;
      }
    }
  }
  return Array.from(map.values());
}

function computeRunMetrics(events: readonly ZhihuNativePerformanceEvent[]) {
  const normalizeEvent = events.find((e) => e.phase === 'normalize');
  const compileEvent = events.find((e) => e.phase === 'compile');
  const flowJsonEvents = events.filter((e) => e.phase === 'flow-json');
  const irReadyEvent = events.find((e) => e.phase === 'ir-ready');
  const renderEnterEvent = events.find((e) => e.phase === 'react-render-enter');
  const layoutEffectEvent = events.find(
    (e) => e.phase === 'react-layout-effect',
  );
  const effectEvent = events.find((e) => e.phase === 'react-effect');
  const firstFlowReadyEvent = events.find(
    (e) => e.phase === 'first-flow-ready',
  );
  const allFlowsReadyEvent = events.find((e) => e.phase === 'all-flows-ready');
  const documentReadyEvent = events.find((e) => e.phase === 'document-ready');
  const heightEvents = events.filter((e) => e.phase === 'height');
  const layoutEvents = events.filter((e) => e.phase === 'layout');
  const rawLayoutEvents = events.filter((e) => e.phase === 'raw-layout');
  const propsSetEvents = events.filter((e) => e.phase === 'native-props-set');
  const firstMeasureEvents = events.filter(
    (e) => e.phase === 'native-first-measure',
  );
  const firstLayoutEvents = events.filter(
    (e) => e.phase === 'native-first-layout',
  );
  const flows = aggregateFlowSummaries(events);

  const numOrNull = (v: number | null | undefined): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0
      ? Number(v.toFixed(2))
      : null;

  const sumValid = (arr: (number | null | undefined)[]) => {
    const valid = arr.filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0,
    );
    return valid.length > 0
      ? Number(valid.reduce((a, b) => a + b, 0).toFixed(2))
      : null;
  };

  const maxValid = (arr: (number | null | undefined)[]) => {
    const valid = arr.filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0,
    );
    return valid.length > 0 ? Number(Math.max(...valid).toFixed(2)) : null;
  };

  const minValid = (arr: (number | null | undefined)[]) => {
    const valid = arr.filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0,
    );
    return valid.length > 0 ? Number(Math.min(...valid).toFixed(2)) : null;
  };

  const irReadyMs = numOrNull(irReadyEvent?.elapsedMs);
  const firstRawLayoutMs = minValid(rawLayoutEvents.map((e) => e.elapsedMs));
  const lastLayoutMs = maxValid(layoutEvents.map((e) => e.elapsedMs));
  const lastHeightMs = maxValid(heightEvents.map((e) => e.elapsedMs));
  const layoutEffectMs = numOrNull(layoutEffectEvent?.elapsedMs);
  const propsSetMinMs = minValid(propsSetEvents.map((e) => e.elapsedMs));

  return {
    renderEnterMs: numOrNull(renderEnterEvent?.elapsedMs),
    layoutEffectMs,
    effectMs: numOrNull(effectEvent?.elapsedMs),
    normalizeMs: numOrNull(normalizeEvent?.elapsedMs),
    compileMs: numOrNull(compileEvent?.elapsedMs),
    flowJsonSumMs: sumValid(flowJsonEvents.map((e) => e.elapsedMs)),
    irReadyMs,
    firstFlowReadyMs: numOrNull(firstFlowReadyEvent?.elapsedMs),
    allFlowsReadyMs: numOrNull(allFlowsReadyEvent?.elapsedMs),
    documentReadyMs: numOrNull(documentReadyEvent?.elapsedMs),
    firstHeightMs: minValid(heightEvents.map((e) => e.elapsedMs)),
    lastHeightMs,
    firstLayoutMs: minValid(layoutEvents.map((e) => e.elapsedMs)),
    lastLayoutMs,
    firstRawLayoutMs,
    lastRawLayoutMs: maxValid(rawLayoutEvents.map((e) => e.elapsedMs)),
    propsSetMinMs,
    propsSetMaxMs: maxValid(propsSetEvents.map((e) => e.elapsedMs)),
    firstMeasureMinMs: minValid(firstMeasureEvents.map((e) => e.elapsedMs)),
    firstMeasureMaxMs: maxValid(firstMeasureEvents.map((e) => e.elapsedMs)),
    firstNativeLayoutMinMs: minValid(firstLayoutEvents.map((e) => e.elapsedMs)),
    // Timeline breakdown intervals
    irReadyToFirstRawLayoutMs:
      irReadyMs != null && firstRawLayoutMs != null
        ? Number((firstRawLayoutMs - irReadyMs).toFixed(2))
        : null,
    firstRawLayoutToLastLayoutMs:
      firstRawLayoutMs != null && lastLayoutMs != null
        ? Number((lastLayoutMs - firstRawLayoutMs).toFixed(2))
        : null,
    irReadyToLastLayoutMs:
      irReadyMs != null && lastLayoutMs != null
        ? Number((lastLayoutMs - irReadyMs).toFixed(2))
        : null,
    lastHeightToLastLayoutMs:
      lastHeightMs != null && lastLayoutMs != null
        ? Number((lastLayoutMs - lastHeightMs).toFixed(2))
        : null,
    irReadyToLayoutEffectMs:
      irReadyMs != null && layoutEffectMs != null
        ? Number((layoutEffectMs - irReadyMs).toFixed(2))
        : null,
    layoutEffectToPropsSetMs:
      layoutEffectMs != null && propsSetMinMs != null
        ? Number((propsSetMinMs - layoutEffectMs).toFixed(2))
        : null,
    propsSetToFirstRawLayoutMs:
      propsSetMinMs != null && firstRawLayoutMs != null
        ? Number((firstRawLayoutMs - propsSetMinMs).toFixed(2))
        : null,
    rebuildSumMs: sumValid(flows.map((f) => f.rebuildMs)),
    rebuildMaxMs: maxValid(flows.map((f) => f.rebuildMs)),
    superMeasureSumMs: sumValid(flows.map((f) => f.superMeasureMs)),
    superMeasureMaxMs: maxValid(flows.map((f) => f.superMeasureMs)),
    measureMaxMs: maxValid(flows.map((f) => f.measureMs)),
    schedulePostWaitMaxMs: maxValid(flows.map((f) => f.schedulePostWaitMs)),
    heightPostWaitMaxMs: maxValid(flows.map((f) => f.heightPostWaitMs)),
    setViewSizeCountMax: maxValid(flows.map((f) => f.setViewSizeCount)),
    flowCount: flows.length,
    heightEventsCount: heightEvents.length,
    layoutEventsCount: layoutEvents.length,
    rawLayoutEventsCount: rawLayoutEvents.length,
    flows,
  };
}

function PureRNTextContent({
  document,
  contentWidth,
  fontSizeScale,
  lineHeightScale,
  performanceTrace,
  onLayoutReady,
}: {
  document: ZhihuDocument;
  contentWidth: number;
  fontSizeScale?: number;
  lineHeightScale?: number;
  performanceTrace?: ZhihuNativePerformanceTrace;
  onLayoutReady?: () => void;
}) {
  const settings = useSettingsStore();
  const themeColors = useRuntimeThemeColors();
  const metrics = useMemo(
    () =>
      createRichContentMetrics(
        fontSizeScale ?? settings.fontSizeScale,
        lineHeightScale ?? settings.lineHeightScale,
      ),
    [
      fontSizeScale,
      lineHeightScale,
      settings.fontSizeScale,
      settings.lineHeightScale,
    ],
  );
  const { fontSize, lineHeight } = metrics.body;
  const layoutCountRef = useRef(0);
  const notifiedRef = useRef(false);

  const compiled = useMemo(() => {
    const start = performance.now();
    const result = compileZhihuDocument(document, {
      fontSize,
      lineHeight,
      paragraphSpacing: RICH_CONTENT_PARAGRAPH_SPACING,
    });
    if (performanceTrace) {
      performanceTrace.onEvent({
        phase: 'compile',
        elapsedMs: performance.now() - start,
      });
      performanceTrace.onEvent({
        phase: 'ir-ready',
        elapsedMs: performance.now() - performanceTrace.startedAt,
      });
    }
    return result;
  }, [document, fontSize, lineHeight, performanceTrace]);

  const flowParts = useMemo(
    () => compiled.parts.filter((p) => p.type === 'flow'),
    [compiled],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: layout effect timing must re-record when compiled parts change.
  useLayoutEffect(() => {
    if (performanceTrace) {
      performanceTrace.onEvent({
        phase: 'react-layout-effect',
        elapsedMs: performance.now() - performanceTrace.startedAt,
      });
    }
  }, [performanceTrace, compiled]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: passive effect timing must re-record when compiled parts change.
  useEffect(() => {
    if (performanceTrace) {
      performanceTrace.onEvent({
        phase: 'react-effect',
        elapsedMs: performance.now() - performanceTrace.startedAt,
      });
    }
  }, [performanceTrace, compiled]);

  const handleLayout = (flowId: string, event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (performanceTrace) {
      const now = performance.now();
      performanceTrace.onEvent({
        flowId,
        phase: 'raw-layout',
        elapsedMs: now - performanceTrace.startedAt,
        width,
        height,
      });
      performanceTrace.onEvent({
        flowId,
        phase: 'layout',
        elapsedMs: now - performanceTrace.startedAt,
        width,
        height,
      });
    }
    layoutCountRef.current += 1;
    if (layoutCountRef.current >= flowParts.length && !notifiedRef.current) {
      notifiedRef.current = true;
      if (performanceTrace) {
        performanceTrace.onEvent({
          phase: 'document-ready',
          elapsedMs: performance.now() - performanceTrace.startedAt,
        });
      }
      onLayoutReady?.();
    }
  };

  return (
    <View style={{ width: contentWidth }}>
      {flowParts.map((part) => (
        <Text
          key={part.flow.id}
          selectable
          style={{
            fontSize,
            lineHeight,
            color: themeColors.text,
            marginBottom: RICH_CONTENT_PARAGRAPH_SPACING,
          }}
          onLayout={(e) => handleLayout(part.flow.id, e)}
        >
          {part.flow.text}
        </Text>
      ))}
    </View>
  );
}

export default function RichContentExperimentRoute() {
  if (!richContentExperimentEnabled) return <Redirect href="/" />;
  return <RichContentExperimentScreen />;
}

function RichContentExperimentScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const primary = useThemeColor({}, 'primary');
  const onPrimary = useThemeColor({}, 'onPrimary');
  const background = useThemeColor({}, 'background');
  const surface = useThemeColor({}, 'backgroundSecondary');
  const border = useThemeColor({}, 'border');
  const foreground = useThemeColor({}, 'text');
  const secondary = useThemeColor({}, 'textSecondary');
  const fontSizeScale = useSettingsStore((state) => state.fontSizeScale);
  const lineHeightScale = useSettingsStore((state) => state.lineHeightScale);
  const removeImageWatermark = useSettingsStore(
    (state) => state.removeImageWatermark,
  );
  const cookies = useAuthStore((state) => state.cookies);
  const activeAccountIndex = useAuthStore((state) => state.activeAccountIndex);

  const [input, setInput] = useState('');
  const [selectedType, setSelectedType] = useState<ContentType>('answer');
  const [content, setContent] = useState<LoadedContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Experiment toggles
  const [flowCountMode, setFlowCountMode] = useState<FlowCountMode>('default');
  const [rendererMode, setRendererMode] = useState<RendererMode>('rich-text');
  const [nativeAutoSize, setNativeAutoSize] = useState(false);
  const [clearCacheBeforeMount, setClearCacheBeforeMount] = useState(true);
  const [usePreparedDocument, setUsePreparedDocument] = useState(false);
  const [useInitialContentWidth, setUseInitialContentWidth] = useState(false);
  const [nativeAutoSizeCachedHeight, setNativeAutoSizeCachedHeight] =
    useState(false);
  const [cacheSize, setCacheSize] = useState(() =>
    getMeasuredFlowHeightCacheSize(),
  );

  const [showFlowDetails, setShowFlowDetails] = useState(true);
  const [showExportDetails, setShowExportDetails] = useState(false);
  const [mountIndex, setMountIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [trace, setTrace] = useState<ZhihuNativePerformanceTrace | undefined>();
  const [traceEvents, setTraceEvents] = useState<ZhihuNativePerformanceEvent[]>(
    [],
  );

  // Testing and export states
  const [isTesting, setIsTesting] = useState(false);
  const [testProgress, setTestProgress] = useState({
    current: 0,
    total: 10,
    label: '',
  });
  const [exportedJsonResult, setExportedJsonResult] = useState<string | null>(
    null,
  );
  const [interleavedSummary, setInterleavedSummary] = useState<{
    offSummary: Record<string, StatSummary>;
    onSummary: Record<string, StatSummary>;
    pairDiffSummary: Record<string, StatSummary>;
  } | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  const requestRef = useRef<AbortController | null>(null);
  const activeRenderKey = useRef<string | null>(null);
  const traceIdRef = useRef(0);
  const traceEventsRef = useRef<ZhihuNativePerformanceEvent[]>([]);
  const traceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roundLayoutReadyRef = useRef<(() => void) | null>(null);
  const isTestingRef = useRef(false);
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
    const startPerf = performance.now();
    const startEpoch = Date.now();
    setTrace({
      startedAt: startPerf,
      startedEpochMs: startEpoch,
      onEvent: (event) => {
        if (traceIdRef.current !== traceId || !Number.isFinite(event.elapsedMs))
          return;
        if (traceEventsRef.current.length >= 2048) return;
        traceEventsRef.current.push(event);
        if (traceTimerRef.current) return;
        traceTimerRef.current = setTimeout(() => {
          traceTimerRef.current = null;
          if (traceIdRef.current === traceId)
            setTraceEvents([...traceEventsRef.current]);
        }, 800);
      },
    });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: account or cookie changes must clear existing content and active traces.
  useEffect(() => {
    isTestingRef.current = false;
    setContent(null);
    activeRenderKey.current = null;
    traceEventsRef.current = [];
    setTraceEvents([]);
    setTrace(undefined);
    setLoading(false);
    setError(null);
    setReady(false);
    setExportedJsonResult(null);
    setInterleavedSummary(null);
    setCopyToast(null);
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
    setExportedJsonResult(null);
    setInterleavedSummary(null);
    setCopyToast(null);
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
      if (clearCacheBeforeMount) {
        clearMeasuredFlowHeightCache();
        setCacheSize(0);
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

  // Base normalized document
  const baseDocument = useMemo(() => {
    if (!visibleContent) return undefined;
    const result = normalizeZhihuDocument(visibleContent.content, {
      documentId: `${visibleContent.type}:${visibleContent.id}`,
      segmentInfos: visibleContent.segmentInfos,
      linkCardInfo: visibleContent.linkCardInfo,
      removeImageWatermark,
    });
    return result.document;
  }, [visibleContent, removeImageWatermark]);

  // Transformed document according to flowCountMode
  const activeDocument = useMemo(() => {
    if (!baseDocument) return undefined;
    if (flowCountMode === '1') return makeSingleFlowDocument(baseDocument);
    if (flowCountMode === '50') return make50FlowsDocument(baseDocument);
    return baseDocument;
  }, [baseDocument, flowCountMode]);

  // Initial inner content width
  const contentWidth = Math.max(0, windowWidth - 32);
  const initialContentWidth = useInitialContentWidth ? contentWidth : undefined;

  const renderKey = visibleContent
    ? `${visibleContent.type}:${visibleContent.id}:${rendererMode}:${flowCountMode}:${nativeAutoSize}:${usePreparedDocument}:${useInitialContentWidth}:${nativeAutoSizeCachedHeight}:${mountIndex}`
    : null;
  activeRenderKey.current = renderKey;

  const singleRunMetrics = useMemo(
    () => computeRunMetrics(traceEvents),
    [traceEvents],
  );
  const flowSummaries = singleRunMetrics.flows;

  const formatMs = (value: number | null | undefined) =>
    typeof value === 'number' && Number.isFinite(value)
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

  const firstAndLast = (
    first: number | null | undefined,
    last: number | null | undefined,
    count: number,
  ) => {
    if (count === 0 || first == null || last == null) return '—';
    return `${first.toFixed(2)} / ${last.toFixed(2)} ms（${count} 个事件）`;
  };

  const handleManualRemount = () => {
    if (!visibleContent) return;
    if (clearCacheBeforeMount) {
      clearMeasuredFlowHeightCache();
      setCacheSize(0);
    }
    activeRenderKey.current = null;
    setReady(false);
    startTrace();
    setMountIndex((value) => value + 1);
  };

  const handleClearCache = () => {
    clearMeasuredFlowHeightCache();
    setCacheSize(getMeasuredFlowHeightCacheSize());
  };

  const buildSummaryFromRuns = (
    runs: ReturnType<typeof computeRunMetrics>[],
  ) => ({
    normalizeMs: computeStatsForMetric(runs.map((r) => r.normalizeMs)),
    compileMs: computeStatsForMetric(runs.map((r) => r.compileMs)),
    flowJsonSumMs: computeStatsForMetric(runs.map((r) => r.flowJsonSumMs)),
    irReadyMs: computeStatsForMetric(runs.map((r) => r.irReadyMs)),
    layoutEffectMs: computeStatsForMetric(runs.map((r) => r.layoutEffectMs)),
    firstRawLayoutMs: computeStatsForMetric(
      runs.map((r) => r.firstRawLayoutMs),
    ),
    firstHeightMs: computeStatsForMetric(runs.map((r) => r.firstHeightMs)),
    lastHeightMs: computeStatsForMetric(runs.map((r) => r.lastHeightMs)),
    firstLayoutMs: computeStatsForMetric(runs.map((r) => r.firstLayoutMs)),
    lastLayoutMs: computeStatsForMetric(runs.map((r) => r.lastLayoutMs)),
    documentReadyMs: computeStatsForMetric(runs.map((r) => r.documentReadyMs)),
    propsSetMinMs: computeStatsForMetric(runs.map((r) => r.propsSetMinMs)),
    firstMeasureMinMs: computeStatsForMetric(
      runs.map((r) => r.firstMeasureMinMs),
    ),
    // Timeline intervals
    irReadyToFirstRawLayoutMs: computeStatsForMetric(
      runs.map((r) => r.irReadyToFirstRawLayoutMs),
    ),
    firstRawLayoutToLastLayoutMs: computeStatsForMetric(
      runs.map((r) => r.firstRawLayoutToLastLayoutMs),
    ),
    irReadyToLastLayoutMs: computeStatsForMetric(
      runs.map((r) => r.irReadyToLastLayoutMs),
    ),
    lastHeightToLastLayoutMs: computeStatsForMetric(
      runs.map((r) => r.lastHeightToLastLayoutMs),
    ),
    irReadyToLayoutEffectMs: computeStatsForMetric(
      runs.map((r) => r.irReadyToLayoutEffectMs),
    ),
    layoutEffectToPropsSetMs: computeStatsForMetric(
      runs.map((r) => r.layoutEffectToPropsSetMs),
    ),
    propsSetToFirstRawLayoutMs: computeStatsForMetric(
      runs.map((r) => r.propsSetToFirstRawLayoutMs),
    ),
    rebuildSumMs: computeStatsForMetric(runs.map((r) => r.rebuildSumMs)),
    superMeasureSumMs: computeStatsForMetric(
      runs.map((r) => r.superMeasureSumMs),
    ),
    measureMaxMs: computeStatsForMetric(runs.map((r) => r.measureMaxMs)),
    schedulePostWaitMaxMs: computeStatsForMetric(
      runs.map((r) => r.schedulePostWaitMaxMs),
    ),
    heightPostWaitMaxMs: computeStatsForMetric(
      runs.map((r) => r.heightPostWaitMaxMs),
    ),
    setViewSizeCountMax: computeStatsForMetric(
      runs.map((r) => r.setViewSizeCountMax),
    ),
  });

  // 10-run single-mode test
  const run10Tests = async () => {
    if (!visibleContent || isTesting) return;
    setIsTesting(true);
    setTestProgress({ current: 0, total: 10, label: '单模式 10 轮测试' });
    setExportedJsonResult(null);
    setInterleavedSummary(null);
    setCopyToast(null);
    isTestingRef.current = true;

    const runsData: ReturnType<typeof computeRunMetrics>[] = [];

    try {
      for (let round = 1; round <= 10; round++) {
        if (!isTestingRef.current) break;
        setTestProgress({
          current: round,
          total: 10,
          label: `第 ${round}/10 轮`,
        });

        if (clearCacheBeforeMount) {
          clearMeasuredFlowHeightCache();
          setCacheSize(0);
        }

        const roundPromise = new Promise<void>((resolve) => {
          let resolved = false;
          const finish = () => {
            if (resolved) return;
            resolved = true;
            roundLayoutReadyRef.current = null;
            setTimeout(resolve, 200);
          };
          roundLayoutReadyRef.current = finish;
          setTimeout(finish, 3500);
        });

        activeRenderKey.current = null;
        setReady(false);
        startTrace();
        setMountIndex((v) => v + 1);

        await roundPromise;
        if (!isTestingRef.current) break;

        const roundEvents = [...traceEventsRef.current];
        runsData.push(computeRunMetrics(roundEvents));
        await new Promise((r) => setTimeout(r, 120));
      }

      if (runsData.length > 0 && isTestingRef.current) {
        const summary = buildSummaryFromRuns(runsData);
        const exportPayload = {
          exportTime: new Date().toISOString(),
          testMode: '10-runs-single-mode',
          environment: {
            platform: Platform.OS,
            target: {
              type: visibleContent.type,
              id: visibleContent.id,
              title: visibleContent.title,
            },
            settings: {
              flowCountMode,
              rendererMode,
              nativeAutoSize,
              clearCacheBeforeMount,
              usePreparedDocument,
              useInitialContentWidth,
              nativeAutoSizeCachedHeight,
              fontSizeScale,
              lineHeightScale,
            },
          },
          summary: {
            runsCompleted: runsData.length,
            metrics: summary,
          },
          runs: runsData.map((run, idx) => ({ round: idx + 1, ...run })),
        };

        const jsonString = JSON.stringify(exportPayload, null, 2);
        setExportedJsonResult(jsonString);
        await Clipboard.setStringAsync(jsonString);
        setCopyToast('10 次测试已完成，测试数据已自动复制到剪贴板！');
      }
    } catch {
      setCopyToast('测试过程中发生异常');
    } finally {
      setIsTesting(false);
      isTestingRef.current = false;
      setCacheSize(getMeasuredFlowHeightCacheSize());
    }
  };

  // 20-run interleaved A/B test (10 pairs alternating off and on)
  const run20InterleavedTests = async () => {
    if (!visibleContent || isTesting) return;
    setIsTesting(true);
    setTestProgress({ current: 0, total: 20, label: '交错测试 (A/B 交替)' });
    setExportedJsonResult(null);
    setInterleavedSummary(null);
    setCopyToast(null);
    isTestingRef.current = true;

    const runsA: ReturnType<typeof computeRunMetrics>[] = [];
    const runsB: ReturnType<typeof computeRunMetrics>[] = [];

    try {
      for (let round = 1; round <= 20; round++) {
        if (!isTestingRef.current) break;
        const currentIsAutoSize = round % 2 === 0;
        setNativeAutoSize(currentIsAutoSize);
        setTestProgress({
          current: round,
          total: 20,
          label: `第 ${round}/20 轮 (${currentIsAutoSize ? 'AutoSize 开' : 'AutoSize 关'})`,
        });

        if (clearCacheBeforeMount) {
          clearMeasuredFlowHeightCache();
          setCacheSize(0);
        }

        const roundPromise = new Promise<void>((resolve) => {
          let resolved = false;
          const finish = () => {
            if (resolved) return;
            resolved = true;
            roundLayoutReadyRef.current = null;
            setTimeout(resolve, 200);
          };
          roundLayoutReadyRef.current = finish;
          setTimeout(finish, 3500);
        });

        activeRenderKey.current = null;
        setReady(false);
        startTrace();
        setMountIndex((v) => v + 1);

        await roundPromise;
        if (!isTestingRef.current) break;

        const roundEvents = [...traceEventsRef.current];
        const metrics = computeRunMetrics(roundEvents);
        if (currentIsAutoSize) {
          runsB.push(metrics);
        } else {
          runsA.push(metrics);
        }

        await new Promise((r) => setTimeout(r, 120));
      }

      if (runsA.length > 0 && runsB.length > 0 && isTestingRef.current) {
        const offSummary = buildSummaryFromRuns(runsA);
        const onSummary = buildSummaryFromRuns(runsB);

        // Compute pairwise differences (B - A for pair i)
        const pairCount = Math.min(runsA.length, runsB.length);
        const pairDiffs = {
          irReadyToFirstRawLayout: [] as number[],
          firstRawLayoutToLastLayout: [] as number[],
          irReadyToLastLayout: [] as number[],
          lastHeightToLastLayout: [] as number[],
          lastLayout: [] as number[],
          documentReady: [] as number[],
          rebuildSum: [] as number[],
          superMeasureSum: [] as number[],
        };

        for (let i = 0; i < pairCount; i++) {
          const a = runsA[i];
          const b = runsB[i];
          if (
            b.irReadyToFirstRawLayoutMs != null &&
            a.irReadyToFirstRawLayoutMs != null
          ) {
            pairDiffs.irReadyToFirstRawLayout.push(
              b.irReadyToFirstRawLayoutMs - a.irReadyToFirstRawLayoutMs,
            );
          }
          if (
            b.firstRawLayoutToLastLayoutMs != null &&
            a.firstRawLayoutToLastLayoutMs != null
          ) {
            pairDiffs.firstRawLayoutToLastLayout.push(
              b.firstRawLayoutToLastLayoutMs - a.firstRawLayoutToLastLayoutMs,
            );
          }
          if (
            b.irReadyToLastLayoutMs != null &&
            a.irReadyToLastLayoutMs != null
          ) {
            pairDiffs.irReadyToLastLayout.push(
              b.irReadyToLastLayoutMs - a.irReadyToLastLayoutMs,
            );
          }
          if (
            b.lastHeightToLastLayoutMs != null &&
            a.lastHeightToLastLayoutMs != null
          ) {
            pairDiffs.lastHeightToLastLayout.push(
              b.lastHeightToLastLayoutMs - a.lastHeightToLastLayoutMs,
            );
          }
          if (b.lastLayoutMs != null && a.lastLayoutMs != null) {
            pairDiffs.lastLayout.push(b.lastLayoutMs - a.lastLayoutMs);
          }
          if (b.documentReadyMs != null && a.documentReadyMs != null) {
            pairDiffs.documentReady.push(b.documentReadyMs - a.documentReadyMs);
          }
          if (b.rebuildSumMs != null && a.rebuildSumMs != null) {
            pairDiffs.rebuildSum.push(b.rebuildSumMs - a.rebuildSumMs);
          }
          if (b.superMeasureSumMs != null && a.superMeasureSumMs != null) {
            pairDiffs.superMeasureSum.push(
              b.superMeasureSumMs - a.superMeasureSumMs,
            );
          }
        }

        const pairDiffSummary = {
          irReadyToFirstRawLayout: computeStats(
            pairDiffs.irReadyToFirstRawLayout,
          ),
          firstRawLayoutToLastLayout: computeStats(
            pairDiffs.firstRawLayoutToLastLayout,
          ),
          irReadyToLastLayout: computeStats(pairDiffs.irReadyToLastLayout),
          lastHeightToLastLayout: computeStats(
            pairDiffs.lastHeightToLastLayout,
          ),
          lastLayout: computeStats(pairDiffs.lastLayout),
          documentReady: computeStats(pairDiffs.documentReady),
          rebuildSum: computeStats(pairDiffs.rebuildSum),
          superMeasureSum: computeStats(pairDiffs.superMeasureSum),
        };

        setInterleavedSummary({
          offSummary,
          onSummary,
          pairDiffSummary,
        });

        const exportPayload = {
          exportTime: new Date().toISOString(),
          testMode: '20-runs-interleaved-ab-mode',
          environment: {
            platform: Platform.OS,
            target: {
              type: visibleContent.type,
              id: visibleContent.id,
              title: visibleContent.title,
            },
            settings: {
              flowCountMode,
              rendererMode,
              clearCacheBeforeMount,
              usePreparedDocument,
              useInitialContentWidth,
              nativeAutoSizeCachedHeight,
              fontSizeScale,
              lineHeightScale,
            },
          },
          summary: {
            pairsCompleted: pairCount,
            autoSizeOff: offSummary,
            autoSizeOn: onSummary,
            pairwiseDifference_B_minus_A: pairDiffSummary,
          },
          runs: {
            autoSizeOff: runsA.map((r, i) => ({ pairIndex: i + 1, ...r })),
            autoSizeOn: runsB.map((r, i) => ({ pairIndex: i + 1, ...r })),
          },
        };

        const jsonString = JSON.stringify(exportPayload, null, 2);
        setExportedJsonResult(jsonString);
        await Clipboard.setStringAsync(jsonString);
        setCopyToast('20 次交错测试已完成，A/B 对比数据已自动复制到剪贴板！');
      }
    } catch {
      setCopyToast('交错测试过程中发生异常');
    } finally {
      setIsTesting(false);
      isTestingRef.current = false;
      setCacheSize(getMeasuredFlowHeightCacheSize());
    }
  };

  const copyExportedJson = useCallback(async () => {
    if (!exportedJsonResult) return;
    await Clipboard.setStringAsync(exportedJsonResult);
    setCopyToast('已重新复制到剪贴板！');
  }, [exportedJsonResult]);

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

          {/* Experiment Controls Panel */}
          <View
            style={[
              styles.controls,
              { borderColor: border, backgroundColor: surface },
            ]}
          >
            {/* Flow Count Selection */}
            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>Flow 数量对照</Text>
              <View style={styles.row}>
                {(
                  [
                    { mode: '1', label: '1 个' },
                    { mode: 'default', label: '默认' },
                    { mode: '50', label: '50 个' },
                  ] as const
                ).map((item) => (
                  <Pressable
                    key={item.mode}
                    accessibilityRole="button"
                    onPress={() => {
                      activeRenderKey.current = null;
                      setReady(false);
                      if (visibleContent) startTrace();
                      setFlowCountMode(item.mode);
                    }}
                    style={[
                      styles.modePill,
                      { borderColor: border },
                      flowCountMode === item.mode && {
                        backgroundColor: primary,
                        borderColor: primary,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.modePillText,
                        flowCountMode === item.mode && { color: onPrimary },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Renderer Baseline Selection */}
            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>渲染后端对照</Text>
              <View style={styles.row}>
                {(
                  [
                    { mode: 'rich-text', label: 'RichFlow 原生' },
                    { mode: 'pure-rn-text', label: '纯 RN <Text> 基线' },
                  ] as const
                ).map((item) => (
                  <Pressable
                    key={item.mode}
                    accessibilityRole="button"
                    onPress={() => {
                      activeRenderKey.current = null;
                      setReady(false);
                      if (visibleContent) startTrace();
                      setRendererMode(item.mode);
                    }}
                    style={[
                      styles.modePill,
                      { borderColor: border },
                      rendererMode === item.mode && {
                        backgroundColor: primary,
                        borderColor: primary,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.modePillText,
                        rendererMode === item.mode && { color: onPrimary },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Fabric AutoSize Toggle */}
            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>Fabric 原生尺寸（实验）</Text>
              <Switch
                value={nativeAutoSize}
                onValueChange={(value) => {
                  activeRenderKey.current = null;
                  setReady(false);
                  if (visibleContent) startTrace();
                  setNativeAutoSize(value);
                }}
              />
            </View>

            {/* Cold Cache Toggle */}
            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>
                冷缓存测试（挂载前清空高度缓存）
              </Text>
              <Switch
                value={clearCacheBeforeMount}
                onValueChange={setClearCacheBeforeMount}
              />
            </View>

            {/* Experiment A Toggle */}
            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>
                实验 A：预备 Document 模式（跳过 HTML 规范化）
              </Text>
              <Switch
                value={usePreparedDocument}
                onValueChange={(value) => {
                  activeRenderKey.current = null;
                  setReady(false);
                  if (visibleContent) startTrace();
                  setUsePreparedDocument(value);
                }}
              />
            </View>

            {/* Experiment B Toggle */}
            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>
                实验 B：预置容器宽度模式（避免等待首次 onLayout）
              </Text>
              <Switch
                value={useInitialContentWidth}
                onValueChange={(value) => {
                  activeRenderKey.current = null;
                  setReady(false);
                  if (visibleContent) startTrace();
                  setUseInitialContentWidth(value);
                }}
              />
            </View>

            {/* Fabric Cached Height Toggle */}
            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>
                Fabric 预置缓存尺寸模式（热测试公平对比）
              </Text>
              <Switch
                value={nativeAutoSizeCachedHeight}
                onValueChange={(value) => {
                  activeRenderKey.current = null;
                  setReady(false);
                  if (visibleContent) startTrace();
                  setNativeAutoSizeCachedHeight(value);
                }}
              />
            </View>

            {/* Action buttons */}
            <View style={styles.actionRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !visibleContent || isTesting }}
                disabled={!visibleContent || isTesting}
                onPress={handleManualRemount}
                style={[
                  styles.button,
                  styles.flexButton,
                  {
                    borderColor: border,
                    opacity: visibleContent && !isTesting ? 1 : 0.5,
                  },
                ]}
              >
                <Text>重新挂载</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !visibleContent || isTesting }}
                disabled={!visibleContent || isTesting}
                onPress={() => void run10Tests()}
                style={[
                  styles.button,
                  styles.flexButton,
                  {
                    backgroundColor: primary,
                    borderColor: primary,
                    opacity: visibleContent && !isTesting ? 1 : 0.5,
                  },
                ]}
              >
                {isTesting && testProgress.total === 10 ? (
                  <View style={styles.inlineLoading}>
                    <ActivityIndicator size="small" color={onPrimary} />
                    <Text style={{ color: onPrimary, fontSize: 12 }}>
                      {testProgress.current}/10
                    </Text>
                  </View>
                ) : (
                  <Text style={{ color: onPrimary, fontSize: 13 }}>
                    测试 10 次
                  </Text>
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !visibleContent || isTesting }}
                disabled={!visibleContent || isTesting}
                onPress={() => void run20InterleavedTests()}
                style={[
                  styles.button,
                  styles.flexButton,
                  {
                    backgroundColor: primary,
                    borderColor: primary,
                    opacity: visibleContent && !isTesting ? 1 : 0.5,
                  },
                ]}
              >
                {isTesting && testProgress.total === 20 ? (
                  <View style={styles.inlineLoading}>
                    <ActivityIndicator size="small" color={onPrimary} />
                    <Text style={{ color: onPrimary, fontSize: 12 }}>
                      {testProgress.current}/20
                    </Text>
                  </View>
                ) : (
                  <Text style={{ color: onPrimary, fontSize: 13 }}>
                    交错 20 次 (A/B)
                  </Text>
                )}
              </Pressable>
            </View>

            <View style={styles.actionRow}>
              <Pressable
                accessibilityRole="button"
                onPress={handleClearCache}
                style={[
                  styles.button,
                  styles.flexButton,
                  { borderColor: border },
                ]}
              >
                <Text style={{ fontSize: 12 }}>
                  手动清空缓存（当前 {cacheSize} 项）
                </Text>
              </Pressable>
            </View>

            {copyToast ? (
              <Text
                style={[styles.hint, { color: primary, fontWeight: '600' }]}
              >
                {copyToast}
              </Text>
            ) : null}
          </View>

          {/* Interleaved A/B Comparison Card */}
          {interleavedSummary ? (
            <View
              style={[
                styles.controls,
                { borderColor: primary, backgroundColor: surface },
              ]}
            >
              <Text style={[styles.controlLabel, { fontWeight: '700' }]}>
                A/B 交错测试对比结果（各 10 轮交替运行，单位：ms 中位数）
              </Text>
              <Text type="secondary" style={styles.hint}>
                【阶段耗时对比】
                {'\n'}IR Ready：
                {interleavedSummary.offSummary.irReadyMs.median} vs{' '}
                {interleavedSummary.onSummary.irReadyMs.median}
                {'\n'}First Raw Layout：
                {interleavedSummary.offSummary.firstRawLayoutMs.median} vs{' '}
                {interleavedSummary.onSummary.firstRawLayoutMs.median}
                {'\n'}First Height：
                {interleavedSummary.offSummary.firstHeightMs.median} vs{' '}
                {interleavedSummary.onSummary.firstHeightMs.median}
                {'\n'}Last Height：
                {interleavedSummary.offSummary.lastHeightMs.median} vs{' '}
                {interleavedSummary.onSummary.lastHeightMs.median}
                {'\n'}First Layout：
                {interleavedSummary.offSummary.firstLayoutMs.median} vs{' '}
                {interleavedSummary.onSummary.firstLayoutMs.median}
                {'\n'}Last Layout：
                {interleavedSummary.offSummary.lastLayoutMs.median} vs{' '}
                {interleavedSummary.onSummary.lastLayoutMs.median}
                {'\n'}Document Ready：
                {interleavedSummary.offSummary.documentReadyMs.median} vs{' '}
                {interleavedSummary.onSummary.documentReadyMs.median}
                {'\n'}────────────────────────
                {'\n'}【核心阶段间隔对比（中位数）】
                {'\n'}IR Ready → First Raw Layout：
                {interleavedSummary.offSummary.irReadyToFirstRawLayoutMs.median}{' '}
                vs{' '}
                {interleavedSummary.onSummary.irReadyToFirstRawLayoutMs.median}
                {'\n'}First Raw Layout → Last Layout：
                {
                  interleavedSummary.offSummary.firstRawLayoutToLastLayoutMs
                    .median
                }{' '}
                vs{' '}
                {
                  interleavedSummary.onSummary.firstRawLayoutToLastLayoutMs
                    .median
                }
                {'\n'}IR Ready → Last Layout（总布局用时）：
                {interleavedSummary.offSummary.irReadyToLastLayoutMs.median} vs{' '}
                {interleavedSummary.onSummary.irReadyToLastLayoutMs.median}
                {'\n'}Last Height → Last Layout：
                {interleavedSummary.offSummary.lastHeightToLastLayoutMs.median}{' '}
                vs{' '}
                {interleavedSummary.onSummary.lastHeightToLastLayoutMs.median}
                {'\n'}────────────────────────
                {'\n'}【逐对相减中位数（Pairwise B - A）】
                {'\n'}IR Ready → First Raw Layout 差异：
                {
                  interleavedSummary.pairDiffSummary.irReadyToFirstRawLayout
                    .median
                }{' '}
                ms
                {'\n'}First Raw Layout → Last Layout 差异：
                {
                  interleavedSummary.pairDiffSummary.firstRawLayoutToLastLayout
                    .median
                }{' '}
                ms
                {'\n'}IR Ready → Last Layout 差异：
                {interleavedSummary.pairDiffSummary.irReadyToLastLayout.median}{' '}
                ms
                {'\n'}最终 Last Layout 差异：
                {interleavedSummary.pairDiffSummary.lastLayout.median} ms
              </Text>
            </View>
          ) : null}

          {/* Export JSON Results Panel */}
          {exportedJsonResult ? (
            <View
              style={[
                styles.controls,
                { borderColor: primary, backgroundColor: surface },
              ]}
            >
              <View style={styles.controlRow}>
                <Text style={[styles.controlLabel, { fontWeight: '700' }]}>
                  测试数据已就绪（已写入剪贴板）
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void copyExportedJson()}
                  style={[
                    styles.button,
                    {
                      minHeight: 32,
                      paddingHorizontal: 10,
                      borderColor: primary,
                    },
                  ]}
                >
                  <Text style={{ fontSize: 12, color: primary }}>重新复制</Text>
                </Pressable>
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => setShowExportDetails((prev) => !prev)}
                style={styles.detailToggle}
              >
                <Text style={styles.controlLabel}>
                  {showExportDetails
                    ? '收起完整 JSON 数据 ▲'
                    : '查看完整 JSON 数据 ▼'}
                </Text>
              </Pressable>

              {showExportDetails ? (
                <View
                  style={[
                    styles.jsonContainer,
                    { borderColor: border, backgroundColor: background },
                  ]}
                >
                  <Text
                    selectable
                    style={[styles.jsonText, { color: foreground }]}
                  >
                    {exportedJsonResult}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {visibleContent ? (
            <>
              <Text style={styles.title}>{visibleContent.title}</Text>
              {visibleContent.possiblyIncomplete ? (
                <Text type="secondary" style={styles.hint}>
                  此回答可能包含付费或截断内容，当前仅展示接口返回的正文。
                </Text>
              ) : null}
              <Text type="secondary" style={styles.hint}>
                {ready ? '正文布局就绪' : '正文正在布局'}
              </Text>
              {trace ? (
                <>
                  <View
                    style={[
                      styles.controls,
                      { borderColor: border, backgroundColor: surface },
                    ]}
                  >
                    <Text style={styles.controlLabel}>
                      单次运行阶段耗时（共 {flowSummaries.length} 个文字 Flow）
                    </Text>
                    <Text type="secondary" style={styles.hint}>
                      【JS 规范化、编译与 React 生命周期】
                      {'\n'}react-render-enter（进入 Render）：
                      {formatMs(singleRunMetrics.renderEnterMs)}
                      {'\n'}normalize (规范化)：
                      {formatMs(singleRunMetrics.normalizeMs)}
                      {'\n'}compileZhihuDocument (编译)：
                      {formatMs(singleRunMetrics.compileMs)}
                      {'\n'}Flow JSON 序列化合计：
                      {formatMs(singleRunMetrics.flowJsonSumMs)}
                      {'\n'}IR 准备 (ir-ready)：
                      {formatMs(singleRunMetrics.irReadyMs)}
                      {'\n'}react-layout-effect (React Commit 完成)：
                      {formatMs(singleRunMetrics.layoutEffectMs)}
                      {'\n'}react-effect (被动调度完成)：
                      {formatMs(singleRunMetrics.effectMs)}
                      {'\n'}────────────────────────
                      {'\n'}【原生 Props 应用与首次系统测量/布局】
                      {'\n'}Native 收到 Props (commitProps)：
                      {firstAndLast(
                        singleRunMetrics.propsSetMinMs,
                        singleRunMetrics.propsSetMaxMs,
                        singleRunMetrics.flows.length,
                      )}
                      {'\n'}Native 首次收到 onMeasure：
                      {firstAndLast(
                        singleRunMetrics.firstMeasureMinMs,
                        singleRunMetrics.firstMeasureMaxMs,
                        singleRunMetrics.flows.length,
                      )}
                      {'\n'}Native 首次 onLayout 回调：
                      {firstAndLast(
                        singleRunMetrics.firstRawLayoutMs,
                        singleRunMetrics.lastRawLayoutMs,
                        singleRunMetrics.rawLayoutEventsCount,
                      )}
                      {'\n'}────────────────────────
                      {'\n'}【IR Ready 到 First Raw Layout 拆解】
                      {'\n'}IR Ready → React Commit：
                      {formatMs(singleRunMetrics.irReadyToLayoutEffectMs)}
                      {'\n'}React Commit → Native 收到 Props：
                      {formatMs(singleRunMetrics.layoutEffectToPropsSetMs)}
                      {'\n'}Native 收到 Props → 首次 onLayout：
                      {formatMs(singleRunMetrics.propsSetToFirstRawLayoutMs)}
                      {'\n'}IR Ready → 首次 onLayout 合计：
                      {formatMs(singleRunMetrics.irReadyToFirstRawLayoutMs)}
                      {'\n'}────────────────────────
                      {'\n'}【文字排版、高度与布局完成】
                      {'\n'}rebuild()（Spannable + setText）：
                      {sumAndMax(flowSummaries.map((f) => f.rebuildMs))}
                      {'\n'}rebuild() 细分（parse / span / setText 合计）：
                      {sumMs(flowSummaries.map((f) => f.parseMs))} /{' '}
                      {sumMs(flowSummaries.map((f) => f.spannableMs))} /{' '}
                      {sumMs(flowSummaries.map((f) => f.setTextMs))}
                      {'\n'}super.onMeasure()（真实排版测量）：
                      {sumAndMax(flowSummaries.map((f) => f.superMeasureMs))}
                      {'\n'}显式二次 measure()：
                      {maximum(flowSummaries.map((f) => f.measureMs))}
                      {'\n'}scheduleMeasurement post 排队等待：
                      {maximum(flowSummaries.map((f) => f.schedulePostWaitMs))}
                      {'\n'}measureText 高度 post 排队等待：
                      {maximum(flowSummaries.map((f) => f.heightPostWaitMs))}
                      {'\n'}高度事件到达：
                      {firstAndLast(
                        singleRunMetrics.firstHeightMs,
                        singleRunMetrics.lastHeightMs,
                        singleRunMetrics.heightEventsCount,
                      )}
                      {'\n'}匹配布局确认：
                      {firstAndLast(
                        singleRunMetrics.firstLayoutMs,
                        singleRunMetrics.lastLayoutMs,
                        singleRunMetrics.layoutEventsCount,
                      )}
                      {'\n'}文档整体就绪 (document-ready)：
                      {formatMs(singleRunMetrics.documentReadyMs)}
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
                                {flow.layoutCount} 次 / setViewSize{' '}
                                {flow.setViewSizeCount ?? 0} 次）
                              </Text>
                              <Text type="secondary" style={styles.hint}>
                                rebuild: {formatMs(flow.rebuildMs)} (parse:{' '}
                                {formatMs(flow.parseMs)}, span:{' '}
                                {formatMs(flow.spannableMs)}, setText:{' '}
                                {formatMs(flow.setTextMs)}){'\n'}super.measure:{' '}
                                {formatMs(flow.superMeasureMs)} | 二次 measure:{' '}
                                {formatMs(flow.measureMs)}
                                {'\n'}schedule wait:{' '}
                                {formatMs(flow.schedulePostWaitMs)} | height
                                wait: {formatMs(flow.heightPostWaitMs)}
                                {'\n'}propsSet: {formatMs(flow.propsSetMs)} →
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

        {/* Content Renderers */}
        {visibleContent ? (
          <View style={styles.body}>
            {rendererMode === 'pure-rn-text' && activeDocument ? (
              <PureRNTextContent
                key={renderKey}
                document={activeDocument}
                contentWidth={contentWidth}
                fontSizeScale={fontSizeScale}
                lineHeightScale={lineHeightScale}
                performanceTrace={trace}
                onLayoutReady={() => {
                  if (activeRenderKey.current === renderKey) setReady(true);
                  roundLayoutReadyRef.current?.();
                }}
              />
            ) : nativeAvailable ? (
              <ZhihuNativeContent
                key={renderKey}
                content={visibleContent.content}
                document={
                  flowCountMode !== 'default' || usePreparedDocument
                    ? activeDocument
                    : undefined
                }
                objectId={visibleContent.id}
                type={visibleContent.type}
                segmentInfos={visibleContent.segmentInfos}
                linkCardInfo={visibleContent.linkCardInfo}
                nativeAutoSize={nativeAutoSize}
                nativeAutoSizeCachedHeight={nativeAutoSizeCachedHeight}
                initialContentWidth={initialContentWidth}
                performanceTrace={trace}
                fontSizeScale={fontSizeScale}
                lineHeightScale={lineHeightScale}
                selectable
                onLayoutReady={() => {
                  if (activeRenderKey.current === renderKey) setReady(true);
                  roundLayoutReadyRef.current?.();
                }}
                renderFallback={() => <Text>原生正文不可用。</Text>}
              />
            ) : (
              <Text style={styles.hint}>
                当前构建缺少原生文字模块，无法测试原生渲染器。
              </Text>
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  actionRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  button: {
    minHeight: 42,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flexButton: { flex: 1 },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modePillText: {
    fontSize: 12,
    fontWeight: '500',
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
  jsonContainer: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 8,
    maxHeight: 240,
  },
  jsonText: {
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: 11,
    lineHeight: 16,
  },
  hint: { fontSize: 12, lineHeight: 18 },
  title: { fontSize: 17, fontWeight: '700' },
  body: { paddingHorizontal: 16, paddingTop: 14 },
});
