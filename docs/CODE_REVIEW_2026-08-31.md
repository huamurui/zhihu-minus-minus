# 代码审查记录（2026-08-31）

> 本文保留当日历史基线。当前问题状态与验证结果见 [2026-09-05 代码审查记录](./CODE_REVIEW_2026-09-05.md)。

## 基线与范围

- 分支：`main`
- 同步前：`cb5f3a3`，落后 `origin/main` 2 个提交
- 同步后：`dabba57`
- 本轮上游重点：回答、文章、想法和问题页的作者关注状态；`useOptimisticToggle` 的缓存回滚与成功提示状态
- 审查范围：应用架构、请求与登录态、TanStack Query 缓存、富文本模块、持久化、路由、构建工作流、类型与静态检查

本记录只描述本轮确认到的事实与风险。除文档、Agent 指南和失真的源码注释外，没有在本轮顺手修改业务实现。

## 验证结果

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| `git pull --ff-only` | 通过 | fast-forward 到 `dabba57` |
| `./node_modules/.bin/tsc --noEmit` | 通过 | strict TypeScript 无编译错误 |
| `npm run test:rich-content` | 通过 | 15 tests，0 failure |
| `npm ls --depth=0` | 通过 | 当前安装树无 missing/invalid 顶层依赖 |
| `./node_modules/.bin/biome check .` | 未通过 | 23 errors、322 warnings |

没有执行 Android/iOS 真机构建，也没有调用依赖在线审计服务。

## 做得较好的部分

- 远端的关注状态修复为详情查询补齐 `author.is_following`，并让文章、想法、回答和问题回答列表使用明确 query key 做乐观更新。
- `useOptimisticToggle` 现在以 mutate 时的 `wasActive` 生成提示，失败时能恢复 `undefined` 之外的任意旧缓存值；类型默认值也从 `any` 收紧为 `unknown`。
- 富文本已形成独立 feature 边界、真实 fixture、模块边界测试、查询策略测试和迁移计划，是当前仓库验证最完整的区域。
- SQLite 使用有序 migration、事务和串行 operation chain，Feed 曝光与启动缓存的边界清晰。
- TypeScript 严格模式已经能全仓通过，说明近期类型修复没有被本次上游改动破坏。

## 发现与优先级

### P1：请求日志可能泄露登录凭据

`api/client.ts:44` 会打印完整原生 Cookie；错误分支 `api/client.ts:105-111` 会打印完整 Axios config，其中可能包含 `Cookie`、`x-xsrftoken`、`X-Udid` 与 X-ZSE 请求头。开发日志、ADB logcat 或错误采集链路一旦保留这些输出，就可能暴露会话凭据。

建议：删除完整 Cookie/config 输出；统一建立只记录 method、脱敏 path、status、request id 的 logger；在测试中断言敏感 header 不会被序列化到日志。

### P2：登录态主存储未加密

`store/useAuthStore.ts` 将包含 Cookie 的多账号状态主存到 `FileSystem.documentDirectory/auth-storage.json`，SecureStore 只是兼容备份。应用沙箱能提供基础隔离，但该文件本身没有静态加密，和旧 Agent 文档声称的“通过 SecureStore 存储”不一致。

建议：评估 Keychain/Keystore 支持的加密持久化或“SecureStore 密钥 + 加密文件”方案；迁移时保留旧文件读取、成功写入新格式后再清理，避免账号静默丢失。

### P2：全仓静态检查不是绿色基线

Biome 报告 23 个 error，主要包括：

- `app/question/[id]/index.tsx` 的 Effect/Memo 依赖不完整，可能让主题色、路由回调或 mutation 闭包滞后；
- `app/collections/index.tsx`、`app/history.tsx`、`app/notifications/index.tsx`、`app/settings/appearance.tsx`、`app/topic/[id].tsx`、`components/DailyList.tsx`、`components/UpdateChecker.tsx` 的 Hook 依赖诊断；
- `app.json` 与 `app/(tabs)/index.tsx` 的格式漂移；
- `components/ImageActionBottomSheet.tsx` 的导入顺序。

另有 322 个 warning，绝大部分来自 API 边界、页面 props 和渲染器中的显式 `any`。这些不会阻断 `tsc`，但会削弱 strict 模式对真实响应形状和页面回调的保护。

建议：先单独提交 23 个 error 的修复并做主题/导航/通知回归，再按 `api → hooks → 页面` 顺序收紧 `any`。不要一次运行 unsafe auto-fix 后直接提交。

### P2：构建工作流缺少质量门禁

两个 GitHub Actions 工作流都直接安装依赖并构建，没有先运行 TypeScript、Biome 或富文本测试；同时使用 `npm install`，而不是以锁文件为准的 `npm ci`。因此构建成功不能证明 Hook 规则和回归测试通过。

建议：新增独立 CI job，依次运行 `npm ci`、`tsc --noEmit`、`test:rich-content` 和 Biome；在全仓 Biome 清零前，可先检查本次变更文件或维护显式基线，但最终目标应是全仓绿色。

### P3：`npm run lint` 名称与行为不符

`package.json` 中的 `lint` 实际是 `biome check . --write`，会改写格式、imports 和安全修复。开发者或 Agent 以为它是只读命令时，容易混入大范围机械改动。

建议：将 `lint` 改为 `biome check .`，另设 `lint:fix` 为 `biome check . --write`。完成脚本调整前，只读审查应直接调用 Biome binary。

### P3：大型页面与类型热点继续增长

当前主要维护热点：

- `app/(tabs)/index.tsx`：1547 行；
- `app/question/[id]/index.tsx`：1482 行；
- `features/rich-content/components/ZhihuContent.tsx`：1353 行；
- `app/user/[id]/index.tsx`：1076 行；
- `app/settings/appearance.tsx`：999 行。

这些文件同时承担请求、状态、动画、列表和 UI，Hook 依赖与缓存形状更难审查。富文本已有 feature 化路线；首页、问题页和用户页也适合逐步抽取 typed controller hook 与局部组件。

## 上游两次提交的专项结论

本轮同步的 `f95ec51` / `dabba57` 没有引入 TypeScript 错误，乐观关注状态的基本方向正确：

- API include 与 UI 所读的 `author.is_following` 对齐；
- query key 包含详情 id，问题回答列表还包含 `questionId` 与 `sortBy`；
- 更新使用不可变拷贝，失败可回滚，settled 后会重新失效查询校准服务器状态。

剩余验证缺口是 hook 级测试：尚未覆盖服务器失败回滚、连续快速点击、mutation 期间切换 query key、同一作者在多个缓存中的一致性。文章、想法和回答详情按钮会在 pending 时禁用，但问题页及其回答项没有同样的限制，连续 mutation 仍存在竞态窗口；缓存跨页面同步也主要依赖后续 refetch。

## 建议处理顺序

1. 立即移除或脱敏 Cookie、Axios config 日志。
2. 修复 23 个 Biome error，并将静态检查接入 CI。
3. 拆分只读 `lint` 与 `lint:fix`，CI 改用 `npm ci`。
4. 为 `useOptimisticToggle` 增加失败、并发和跨 key 测试。
5. 设计登录态加密迁移方案。
6. 逐步收紧 API 响应类型并拆分三个最大页面。
