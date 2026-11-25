import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { runOnUISync } from 'react-native-worklets';

interface AnswerHeaderPosition {
  offset: number;
  progress: number;
}

export type AnswerHeaderScrollHandler = (
  id: string,
  offset: number,
  collapseOffset: number,
  maxScroll: number,
  scrolling: boolean,
) => void;

const REVEAL_DISTANCE = 48;

/** A reverse scroll reveals the compact header only after the inline header has left. */
export function useAnswerHeaderState(pagerKey: string, answerId?: string) {
  const scope = useRef({ pagerKey, version: 1 });
  if (scope.current.pagerKey !== pagerKey) {
    scope.current = { pagerKey, version: scope.current.version + 1 };
  }
  const scopeVersion = scope.current.version;
  const activeAnswerId = useSharedValue(answerId ?? '');
  const activeScopeVersion = useSharedValue(scopeVersion);
  const activeScrollY = useSharedValue(0);
  const headerProgress = useSharedValue(0);
  const pages = useRef({
    version: scopeVersion,
    id: answerId ?? '',
    saved: new Map<string, AnswerHeaderPosition>(),
  });
  const [displayed, setDisplayed] = useState({
    scopeVersion,
    id: answerId ?? '',
    collapsed: false,
  });

  const publish = useCallback(
    (id: string) => {
      if (
        scope.current.version !== scopeVersion ||
        pages.current.version !== scopeVersion ||
        pages.current.id !== id
      )
        return;
      // Read the latest UI state when the JS callback runs, even after a fast reversal.
      const collapsed = headerProgress.value >= 1;
      setDisplayed((previous) =>
        previous.scopeVersion === scopeVersion &&
        previous.id === id &&
        previous.collapsed === collapsed
          ? previous
          : { scopeVersion, id, collapsed },
      );
    },
    [headerProgress, scopeVersion],
  );

  const onHeaderScroll = useCallback<AnswerHeaderScrollHandler>(
    (id, offset, collapseOffset, maxScroll, scrolling) => {
      'worklet';
      if (
        activeScopeVersion.value !== scopeVersion ||
        activeAnswerId.value !== id ||
        !Number.isFinite(offset)
      )
        return;
      const current = Math.max(0, Math.min(maxScroll, offset));
      // A bounce or a shorter document can move the native offset without a reversal.
      const previous = Math.min(maxScroll, activeScrollY.value);
      const progress = headerProgress.value;
      const delta = scrolling ? (previous - current) / REVEAL_DISTANCE : 0;
      const distancePastHeader = Math.max(0, current - collapseOffset);
      const next = Math.max(
        0,
        Math.min(1, progress + delta, distancePastHeader / REVEAL_DISTANCE),
      );
      activeScrollY.value = current;
      headerProgress.value = next;
      const wasFullyVisible = progress >= 1;
      const fullyVisible = next >= 1;
      if (wasFullyVisible !== fullyVisible) runOnJS(publish)(id);
    },
    [
      activeAnswerId,
      activeScopeVersion,
      activeScrollY,
      headerProgress,
      publish,
      scopeVersion,
    ],
  );

  const restore = useCallback(
    (id: string) => {
      if (scope.current.version !== scopeVersion) return;
      const page = pages.current;
      const sameScope = page.version === scopeVersion;
      if (sameScope && page.id === id) return;
      if (!sameScope) page.saved.clear();
      const position = page.saved.get(id) ?? { offset: 0, progress: 0 };
      // Snapshot and switch together so no native scroll lands between the two.
      const switchPage = () => {
        'worklet';
        const outgoing = {
          offset: activeScrollY.value,
          progress: headerProgress.value,
        };
        activeScopeVersion.value = scopeVersion;
        activeAnswerId.value = id;
        activeScrollY.value = position.offset;
        headerProgress.value = position.progress;
        return outgoing;
      };
      const outgoing =
        Platform.OS === 'web' ? switchPage() : runOnUISync(switchPage);
      if (sameScope && page.id) page.saved.set(page.id, outgoing);
      page.id = id;
      page.version = scopeVersion;
      setDisplayed({ scopeVersion, id, collapsed: position.progress >= 1 });
    },
    [
      scopeVersion,
      activeAnswerId,
      activeScopeVersion,
      activeScrollY,
      headerProgress,
    ],
  );

  useLayoutEffect(() => {
    restore(answerId ?? '');
  }, [answerId, restore]);

  return {
    collapsed:
      displayed.scopeVersion === scopeVersion &&
      displayed.id === answerId &&
      displayed.collapsed,
    restore,
    onHeaderScroll,
    headerProgress,
    activeAnswerId,
    activeScopeVersion,
    scopeVersion,
  };
}
