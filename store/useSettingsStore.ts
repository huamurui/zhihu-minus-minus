import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { colors } from '@/constants/designTokens';
import type {
  ReadingBackground,
  SurfaceStyle,
  TextContrast,
} from '@/constants/theme';
import type { FilterMode, FilterQualityLevel } from '@/utils/feedFilter';

const settingsStorage = {
  getItem: (name: string) => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) =>
    SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
};

/** Returns true only for a complete, well-formed 6-digit hex color like "#0084ff" */
function isValidHex(color: string | null | undefined): boolean {
  if (!color) return false;
  return /^#[0-9a-fA-F]{6}$/.test(color);
}

/** Sanitize a color value: returns the color if valid, null otherwise */
function sanitizeColor(color: string | null | undefined): string | null {
  return isValidHex(color) ? (color as string).toLowerCase() : null;
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
  useWebView: boolean;
  enablePrivateMessaging: boolean;
  /** iOS 按压时的不透明度 (0.5 ~ 1.0) */
  pressOpacity: number;
  /** iOS 按压时的缩放比例 (0.88 ~ 1.0) */
  pressScale: number;
  /** 安卓按压反馈类型: ripple (水波纹), scale-opacity (透明度+缩放) */
  androidFeedbackType: 'ripple' | 'scale-opacity';
  /** 是否开启应用内震动反馈 */
  enableHapticFeedback: boolean;
  /** 是否开启浏览历史记录 */
  enableBrowseHistory: boolean;
  /** 是否在本地记录并过滤近期看过的推荐内容 */
  enableLocalFeedDedup: boolean;
  /** 是否在冷启动时保留上次的推荐流内容 */
  enableFeedCacheOnLaunch: boolean;

  // —— 本地内容过滤（见 utils/feedFilter.ts）——
  /** 过滤总开关。默认关：行为改变型功能不在升级后静默生效。 */
  enableLocalFeedFilter: boolean;
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
  useWebView: false,
  enablePrivateMessaging: false,
  pressOpacity: 0.82,
  pressScale: 0.98,
  androidFeedbackType: 'ripple',
  enableHapticFeedback: true,
  enableBrowseHistory: true,
  enableLocalFeedDedup: false,
  enableFeedCacheOnLaunch: false,
  enableLocalFeedFilter: false,
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
          // 兜底：过滤 union 字段写入非枚举值时退回默认
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
      version: 10,
      migrate: (persistedState: any, version: number) => {
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

        // 升级到 v8 时兜底本地内容过滤字段
        if (version < 8) {
          persistedState.enableLocalFeedFilter = false;
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

        return persistedState as SettingsState;
      },
    },
  ),
);
