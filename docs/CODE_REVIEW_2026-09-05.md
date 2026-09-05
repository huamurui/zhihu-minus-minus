# 代码审查记录（2026-09-05）

## 基线与范围

- 分支：`main`，审查提交：`87c0712`（v0.5.0）。
- 审查开始时工作树干净；随后更新审查文档并修复本轮确认的 5 个 Biome error，所有变更尚未提交。
- 范围：请求与登录态、信息流、查询与页面交互、主题、持久化、路由、富文本及构建工作流。
- 前次记录：[2026-08-31 代码审查](./CODE_REVIEW_2026-08-31.md)。本记录描述当前状态，不表示所有问题均由近期提交引入，也不表示所有运行路径均已验证。

## 验证结果

以下结果来自本轮对 `87c0712` 的审查及后续工作树修复。

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| `./node_modules/.bin/tsc --noEmit` | 通过 | strict TypeScript 无编译错误 |
| `npm run test:rich-content` | 通过 | 18 tests，0 failure |
| `npm run analyze:rich-content` | 通过 | 6 个 fixture 校验均为 `ok` |
| `npm run test:theme` | 通过 | 7 tests，0 failure |
| `npm run test:user-profile` | 通过 | 5 tests，0 failure；Node 输出模块类型警告 |
| `npm run lint` | 通过 | 只读执行 `biome check .`；0 errors、143 warnings，检查 173 个文件 |
| `git diff --check` | 通过 | 工作树差异无空白错误 |

未执行 Android/iOS 原生构建、真机登录、线上同城接口验证或文件系统故障注入。类型与现有测试通过不能替代这些运行时验证。没有运行会改写文件的 `npm run lint:fix` 或 `npm run format`。

## 发现与建议

### P2：同城分区匹配会接受任意非空 section_id

位置：[`api/zhihu/feed.ts`](../api/zhihu/feed.ts)，第 227–237 行。

`sections.find()` 的条件为 `section.section_name?.includes('同城') || section.section_id`。当同城分区之前存在带有非空 ID 的其他分区时，查找会提前命中该分区；随后请求它的信息流，并将它的名称保存为 `localCityName`。因此结果取决于接口返回顺序，不能保证进入同城分区。

建议：按明确的同城名称或接口标记匹配，并单独验证 ID；找不到时走显式回退。补充“普通分区在前、同城分区在后”和“不含同城分区”的用例。本项依据代码控制流确认，尚未用线上响应复现。

### P2：登录与 URL 解析日志保留完整 URL

位置：[`app/login/index.tsx`](../app/login/index.tsx)，第 145–147 行；[`utils/url.ts`](../utils/url.ts)，第 128–129 行。

登录 WebView 的每次导航都会输出完整 URL；URL 解析异常也会输出原始 URL。如果地址的 query 或 fragment 携带临时授权信息或其他敏感参数，这些内容会进入日志。本轮未捕获真实凭据泄露，因此将其记录为日志脱敏缺口，而非已证实的账号泄露事件。

建议：仅记录允许的 origin/path 或解析失败标记，去除 query、fragment 和 URL 用户信息；异常对象也不要未经筛选直接输出。用虚构敏感参数验证脱敏行为，禁止使用真实登录信息作为测试样本。

### P2：认证持久化写入失败没有反馈到调用方

位置：[`store/useAuthStore.ts`](../store/useAuthStore.ts)，第 34–40 行；[`app/login/index.tsx`](../app/login/index.tsx)，第 77–94 行。

文件适配器捕获写入异常后正常返回，登录流程也没有等待主存储写入成功就报告会话已保存并离开页面。在磁盘写入失败时，内存中的账号状态可能已更新，而文件仍保留旧状态或不存在，重启后可能恢复旧账号或丢失本次登录。

建议：建立调用方可等待的持久化结果和失败反馈，提供重试；仅重新抛出异常不足以解决调用方未等待的问题。通过模拟写入失败及成功重试验证恢复行为。本轮尚未进行文件系统故障注入。

### 已处理：全仓 5 个 Biome error

本轮发现的 5 个 error 分别为：

- `app/notifications/index.tsx:49`：`useCallback` 缺少 `markReadMutation.mutate` 依赖。
- `app/topic/[id].tsx:114`：`useMemo` 缺少 `followMutation.mutate` 依赖，多出未使用的 `followMutation.isPending` 依赖，共 2 个 error。
- `features/rich-content/fixtures/cases/question-feed-card-heavy.json` 与 `features/rich-content/fixtures/manifest.json`：各 1 个格式 error。

上述问题已逐项修复：两个 Hook 使用实际调用的 `mutate` 依赖，移除未使用依赖，两个 JSON 文件只应用定向格式化。全仓 Biome 现为 0 个 error、143 个 warning，类型检查、富文本测试和 fixture 分析通过。现有 warning 不在本次修复范围内。

## 登录检查的待验证项

`app/login/index.tsx:55` 将 `hasZseCk` 固定为 `true`，所以“缺少 `__zse_ck` 时等待”的分支不可达，状态日志也不能反映真实 Cookie 是否存在。但历史提交 `d0df40ac` 明确说明这是有意跳过的检查：当时该 Cookie 没有帮助解除更多 API 限制。

此前会话中将这一点定为 P1，并推断缺少该 Cookie 会导致后续请求全部失败，证据不足；本记录撤回该确定性结论。当前可以确认的是注释、日志和实际检查不一致。是否应强制要求该 Cookie，需要验证当前服务端行为，不能直接恢复检查而使登录永久等待。

如采用 `getMe()` 验证登录，应区分认证无效、临时网络失败及人机验证，避免把所有失败都视为账号失效。当前该请求失败仍会继续登录，真实影响需结合真机测试确认。

## 前次问题的当前状态

| 前次问题 | 当前状态 |
| --- | --- |
| `api/client.ts` 直接输出 Cookie / Axios config | 本轮复核的请求与响应日志已改为 method、path、status、request id；旧输出已移除，仍需处理上述完整 URL 日志 |
| 认证文件未加密 | 仍存在；主存储为应用沙箱内的 `auth-storage.json`，迁移必须保留现有账号 |
| 全仓 Biome 非绿色 | error 已从 23 个清零；仍有 143 个 warning |
| 构建工作流缺少质量门禁 | 仍存在；两个工作流仍使用 `npm install`，没有 TypeScript、Biome 和测试门禁 |
| `npm run lint` 会修改文件 | 已修复；`lint` 为只读检查，写入行为移至 `lint:fix` |

前次报告中的乐观更新并发测试缺口和大型页面拆分建议，本轮没有完成逐项关闭验证，继续保留为后续事项。

## 建议处理顺序

1. 修正同城分区选择，补齐登录及 URL 解析日志脱敏。
2. 为认证持久化增加可观察的失败处理与恢复验证。
3. 逐步收紧 Biome warning，并将只读 lint 接入 CI。
4. 真机验证登录 Cookie 要求，再决定是否调整登录成功判定。
5. 继续设计认证文件加密迁移与查询并发测试。
