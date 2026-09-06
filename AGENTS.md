# AGENTS.md

本文件是仓库级自动化开发指南，适用于整个项目。面向用户的功能与安装说明以 `README.md` 为准；富文本专项约定以 `features/rich-content/README.md` 及其 `docs/` 为准。

## 项目概况

Zhihu-- 是 Expo 55 / React Native 0.83 / React 19 客户端，使用严格模式 TypeScript。主要技术链路如下：

- 路由与原生入口：Expo Router，页面位于 `app/`；
- 服务端状态：TanStack Query v5；全局与持久状态：Zustand；
- 网络：`api/client.ts` 中的 Axios 客户端及 X-ZSE-96 签名；
- 本地数据：Expo SQLite，迁移集中在 `storage/localDatabase.ts`；
- 样式与列表：NativeWind、主题色系统、FlashList；
- 富文本：`features/rich-content/` 的统一公共入口；
- 监控：Sentry；构建配置位于 `app.json`、`eas.json` 和 `.github/workflows/`。

## 目录边界

- `app/`：路由页面与页面级编排。可复用逻辑不要继续堆进大型页面。
- `api/`：HTTP 客户端、知乎接口与签名。接口函数应声明返回类型。
- `components/`：跨页面组件。业务专属渲染优先放进对应 feature。
- `features/rich-content/`：富文本运行时、fixtures、分析工具、测试和设计记录。业务代码只能从 `@/features/rich-content` 导入其能力。
- `hooks/`：共享状态和交互逻辑；TanStack Query key 与缓存形状必须保持一致。
- `storage/`：SQLite 与本地仓储。schema 变化必须新增有序 migration，不能原地改写已发布 migration。
- `store/`：Zustand store 及持久化迁移。
- `types/zhihu.ts`：共享知乎领域类型；优先扩展这里，避免页面重复声明相同结构。
- `utils/`：无页面依赖的工具函数。
- `android/`、`ios/`、`.expo/`：生成物，不提交；只有确需验证原生配置时才重新生成。

## 安全与隐私

Cookie、`z_c0`、`d_c0`、`_xsrf`、X-ZSE 请求头和完整 Axios config 都视为敏感信息：

- 不得在日志、Toast、错误上报、fixture、截图或测试快照中输出；
- 调试网络请求时只记录 method、脱敏后的 path、status 和独立 request id；
- 修改 `api/client.ts` 时检查成功与失败分支，避免请求头通过 `error.config` 泄露；
- 登录态当前由 `useAuthStore` 主存到应用沙箱内的 `auth-storage.json`，并尝试以 SecureStore 保留兼容备份。调整此链路时要提供向后兼容迁移，不能静默丢失账号；
- 真机捕获的知乎正文必须先脱敏，再放入 `features/rich-content/fixtures/`。

截至 2026-09-05，`api/client.ts` 原有完整 Cookie/config 日志已移除；登录 WebView 和 URL 解析异常仍输出完整 URL，存在敏感参数进入日志的风险。涉及这些链路时应补齐脱敏，详见 `docs/CODE_REVIEW_2026-09-05.md`。

## 实现约定

### TypeScript 与 React

- 保持 `strict: true`。外部 API 边界可先接为 `unknown`，随后用类型守卫或规范化函数收窄；不要新增无说明的 `any`。
- Hook 必须无条件调用并位于 early return 之前；Effect、Callback、Memo 的依赖要完整，不能仅为消除诊断而盲目禁用规则。
- 大型页面新增逻辑时，优先抽取 typed hook、组件或 feature。`app/(tabs)/index.tsx`、`app/question/[id]/index.tsx` 与富文本渲染器已经是维护热点。
- 不要依赖数组 index 作为 key，除非数据确实没有稳定标识，并用窄范围 Biome 注释说明原因。

### 查询与乐观更新

- 查询 key 必须包含会改变结果的全部参数；失效时尽量使用同一 key，谨慎使用过宽的前缀失效。
- 无限列表优先使用 `hooks/useZhihuInfiniteQuery.ts`；下拉刷新使用 `utils/query.ts` 的精确 reset 语义。
- 使用 `useOptimisticToggle` 时提供准确的泛型、`queryKey` 和不可变 `onUpdateCache`。确认成功提示基于 mutate 时的旧状态，并保留失败回滚与 settled 后校准。
- 改动缓存形状、分页参数或并发 mutation 行为时，补充可重复测试；只看视觉结果不足以覆盖回滚与竞态。

### 富文本

- 统一使用 `import { ZhihuContent } from '@/features/rich-content'`。
- 修复正文解析或渲染问题时，将脱敏样本放入 `fixtures/inbox/`；确认结构后登记到 `fixtures/cases/` 与 manifest。
- 至少运行 `npm run analyze:rich-content` 和 `npm run test:rich-content`。
- RNRH 当前是迁移期实现与 fallback，目标架构见 `features/rich-content/docs/renderer-v2-plan.md`；不要重新扩大旧实现的公共边界。

### 路由、存储与原生配置

- Expo Router 负责冷启动和热启动链接。支持新链接类型时同步检查 `app/+native-intent.tsx`、`utils/url.ts` 与 `app.json` intent filters。
- 修改 SQLite schema 时递增 `DATABASE_VERSION` 并新增事务 migration；仓储操作继续经 `localDatabase.run` 串行化。
- 修改 Zustand 持久结构时递增 store version 并实现 migration。
- `package.json` 与 `app.json` 的应用版本必须同步。版本、原生依赖或原生字段变化后再运行 prebuild。

## 工作流与验证

开始前先检查 `git status --short --branch`，保留用户已有改动。安装依赖优先使用锁文件：

```bash
npm ci
```

按改动范围运行验证，最低基线为：

```bash
npm run check
```

补充检查：

```bash
npm run analyze:rich-content
./node_modules/.bin/biome check .
```

`npm run lint` 执行只读的 `biome check .`；需要应用 Biome 修复时使用 `npm run lint:fix`。`npm run lint:fix` 与 `npm run format` 会修改文件，运行后必须逐项复核 diff。

`npm run check` 是 CI 和发布前的聚合质量门禁，依次执行类型检查、Biome、三组测试及富文本 fixture 分析。PR 与 `main` push 使用 `.github/workflows/ci.yml`；手动发布使用 `.github/workflows/build.yaml`，在同一次运行中汇总 Android 与 iOS artifact。发布前必须同步 `package.json` 与 `app.json` 的版本，并从 `main` 创建尚不存在的 `v<version>` tag。详见 `docs/RELEASING.md`。

Dependabot 的 npm 普通更新只允许每月分组的 patch 更新；Expo SDK、React Native 及配套 `expo-*` 主版本升级必须手动统一进行，不能合并跨 SDK 的单包升级。依赖 PR 必须同步更新锁文件，并以 `npm ci` 成功作为前置条件。

截至 2026-09-05（基于 `906aade` 的未提交工作流改动），聚合检查通过：18 个富文本测试、7 个主题测试、5 个用户资料测试及 6 个 fixture 校验通过；全仓 Biome 为 0 个 error、143 个 warning。不要把这些存量 warning 误报为本次改动引入，也不要新增诊断。详细基线和优先级见 `docs/CODE_REVIEW_2026-09-05.md`。

## 完成标准

- 需求对应的实现与文档一致，没有顺手扩大范围；
- 敏感信息未进入日志、fixture 或提交；
- 类型检查通过，相关测试通过，改动文件通过 Biome；
- 原生、路由、缓存或持久结构变化附带相应验证与迁移；
- 最终交付说明已运行的命令、未运行的真机/平台验证以及剩余风险。
