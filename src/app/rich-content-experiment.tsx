import * as FileSystem from 'expo-file-system/legacy';
import { Redirect, Stack } from 'expo-router';
import * as Sharing from 'expo-sharing';
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
  flowMeasureKey,
  getMeasuredFlowHeightCacheSize,
  getMeasuredFlowHeightMap,
  isRichTextNativeAvailable,
  normalizeZhihuDocument,
  RICH_CONTENT_PARAGRAPH_SPACING,
  type RichTextFlow,
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

export interface ExactHeightCoverageResult {
  totalFlows: number;
  coveredFlows: number;
  missingFlowIds: string[];
  isFullyCovered: boolean;
}

export function checkExactFlowHeightsCoverage(
  document: ZhihuDocument | undefined,
  fontSize: number,
  lineHeight: number,
  exactHeights: Readonly<Record<string, number>>,
  width?: number,
  configJson?: string,
): ExactHeightCoverageResult {
  if (!document) {
    return {
      totalFlows: 0,
      coveredFlows: 0,
      missingFlowIds: [],
      isFullyCovered: false,
    };
  }
  const compiled = compileZhihuDocument(document, {
    fontSize,
    lineHeight,
    paragraphSpacing: RICH_CONTENT_PARAGRAPH_SPACING,
  });
  const flows = compiled.parts.filter(
    (p): p is { type: 'flow'; flow: RichTextFlow } => p.type === 'flow',
  );
  if (flows.length === 0) {
    return {
      totalFlows: 0,
      coveredFlows: 0,
      missingFlowIds: [],
      isFullyCovered: true,
    };
  }
  const missingFlowIds: string[] = [];
  let coveredCount = 0;
  for (const part of flows) {
    const flow = part.flow;
    const fullKey =
      width && configJson ? flowMeasureKey(flow, width, configJson) : undefined;
    const height =
      (fullKey ? exactHeights[fullKey] : undefined) ?? exactHeights[flow.id];
    if (typeof height === 'number' && Number.isFinite(height) && height > 0) {
      coveredCount += 1;
    } else {
      missingFlowIds.push(flow.id);
    }
  }
  return {
    totalFlows: flows.length,
    coveredFlows: coveredCount,
    missingFlowIds,
    isFullyCovered: coveredCount === flows.length,
  };
}

interface FlowTraceSummary {
  flowId: string;
  measureKey: string | null;
  contentWidth: number | null;
  cachedExactHeight: number | null;
  nativeMeasuredHeight: number | null;
  actualLayoutHeight: number | null;
  diffCachedVsNative: number | null;
  diffNativeVsLayout: number | null;
  isMatched: boolean;
  hasMismatchEvent: boolean;
  mismatchCount: number;
  postMatchUpdateCount: number;
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
        measureKey: null,
        contentWidth: null,
        cachedExactHeight: null,
        nativeMeasuredHeight: null,
        actualLayoutHeight: null,
        diffCachedVsNative: null,
        diffNativeVsLayout: null,
        isMatched: false,
        hasMismatchEvent: false,
        mismatchCount: 0,
        postMatchUpdateCount: 0,
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
    if (event.measureKey) entry.measureKey = event.measureKey;
    if (event.width != null) entry.contentWidth = event.width;
    if (event.cachedExactHeight != null)
      entry.cachedExactHeight = event.cachedExactHeight;
    if (event.nativeMeasuredHeight != null)
      entry.nativeMeasuredHeight = event.nativeMeasuredHeight;
    if (event.actualLayoutHeight != null)
      entry.actualLayoutHeight = event.actualLayoutHeight;

    if (event.phase === 'layout-mismatch') {
      entry.hasMismatchEvent = true;
      entry.mismatchCount += 1;
    } else if (
      event.phase === 'first-matched-layout' ||
      event.phase === 'layout'
    ) {
      entry.isMatched = true;
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

  for (const entry of map.values()) {
    if (entry.nativeMeasuredHeight != null && entry.cachedExactHeight != null) {
      entry.diffCachedVsNative = Number(
        (entry.nativeMeasuredHeight - entry.cachedExactHeight).toFixed(2),
      );
    }
    if (
      entry.actualLayoutHeight != null &&
      entry.nativeMeasuredHeight != null
    ) {
      entry.diffNativeVsLayout = Number(
        (entry.actualLayoutHeight - entry.nativeMeasuredHeight).toFixed(2),
      );
    }
    if (
      !entry.isMatched &&
      entry.layoutCount > 0 &&
      entry.actualLayoutHeight != null &&
      entry.nativeMeasuredHeight != null
    ) {
      entry.isMatched =
        Math.abs(entry.actualLayoutHeight - entry.nativeMeasuredHeight) <= 1;
    }
    entry.postMatchUpdateCount = entry.isMatched
      ? Math.max(0, entry.layoutCount - 1)
      : 0;
  }

  return Array.from(map.values());
}

function computeRunMetrics(
  events: readonly ZhihuNativePerformanceEvent[],
  expectedFlowCount?: number,
) {
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
  const contentVisibleCommitEvent = events.find(
    (e) => e.phase === 'content-visible-commit',
  );
  const heightEvents = events.filter((e) => e.phase === 'height');
  const layoutEvents = events.filter((e) => e.phase === 'layout');
  const rawLayoutEvents = events.filter((e) => e.phase === 'raw-layout');
  const firstMatchedLayoutEvents = events.filter(
    (e) => e.phase === 'first-matched-layout',
  );
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
  const lastMatchedUpdateMs = lastLayoutMs;
  const lastHeightMs = maxValid(heightEvents.map((e) => e.elapsedMs));
  const layoutEffectMs = numOrNull(layoutEffectEvent?.elapsedMs);
  const propsSetMinMs = minValid(propsSetEvents.map((e) => e.elapsedMs));
  const documentReadyMs = numOrNull(documentReadyEvent?.elapsedMs);
  const contentVisibleCommitMs = numOrNull(
    contentVisibleCommitEvent?.elapsedMs,
  );
  const firstMatchedLayoutMs = minValid(
    firstMatchedLayoutEvents.map((e) => e.elapsedMs),
  );
  const lastMatchedLayoutMs = maxValid(
    firstMatchedLayoutEvents.map((e) => e.elapsedMs),
  );
  const irReadyToLastMatchedLayoutMs =
    irReadyMs != null && lastMatchedLayoutMs != null
      ? Number((lastMatchedLayoutMs - irReadyMs).toFixed(2))
      : null;
  const totalPostMatchUpdates =
    sumValid(flows.map((f) => f.postMatchUpdateCount)) ?? 0;

  const matchedFlowsCount = flows.filter((f) => f.isMatched).length;
  const mismatchedFlowsCount = flows.filter(
    (f) => !f.isMatched || f.hasMismatchEvent,
  ).length;

  const isAllExpectedMatched =
    expectedFlowCount != null
      ? flows.length >= expectedFlowCount &&
        matchedFlowsCount >= expectedFlowCount
      : flows.length > 0 && flows.every((f) => f.isMatched);

  const isValid =
    documentReadyEvent != null &&
    isAllExpectedMatched &&
    (expectedFlowCount == null || flows.length === expectedFlowCount);
  const invalidReason = !documentReadyEvent
    ? 'Document ready event not received (timeout)'
    : flows.length === 0
      ? 'No flows detected'
      : expectedFlowCount != null && flows.length < expectedFlowCount
        ? `预期 ${expectedFlowCount} 个 Flow，实际仅捕获 ${flows.length} 个`
        : !flows.every((f) => f.isMatched) ||
            (expectedFlowCount != null && matchedFlowsCount < expectedFlowCount)
          ? `仅 ${matchedFlowsCount}/${expectedFlowCount ?? flows.length} 个 Flow 首次对齐有效`
          : undefined;

  return {
    isValid,
    invalidReason,
    renderEnterMs: numOrNull(renderEnterEvent?.elapsedMs),
    layoutEffectMs,
    effectMs: numOrNull(effectEvent?.elapsedMs),
    normalizeMs: numOrNull(normalizeEvent?.elapsedMs),
    compileMs: numOrNull(compileEvent?.elapsedMs),
    flowJsonSumMs: sumValid(flowJsonEvents.map((e) => e.elapsedMs)),
    irReadyMs,
    firstFlowReadyMs: numOrNull(firstFlowReadyEvent?.elapsedMs),
    allFlowsReadyMs: numOrNull(allFlowsReadyEvent?.elapsedMs),
    documentReadyMs,
    contentVisibleCommitMs,
    firstHeightMs: minValid(heightEvents.map((e) => e.elapsedMs)),
    lastHeightMs,
    firstLayoutMs: minValid(layoutEvents.map((e) => e.elapsedMs)),
    lastLayoutMs,
    lastMatchedUpdateMs,
    firstMatchedLayoutMs,
    lastMatchedLayoutMs,
    firstRawLayoutMs,
    lastRawLayoutMs: maxValid(rawLayoutEvents.map((e) => e.elapsedMs)),
    propsSetMinMs,
    propsSetMaxMs: maxValid(propsSetEvents.map((e) => e.elapsedMs)),
    firstMeasureMinMs: minValid(firstMeasureEvents.map((e) => e.elapsedMs)),
    firstMeasureMaxMs: maxValid(firstMeasureEvents.map((e) => e.elapsedMs)),
    firstNativeLayoutMinMs: minValid(firstLayoutEvents.map((e) => e.elapsedMs)),
    totalPostMatchUpdates,
    // Timeline breakdown intervals
    irReadyToFirstRawLayoutMs:
      irReadyMs != null && firstRawLayoutMs != null
        ? Number((firstRawLayoutMs - irReadyMs).toFixed(2))
        : null,
    irReadyToLastMatchedLayoutMs,
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
    matchedFlowsCount,
    mismatchedFlowsCount,
    heightEventsCount: heightEvents.length,
    layoutEventsCount: layoutEvents.length,
    rawLayoutEventsCount: rawLayoutEvents.length,
    flows,
  };
}

function buildSummaryFromRuns(runs: ReturnType<typeof computeRunMetrics>[]) {
  const validRuns = runs.filter((r) => r.isValid);
  const source = validRuns.length > 0 ? validRuns : runs;
  return {
    totalRuns: runs.length,
    validRuns: validRuns.length,
    normalizeMs: computeStatsForMetric(source.map((r) => r.normalizeMs)),
    compileMs: computeStatsForMetric(source.map((r) => r.compileMs)),
    flowJsonSumMs: computeStatsForMetric(source.map((r) => r.flowJsonSumMs)),
    irReadyMs: computeStatsForMetric(source.map((r) => r.irReadyMs)),
    layoutEffectMs: computeStatsForMetric(source.map((r) => r.layoutEffectMs)),
    firstRawLayoutMs: computeStatsForMetric(
      source.map((r) => r.firstRawLayoutMs),
    ),
    firstMatchedLayoutMs: computeStatsForMetric(
      source.map((r) => r.firstMatchedLayoutMs),
    ),
    firstHeightMs: computeStatsForMetric(source.map((r) => r.firstHeightMs)),
    lastHeightMs: computeStatsForMetric(source.map((r) => r.lastHeightMs)),
    firstLayoutMs: computeStatsForMetric(source.map((r) => r.firstLayoutMs)),
    lastLayoutMs: computeStatsForMetric(source.map((r) => r.lastLayoutMs)),
    lastMatchedLayoutMs: computeStatsForMetric(
      source.map((r) => r.lastMatchedLayoutMs),
    ),
    lastMatchedUpdateMs: computeStatsForMetric(
      source.map((r) => r.lastMatchedUpdateMs ?? r.lastLayoutMs),
    ),
    totalPostMatchUpdates: computeStatsForMetric(
      source.map((r) => r.totalPostMatchUpdates),
    ),
    documentReadyMs: computeStatsForMetric(
      source.map((r) => r.documentReadyMs),
    ),
    contentVisibleCommitMs: computeStatsForMetric(
      source.map((r) => r.contentVisibleCommitMs),
    ),
    propsSetMinMs: computeStatsForMetric(source.map((r) => r.propsSetMinMs)),
    firstMeasureMinMs: computeStatsForMetric(
      source.map((r) => r.firstMeasureMinMs),
    ),
    // Timeline intervals
    irReadyToLastMatchedLayoutMs: computeStatsForMetric(
      source.map((r) => r.irReadyToLastMatchedLayoutMs),
    ),
    irReadyToFirstRawLayoutMs: computeStatsForMetric(
      source.map((r) => r.irReadyToFirstRawLayoutMs),
    ),
    firstRawLayoutToLastLayoutMs: computeStatsForMetric(
      source.map((r) => r.firstRawLayoutToLastLayoutMs),
    ),
    irReadyToLastLayoutMs: computeStatsForMetric(
      source.map((r) => r.irReadyToLastLayoutMs),
    ),
    lastHeightToLastLayoutMs: computeStatsForMetric(
      source.map((r) => r.lastHeightToLastLayoutMs),
    ),
    irReadyToLayoutEffectMs: computeStatsForMetric(
      source.map((r) => r.irReadyToLayoutEffectMs),
    ),
    layoutEffectToPropsSetMs: computeStatsForMetric(
      source.map((r) => r.layoutEffectToPropsSetMs),
    ),
    propsSetToFirstRawLayoutMs: computeStatsForMetric(
      source.map((r) => r.propsSetToFirstRawLayoutMs),
    ),
    rebuildSumMs: computeStatsForMetric(source.map((r) => r.rebuildSumMs)),
    superMeasureSumMs: computeStatsForMetric(
      source.map((r) => r.superMeasureSumMs),
    ),
    measureMaxMs: computeStatsForMetric(source.map((r) => r.measureMaxMs)),
    schedulePostWaitMaxMs: computeStatsForMetric(
      source.map((r) => r.schedulePostWaitMaxMs),
    ),
    heightPostWaitMaxMs: computeStatsForMetric(
      source.map((r) => r.heightPostWaitMaxMs),
    ),
    setViewSizeCountMax: computeStatsForMetric(
      source.map((r) => r.setViewSizeCountMax),
    ),
  };
}

type MetricSummaryResult = ReturnType<typeof buildSummaryFromRuns>;

interface ThreeModeSummaryData {
  totalRuns: number;
  validRunsOff: number;
  validRunsOn: number;
  validRunsExact: number;
  offSummary: MetricSummaryResult;
  onSummary: MetricSummaryResult;
  exactSummary: MetricSummaryResult;
  diff_On_minus_Off: Record<string, StatSummary>;
  diff_Exact_minus_Off: Record<string, StatSummary>;
  diff_Exact_minus_On: Record<string, StatSummary>;
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
      performanceTrace.onEvent({
        flowId,
        phase: 'first-matched-layout',
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
        performanceTrace.onEvent({
          phase: 'content-visible-commit',
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

async function exportJsonToFile(
  jsonString: string,
  prefix = 'zhihu-fabric-benchmark',
): Promise<string | null> {
  try {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_');
    const fileName = `${prefix}-${timestamp}.json`;
    const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!dir) return null;
    const fileUri = `${dir}${fileName}`;
    await FileSystem.writeAsStringAsync(fileUri, jsonString, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: '导出测试数据 JSON 文件',
        UTI: 'public.json',
      });
    }
    return fileUri;
  } catch {
    return null;
  }
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
  const [exactHeightMode, setExactHeightMode] = useState(false);
  const [inFlowRevealMode, setInFlowRevealMode] = useState(false);
  const [exactFlowHeights, setExactFlowHeights] = useState<
    Record<string, number>
  >({});
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
  const [exportedFileUri, setExportedFileUri] = useState<string | null>(null);
  const [interleavedSummary, setInterleavedSummary] = useState<{
    offSummary: MetricSummaryResult;
    onSummary: MetricSummaryResult;
    pairDiffSummary: Record<string, StatSummary>;
  } | null>(null);
  const [threeModeSummary, setThreeModeSummary] =
    useState<ThreeModeSummaryData | null>(null);
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
    setExportedFileUri(null);
    setInterleavedSummary(null);
    setThreeModeSummary(null);
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
    setExportedFileUri(null);
    setInterleavedSummary(null);
    setThreeModeSummary(null);
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

  const currentCoverage = useMemo(() => {
    const richMetrics = createRichContentMetrics(
      fontSizeScale,
      lineHeightScale,
    );
    return checkExactFlowHeightsCoverage(
      activeDocument,
      richMetrics.body.fontSize,
      richMetrics.body.lineHeight,
      exactFlowHeights,
      contentWidth,
    );
  }, [
    activeDocument,
    fontSizeScale,
    lineHeightScale,
    exactFlowHeights,
    contentWidth,
  ]);

  const renderKey = visibleContent
    ? `${visibleContent.type}:${visibleContent.id}:${rendererMode}:${flowCountMode}:${nativeAutoSize}:${exactHeightMode}:${inFlowRevealMode}:${usePreparedDocument}:${useInitialContentWidth}:${nativeAutoSizeCachedHeight}:${mountIndex}`
    : null;
  activeRenderKey.current = renderKey;

  const expectedFlowCount = useMemo(() => {
    if (!activeDocument) return undefined;
    const richMetrics = createRichContentMetrics(
      fontSizeScale,
      lineHeightScale,
    );
    const compiled = compileZhihuDocument(activeDocument, {
      fontSize: richMetrics.body.fontSize,
      lineHeight: richMetrics.body.lineHeight,
      paragraphSpacing: RICH_CONTENT_PARAGRAPH_SPACING,
    });
    return compiled.parts.filter((p) => p.type === 'flow').length;
  }, [activeDocument, fontSizeScale, lineHeightScale]);

  const singleRunMetrics = useMemo(
    () => computeRunMetrics(traceEvents, expectedFlowCount),
    [traceEvents, expectedFlowCount],
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

  // 10-run single-mode test
  const run10Tests = async () => {
    if (!visibleContent || isTesting) return;
    setIsTesting(true);
    setTestProgress({ current: 0, total: 10, label: '单模式 10 轮测试' });
    setExportedJsonResult(null);
    setExportedFileUri(null);
    setInterleavedSummary(null);
    setThreeModeSummary(null);
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
        runsData.push(computeRunMetrics(roundEvents, expectedFlowCount));
        await new Promise((r) => setTimeout(r, 120));
      }

      if (runsData.length > 0 && isTestingRef.current) {
        const summary = buildSummaryFromRuns(runsData);
        const exportPayload = {
          exportTime: new Date().toISOString(),
          testMode: '10-runs-single-mode',
          environment: {
            platform: Platform.OS,
            isDev: Boolean(__DEV__),
            contentWidth,
            flowCount: visibleContent ? flowSummaries.length : 0,
            target: {
              type: visibleContent.type,
              id: visibleContent.id,
              title: visibleContent.title,
            },
            settings: {
              flowCountMode,
              rendererMode,
              nativeAutoSize,
              exactHeightMode,
              clearCacheBeforeMount,
              usePreparedDocument,
              useInitialContentWidth,
              nativeAutoSizeCachedHeight,
              inFlowRevealMode,
              fontSizeScale,
              lineHeightScale,
            },
          },
          summary: {
            runsCompleted: runsData.length,
            validRunsCompleted: summary.validRuns,
            metrics: summary,
          },
          runs: runsData.map((run, idx) => ({ round: idx + 1, ...run })),
        };

        const jsonString = JSON.stringify(exportPayload, null, 2);
        setExportedJsonResult(jsonString);
        const fileUri = await exportJsonToFile(
          jsonString,
          'zhihu-benchmark-10runs',
        );
        setExportedFileUri(fileUri);
        setCopyToast(
          fileUri
            ? '10 次测试已完成，测试数据已生成并调起文件导出！'
            : '10 次测试已完成，测试数据已生成！',
        );
      }
    } catch {
      setCopyToast('测试过程中发生异常');
    } finally {
      setIsTesting(false);
      isTestingRef.current = false;
      setCacheSize(getMeasuredFlowHeightCacheSize());
    }
  };

  // 20-run interleaved A/B test (10 pairs alternating off and on with ABBA counterbalancing)
  const run20InterleavedTests = async () => {
    if (!visibleContent || isTesting) return;
    setIsTesting(true);
    setTestProgress({ current: 0, total: 20, label: '交错测试 (ABBA 平衡)' });
    setExportedJsonResult(null);
    setExportedFileUri(null);
    setInterleavedSummary(null);
    setThreeModeSummary(null);
    setCopyToast(null);
    isTestingRef.current = true;

    const runsA: ReturnType<typeof computeRunMetrics>[] = [];
    const runsB: ReturnType<typeof computeRunMetrics>[] = [];

    const abbaSequence = [
      false,
      true,
      true,
      false,
      false,
      true,
      true,
      false,
      false,
      true,
      true,
      false,
      false,
      true,
      true,
      false,
      false,
      true,
      true,
      false,
    ];

    try {
      for (let round = 1; round <= 20; round++) {
        if (!isTestingRef.current) break;
        const currentIsAutoSize = abbaSequence[round - 1];
        setNativeAutoSize(currentIsAutoSize);
        setExactHeightMode(false);
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
        const metrics = computeRunMetrics(roundEvents, expectedFlowCount);
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

        // Compute pairwise differences (B - A for pair i, only valid pairs)
        const pairCount = Math.min(runsA.length, runsB.length);
        const pairDiffs = {
          irReadyToFirstRawLayout: [] as number[],
          firstRawLayoutToLastLayout: [] as number[],
          irReadyToLastLayout: [] as number[],
          lastHeightToLastLayout: [] as number[],
          lastLayout: [] as number[],
          lastMatchedLayout: [] as number[],
          lastMatchedUpdate: [] as number[],
          postMatchUpdates: [] as number[],
          documentReady: [] as number[],
          contentVisibleCommit: [] as number[],
          firstMatchedLayout: [] as number[],
          rebuildSum: [] as number[],
          superMeasureSum: [] as number[],
        };

        for (let i = 0; i < pairCount; i++) {
          const a = runsA[i];
          const b = runsB[i];
          if (!a.isValid || !b.isValid) continue;
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
          if (b.lastMatchedLayoutMs != null && a.lastMatchedLayoutMs != null) {
            pairDiffs.lastMatchedLayout.push(
              b.lastMatchedLayoutMs - a.lastMatchedLayoutMs,
            );
          }
          if (b.lastMatchedUpdateMs != null && a.lastMatchedUpdateMs != null) {
            pairDiffs.lastMatchedUpdate.push(
              b.lastMatchedUpdateMs - a.lastMatchedUpdateMs,
            );
          }
          pairDiffs.postMatchUpdates.push(
            b.totalPostMatchUpdates - a.totalPostMatchUpdates,
          );
          if (b.documentReadyMs != null && a.documentReadyMs != null) {
            pairDiffs.documentReady.push(b.documentReadyMs - a.documentReadyMs);
          }
          if (
            b.contentVisibleCommitMs != null &&
            a.contentVisibleCommitMs != null
          ) {
            pairDiffs.contentVisibleCommit.push(
              b.contentVisibleCommitMs - a.contentVisibleCommitMs,
            );
          }
          if (
            b.firstMatchedLayoutMs != null &&
            a.firstMatchedLayoutMs != null
          ) {
            pairDiffs.firstMatchedLayout.push(
              b.firstMatchedLayoutMs - a.firstMatchedLayoutMs,
            );
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
          lastMatchedLayout: computeStats(pairDiffs.lastMatchedLayout),
          lastMatchedUpdate: computeStats(pairDiffs.lastMatchedUpdate),
          postMatchUpdates: computeStats(pairDiffs.postMatchUpdates),
          documentReady: computeStats(pairDiffs.documentReady),
          contentVisibleCommit: computeStats(pairDiffs.contentVisibleCommit),
          firstMatchedLayout: computeStats(pairDiffs.firstMatchedLayout),
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
          testMode: '20-runs-interleaved-abba-mode',
          environment: {
            platform: Platform.OS,
            isDev: Boolean(__DEV__),
            contentWidth,
            flowCount: visibleContent ? flowSummaries.length : 0,
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
              inFlowRevealMode,
              fontSizeScale,
              lineHeightScale,
            },
          },
          summary: {
            pairsCompleted: pairCount,
            validPairsCompleted: pairDiffs.lastLayout.length,
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
        const fileUri = await exportJsonToFile(
          jsonString,
          'zhihu-benchmark-20runs-abba',
        );
        setExportedFileUri(fileUri);
        setCopyToast(
          fileUri
            ? '20 次 ABBA 平衡交错测试已完成，测试数据已生成并调起文件导出！'
            : '20 次测试已完成，测试数据已生成！',
        );
      }
    } catch {
      setCopyToast('交错测试过程中发生异常');
    } finally {
      setIsTesting(false);
      isTestingRef.current = false;
      setCacheSize(getMeasuredFlowHeightCacheSize());
    }
  };

  // 30-run 3-mode balanced interleaved test (Off / On / Exact, 10 each)
  const run30ThreeModeTests = async () => {
    if (!visibleContent || isTesting) return;
    setIsTesting(true);
    setTestProgress({ current: 0, total: 30, label: '三模式平衡交错测试' });
    setExportedJsonResult(null);
    setExportedFileUri(null);
    setInterleavedSummary(null);
    setThreeModeSummary(null);
    setCopyToast(null);
    isTestingRef.current = true;

    try {
      // Check if exact flow heights are captured and cover 100% of flows
      let currentExactHeights = exactFlowHeights;
      const richMetrics = createRichContentMetrics(
        fontSizeScale,
        lineHeightScale,
      );
      let coverage = checkExactFlowHeightsCoverage(
        activeDocument,
        richMetrics.body.fontSize,
        richMetrics.body.lineHeight,
        currentExactHeights,
        contentWidth,
      );

      if (!coverage.isFullyCovered) {
        setTestProgress({
          current: 0,
          total: 30,
          label: `正在预热捕获各 Flow 精确高度 (${coverage.coveredFlows}/${coverage.totalFlows})...`,
        });
        const primePromise = new Promise<void>((resolve) => {
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
        setNativeAutoSize(false);
        setExactHeightMode(false);
        activeRenderKey.current = null;
        setReady(false);
        startTrace();
        setMountIndex((v) => v + 1);
        await primePromise;
        currentExactHeights = getMeasuredFlowHeightMap();
        setExactFlowHeights(currentExactHeights);
        setCacheSize(getMeasuredFlowHeightCacheSize());

        coverage = checkExactFlowHeightsCoverage(
          activeDocument,
          richMetrics.body.fontSize,
          richMetrics.body.lineHeight,
          currentExactHeights,
          contentWidth,
        );
        if (!coverage.isFullyCovered) {
          setCopyToast(
            `精确高度预热未完全覆盖：仅命中 ${coverage.coveredFlows}/${coverage.totalFlows} 个 Flow，测试已取消`,
          );
          return;
        }
      }

      const runsOff: ReturnType<typeof computeRunMetrics>[] = [];
      const runsOn: ReturnType<typeof computeRunMetrics>[] = [];
      const runsExact: ReturnType<typeof computeRunMetrics>[] = [];

      // 5 palindromic blocks of 6 = 30 runs total (10 each)
      const blockModes: Array<'off' | 'on' | 'exact'>[] = [
        ['off', 'on', 'exact', 'exact', 'on', 'off'],
        ['on', 'exact', 'off', 'off', 'exact', 'on'],
        ['exact', 'off', 'on', 'on', 'off', 'exact'],
        ['off', 'on', 'exact', 'exact', 'on', 'off'],
        ['on', 'exact', 'off', 'off', 'exact', 'on'],
      ];
      const sequence = blockModes.flat();

      for (let round = 1; round <= 30; round++) {
        if (!isTestingRef.current) break;
        const mode = sequence[round - 1];
        const modeLabel =
          mode === 'off'
            ? 'AutoSize 关'
            : mode === 'on'
              ? 'AutoSize 开'
              : 'Exact 精确尺寸';

        setTestProgress({
          current: round,
          total: 30,
          label: `第 ${round}/30 轮 (${modeLabel})`,
        });

        if (mode === 'off') {
          setNativeAutoSize(false);
          setExactHeightMode(false);
        } else if (mode === 'on') {
          setNativeAutoSize(true);
          setExactHeightMode(false);
        } else {
          setNativeAutoSize(false);
          setExactHeightMode(true);
        }

        if (clearCacheBeforeMount && mode !== 'exact') {
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
        const metrics = computeRunMetrics(roundEvents, expectedFlowCount);
        if (mode === 'off') {
          runsOff.push(metrics);
        } else if (mode === 'on') {
          runsOn.push(metrics);
        } else {
          runsExact.push(metrics);
        }

        await new Promise((r) => setTimeout(r, 120));
      }

      if (
        runsOff.length > 0 &&
        runsOn.length > 0 &&
        runsExact.length > 0 &&
        isTestingRef.current
      ) {
        const offSummary = buildSummaryFromRuns(runsOff);
        const onSummary = buildSummaryFromRuns(runsOn);
        const exactSummary = buildSummaryFromRuns(runsExact);

        const computePairDiff = (
          runs1: typeof runsOff,
          runs2: typeof runsOff,
          getter: (r: (typeof runsOff)[0]) => number | null | undefined,
        ) => {
          const diffs: number[] = [];
          const count = Math.min(runs1.length, runs2.length);
          for (let i = 0; i < count; i++) {
            const v1 = getter(runs1[i]);
            const v2 = getter(runs2[i]);
            if (
              v1 != null &&
              v2 != null &&
              runs1[i].isValid &&
              runs2[i].isValid
            ) {
              diffs.push(v1 - v2);
            }
          }
          return computeStats(diffs);
        };

        const diffKeys = {
          lastMatchedLayout: (r: (typeof runsOff)[0]) => r.lastMatchedLayoutMs,
          documentReady: (r: (typeof runsOff)[0]) => r.documentReadyMs,
          contentVisibleCommit: (r: (typeof runsOff)[0]) =>
            r.contentVisibleCommitMs,
          lastMatchedUpdate: (r: (typeof runsOff)[0]) => r.lastMatchedUpdateMs,
          postMatchUpdates: (r: (typeof runsOff)[0]) => r.totalPostMatchUpdates,
          lastLayout: (r: (typeof runsOff)[0]) => r.lastLayoutMs,
          firstRawLayout: (r: (typeof runsOff)[0]) => r.firstRawLayoutMs,
          firstMatchedLayout: (r: (typeof runsOff)[0]) =>
            r.firstMatchedLayoutMs,
          irReadyToLastMatchedLayout: (r: (typeof runsOff)[0]) =>
            r.irReadyToLastMatchedLayoutMs,
          irReadyToLastLayout: (r: (typeof runsOff)[0]) =>
            r.irReadyToLastLayoutMs,
          irReadyToFirstRawLayout: (r: (typeof runsOff)[0]) =>
            r.irReadyToFirstRawLayoutMs,
          firstRawLayoutToLastLayout: (r: (typeof runsOff)[0]) =>
            r.firstRawLayoutToLastLayoutMs,
          rebuildSum: (r: (typeof runsOff)[0]) => r.rebuildSumMs,
          superMeasureSum: (r: (typeof runsOff)[0]) => r.superMeasureSumMs,
        };

        const diff_On_minus_Off: Record<string, StatSummary> = {};
        const diff_Exact_minus_Off: Record<string, StatSummary> = {};
        const diff_Exact_minus_On: Record<string, StatSummary> = {};

        for (const [k, getter] of Object.entries(diffKeys)) {
          diff_On_minus_Off[k] = computePairDiff(runsOn, runsOff, getter);
          diff_Exact_minus_Off[k] = computePairDiff(runsExact, runsOff, getter);
          diff_Exact_minus_On[k] = computePairDiff(runsExact, runsOn, getter);
        }

        const summaryResult: ThreeModeSummaryData = {
          totalRuns: runsOff.length + runsOn.length + runsExact.length,
          validRunsOff: offSummary.validRuns,
          validRunsOn: onSummary.validRuns,
          validRunsExact: exactSummary.validRuns,
          offSummary,
          onSummary,
          exactSummary,
          diff_On_minus_Off,
          diff_Exact_minus_Off,
          diff_Exact_minus_On,
        };

        setThreeModeSummary(summaryResult);

        const exportPayload = {
          exportTime: new Date().toISOString(),
          testMode: '30-runs-three-mode-balanced',
          environment: {
            platform: Platform.OS,
            isDev: Boolean(__DEV__),
            contentWidth,
            flowCount: visibleContent ? flowSummaries.length : 0,
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
              inFlowRevealMode,
              fontSizeScale,
              lineHeightScale,
            },
          },
          summary: summaryResult,
          runs: {
            autoSizeOff: runsOff.map((r, i) => ({ round: i + 1, ...r })),
            autoSizeOn: runsOn.map((r, i) => ({ round: i + 1, ...r })),
            exactHeight: runsExact.map((r, i) => ({ round: i + 1, ...r })),
          },
        };

        const jsonString = JSON.stringify(exportPayload, null, 2);
        setExportedJsonResult(jsonString);
        const fileUri = await exportJsonToFile(
          jsonString,
          'zhihu-benchmark-30runs-threemode',
        );
        setExportedFileUri(fileUri);
        setCopyToast(
          fileUri
            ? '30 次三模式平衡测试已完成，测试数据已生成并调起文件导出！'
            : '30 次测试已完成，测试数据已生成！',
        );
      }
    } catch {
      setCopyToast('三模式测试过程中发生异常');
    } finally {
      setIsTesting(false);
      isTestingRef.current = false;
      setCacheSize(getMeasuredFlowHeightCacheSize());
    }
  };

  const exportCurrentJsonFile = useCallback(async () => {
    if (!exportedJsonResult) return;
    const uri = await exportJsonToFile(exportedJsonResult);
    if (uri) {
      setExportedFileUri(uri);
      setCopyToast('已重新调起文件导出分享！');
    }
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

            {/* Exact Height Diagnostic Toggle */}
            <View style={styles.controlRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.controlLabel}>
                  诊断：精确高度直传模式（验证二阶段布局开销）
                </Text>
                <Text type="secondary" style={styles.hint}>
                  缓存命中: {currentCoverage.coveredFlows}/
                  {currentCoverage.totalFlows}{' '}
                  {currentCoverage.isFullyCovered
                    ? '✅ 全部就绪'
                    : '⚠️ 缺值将致未决'}
                </Text>
              </View>
              <Switch
                value={exactHeightMode}
                onValueChange={(value) => {
                  activeRenderKey.current = null;
                  setReady(false);
                  if (visibleContent) startTrace();
                  setExactHeightMode(value);
                  if (value && !currentCoverage.isFullyCovered) {
                    const map = getMeasuredFlowHeightMap();
                    setExactFlowHeights(map);
                  }
                }}
              />
            </View>

            {/* Reveal Strategy Diagnostic Toggle */}
            <View style={styles.controlRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.controlLabel}>
                  诊断：揭晓机制（保留正常文档流，仅切 Opacity，不换 Position）
                </Text>
                <Text type="secondary" style={styles.hint}>
                  隔离容器定位策略对二次回流的影响
                </Text>
              </View>
              <Switch
                value={inFlowRevealMode}
                onValueChange={(value) => {
                  activeRenderKey.current = null;
                  setReady(false);
                  if (visibleContent) startTrace();
                  setInFlowRevealMode(value);
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
                    交错 20 次 (ABBA)
                  </Text>
                )}
              </Pressable>
            </View>

            <View style={styles.actionRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !visibleContent || isTesting }}
                disabled={!visibleContent || isTesting}
                onPress={() => void run30ThreeModeTests()}
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
                {isTesting && testProgress.total === 30 ? (
                  <View style={styles.inlineLoading}>
                    <ActivityIndicator size="small" color={onPrimary} />
                    <Text style={{ color: onPrimary, fontSize: 12 }}>
                      {testProgress.current}/30
                    </Text>
                  </View>
                ) : (
                  <Text style={{ color: onPrimary, fontSize: 13 }}>
                    三模式 30 次 (Off/On/Exact)
                  </Text>
                )}
              </Pressable>
            </View>

            <View style={styles.actionRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const map = getMeasuredFlowHeightMap();
                  setExactFlowHeights(map);
                  const richMetrics = createRichContentMetrics(
                    fontSizeScale,
                    lineHeightScale,
                  );
                  const cov = checkExactFlowHeightsCoverage(
                    activeDocument,
                    richMetrics.body.fontSize,
                    richMetrics.body.lineHeight,
                    map,
                    contentWidth,
                  );
                  setCopyToast(
                    `已捕获精准高度：${cov.coveredFlows}/${cov.totalFlows} Flow ${
                      cov.isFullyCovered ? '全部命中就绪 ✅' : '部分缺失 ⚠️'
                    }`,
                  );
                }}
                style={[
                  styles.button,
                  styles.flexButton,
                  { borderColor: border },
                ]}
              >
                <Text style={{ fontSize: 12 }}>
                  捕获精准高度（{currentCoverage.coveredFlows}/
                  {currentCoverage.totalFlows}{' '}
                  {currentCoverage.isFullyCovered ? '✅' : '⚠️'}）
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={handleClearCache}
                style={[
                  styles.button,
                  styles.flexButton,
                  { borderColor: border },
                ]}
              >
                <Text style={{ fontSize: 12 }}>清空缓存（{cacheSize} 项）</Text>
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
                【核心指标对比】
                {'\n'}★ 全 Flow 首次对齐 (Last Matched Layout)：
                {interleavedSummary.offSummary.lastMatchedLayoutMs.median} vs{' '}
                {interleavedSummary.onSummary.lastMatchedLayoutMs.median}
                {'\n'}IR Ready → 全 Flow 首次对齐：
                {
                  interleavedSummary.offSummary.irReadyToLastMatchedLayoutMs
                    .median
                }{' '}
                vs{' '}
                {
                  interleavedSummary.onSummary.irReadyToLastMatchedLayoutMs
                    .median
                }
                {'\n'}文档整体就绪 (Document Ready)：
                {interleavedSummary.offSummary.documentReadyMs.median} vs{' '}
                {interleavedSummary.onSummary.documentReadyMs.median}
                {'\n'}内容可见提交 (Content Visible Commit)：
                {interleavedSummary.offSummary.contentVisibleCommitMs.median} vs{' '}
                {interleavedSummary.onSummary.contentVisibleCommitMs.median}
                {'\n'}────────────────────────
                {'\n'}【诊断指标（布局震荡与后续更新）】
                {'\n'}最后匹配更新 (Last Matched Update)：
                {interleavedSummary.offSummary.lastMatchedUpdateMs.median} vs{' '}
                {interleavedSummary.onSummary.lastMatchedUpdateMs.median}
                {'\n'}匹配后额外更新次数合计：
                {interleavedSummary.offSummary.totalPostMatchUpdates.median} vs{' '}
                {interleavedSummary.onSummary.totalPostMatchUpdates.median}
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
                {'\n'}────────────────────────
                {'\n'}【逐对相减中位数（Pairwise B - A）】
                {'\n'}★ 全 Flow 首次对齐差异：
                {interleavedSummary.pairDiffSummary.lastMatchedLayout?.median ??
                  '—'}{' '}
                ms
                {'\n'}Document Ready 差异：
                {interleavedSummary.pairDiffSummary.documentReady?.median ??
                  '—'}{' '}
                ms
                {'\n'}Content Visible Commit 差异：
                {interleavedSummary.pairDiffSummary.contentVisibleCommit
                  ?.median ?? '—'}{' '}
                ms
                {'\n'}最后匹配更新 (Last Matched Update) 差异：
                {interleavedSummary.pairDiffSummary.lastMatchedUpdate?.median ??
                  '—'}{' '}
                ms
                {'\n'}匹配后额外更新次数差异：
                {interleavedSummary.pairDiffSummary.postMatchUpdates?.median ??
                  '—'}{' '}
                次{'\n'}IR Ready → First Raw Layout 差异：
                {
                  interleavedSummary.pairDiffSummary.irReadyToFirstRawLayout
                    .median
                }{' '}
                ms
              </Text>
            </View>
          ) : null}

          {/* Three-Mode Comparison Card */}
          {threeModeSummary ? (
            <View
              style={[
                styles.controls,
                { borderColor: primary, backgroundColor: surface },
              ]}
            >
              <Text style={[styles.controlLabel, { fontWeight: '700' }]}>
                三模式平衡测试结果（Off / On / Exact 各 10 轮，单位：ms 中位数）
              </Text>
              <Text type="secondary" style={styles.hint}>
                【有效样本率（要求全 17 Flow 首次对齐）】
                {'\n'}AutoSize Off：{threeModeSummary.validRunsOff}/10 轮有效
                {'\n'}AutoSize On：{threeModeSummary.validRunsOn}/10 轮有效
                {'\n'}Exact Height：{threeModeSummary.validRunsExact}/10 轮有效
                {'\n'}────────────────────────
                {'\n'}【核心指标三组对比（Off vs On vs Exact）】
                {'\n'}★ 全 Flow 首次对齐 (Last Matched Layout)：
                {threeModeSummary.offSummary.lastMatchedLayoutMs.median} vs{' '}
                {threeModeSummary.onSummary.lastMatchedLayoutMs.median} vs{' '}
                {threeModeSummary.exactSummary.lastMatchedLayoutMs.median}
                {'\n'}IR Ready → 全 Flow 首次对齐：
                {
                  threeModeSummary.offSummary.irReadyToLastMatchedLayoutMs
                    .median
                }{' '}
                vs{' '}
                {threeModeSummary.onSummary.irReadyToLastMatchedLayoutMs.median}{' '}
                vs{' '}
                {
                  threeModeSummary.exactSummary.irReadyToLastMatchedLayoutMs
                    .median
                }
                {'\n'}文档整体就绪 (Document Ready)：
                {threeModeSummary.offSummary.documentReadyMs.median} vs{' '}
                {threeModeSummary.onSummary.documentReadyMs.median} vs{' '}
                {threeModeSummary.exactSummary.documentReadyMs.median}
                {'\n'}内容可见提交 (Content Visible Commit)：
                {threeModeSummary.offSummary.contentVisibleCommitMs.median} vs{' '}
                {threeModeSummary.onSummary.contentVisibleCommitMs.median} vs{' '}
                {threeModeSummary.exactSummary.contentVisibleCommitMs.median}
                {'\n'}────────────────────────
                {'\n'}【诊断指标（布局震荡与后续更新）】
                {'\n'}最后匹配更新 (Last Matched Update)：
                {threeModeSummary.offSummary.lastMatchedUpdateMs.median} vs{' '}
                {threeModeSummary.onSummary.lastMatchedUpdateMs.median} vs{' '}
                {threeModeSummary.exactSummary.lastMatchedUpdateMs.median}
                {'\n'}匹配后额外更新次数合计 (Post-match Updates)：
                {threeModeSummary.offSummary.totalPostMatchUpdates.median} vs{' '}
                {threeModeSummary.onSummary.totalPostMatchUpdates.median} vs{' '}
                {threeModeSummary.exactSummary.totalPostMatchUpdates.median}
                {'\n'}IR Ready：
                {threeModeSummary.offSummary.irReadyMs.median} vs{' '}
                {threeModeSummary.onSummary.irReadyMs.median} vs{' '}
                {threeModeSummary.exactSummary.irReadyMs.median}
                {'\n'}First Raw Layout：
                {threeModeSummary.offSummary.firstRawLayoutMs.median} vs{' '}
                {threeModeSummary.onSummary.firstRawLayoutMs.median} vs{' '}
                {threeModeSummary.exactSummary.firstRawLayoutMs.median}
                {'\n'}────────────────────────
                {'\n'}【配对差值中位数对比（Pairwise B - A）】
                {'\n'}1. 二阶段布局开销 (Exact - Off)：
                {'\n'} ★ 全 Flow 首次对齐差异：
                {threeModeSummary.diff_Exact_minus_Off.lastMatchedLayout
                  ?.median ?? '—'}{' '}
                ms
                {'\n'} Document Ready 差异：
                {threeModeSummary.diff_Exact_minus_Off.documentReady?.median ??
                  '—'}{' '}
                ms
                {'\n'} Content Visible Commit 差异：
                {threeModeSummary.diff_Exact_minus_Off.contentVisibleCommit
                  ?.median ?? '—'}{' '}
                ms
                {'\n'} 最后匹配更新 (Last Matched Update) 差异：
                {threeModeSummary.diff_Exact_minus_Off.lastMatchedUpdate
                  ?.median ?? '—'}{' '}
                ms
                {'\n'} 匹配后额外更新次数差异：
                {threeModeSummary.diff_Exact_minus_Off.postMatchUpdates
                  ?.median ?? '—'}{' '}
                次{'\n'}2. Fabric 原生尺寸影响 (On - Off)：
                {'\n'} ★ 全 Flow 首次对齐差异：
                {threeModeSummary.diff_On_minus_Off.lastMatchedLayout?.median ??
                  '—'}{' '}
                ms
                {'\n'} Document Ready 差异：
                {threeModeSummary.diff_On_minus_Off.documentReady?.median ??
                  '—'}{' '}
                ms
                {'\n'} Content Visible Commit 差异：
                {threeModeSummary.diff_On_minus_Off.contentVisibleCommit
                  ?.median ?? '—'}{' '}
                ms
                {'\n'} 最后匹配更新 (Last Matched Update) 差异：
                {threeModeSummary.diff_On_minus_Off.lastMatchedUpdate?.median ??
                  '—'}{' '}
                ms
                {'\n'} 匹配后额外更新次数差异：
                {threeModeSummary.diff_On_minus_Off.postMatchUpdates?.median ??
                  '—'}{' '}
                次{'\n'}3. 纯直传样式 vs Fabric 原生 (Exact - On)：
                {'\n'} ★ 全 Flow 首次对齐差异：
                {threeModeSummary.diff_Exact_minus_On.lastMatchedLayout
                  ?.median ?? '—'}{' '}
                ms
                {'\n'} Document Ready 差异：
                {threeModeSummary.diff_Exact_minus_On.documentReady?.median ??
                  '—'}{' '}
                ms
                {'\n'} Content Visible Commit 差异：
                {threeModeSummary.diff_Exact_minus_On.contentVisibleCommit
                  ?.median ?? '—'}{' '}
                ms
                {'\n'} 最后匹配更新 (Last Matched Update) 差异：
                {threeModeSummary.diff_Exact_minus_On.lastMatchedUpdate
                  ?.median ?? '—'}{' '}
                ms
                {'\n'} 匹配后额外更新次数差异：
                {threeModeSummary.diff_Exact_minus_On.postMatchUpdates
                  ?.median ?? '—'}{' '}
                次
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
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.controlLabel, { fontWeight: '700' }]}>
                    测试数据已生成（JSON 文件）
                  </Text>
                  {exportedFileUri ? (
                    <Text
                      type="secondary"
                      style={styles.hint}
                      numberOfLines={1}
                    >
                      文件: {exportedFileUri.split('/').pop()}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void exportCurrentJsonFile()}
                  style={[
                    styles.button,
                    {
                      minHeight: 32,
                      paddingHorizontal: 12,
                      backgroundColor: primary,
                      borderColor: primary,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      color: onPrimary,
                      fontWeight: '600',
                    }}
                  >
                    导出 / 分享文件
                  </Text>
                </Pressable>
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => setShowExportDetails((prev) => !prev)}
                style={styles.detailToggle}
              >
                <Text style={styles.controlLabel}>
                  {showExportDetails
                    ? '收起 JSON 文本预览 ▲'
                    : '展开 JSON 文本预览 ▼'}
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
                      {'\n'}首次匹配尺寸布局 (first-matched-layout)：
                      {formatMs(singleRunMetrics.firstMatchedLayoutMs)}
                      {'\n'}★ 全 Flow 首次对齐 (Last Matched Layout)：
                      {formatMs(singleRunMetrics.lastMatchedLayoutMs)}
                      {'\n'}文档整体就绪 (Document Ready)：
                      {formatMs(singleRunMetrics.documentReadyMs)}
                      {'\n'}内容可见提交 (Content Visible Commit)：
                      {formatMs(singleRunMetrics.contentVisibleCommitMs)}
                      {'\n'}最后匹配更新 (Last Matched Update)：
                      {formatMs(singleRunMetrics.lastMatchedUpdateMs)}
                      {'\n'}匹配后额外更新次数合计：
                      {singleRunMetrics.totalPostMatchUpdates} 次{'\n'}
                      有效性判定：
                      {singleRunMetrics.isValid
                        ? '有效'
                        : `无效（${singleRunMetrics.invalidReason}）`}
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
                                {flow.flowId}
                                {flow.isMatched
                                  ? ' (✅ 对齐)'
                                  : flow.hasMismatchEvent
                                    ? ' (❌ 错位)'
                                    : ' (⏳ 未决)'}
                                （高度 {flow.heightCount} 次 / 布局{' '}
                                {flow.layoutCount} 次 / 匹配后额外更新{' '}
                                {flow.postMatchUpdateCount} 次 / setViewSize{' '}
                                {flow.setViewSizeCount ?? 0} 次）
                              </Text>
                              <Text type="secondary" style={styles.hint}>
                                【尺寸核对】缓存Exact:{' '}
                                {flow.cachedExactHeight != null
                                  ? `${flow.cachedExactHeight} pt`
                                  : '无'}{' '}
                                | 原生Measure:{' '}
                                {flow.nativeMeasuredHeight != null
                                  ? `${flow.nativeMeasuredHeight} pt`
                                  : '无'}{' '}
                                | 实际Layout:{' '}
                                {flow.actualLayoutHeight != null
                                  ? `${flow.actualLayoutHeight} pt`
                                  : '无'}
                                {'\n'}【高度差值】原生-缓存:{' '}
                                {flow.diffCachedVsNative != null
                                  ? `${flow.diffCachedVsNative} pt`
                                  : '—'}{' '}
                                | 布局-原生:{' '}
                                {flow.diffNativeVsLayout != null
                                  ? `${flow.diffNativeVsLayout} pt`
                                  : '—'}
                                {'\n'}【排版基准】宽度:{' '}
                                {flow.contentWidth ?? '—'} pt | key:{' '}
                                {flow.measureKey ?? '—'}
                                {'\n'}rebuild: {formatMs(flow.rebuildMs)}{' '}
                                (parse: {formatMs(flow.parseMs)}, span:{' '}
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
                exactHeightMode={exactHeightMode}
                exactFlowHeights={exactFlowHeights}
                inFlowRevealMode={inFlowRevealMode}
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
