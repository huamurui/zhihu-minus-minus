import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { colors } from '@/constants/designTokens';
import type {
  ReadingBackground,
  SurfaceStyle,
  TextContrast,
} from '@/constants/theme';
import type { RichContentRenderer } from '@/features/rich-content';
import type { FilterMode, FilterQualityLevel } from '@/utils/feedFilter';
import { normalizeFeedRegexPatterns } from '@/utils/feedRegex';

export type { RichContentRenderer } from '@/features/rich-content';

const settingsStorage = {
  getItem: (name: string) => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) =>
    SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
};

/** Returns true only for a complete, well-formed 6-digit hex color like "#0084ff" */
function isValidHex(color: unknown): color is string {
  if (typeof color !== 'string') return false;
  return /^#[0-9a-fA-F]{6}$/.test(color);
}

/** Sanitize a color value: returns the color if valid, null otherwise */
function sanitizeColor(color: unknown): string | null {
  return isValidHex(color) ? color.toLowerCase() : null;
}

function normalizePersistedSettingsState(
  value: unknown,
): Record<string, unknown> {
  return value && typeof value === 'object'
    ? { ...(value as Record<string, unknown>) }
    : {};
}

const VALID_FILTER_MODES: ReadonlyArray<FilterMode> = ['collapse', 'hide'];
const VALID_QUALITY_LEVELS: ReadonlyArray<FilterQualityLevel> = [
  'loose',
  'standard',
  'strict',
];
const VALID_READING_BACKGROUNDS: ReadonlyArray<ReadingBackground> = [
  'default',
  'soft',
  'warm',
  'dim',
];
const VALID_TEXT_CONTRASTS: ReadonlyArray<TextContrast> = ['standard', 'high'];
const VALID_SURFACE_STYLES: ReadonlyArray<SurfaceStyle> = ['layered', 'flat'];
const DEFAULT_RECOMMEND_AD_INTERVAL = -10;

function isValidFilterMode(v: unknown): v is FilterMode {
  return typeof v === 'string' && (VALID_FILTER_MODES as string[]).includes(v);
}

function isValidQualityLevel(v: unknown): v is FilterQualityLevel {
  return (
    typeof v === 'string' && (VALID_QUALITY_LEVELS as string[]).includes(v)
  );
}

function isValidReadingBackground(v: unknown): v is ReadingBackground {
  return (
    typeof v === 'string' && (VALID_READING_BACKGROUNDS as string[]).includes(v)
  );
}

function isValidTextContrast(v: unknown): v is TextContrast {
  return (
    typeof v === 'string' && (VALID_TEXT_CONTRASTS as string[]).includes(v)
  );
}

function isValidSurfaceStyle(v: unknown): v is SurfaceStyle {
  return (
    typeof v === 'string' && (VALID_SURFACE_STYLES as string[]).includes(v)
  );
}

export type AnswerReadingMode = 'detail' | 'preview-list';

function isValidAnswerReadingMode(value: unknown): value is AnswerReadingMode {
  return value === 'detail' || value === 'preview-list';
}

/** 双击正文快捷动作；undefined 表示尚未配置，首次双击会弹出引导 Sheet。 */
export type DoubleTapAction = 'off' | 'like' | 'comments';

function isValidDoubleTapAction(value: unknown): value is DoubleTapAction {
  return value === 'off' || value === 'like' || value === 'comments';
}

function isValidRichContentRenderer(v: unknown): v is RichContentRenderer {
  return v === 'webview' || v === 'native-v2';
}

function sanitizeRecommendAdInterval(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value)
    ? value
    : DEFAULT_RECOMMEND_AD_INTERVAL;
}

export type TabKey =
  | 'following'
  | 'recommend'
  | 'local'
  | 'hot'
  | 'daily'
  | 'publish'
  | 'profile';

export interface AppSettings {
  fontSizeScale: number;
  lineHeightScale: number;
  primaryColor: string | null;
  readingBackground: ReadingBackground;
  textContrast: TextContrast;
  surfaceStyle: SurfaceStyle;
  visibleTabs: TabKey[];
  defaultTab: TabKey;
  localCityName: string | null;
  borderRadius: number;
  richContentRenderer: RichContentRenderer;
  /** 点击回答卡片后的阅读方式；列表入口始终使用普通卡片。 */
  answerReadingMode: AnswerReadingMode;
  /**
   * 双击回答/文章/想法正文的动作；未配置(undefined)时首次双击弹出引导 Sheet。
   * 三处内容共用同一设置。
   */
  doubleTapAction?: DoubleTapAction;
  enablePrivateMessaging: boolean;
  /** 是否开启按压时的水波纹、缩放与透明度变化 */
  enablePressFeedback: boolean;
  /** 缩放模式按压时的不透明度 (0.5 ~ 1.0) */
  pressOpacity: number;
  /** 缩放模式按压时的缩放比例 (0.88 ~ 1.0) */
  pressScale: number;
  /** 安卓按压反馈类型: ripple (水波纹), scale-opacity (透明度+缩放) */
  androidFeedbackType: 'ripple' | 'scale-opacity';
  /** 是否开启应用内震动反馈 */
  enableHapticFeedback: boolean;
  /** iOS 是否使用系统原生底部 Tab（iOS 26+ 显示 Liquid Glass） */
  useNativeIOSBottomTabs: boolean;
  /** 是否开启浏览历史记录 */
  enableBrowseHistory: boolean;
  /** 是否在本地记录并过滤近期看过的推荐内容 */
  enableLocalFeedDedup: boolean;
  /** 是否在冷启动时保留上次的推荐流内容 */
  enableFeedCacheOnLaunch: boolean;
  /** 推荐请求是否附加 desktop=true */
  recommendRequestIncludeDesktop: boolean;
  /** 推荐请求是否附加 ad_interval */
  recommendRequestIncludeAdInterval: boolean;
  /** 推荐请求的 ad_interval 值 */
  recommendRequestAdInterval: number;

  // —— 本地内容过滤（见 utils/feedFilter.ts）——
  /** 本地广告与内容过滤总开关，默认开启。 */
  enableLocalFeedFilter: boolean;
  /** 针对完整正文纯文本的自定义正则表达式规则。 */
  filterRegexPatterns: string[];
  /** 被过滤内容的展示方式：折叠占位（默认）或直接隐藏。 */
  filterMode: FilterMode;
  /** 折叠模式下是否在占位行上显示原因文案（仅折叠模式有载体）。 */
  filterShowReason: boolean;
  // 推广 / 营销类开关型规则
  /** answer_type === 'PAID' 或 paid_info != null（知乎盐选付费内容） */
  filterBlockPaid: boolean;
  /** 正文含 xg.zhihu.com（知乎广告平台推流） */
  filterBlockAdPlatform: boolean;
  /** 正文含 d.zhihu.com / data-edu-card-id（知乎学堂课程卡片） */
  filterBlockZhihuSchool: boolean;
  /** 正文含 mp.weixin.qq.com（微信公众号引流文章） */
  filterBlockWeChat: boolean;
  /** is_labeled（带推广标记的内容） */
  filterBlockLabeled: boolean;
  /** author.is_org（机构号发布的内容；默认放行，机构号也有正经内容） */
  filterBlockOrgAuthor: boolean;
  /** author.is_advertiser（广告主发布的内容） */
  filterBlockAdvertiser: boolean;
  // 内容质量过滤
  /** 质量过滤开关，与上面推广开关独立。 */
  filterEnableQuality: boolean;
  /** 三档强度阈值，驱动四类内容的组合条件（详见 utils/feedFilter.ts）。 */
  filterQualityLevel: FilterQualityLevel;
  // 豁免
  /** 关注作者的内容永不过滤（质量规则的内建豁免依据） */
  filterKeepFollowing: boolean;
  /** 我关注的人赞过的内容永不过滤 */
  filterKeepUpvotedByFollowee: boolean;
}

interface SettingsState extends AppSettings {
  updateSettings: (settings: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  fontSizeScale: 1.0,
  lineHeightScale: 1.5,
  primaryColor: colors.light.primary,
  readingBackground: 'default',
  textContrast: 'standard',
  surfaceStyle: 'layered',
  visibleTabs: ['following', 'recommend', 'hot', 'daily', 'publish', 'profile'],
  defaultTab: 'recommend',
  localCityName: null,
  borderRadius: 12,
  richContentRenderer: 'native-v2',
  answerReadingMode: 'detail',
  enablePrivateMessaging: false,
  enablePressFeedback: true,
  pressOpacity: 0.82,
  pressScale: 0.98,
  androidFeedbackType: 'ripple',
  enableHapticFeedback: true,
  useNativeIOSBottomTabs: true,
  enableBrowseHistory: true,
  enableLocalFeedDedup: false,
  enableFeedCacheOnLaunch: false,
  recommendRequestIncludeDesktop: true,
  recommendRequestIncludeAdInterval: true,
  recommendRequestAdInterval: DEFAULT_RECOMMEND_AD_INTERVAL,
  enableLocalFeedFilter: true,
  filterRegexPatterns: [],
  filterMode: 'collapse',
  filterShowReason: true,
  filterBlockPaid: true,
  filterBlockAdPlatform: true,
  filterBlockZhihuSchool: true,
  filterBlockWeChat: true,
  filterBlockLabeled: true,
  filterBlockOrgAuthor: false,
  filterBlockAdvertiser: true,
  filterEnableQuality: true,
  filterQualityLevel: 'standard',
  filterKeepFollowing: true,
  filterKeepUpvotedByFollowee: true,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      updateSettings: (newSettings) =>
        set((state) => {
          const nextSettings = { ...state, ...newSettings };
          // 兜底：确保"我的"页面始终可见
          if (
            nextSettings.visibleTabs &&
            !nextSettings.visibleTabs.includes('profile')
          ) {
            nextSettings.visibleTabs = [...nextSettings.visibleTabs, 'profile'];
          }
          // 兜底：若 defaultTab 不在 visibleTabs 中，自动重置为第一个可见 Tab
          if (
            nextSettings.visibleTabs &&
            !nextSettings.visibleTabs.includes(nextSettings.defaultTab)
          ) {
            nextSettings.defaultTab =
              nextSettings.visibleTabs[0] || 'recommend';
          }
          // 兜底：非法 hex 颜色退回默认（null）
          nextSettings.primaryColor = sanitizeColor(nextSettings.primaryColor);
          if (!isValidReadingBackground(nextSettings.readingBackground)) {
            nextSettings.readingBackground = 'default';
          }
          if (!isValidTextContrast(nextSettings.textContrast)) {
            nextSettings.textContrast = 'standard';
          }
          if (!isValidSurfaceStyle(nextSettings.surfaceStyle)) {
            nextSettings.surfaceStyle = 'layered';
          }
          if (!isValidAnswerReadingMode(nextSettings.answerReadingMode)) {
            nextSettings.answerReadingMode = 'detail';
          }
          if (!isValidRichContentRenderer(nextSettings.richContentRenderer)) {
            nextSettings.richContentRenderer = 'native-v2';
          }
          if (
            nextSettings.doubleTapAction !== undefined &&
            !isValidDoubleTapAction(nextSettings.doubleTapAction)
          ) {
            nextSettings.doubleTapAction = undefined;
          }
          if (typeof nextSettings.enablePressFeedback !== 'boolean') {
            nextSettings.enablePressFeedback = true;
          }
          if (
            typeof nextSettings.recommendRequestIncludeDesktop !== 'boolean'
          ) {
            nextSettings.recommendRequestIncludeDesktop = true;
          }
          if (
            typeof nextSettings.recommendRequestIncludeAdInterval !== 'boolean'
          ) {
            nextSettings.recommendRequestIncludeAdInterval = true;
          }
          nextSettings.recommendRequestAdInterval = sanitizeRecommendAdInterval(
            nextSettings.recommendRequestAdInterval,
          );
          // 兜底：过滤 union 字段写入非枚举值时退回默认
          if (typeof nextSettings.enableLocalFeedFilter !== 'boolean') {
            nextSettings.enableLocalFeedFilter = true;
          }
          if ('filterRegexPatterns' in newSettings) {
            const patterns = normalizeFeedRegexPatterns(
              newSettings.filterRegexPatterns,
            );
            const previousPatterns = state.filterRegexPatterns;
            // Feed memoization and the compiled-regex cache use array identity.
            nextSettings.filterRegexPatterns =
              patterns.length === previousPatterns.length &&
              patterns.every(
                (pattern, index) => pattern === previousPatterns[index],
              )
                ? previousPatterns
                : patterns;
          }
          if (!isValidFilterMode(nextSettings.filterMode)) {
            nextSettings.filterMode = 'collapse';
          }
          if (!isValidQualityLevel(nextSettings.filterQualityLevel)) {
            nextSettings.filterQualityLevel = 'standard';
          }
          return nextSettings;
        }),
      resetSettings: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'zhihu-settings-storage',
      storage: createJSONStorage(() => settingsStorage),
      version: 18,
      migrate: (rawPersistedState: unknown, version: number) => {
        const persistedState =
          normalizePersistedSettingsState(rawPersistedState);
        // 清理历史脏数据：null 或非法 hex 都退回默认蓝
        const sanitized = sanitizeColor(persistedState?.primaryColor);
        persistedState.primaryColor = sanitized ?? colors.light.primary;

        // 升级到 v3 时兜底新增的按压反馈参数
        if (version < 3) {
          persistedState.pressOpacity = persistedState.pressOpacity ?? 0.82;
          persistedState.pressScale = persistedState.pressScale ?? 0.98;
        }

        // 升级到 v4 时兜底安卓按压反馈类型选择
        if (version < 4) {
          persistedState.androidFeedbackType =
            persistedState.androidFeedbackType ?? 'ripple';
        }

        if (version < 5) {
          persistedState.enableBrowseHistory =
            persistedState.enableBrowseHistory ?? true;
        }

        if (version < 6) {
          persistedState.enableLocalFeedDedup =
            persistedState.enableLocalFeedDedup ?? false;
        }

        if (version < 7) {
          persistedState.enableFeedCacheOnLaunch =
            persistedState.enableFeedCacheOnLaunch ?? false;
        }

        if (version < 11) {
          persistedState.recommendRequestIncludeDesktop =
            persistedState.recommendRequestIncludeDesktop ?? true;
          persistedState.recommendRequestIncludeAdInterval =
            persistedState.recommendRequestIncludeAdInterval ?? true;
          persistedState.recommendRequestAdInterval =
            sanitizeRecommendAdInterval(
              persistedState.recommendRequestAdInterval,
            );
        }

        // 升级到 v8 时兜底本地内容过滤字段
        if (version < 8) {
          persistedState.filterMode = isValidFilterMode(
            persistedState.filterMode,
          )
            ? persistedState.filterMode
            : 'collapse';
          persistedState.filterShowReason =
            persistedState.filterShowReason ?? true;
          persistedState.filterBlockPaid =
            persistedState.filterBlockPaid ?? true;
          persistedState.filterBlockAdPlatform =
            persistedState.filterBlockAdPlatform ?? true;
          persistedState.filterBlockZhihuSchool =
            persistedState.filterBlockZhihuSchool ?? true;
          persistedState.filterBlockWeChat =
            persistedState.filterBlockWeChat ?? true;
          persistedState.filterBlockLabeled =
            persistedState.filterBlockLabeled ?? true;
          persistedState.filterBlockOrgAuthor =
            persistedState.filterBlockOrgAuthor ?? false;
          persistedState.filterBlockAdvertiser =
            persistedState.filterBlockAdvertiser ?? true;
          persistedState.filterEnableQuality =
            persistedState.filterEnableQuality ?? true;
          persistedState.filterQualityLevel = isValidQualityLevel(
            persistedState.filterQualityLevel,
          )
            ? persistedState.filterQualityLevel
            : 'standard';
          persistedState.filterKeepFollowing =
            persistedState.filterKeepFollowing ?? true;
          persistedState.filterKeepUpvotedByFollowee =
            persistedState.filterKeepUpvotedByFollowee ?? true;
        }

        if (version < 9) {
          persistedState.enableHapticFeedback =
            persistedState.enableHapticFeedback ?? true;
        }

        if (version < 12) {
          persistedState.useNativeIOSBottomTabs =
            persistedState.useNativeIOSBottomTabs ?? true;
        }

        persistedState.readingBackground = isValidReadingBackground(
          persistedState.readingBackground,
        )
          ? persistedState.readingBackground
          : 'default';
        persistedState.textContrast = isValidTextContrast(
          persistedState.textContrast,
        )
          ? persistedState.textContrast
          : 'standard';
        persistedState.surfaceStyle = isValidSurfaceStyle(
          persistedState.surfaceStyle,
        )
          ? persistedState.surfaceStyle
          : 'layered';
        persistedState.recommendRequestIncludeDesktop =
          typeof persistedState.recommendRequestIncludeDesktop === 'boolean'
            ? persistedState.recommendRequestIncludeDesktop
            : true;
        persistedState.recommendRequestIncludeAdInterval =
          typeof persistedState.recommendRequestIncludeAdInterval === 'boolean'
            ? persistedState.recommendRequestIncludeAdInterval
            : true;
        persistedState.recommendRequestAdInterval = sanitizeRecommendAdInterval(
          persistedState.recommendRequestAdInterval,
        );

        // v15 removes RNRH. Preserve WebView/native choices and migrate classic
        // or unset choices to tiqian-super-mini; keep legacy WebView preference.
        persistedState.richContentRenderer = isValidRichContentRenderer(
          persistedState.richContentRenderer,
        )
          ? persistedState.richContentRenderer
          : persistedState.useWebView === true
            ? 'webview'
            : 'native-v2';
        delete persistedState.useWebView;

        // v14 adds a visual-feedback switch without changing existing styles.
        persistedState.enablePressFeedback =
          typeof persistedState.enablePressFeedback === 'boolean'
            ? persistedState.enablePressFeedback
            : true;

        // v16 adds the destination mode; existing entries continue to detail.
        persistedState.answerReadingMode = isValidAnswerReadingMode(
          persistedState.answerReadingMode,
        )
          ? persistedState.answerReadingMode
          : 'detail';

        // v17 adds custom regex rules and enables filtering for unset choices.
        persistedState.enableLocalFeedFilter =
          typeof persistedState.enableLocalFeedFilter === 'boolean'
            ? persistedState.enableLocalFeedFilter
            : true;
        persistedState.filterRegexPatterns = normalizeFeedRegexPatterns(
          persistedState.filterRegexPatterns,
        );

        // v18 adds the double-tap action; unset or invalid keeps it undefined so
        persistedState.doubleTapAction = isValidDoubleTapAction(
          persistedState.doubleTapAction,
        )
          ? persistedState.doubleTapAction
          : undefined;

        return persistedState as unknown as SettingsState;
      },
    },
  ),
);
