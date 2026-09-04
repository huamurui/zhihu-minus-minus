# 设计 Token

应用层的视觉值统一维护在 [`constants/designTokens.json`](../constants/designTokens.json) 中。它是 TypeScript、React Native 和 NativeWind 共用的源文件，避免在 `Colors.ts`、`tailwind.config.js` 和页面之间重复抄写同一组颜色。

## 分层

- `colors.light` / `colors.dark`：按语义命名的主题色。优先使用 `text`、`backgroundSecondary`、`border`、`iconMuted` 等语义 token，不要直接使用 hex 值。
- `typography`：系统字体、常用字号、行高比例和字重。
- `radii` / `opacity`：通用圆角和交互透明度。
- `effects`：渐变遮罩和模糊层等跨组件效果。

## 使用方式

React Native 样式使用 `@/constants/designTokens`：

```ts
import { colors, typography } from '@/constants/designTokens';

const color = colors[colorScheme].textSecondary;
const titleStyle = { fontSize: typography.fontSize.title };
```

NativeWind 使用同一份 token 生成的语义 class，例如 `bg-surface`、`text-foreground`、`text-tertiary`、`border-border` 和 `bg-primary`。`constants/Colors.ts` 仅作为旧代码的兼容入口，新代码不要再从那里新增依赖。

用户自定义主题色仍然属于运行时设置，由 `useThemeColor` 在 `primary`、`tint` 和相关透明色上覆盖静态 token。知乎接口返回的标签色等内容数据可以保留在 feature 边界内，不应反向写入全局设计 token。

主题模式由 `store/useThemeStore.ts` 管理，支持 `system`、`light` 和 `dark`。`system` 模式会监听操作系统外观变化，手动切换后的模式会持久化。涉及主色的原生组件样式应使用 `useThemeColor`，不要直接读取 `Colors[colorScheme].primary` 或使用静态 `bg-primary`，否则无法响应用户自定义主题色。

文字与背景的用户调整方案见 [`docs/THEME_CUSTOMIZATION.md`](./THEME_CUSTOMIZATION.md)，其中区分了主题预设、低门槛调节和高级自定义三层能力。
