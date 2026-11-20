import type { LargeScreenLayoutMode } from '@/store/useSettingsStore';

export type PaneRole = 'list' | 'detail' | 'full';

export interface PaneRoute {
  key: string;
  name: string;
}

export const PANE_DIVIDER_WIDTH = 16;
const TWO_PANE_MIN_WIDTH = 840;

export function shouldUseTwoPanes(mode: LargeScreenLayoutMode, width: number) {
  return mode === 'dual' || (mode === 'auto' && width >= TWO_PANE_MIN_WIDTH);
}

/** Unknown routes stay full screen, especially login, editors and media viewers. */
export function getPaneRole(name: string): PaneRole {
  // Keep settings and the layout switch reachable at any pane width.
  if (name.startsWith('settings/')) return 'full';
  if (
    name === '(tabs)' ||
    name === 'search' ||
    name === 'history' ||
    name === 'question/[id]/index' ||
    name === 'user/[id]/index' ||
    name === 'topic/[id]' ||
    name === 'column/[id]' ||
    name.startsWith('collections/') ||
    name === 'user/likes' ||
    /^user\/\[id\]\/(stream|search|following|followers|mutual)$/.test(name)
  )
    return 'list';
  if (
    name === 'answer/[id]' ||
    name === 'article/[id]' ||
    name === 'pin/[id]' ||
    name === 'guest/detail' ||
    name.startsWith('comments/')
  )
    return 'detail';
  return 'full';
}

export function getListPaneWidth(width: number, ratio: number): number {
  const usable = Math.max(0, width - PANE_DIVIDER_WIDTH);
  const safeRatio = Number.isFinite(ratio)
    ? Math.min(0.6, Math.max(0.2, ratio))
    : 1 / 3;
  return usable * safeRatio;
}

/**
 * Project one chronological stack into two panes. Resizing never dispatches a
 * navigation action: route keys, params, mounted pages and back order survive.
 * A full-screen route is a boundary; unrelated earlier pages cannot leak through.
 */
export function getVisiblePanes(
  routes: readonly PaneRoute[],
  index: number,
  enabled: boolean,
) {
  const current = routes[index];
  if (!current)
    return { listKey: undefined, detailKey: undefined, fullKey: undefined };
  if (!enabled || getPaneRole(current.name) === 'full') {
    return { listKey: undefined, detailKey: undefined, fullKey: current.key };
  }
  let listKey: string | undefined;
  let detailKey: string | undefined;
  for (let i = index; i >= 0; i--) {
    const route = routes[i];
    const role = getPaneRole(route.name);
    if (role === 'full') break;
    if (role === 'list') {
      listKey = route.key;
      break;
    }
    if (role === 'detail') detailKey ??= route.key;
  }
  // A direct detail link without a list remains fully usable on its own.
  if (!listKey)
    return { listKey: undefined, detailKey: undefined, fullKey: current.key };
  return { listKey, detailKey, fullKey: undefined };
}
