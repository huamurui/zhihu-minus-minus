# AGENTS.md

本文件是仓库级自动化开发指南，适用于整个项目。面向用户的安装和功能说明以 [`README.md`](./README.md) 为准；本地运行、测试、原生构建和发布流程见 [`DEVELOPMENT.md`](./docs/DEVELOPMENT.md)、[`BUILD_WINDOWS.md`](./docs/BUILD_WINDOWS.md) 与 [`docs/RELEASING.md`](./docs/RELEASING.md)；富文本专项约定以 [`src/features/rich-content/README.md`](./src/features/rich-content/README.md) 及其 `docs/` 为准。

文中的源码路径和命令均以仓库根目录为基准。

根目录 `README.md` 面向初次了解项目的读者。项目定位、主要功能、安装或首次使用流程发生变化，或首页已有说明失实时，再更新相应段落。小功能、单项设置、交互微调和修复默认在 PR 中说明。需要用户发现或操作的细节写在应用内提示中，维护和验证细节写入对应的开发文档。

## 项目概况

Zhihu-- 是 Expo SDK 58 / React Native 0.88 / React 19.3 客户端，使用严格模式 TypeScript 6。主要技术链路如下：

- 路由与原生入口：Expo Router，页面位于 `src/app/`；已启用 typed routes；
- 服务端状态：TanStack Query v5；全局与持久状态：Zustand；
- 网络：`src/api/client.ts` 中的 Axios 客户端及 X-ZSE-96 签名；`src/api/zhihu/*.ts` 对知乎响应使用显式类型和规范化函数；
- 本地数据：Expo SQLite，迁移集中在 `src/storage/localDatabase.ts`；另有 Feed 缓存、曝光去重和 SecureStore 持久状态；
- 样式与列表：NativeWind、运行时主题 token、FlashList；
- 富文本：`src/features/rich-content/` 的统一公共入口，tiqian-super-mini 默认，WebView 作为可选后端与 fallback；
- 监控与统计：`src/utils/telemetry.ts` 统一适配 Sentry 和可选 Firebase Analytics，设置页提供隐私开关；
- 原生扩展：`plugins/` 中的 Expo config plugins，`modules/` 中的本地原生模块；构建配置位于 `app.json`、`app.config.ts`、`eas.json` 和 `.github/workflows/`。

## 目录边界

应用源码集中在 `src/`，`@/*` 指向 `src/*`；静态资源位于 `src/assets/`，通过 `@/assets/*` 引用；`@/modules/*` 单独指向根目录的本地原生模块。工具入口配置留在仓库根目录，辅助脚本放在 `scripts/`，展示截图放在 `docs/screenshot/`。

- `src/app/`：路由页面与页面级编排。可复用逻辑不要继续堆进大型页面。
- `src/api/`：HTTP 客户端、知乎接口与签名。接口函数应声明参数和返回类型；外部不确定数据先接为 `unknown`，随后规范化。
- `src/components/`：跨页面组件。业务专属渲染优先放进对应 feature。
- `src/features/rich-content/`：富文本运行时、fixtures、分析工具、测试和设计记录。业务代码只能从 `@/features/rich-content` 导入其能力。
- `src/features/publishing/`：创作编辑器、无损原块、账号隔离草稿、媒体生命周期和发布序列化逻辑，约定见其 `README.md`。
- `src/hooks/`：共享状态和交互逻辑；TanStack Query key 与缓存形状必须保持一致。
- `src/storage/`：SQLite、本地 Feed 缓存和曝光记录。schema 变化必须新增有序 migration，不能原地改写已发布 migration。
- `src/store/`：Zustand store 及持久化迁移。认证、设置、主题、阅读进度和 telemetry 的持久边界分别维护。
- `src/types/zhihu.ts`：共享知乎领域类型；优先扩展这里，避免页面重复声明相同结构。
- `src/utils/`：无页面依赖的查询、URL、过滤、阅读进度、telemetry 和错误处理工具。
- `plugins/`、`modules/`：原生配置插件和本地原生模块。原生行为优先通过配置/插件表达，不要依赖未提交的生成目录改动。
- `tests/`：不依赖完整原生运行时的回归测试。
- `android/`、`ios/`、`.expo/`：生成物，不提交；只有确需验证原生配置时才重新生成。

## 安全与隐私

Cookie、`z_c0`、`d_c0`、`_xsrf`、X-ZSE 请求头、完整 Axios config、Sentry Token、Firebase 配置文件和真实登录 URL 都视为敏感信息：

- 不得在日志、Toast、错误上报、fixture、截图或测试快照中输出；
- 调试网络请求时只记录 method、脱敏后的 path、status 和独立 request id；异常对象不能未经筛选直接序列化；
- 修改 `src/api/client.ts` 时检查成功与失败分支，避免请求头通过 `error.config` 泄露；
- 登录 WebView 日志只允许输出去掉 query/fragment 的 origin/path。URL 解析失败只记录固定标记，不记录原始 URL；
- 登录态主存于应用沙箱内的 `auth-storage.json`，用于容纳多账号 Cookie；旧 SecureStore Cookie 只在首次没有该文件时兼容导入。文件及当前备份使用 AES-GCM，密钥单独存于 SecureStore；原生原子读取包含 Android `.bak` 恢复。调整此链路时必须保留旧明文和账号迁移，读取/密钥失败不得覆盖原文件，见 `docs/AUTH_STORAGE.md`；
- 主色纯色背景使用运行时 `onPrimary`，文字强调和链接使用 `link`；NativeWind 语义颜色由根级 vars 同步。不要把 `Colors` 的运行时值固定进模块级 StyleSheet。
- telemetry 必须经 `src/utils/telemetry.ts`，只传递脱敏的事件名、类型和数值；关闭设置后不得继续发送事件；
- 真机捕获的知乎正文必须先脱敏，再放入 `src/features/rich-content/fixtures/inbox/`；确认结构后再登记到 `cases/` 和 manifest。

## 实现约定

### TypeScript 与 React

- 保持 `strict: true`。不要新增无说明的 `any`；外部 API 边界优先使用 `unknown`、类型守卫和规范化函数。
- 知乎 API 调用使用 Axios 泛型并声明导出函数的返回类型；共享响应结构优先放入 `src/types/zhihu.ts` 或对应 API 模块，避免在页面重复建模。
- Hook 必须无条件调用并位于 early return 之前；Effect、Callback、Memo 的依赖要完整，不能仅为消除诊断而盲目禁用规则。
- 大型页面新增逻辑时，优先抽取 typed hook、组件或 feature。`src/app/(tabs)/index.tsx`、`src/app/question/[id]/index.tsx` 和富文本渲染器仍是维护热点。
- 不要依赖数组 index 作为 key，除非数据确实没有稳定标识，并用窄范围 Biome 注释说明原因。

### 查询与乐观更新

- 查询 key 必须包含会改变结果的全部参数；失效时尽量使用同一 key，谨慎使用过宽的前缀失效。
- 无限列表优先使用 `src/hooks/useZhihuInfiniteQuery.ts`；下拉刷新使用 `src/utils/query.ts` 的精确 reset 语义。
- 使用 `useOptimisticToggle` 时提供准确的泛型、`queryKey` 和不可变 `onUpdateCache`。确认成功提示基于 mutate 时的旧状态，并保留失败回滚与 settled 后校准。
- 改动缓存形状、分页参数或并发 mutation 行为时，补充可重复测试；只看视觉结果不足以覆盖回滚与竞态。

### 富文本

- 统一使用 `import { ZhihuContent } from '@/features/rich-content'`。`src/components/ZhihuContent.tsx` 和 `src/components/ZhihuDOMContent.tsx` 仅是兼容转发。
- 修复正文解析或渲染问题时，将脱敏样本放入 `fixtures/inbox/`；确认结构后登记到 `fixtures/cases/` 与 manifest。
- 至少运行 `npm run analyze:rich-content` 和 `npm test -- src/features/rich-content/tests --runInBand`；完整变更运行 `npm run check`。
- RNRH 已删除；tiqian-super-mini 为默认后端，缺原生模块回退 WebView。目标架构见 `src/features/rich-content/docs/renderer-v2-plan.md`；不要重新引入已删除的后端。

### 路由、存储与原生配置

- Expo Router 负责冷启动和热启动链接。支持新链接类型时同步检查 `src/app/+native-intent.tsx`、`src/utils/url.ts` 与 `app.json` intent filters。
- 修改 SQLite schema 时递增 `DATABASE_VERSION` 并新增事务 migration；仓储操作继续经 `localDatabase.run` 串行化。
- 修改 Zustand 持久结构时递增对应 store version 并实现 migration。认证文件、设置、阅读进度和 telemetry 的存储格式不能无迁移地改变。
- 修改 `app.json`、`app.config.ts`、config plugin、原生依赖、原生权限、Firebase/Sentry 配置或本地原生模块后重新运行 prebuild；不要提交 `android/`、`ios/` 生成物。
- `package.json` 与 `app.json` 的应用版本必须同步。Release 只从 `main` 创建，tag 使用尚不存在的 `v<version>`。

## 工作流与验证

本地与 CI 使用 Node.js 24（见 `.nvmrc`）；iOS 最低版本为 16.4，使用 Xcode 26.4 或更高版本与 CocoaPods。开始前先检查 `git status --short --branch`，保留用户已有改动。安装依赖优先使用锁文件：

```bash
npm ci
```

按改动范围运行验证，最低基线为：

```bash
npm run check
```

`npm run check` 是 CI 和发布前的聚合质量门禁，依次执行类型检查、只读 Biome、全部测试及富文本 fixture 分析。`npm run lint` 只读；需要写入修复时使用 `npm run lint:fix` 或 `npm run format`，运行后必须逐项复核 diff。

专项测试文件位于 `tests/` 与 `src/features/rich-content/tests/`，覆盖富文本、主题、用户资料、发布、知乎 App API、网络失败、投票者、更新选择和阅读进度。修改相应模块时优先运行 `npm test -- <测试文件或目录> --runInBand`，再运行完整 `npm run check`。

测试应覆盖功能行为、数据正确性及内容不可见、遮挡或控件不可用等问题，不为纯审美的字号、间距、圆角、配色、透明度、动画曲线或 className 写固定值断言。

PR 与 `main` push 使用 `.github/workflows/ci.yml`；手动构建/发布使用 `.github/workflows/build.yaml`。发布工作流构建四个 Android 单 ABI APK 和一个未签名 iOS IPA：Android 使用 `EXPO_TOKEN` 加 4 个 telemetry Secret，iOS 使用其中 4 个 telemetry Secret；完整 workflow 运行需要配置全部 5 个 Secret。详见 `docs/DEVELOPMENT.md`、`docs/RELEASING.md` 和 `docs/TELEMETRY.md`。

Dependabot 的 npm 普通更新只允许每月分组的 patch 更新；GitHub Actions 允许每月分组的 minor/patch 更新；Expo SDK、React Native 及配套 `expo-*` 主版本升级必须手动统一进行，不能合并跨 SDK 的单包升级。依赖 PR 必须同步更新锁文件，并以 `npm ci` 成功作为前置条件。NativeWind 4 与 Tailwind CSS 3 配套，Firebase 26 保留 CocoaPods 支持，TypeScript 6 保留工具使用的编译器 JS API；升级这些主版本前先核对 `docs/DEVELOPMENT.md` 的兼容边界。

## 完成标准

- 需求对应的实现、用户文档、开发文档和工作流配置一致，没有顺手扩大范围；
- 敏感信息未进入日志、fixture、截图或提交；
- 类型检查通过，相关测试通过，改动文件通过 Biome；
- 原生、路由、缓存或持久结构变化附带相应验证与迁移；
- 最终交付说明已运行的命令、未运行的真机/平台验证以及剩余风险。
