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

当前 NativeWind 4.2.2 在选择 `system` 时向 `Appearance.setColorScheme` 传入 `null`，而 React Native 0.83.2 原生接口要求使用 `unspecified`。主题同步入口在原生端通过 `TurboModuleRegistry` 调用 `Appearance` 模块，传入 `light`、`dark` 或 `unspecified`；实际颜色通过原生外观事件同步给 React Native 与 NativeWind。这也避开了 RN 0.83.2 的 JS setter 把 `unspecified` 缓存成实际颜色的问题，无需修改依赖或维护补丁。Web 端仍使用 NativeWind 的公开主题 API。

修改主题同步或升级相关依赖后运行 `npm run test:theme`。测试加载未修改的 Appearance 和 NativeWind 原生运行时代码，模拟 Android 的非空参数约束和异步外观事件，覆盖冷启动、手动模式、恢复跟随系统和回到前台。

文字与背景的用户调整方案见 [`docs/THEME_CUSTOMIZATION.md`](./THEME_CUSTOMIZATION.md)，其中区分了主题预设、低门槛调节和高级自定义三层能力。
