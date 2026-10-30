# 知乎 App API 记录

这些 `api.zhihu.com` 路径来自知乎 Android 客户端流量，不按匿名接口归类；同一路径可能同时支持设备匿名态和账号登录态。调用方根据当前会话选择 App API 或 Web API，不能把需要登录的 Web 读取接口作为游客回退。

## 已记录接口

| 用途 | 方法与路径 | 主要参数 | API 版本 / 页面 |
| --- | --- | --- | --- |
| 推荐流 | `GET /topstory/recommend` | `action`、`after_id`、`end_offset`、`page_number`、`session_token`、`start_type`、`refresh_scene`、`device`、`is_feed_first_request` 等 | `3.1.8` / `44` |
| 问题详情 | `GET /questions/{id}` | `include` | `3.0.93` / `172` |
| 问题回答流 | `GET /questions/{id}/feeds` | `include`、`order`、`show_detail`、`limit`、`offset`、`cursor`、`session_id` | `3.0.89` / `172` |
| 单回答 v2（已停用） | `GET /answers/v2/{id}` | 曾用于预览首卡；用户反馈 `40362` 服务端限制，首卡改用列表普通正文 | 捕获 `3.0.93` / `42`，未确认成功返回 |
| 原生回答渲染流 | `GET /next-render` | `id`、`type`、`scenes`、`collection_id`、`collection_type`、`question_feed_session_id`、`question_feed_cursor`、`context_expand`、`is_native` | `3.0.93` / `172`，预览模式 |
| 单回答正文续页 | `GET /next-content-render` | 服务端续页 URL 中的 `offset`、`url_token`、`content_type`、`version_id` | `3.0.93` / `172`，响应按运行时校验 |
| 相关内容 | `GET /questions/{id}/related-objects` | `is_search` | `3.0.93` / `172` |
| 动态流 | `GET /moments_v3` | `action`、`feed_type`、`moment_start_offset`、`offset`、`page_num`、`session_id` 等 | `3.0.93` / `43` |
| 聚合动态来源 | `GET /moments/{id}/origin` | `limit` | `3.0.93` / `172` |
| 个人主页「创作」 | `GET /moments/{用户 ID}/origin` | 首页 `limit`；翻页使用 `paging.next`（`offset` 为「时间戳:类型」游标，另带 `page_num`） | `3.0.93` / `10164`；Web 会话返回 `moments_feed` 条目，`target` 为完整的回答、文章或想法，官方客户端返回排版好的 `ComponentCard`；游客请求返回 `40353` |

已接入接口的参数类型、URL 构造器和稳定请求头定义集中在 `src/api/zhihu/appApi.ts`。初始请求只填入可安全推导的默认值；翻页时直接使用服务端下发的 URL，保留 `session_token`、cursor、offset 和频控状态。

`/next-render` 的请求头分类、参数类型、`answer | login_prompt` 返回体和 `structured_content` 分段正文详见 [知乎 next-render 请求与返回体结构](./ZHIHU_NEXT_RENDER.md)。其中正文的 `paging` 是 JSON 字符串，续取路径为 `/next-content-render`，与外层回答流分页不同。预览卡片列表已按此结构接入请求，开发案例继续提供独立 JSON 渲染对照。初始请求仅使用当前回答、已知问题 ID 和固定场景参数，未知会话/游标留空；此最小参数组合尚未进行线上验证。

当前请求策略中，游客推荐流会优先尝试 App API；若当前安装尚未取得接口所需的完整设备凭据，则回退到原有浏览器游客接口。问题详情与回答流按会话分流：登录时使用 Web API 取得完整详情，游客时使用 App API 的公开题目/回答卡片；游客不会尝试调用需要登录的 Web 回答详情接口。动态关注流使用 `/moments_v3?feed_type=timeline`；失败时保持空态。

回答详情与左右切换共用 `useAnswerDetailQuery`：游客优先展示点击卡片或公开问题回答流已返回的正文，使用按会话隔离的 `guest-answer` 缓存；摘要、截断及付费预览保留限制标记，不写入完整 `answer-detail` 缓存。只有部分正文时显示说明和登录入口，未获得可读卡片时显示稳定的失败提示与手动重试。游客相邻页不预取 Web 回答详情，问题 Pager 也使用 App feeds，并保留服务端分页 URL 中的 cursor。详情请求等待或失败不会卸载整个 Pager，避免错误后的挂载重试循环。

## 凭据边界

抓包中的 `authorization`、Cookie、`x-udid`、`x-zst-*`、`x-ms-id`、`x-suger`、`x-at-df-if`、`x-zse-*` 和 trace id 均不写入源码、fixture 或日志。它们属于会话凭据、设备指纹或单次请求状态，应由当前安装的运行时会话提供。`x-ad-styles` 同样不复制：它体积大、与客户端广告渲染能力绑定，并非读取正文所需的业务参数。
