# 设计 Token

应用颜色由 [`src/constants/designTokens.json`](../src/constants/designTokens.json) 的基础值与色阶配置，经 [`resolveThemeColors`](../src/constants/theme.ts) 统一生成。React Native、NativeWind、React Navigation 与富文本后端读取同一份运行时 palette。

## 色阶与解析

主题使用 Google 的纯 JavaScript [`@material/material-color-utilities`](https://github.com/material-foundation/material-color-utilities) HCT 算法。以用户选择的主色为种子，保留主色原值；页面、卡片、正文文字、中性控件和边框采用同色相、低彩度的不同明度。主色图标、短文字按钮及透明浅底继续使用已有主色与 alpha 配方。灰、黑、白种子保持中性，避免引入不存在的色相。

- `colors.light / dark` 保留基础语义值和旧代码兼容键，包括品牌、危险、成功与警告等颜色。
- `themeAdjustments.readingBackground` 只定义四档阅读体验的中性色彩度和 light/dark 明度，不再复制数百个相同色值。暖纸以暖色色相为主，使用 Material harmonization 向种子轻微偏移。
- `themeAdjustments.textContrast.high` 指定高对比文字明度。
- `typography / radii / opacity / effects` 继续定义静态排版、形状和交互效果；遮罩的 alpha 形状可以固定，实际表面颜色应来自运行时 token。

解析顺序为：规范化种子与预设 → HCT 低彩度中性色阶 → 分层或扁平表面 → 文字对比度 → 实心前景选择。正文、次要文字、三级文字和链接在页面、卡片及中性控件上至少满足 4.5:1；高对比正文至少 7:1。`onPrimary` 使用 Material 的 `DynamicColor.tonePrefersLightForeground`：主色 HCT 明度四舍五入后低于 60 时使用白色，否则使用黑色。判断仅依赖实际填充色，与明暗主题、阅读背景、正文对比度及表面层次无关。默认蓝色 `#0084ff` 使用白字，白色、亮黄、亮绿等填充使用黑字；用户选定的主色原值保持不变。

主色实心前景至少保持 3:1，默认蓝底白字约为 3.66:1；这是一项控件视觉取色偏好，不能声称符合 [WCAG 普通文字 4.5:1](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)。危险、成功、警告等实心前景仍按最大黑白对比度选择，至少保持 4.5:1。原有强调色与透明底不纳入这项文字对比度保证。解析结果不可变，缓存上限 64 套，避免取色器拖动造成无限缓存。

## 配对使用颜色

| 用途 | 背景 | 文字、图标、加载指示器 |
| --- | --- | --- |
| 主色实心按钮 | `primary` | `onPrimary` |
| 主色透明浅底 | `primaryTransparent` 或 `primary_XX` | 原有 `primary`（既有组件配色保持不变） |
| 危险实心按钮或红色未读角标 | `danger` | `onDanger` |
| 主题色未读角标 | `primary` | `onPrimary` |
| 成功实心按钮 | `success` | `onSuccess` |
| 警告实心按钮 | `warning` | `onWarning` |
| 图标和短文字按钮 | 原有表面或透明底 | 原始 `primary`、`danger / success / warning` 等强调色 |
| 长提示文字及正文链接 | 页面或卡片 | `link` |

`primaryTransparent` 保留透明语义：默认主色为 light 0.1 / dark 0.15，自定义非默认主色为原有 `26` alpha；`primary_XX` 直接拼接当前主色与指定 alpha。`tint` 保留原始主色，`tabIconSelected` 保留既有默认/自定义规则。`link` 延续对原始主色做最小可读性调整的算法，不生成新的 HCT 强调色阶。`surface` 等于 `backgroundSecondary`；`textInverse` 仍表示反色表面文字，不能当作所有实心按钮的前景。

特殊固定底色（例如热榜名次）使用 `contrastingText(actualBackground)`；任意非主题背景上的彩色前景使用 `readableColor(foreground, [actualBackground])`。透明颜色必须先考虑实际承载表面，不能拿透明字符串当作不透明颜色计算。照片上的固定遮罩与知乎内容自带颜色属于内容边界，不由全局主题自动改写。

## 运行时入口

```ts
import { useThemeColor } from '@/components/Themed';

const background = useThemeColor({}, 'primary');
const foreground = useThemeColor({}, 'onPrimary');
```

批量读取可用 `useRuntimeThemeColors()`。旧 `Colors` getter 解析同一 palette；旧组件通过 `useColorScheme` 订阅颜色偏好。不要在模块级 StyleSheet 中保存运行时颜色，避免打开页面后切换主色仍保留旧值。

NativeWind 根级 `vars` 同步同一 palette。不透明颜色以六位 HEX 转 RGB 通道，透明 token 直接传 CSS 颜色字符串；原生 `Text` 的 `bg-primary text-on-primary`、`bg-danger text-on-danger` 等实心填充使用成对语义 class。`Themed.Text` 自带行内文字颜色，按钮前景应显式传入 `style={{ color: onPrimary }}`，避免默认颜色覆盖普通 class。富文本仅从统一公共入口读取运行时主题。

主题模式仍由 `src/store/useThemeStore.ts` 管理 `system / light / dark`，现有原生 Appearance 与 NativeWind 同步路径不变。本实现从应用内主色生成配色，没有接入 Android 壁纸颜色提取；纯 JS 算法在各平台共用，不新增原生模块。

## 验证

运行 `npm test -- tests/runtimeTheme.test.tsx tests/themeMode.test.js tests/actionColorContrast.test.tsx tests/appearanceSettings.test.tsx --runInBand`，再执行 `npm run check`。配色矩阵覆盖明暗模式、阅读预设、文字对比度、表面层次，以及白、黑、黄和其他高彩度种子。组件测试同时检查实心控件的文字、图标和加载态前景，以及浅底与强调色原有配方未被改写；系统模式测试继续覆盖 OS 外观同步。

真机验收应查看实际正文、设置预览、投票/关注/危险按钮，覆盖高亮度种子与暗色模式；自动对比度测试不能替代透明叠层、照片或平台控件的视觉检查。
