# 知乎 App API 记录

这些 `api.zhihu.com` 路径来自知乎 Android 客户端流量，不按匿名接口归类；同一路径可能同时支持设备匿名态和账号登录态。调用方根据当前会话选择 App API 或 Web API，不能把需要登录的 Web 读取接口作为游客回退。

## 已记录接口

| 用途 | 方法与路径 | 主要参数 | API 版本 / 页面 |
| --- | --- | --- | --- |
| 推荐流 | `GET /topstory/recommend` | `action`、`after_id`、`end_offset`、`page_number`、`session_token`、`start_type`、`refresh_scene`、`device`、`is_feed_first_request` 等 | `3.1.8` / `44` |
| 问题详情 | `GET /questions/{id}` | `include` | `3.0.93` / `172` |
| 问题回答流 | `GET /questions/{id}/feeds` | `include`、`order`、`show_detail`、`limit`、`offset`、`cursor`、`session_id` | `3.0.89` / `172` |
| 相关内容 | `GET /questions/{id}/related-objects` | `is_search` | `3.0.93` / `172` |
| 动态流 | `GET /moments_v3` | `action`、`feed_type`、`moment_start_offset`、`offset`、`page_num`、`session_id` 等 | `3.0.93` / `43` |
| 聚合动态来源 | `GET /moments/{id}/origin` | `limit` | `3.0.93` / `172` |

参数类型、URL 构造器和稳定请求头定义集中在 `api/zhihu/appApi.ts`。初始请求只填入可安全推导的默认值；翻页时直接使用服务端下发的 URL，保留 `session_token`、cursor、offset 和频控状态。

当前请求策略中，游客推荐流会优先尝试 App API；若当前安装尚未取得接口所需的完整设备凭据，则回退到原有浏览器游客接口。问题详情与回答流按会话分流：登录时使用 Web API 取得完整详情，游客时使用 App API 的公开题目/回答卡片；游客不会尝试调用需要登录的 Web 回答详情接口。动态关注流使用 `/moments_v3?feed_type=timeline`；失败时保持空态。

## 凭据边界

抓包中的 `authorization`、Cookie、`x-udid`、`x-zst-*`、`x-ms-id`、`x-suger`、`x-at-df-if`、`x-zse-*` 和 trace id 均不写入源码、fixture 或日志。它们属于会话凭据、设备指纹或单次请求状态，应由当前安装的运行时会话提供。`x-ad-styles` 同样不复制：它体积大、与客户端广告渲染能力绑定，并非读取正文所需的业务参数。
