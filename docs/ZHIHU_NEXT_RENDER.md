# 知乎 next-render 请求与返回体结构

本文记录用户提供的知乎 Android `11.9.0` 请求和 `message.txt` JSON 返回体，记录日期为 2026-10-03。接口为 `GET https://api.zhihu.com/next-render`，场景为问题回答流。样本的 `data` 直接包含 5 个 `answer` 和 1 个 `login_prompt`，回答正文位于 `structured_content`，没有 `target` 包装，也没有 HTML `content` 字段。

这里记录的是单次抓包观察，不是知乎公开接口契约。下文的枚举和字段是否存在均以此样本为限；空对象、空数组和 `null` 不能证明其他响应的内部结构。请求和完整返回体类型保存在 [`src/api/zhihu/nextRender.ts`](../src/api/zhihu/nextRender.ts)，共享正文、节点与行内标记保存在 [`src/types/zhihu.ts`](../src/types/zhihu.ts)。预览卡片列表现已接入请求，但运行时仅正常化展示所需字段，不能将返回值直接强转为这份抓包类型。开发测试页继续提供独立 JSON 节点渲染对照。本文中的说明示例为合成数据；开发页另外保留附件中五个回答的脱敏正文，身份、ID、业务链接和不透明上下文都已替换，不保存凭据或追踪值。正文和公式的公开图片地址保留供渲染使用。

## 请求方法与参数

请求使用 HTTPS GET，无请求体。`--compressed` 是 curl 的压缩协商与自动解压选项，不是接口查询参数；附件只提供了解码后的 JSON，没有 HTTP 状态码或响应头，因此不能据此确定服务端的压缩算法或 `Content-Type`。

所有查询参数在 URL 上都是字符串。下表的类型是建议调用方使用的逻辑类型；标注“观察值”的枚举不代表接口只支持这些值。原始请求携带了表中的全部 9 项，哪些必填、哪些可省略尚未验证。

| 参数 | 建议类型 | 观察值或含义 |
| --- | --- | --- |
| `id` | `string` | 当前内容 ID；本次为 19 位十进制文本，保留原串，不能先转 JS `number` |
| `type` | `string`，本次 `'answer'` | 当前内容类型 |
| `scenes` | `string`，本次 `'question_feed'` | 问题回答流场景 |
| `collection_id` | `string` | 容器 ID；本次同样为 19 位十进制文本 |
| `collection_type` | `string`，本次 `'question'` | 容器类型 |
| `question_feed_session_id` | `string` | 回答流会话 ID；按不透明字符串保存 |
| `question_feed_cursor` | `string` | 回答流游标；不自行生成、解码或转换为数字 |
| `context_expand` | `0 \| 1`，本次 `1` | 名称指向上下文展开开关，具体行为与其他取值尚未验证 |
| `is_native` | `0 \| 1`，本次 `1` | 原生渲染标志，其他取值尚未验证 |

对应 TS 类型为 `ZhihuNextRenderParams`。ID、session 和 cursor 均保留字符串；不会因为文本只包含数字就转为 `number`。

### 脱敏请求模板

以下保留请求形状与稳定的版本信息。`<...>` 均是占位符，需要由当前运行时会话提供并进行 URL 编码；此模板没有包含抓包中的完整设备和会话请求头，不能视为已验证可独立调用的最小请求。

```bash
curl --get --compressed 'https://api.zhihu.com/next-render' \
  -H 'x-api-version: 3.0.93' \
  -H 'x-page-id: 172' \
  -H 'x-app-version: 11.9.0' \
  --data-urlencode 'id=<CONTENT_ID>' \
  --data-urlencode 'type=answer' \
  --data-urlencode 'scenes=question_feed' \
  --data-urlencode 'collection_id=<COLLECTION_ID>' \
  --data-urlencode 'collection_type=question' \
  --data-urlencode 'question_feed_session_id=<SESSION_ID>' \
  --data-urlencode 'question_feed_cursor=<CURSOR>' \
  --data-urlencode 'context_expand=1' \
  --data-urlencode 'is_native=1'
```

### 请求头分类

HTTP 请求头的线上类型均为 `string`。版本、尺寸和数字标志也不以 JSON 数字发送。表中仅记录名称、格式和安全的稳定元数据；抓包值不证明每个头都是必需的，也不能证明该请求支持匿名访问。

| 请求头 | 格式或观察值 | 用途与保存边界 |
| --- | --- | --- |
| `x-api-version` | 版本串，本次 `3.0.93` | 接口版本元数据 |
| `x-page-id` | 整数文本，本次 `172` | 页面上下文元数据 |
| `user-agent` | App 标识 + 版本 + WebView UA | 本次标识 `com.zhihu.android/Futureve/11.9.0`；完整设备 UA 不固化 |
| `x-app-version` | 版本串，本次 `11.9.0` | App 版本 |
| `x-app-za` | `key=value&key=value` | OS、版本、设备型号、尺寸、渠道等设备上下文；不复制设备值 |
| `x-app-bundleid` | 本次 `com.zhihu.android` | 应用标识 |
| `x-app-flavor` | 本次 `zhihuwap64` | 客户端渠道或变体标识 |
| `x-app-build` | 本次 `release` | 构建标识 |
| `x-network-type` | 本次 `WiFi` | 网络上下文 |
| `x-ad-styles` | `style_name=version;...` | 广告渲染能力表；不复制庞大能力清单，是否影响响应尚未验证 |
| `x-ad` | 本次 `canvas_version:v=5.1;setting:cad=0` | 广告上下文；原 curl 重复发送两次同值，不能由此认定重复是必要的 |
| `x-b3-traceid` | 不透明字符串 | 请求追踪状态；原值不保存 |
| `x-client-ri` | 本次表现为整数文本 | 客户端请求状态，具体语义未验证；原值不保存 |
| `authorization` | `Bearer <TOKEN>` | 账号凭据，仅由当前会话提供 |
| `cookie` | `name=value; ...` | 包含 `BEC`、`_xsrf`、`z_c0`；完整值与分项值均不保存 |
| `x-zst-81`、`x-zst-82` | 不透明字符串 | 设备或会话凭据，具体算法未验证 |
| `x-udid` | 不透明字符串 | 设备标识；原值不保存 |
| `x-ms-id` | 不透明字符串 | 设备或会话状态，具体语义未验证 |
| `x-suger` | 编码字符串 | 设备与请求上下文；不解码后固化或记录原值 |
| `x-zse-93`、`x-zse-96` | 不透明版本与签名字符串 | 签名链路；不保存抓包值。原文本中 `x-zse-93` 有换行，调用时需使用合法的单行 header 值 |

## 返回体总览

顶层 `paging` 是 JSON 对象；`data` 是联合类型数组，必须先按 `type` 区分 `answer` 与 `login_prompt`。本样本的 5 个回答都包含同一问题对象，但不能推导任意场景下必然相同。所有出现的业务 ID 都以 JSON `string` 返回。

| 位置 | TS 类型 | 结构 |
| --- | --- | --- |
| 根对象 | `ZhihuNextRenderResponse` | `{ paging, data }` |
| `paging` | `ZhihuNextRenderPaging` | `is_end: boolean`、`is_start: boolean`、`next: string`、`previous: string`、`totals: number` |
| `data[]` | `ZhihuNextRenderItem` | `ZhihuNextRenderAnswer \| ZhihuNextRenderLoginPrompt`，按 `type` 判别 |
| `data[].type = 'login_prompt'` | `ZhihuNextRenderLoginPrompt` | 仅 `id: string`、`type: 'login_prompt'`、`description: string` |
| `data[].type = 'answer'` | `ZhihuNextRenderAnswer` | 回答元数据、交互关系和 `structured_content`，详见 TS 定义 |

`paging.next` 指向 `/next-render`；它包含原有参数，并额外出现 `limit`、`page_id`、`session_id`。这些参数的线上值也是字符串：`limit`、`page_id` 表现为整数文本，`session_id` 为会话状态。应保留服务端下发的游标、会话与参数组合，不能按初始 URL 重新拼装而丢失状态。顶层 `previous` 在样本中为空串；`is_end=true` 时 `next` 仍非空，所以分页是否结束应看 `is_end`。`totals` 为 `0`，但统计口径尚未验证。

`login_prompt` 没有 `author`、`question` 或 `structured_content`，不能强转为回答或富文本节点。它的出现也不能单凭本附件解释为凭据失效、匿名态或错误 HTTP 状态。

### 回答元数据与字段差异

完整字段都在 `ZhihuNextRenderAnswer` 及其嵌套接口中声明。以下列出容易与仓库已有领域模型混淆的边界。

| 字段 | 样本类型与差异 |
| --- | --- |
| `question` | 含 `status`、`relationship`、`review_info`、`mute_info`、`reaction_instruction`、`followers_count`、`answer_count`；`status.is_close` 保留原字段拼写 |
| `author` | 用户类型为 `people`；名称字段是 `fullname`，头像字段是 `avatar`，不同于现有模型中的 `name`、`avatar_url` |
| `author.avatar` | `avatar_image` 为带 `day/night/width/height/jump_url` 的对象；`avatar_icon_image` 为同结构对象或 `null`；frame/cover 本样本仅为 `null` |
| `author.identity_icons` | 带跳转 URL 的主题图片数组；实际有空数组、单项和两项三种情况 |
| `search_word.queries[]` | `display_query`、`real_query`、`link_url`、`attached_info`、`id` 均为字符串 |
| `interaction_bar_plugins[]` | `comment` 分支有 `comment: { enable: boolean, placeholder: string }`；`follow` 分支只有 `type` |
| `reaction.statistics` | 计数是 `number`；可选 `img_like_count` 为 `Record<string, number>`，以动态图片 ID 为键；`republishers` 仅观察到空数组 |
| `reaction.relation` | 可选 `img_liked` 为 `Record<string, boolean>`；`vote` 样本为 `Neutral`，不能直接套用现有模型的大小写枚举；`subcribed` 保留原拼写 |
| `reaction.image_reactions` | 动态图片 ID → `{ like_count: number, is_liked: boolean }`，允许空对象 |
| `image_list` | 仅 3 个回答存在；图片元数据见下文，不是正文节点数组 |
| `card_list` | 另 2 个回答存在且为 `null`；其他回答中该字段缺失 |
| `video` | 5 个回答均为 `null`，非空结构未知 |
| `hot_comment`、`endorsement` | 仅为空数组，类型定义保留 `unknown[]`，不能凭空推测元素类型 |
| `reaction_instruction`、`third_business` | 仅为空对象，保留 `Record<string, unknown>`；问题内的 `reaction_instruction` 也是如此 |
| `attached_info` | 编码后的不透明二进制上下文，不是 JSON；不解码成业务对象，也不记录真实值 |
| `nf_attached_info`、`ad_info.data` | 样本为空字符串，仍为 `string` |
| `content_end_info` | 创建/更新展示文本、IP 展示文本、转载设置字符串及 `show_origin_page: { text, action_url }`；不能把展示文本当时间戳 |
| `comment_config` | `{ can_segment_reply: boolean }` |

`image_list`、`card_list`、`img_like_count`、`img_liked` 的可选性来自样本内实际缺失。其他字段在所属分支中都存在，这只能说明本样本，不能证明所有响应永远必填。`null`、缺失、空数组、空对象和空字符串需要分别处理。TS 定义中仅观察到 `null` 的字段写为 `null` 并注明未确认非空结构。

## structured_content 正文

`ZhihuStructuredContent` 的结构为 `{ paging: string, segments: ZhihuStructuredContentSegment[] }`。`segments` 按返回顺序组成正文；文字存储在段落、标题或列表项的 `text` 中，样式、链接和公式通过 `marks` 的文本范围描述。它不是 HTML 字符串，也不是现有 HTML fixture 中的 `segment_infos` 段落互动信息。

### 正文分页

`structured_content.paging` 在线上是字符串。先对这个字符串执行 JSON 解析，再把结果当作 `unknown` 校验为 `ZhihuStructuredContentPaging`，不能直接读 `paging.is_end`，也不能把整个字符串当 URL。

```json
{
  "paging": "{\"is_end\":false,\"next\":\"https://api.zhihu.com/next-content-render?offset=20&url_token=10001&content_type=answer&version_id=20001\",\"is_start\":true,\"previous\":\"\",\"totals\":0}",
  "segments": []
}
```

这是合成的分页形状示例；真实样本的 `previous` 也有 URL，即使 `is_start=true`。解析后字段与外层分页同形，但两者的分页对象和游标分别管理：

| 分页 | 线上类型 | 续取路径 | 决定是否结束 |
| --- | --- | --- | --- |
| 回答流 `response.paging` | 对象 | `/next-render` | 外层 `is_end` |
| 单个回答 `answer.structured_content.paging` | JSON 字符串 | `/next-content-render` | 解码后的内层 `is_end` |

内层 `next` 和 `previous` 都包含 `offset`、`url_token`、`content_type`、`version_id`。对应参数类型为 `ZhihuNextContentRenderParams`：`offset` 建模为整数 `number`，另三项保留字符串，其中本样本 `content_type='answer'`。线上 URL 中全部仍是文本；`url_token` 与 `version_id` 不能先转为数字。此续取接口尚未实际调用，也没有真实续页返回体样本；开发案例只模拟本地 JSON 页追加。

5 个正文分页的 `is_start` 均为 `true`、`totals` 均为 `0`，但都有正文段；`totals` 不能当作段数。即使 `is_end=true`，`next` 也非空，必须先检查结束标志。有一条回答 `is_end=false`，证明初次返回的正文可能只是前一部分。

### 分段节点

`ZhihuStructuredContentSegment` 是按 `type` 判别的联合类型。所有分段都有 `id: string`，并且只在对应分支下读取同名 payload；`hr` 没有 payload。完整接口字段见 TS 文件。

| `type` | payload | 关键字段与本样本边界 |
| --- | --- | --- |
| `paragraph` | `paragraph` | `pid: string`、`text: string`、`marks: ZhihuStructuredContentMark[]`；38 个节点的外层 `id` 都与 `pid` 不同，不能混用 |
| `heading` | `heading` | `level: number`、`text: string`、`marks`；只观察到 `level=2`，不据此限制所有标题等级；本样本只出现 bold 标记 |
| `list_node` | `list_node` | `type='unordered'`、`items[]`；每项含 `indent_level: number`、`text`、`marks`，没有独立 `id/pid`；本样本 4 项且缩进均为 1，只出现公式标记 |
| `image` | `image` | `width/height: number`、`is_gif: boolean`、`description: string`、`layout`、`status`、`token/original_token: string`、`urls/original_urls: string[]` |
| `hr` | 无 | 只有外层 `id` 和 `type`，表示分隔节点 |

图片 `layout` 出现 `normal` 与 `small`，`status` 仅出现 `normal`，`is_gif` 全为 `false`。`urls` 与 `original_urls` 本次均为单项数组，类型仍保留数组；`description` 可以为空串。尺寸、标题等级和缩进在样本中都是整数，但不凭此推断单位、完整取值范围或其他合法布局。未观察到 GIF、视频、表格、引用、有序列表等节点结构，不能为它们编造 payload。

`segment.id` 在每个回答的本页内不重复；是否跨分页稳定尚未验证。正文分段本身没有动态对象键；动态图片字典位于回答的 `reaction` 中。

### 行内标记

`ZhihuStructuredContentMark` 也按 `type` 判别。每个标记都有 `start_index: number`、`end_index: number`，范围为 `[start_index, end_index)`，作用于所在节点或列表项的 `text`。

| `type` | payload | 字段与语义 |
| --- | --- | --- |
| `bold` | 无 | 仅类型与范围，不能期待 `bold` 对象 |
| `link` | `link` | `href: string`、`icon_name: string`、`link_type: 'member_mention' \| 'text'`；4 个提及链接的 icon 为空串，1 个文本链接使用图标名 |
| `entity_word` | `entity_word` | `id: string`、`type='search'`、`word: string`、`url: string`、`attach_info_bytes: string`；词条范围文本都等于 `word` |
| `formula` | `formula` | `content: string`、`width/height: number`、`img_url: string`、`url: string`；`content` 为公式源码，部分包含 LaTeX 命令 |

全部 53 个公式标记的范围都覆盖文字中的固定占位符 `[公式]`，长度为 4；实际公式来自 `formula.content` 或 `formula.img_url`。`formula.url` 在此样本中是回答链接，`img_url` 才是公式图片，不能混用。替换占位符后仍应保留原 `text` 的范围映射。

存在一处 `bold` 与 `entity_word` 范围重叠，因此不能把 marks 当作互斥的连续切片。所有观察到的范围都是合法的非负整数半开区间；样本不含非 BMP 字符，能排除 UTF-8 字节偏移，但尚不能区分 Unicode 码点和 JS UTF-16 单元。未来带 emoji 等字符的样本需要另行核对。

`entity_word.attach_info_bytes` 可 Base64 解码为非 UTF-8 二进制，协议未知；保留不透明字符串即可，不把它当 JSON，也不把真实串写入日志或 fixture。除 `paging` 外，本样本未发现其他嵌套 JSON 字符串。

下面用合成文本展示四种 mark，以及 bold 与词条重叠的形状。`id`、URL、公式与文本均为示意值，范围对应这段示意文本。

```json
{
  "id": "segment-example",
  "type": "paragraph",
  "paragraph": {
    "pid": "paragraph-example",
    "text": "示例用户的[公式]与检索词。",
    "marks": [
      {
        "type": "link",
        "start_index": 0,
        "end_index": 4,
        "link": {
          "href": "https://example.invalid/people/example",
          "icon_name": "",
          "link_type": "member_mention"
        }
      },
      {
        "type": "formula",
        "start_index": 5,
        "end_index": 9,
        "formula": {
          "content": "\\frac{1}{2}",
          "width": 16,
          "height": 32,
          "img_url": "https://example.invalid/formula.png",
          "url": "https://example.invalid/answer/10001"
        }
      },
      {
        "type": "entity_word",
        "start_index": 10,
        "end_index": 13,
        "entity_word": {
          "id": "entity-example",
          "type": "search",
          "word": "检索词",
          "url": "https://example.invalid/search",
          "attach_info_bytes": "<OPAQUE_BYTES>"
        }
      },
      { "type": "bold", "start_index": 10, "end_index": 13 }
    ]
  }
}
```

### 逐回答结构统计

以下编号仅指附件数组位置，用于核对不同案例；未保存真实回答 ID 或原文。共 48 个分段、99 个 mark。

| 回答位置 | 分段组成 | marks 组成 | 正文 `is_end` | 图片差异 |
| --- | --- | --- | --- | --- |
| `data[0]` | 6 段：paragraph 3、list_node 1、image 2 | 13 个：link 4、formula 9；公式在 4 个无序列表项中 | `true` | 2 个 normal 图片；`image_list.images` 2 张 |
| `data[1]` | 20 段：paragraph 17、heading 2、image 1 | 28 个：bold 27、entity_word 1；其中 heading 含 bold 1 个 | `false` | 本页 1 个 small 图片；`image_list.images` 2 张，正文仍有后续 |
| `data[2]` | 11 段：paragraph 10、hr 1 | 48 个：formula 44、entity_word 2、bold 2 | `true` | 无 `image_list`，`card_list=null` |
| `data[3]` | 7 段：paragraph 4、image 3 | 7 个：entity_word 7 | `true` | normal 2 个、small 1 个；`image_list.images` 3 张 |
| `data[4]` | 4 段：paragraph 4 | 3 个：entity_word 2、link 1；该链接为 text 类型 | `true` | 无 `image_list`，`card_list=null` |

节点合计为 paragraph 38、image 6、heading 2、list_node 1、hr 1；mark 合计为 formula 53、bold 29、entity_word 12、link 5。段落内包含全部四种 mark。`structured_content` 内未观察到 `null` 或某个已知分支 payload 内的缺字段，但这不代表其他响应不会出现。

### 图片列表与正文图片

回答级 `image_list.images[]` 的字段为 `height`、`original_height`、`original_token`、`original_url`、`original_width`、`suffix`、`thumbnail`、`token`、`url`、`width`；尺寸为 `number`，其余为 `string`。外层还有 `count: number`、`width_ratio: number`、`is_grid: boolean`。

正文图片则使用 `urls` 和 `original_urls` 数组，并携带 `layout`、`status`、`is_gif`、`description`。两者的字段和角色不同：正文图片的位置应来自 `segments`，不能用回答级图片列表重建位置，也不能要求初页图片段数总与 `image_list.count` 相同；`data[1]` 已存在 1 段对 2 张的差异。

## 类型定义与使用边界

TS 文件声明了本样本观察到的所有已知分支和嵌套字段。生产接入仍需要以 `unknown` 接住响应，再校验顶层、`type`、payload、范围与 URL，解析内层分页；类型注解不能替代运行时校验。开发案例的数据经过结构校验后，直接映射到 React Native 节点或 `ZhihuDocument` 原生文本流，不经过 HTML/XML 字符串或旧富文本解析器。

已知联合仅覆盖本次出现的 5 种 segment 和 4 种 mark。遇到未知 `type` 不能误当成已知节点，也不能把丢失段的结果视为完整正文。原有富文本 fixture 中没有其他 `structured_content` 抓包样本；本轮从附件提取五个脱敏案例，并另留合成边界案例。尚未验证真机渲染、字段可省略性、真实正文续页响应或匿名调用。

## 开发渲染对照

从“我的 → 富文本测试案例 → structured_content 渲染对照”进入开发页。五个主要案例逐一对应附件的 `data[0..4]`，保留全部 48 个分段、99 个 mark、53 个公式标记和原分页状态。身份文字替换保持 UTF-16 长度，避免改变范围；ID、业务链接、token 和不透明字节串都已替换。六张正文图与公式图保留原公开 HTTPS 图片地址，运行时按地址加载；仓库只保存 JSON，不新增下载的图片文件。公式源码保留复制语义，分段模式在公式图片加载失败时回退源码。

页面可查看脱敏 JSON 和分页信息、按分段展开收起。原样本中 `data[1]` 的正文尚未结束，但附件没有后续正文，页面明确显示该状态；额外的“合成：本地续页边界”才演示本地追加与重复节点处理，不请求生产接口。

| 方式 | 渲染路径 | 展开收起 |
| --- | --- | --- |
| 原生分段 | JSON 节点与 marks → React Native Text/Image/View | 直接选取要显示的 segments |
| tiqian 文本流 | JSON 节点与 marks → `ZhihuDocument` → 原生文本流 | 同样选取 segments，再编译这部分文档 |

两种方式都由独立 `ZhihuStructuredContent` 组件承载，不把 JSON 序列化为 HTML/XML，不调用旧 HTML 解析器。文字中的 `<`、`&` 等字符按文字显示，重叠标记直接建模为范围样式，公式占位直接建模为公式附件。tiqian 模块不可用时回退原生分段；测试页切换排版不会修改持久阅读偏好。

转换保留分段身份与有效 payload；生产接入与段落互动校验见下文。开发对照页不请求正文或互动接口。

## 2026-10-05 预览列表接入

在“设置 → 外观与阅读 → 回答阅读方式”选择预览卡片列表后，点击普通回答卡片进入结构化正文预览；默认模式仍为回答详情。问题页和收藏夹先显示普通卡片。初始 `/next-render` 始终使用点击的回答 ID、`type=answer`、`context_expand=1`、`is_native=1`。推荐入口使用 `scenes=recommend`，来源不明确的其他入口使用 `scenes=unknown`，用户主页自己的回答使用 `scenes=profile_answer`，只有明确的问题回答列表使用 `scenes=question_feed` 并附带已知问题 ID、`collection_type=question`；问题流中无法取得的会话与游标参数为空，不复制抓包凭据。回答列表与正文使用各自的完整续页 URL，保留所有服务器参数并检查结束标志及循环。

后续卡片保留完整已加载 segments，按正文实测高度展开收起，通过统一 `ZhihuContent.document` 使用与详情相同的正文后端和交互。默认原生路径直接消费文档，选择 WebView 或缺少模块时才安全序列化，沿用 DOM 排版及桥接。登录提示单独展示；未知附加标记保留原文，未知块有明确文字时保留文字，不提示整条回答必须进入详情。next-render 中真正缺失或无效的回答正文只跳过该回答，保留同页有效卡片及原分页；整页没有新增有效回答时仍由无进展保护停止续取。首卡加载、正文续页及接口失败保留独立重试，不假装加载了全文。单回答续页仍没有真实返回体样本；本轮未运行模拟器、启动真机应用或主动请求真实 API。

## 2026-10-05 按回答入口区分场景

用户补充了推荐、用户主页和未知来源的请求示例，均使用回答 ID 与 `type=answer`，分别携带 `scenes=recommend`、`scenes=profile_answer` 和 `scenes=unknown`，没有问题容器或问题流会话字段。当前类型按这四个场景区分初始请求；URL 构建只透传对应场景的已知参数。推荐/用户场景尚无真实响应样本；用户后续提供的收藏入口返回确认 `scenes=unknown`，见下文。请求构建与缓存隔离通过合成回归核对，未主动调用真实接口。仍沿用服务端完整续页 URL，不重建其参数。

用户进一步确认 `/next-render` 返回的是点击回答之后的内容，不能依赖它包含所选回答。曾补入 `GET /answers/v2/{answerId}`，但用户实际请求收到 `error.code=40362`，错误说明当前请求异常、暂时限制访问。这是服务端拒绝请求，尚未进入正文解析。抓包与现有调用在 App 标识、UA、Bearer 等方面存在差异，但没有证据证明其中哪一项是此次限制的原因；不复制凭据或设备标识，不将某个请求头写成已验证的修复。

按用户决定停用 v2。当前首张卡片固定使用点击列表中已有的 `content`，以普通 `ZhihuContent` 展开渲染，保留该内容真实携带的 `segment_infos` 和 `link_card_info`；不把 HTML 转成新接口的 segments，也不补造段落业务 ID。FeedCard、问题回答卡片和 CreationCard 在点击时写入当前账号会话的临时首卡缓存；部分或付费列表正文不会因此进入完整详情缓存。没有有效列表正文时可复用已有普通详情正文；仍缺正文才沿用原 `getAnswer` 接口。首卡刷新和段落互动沿用普通接口，后续卡片继续使用 next-render 的结构化正文，两者分别重试。首卡重试保留后续列表，下拉刷新同时刷新首卡与后续流。

首卡默认展开，将全部可用的原始 `content` 与真实元数据交给普通正文宿主，沿用详情的后端和完整交互，长正文允许通过正文或悬浮栏按钮收起；刷新及账号、来源切换后恢复当前首卡默认展开。首卡与后续卡片共用实测高度裁剪，短内容不折叠，少量溢出保留全文，展开收起不改写原文与段落身份。列表返回被截断或付费正文时明确保留不完整状态，不把它当成全文。后续结构化回答的正文续页保持自动读取。首卡固定在列表首项，过滤后续流的同 ID 回答；首卡、后续流和正文续页都按当前账号会话隔离。外层回答和内层正文续页继续原样请求各自 `paging.next`。除地址校验与循环识别外，预览也读取首个响应的外层续页信息。可信的 `/next-render` 地址明确标注 `scenes=question_feed`、`collection_type=question` 和 `collection_id` 时，列表头使用该问题 ID 请求详情。

`profile_answer` 可能返回当前用户在不同问题下的回答，因此预览不把第一条回答的问题当成整个列表的容器。左右滑动详情的 `profile_answer` 来源继续通过已有成员回答接口跨问题分页；其他来源默认请求当前问题的回答列表，包含推荐、显式问题来源以及关注动态、搜索、收藏、历史、链接等 `unknown` 入口。缺少问题 ID 时先从所选回答详情解析，列表请求不阻塞当前回答阅读。原始来源场景保留，预览列表仍按上述 next-render 场景及续页规则请求。详情与预览共用正文渲染和交互。

## 2026-10-05 成功返回中的段落互动标记

用户补充的成功返回含 5 个回答、39 个 paragraph 分段，前 3 个回答出现共 4 个 `seg_like` mark，另有 6 个 bold。`seg_like` 的 payload 包含 `comment_count`、`count`、`is_like`、`is_span`、`my_comment_count` 与 `seg_ids`，是附加在既有文字上的互动元数据。旧解析器把它当作未知正文类型，导致前 3 条正文被整体拒绝；现在保留 typed 元数据、全部原文和其他格式标记，`count` 映射为共享 `like_count`。非 BMP 样本的 37 码点/44 UTF-16 单位与末端范围 44 一致。唯一真实 PID、准确完整范围和有效片段 ID 可进入详情已有段落菜单；重复 PID、交叉标记、跨段反应和公式段保留本地阅读/复制，不提交猜测坐标。WebView 片段点击携带内部节点 ID，选区仍计算整段偏移。

该响应的 5 条正文 `is_end` 均为 true，`next` 仍非空，正文按结束标志停止续取；外层回答列表的 `is_end` 为 false，两层分页继续独立处理。该次初始请求的会话与游标参数为空且已成功，但单次返回不能证明所有场景下的参数要求。回归使用脱敏响应经过 API 规范化、JSON 文档转换、IR 编译及共享宿主，覆盖全部 39 段、粗体、分页、真实身份与互动范围。另读取用户已连接安卓真机的现有崩溃日志，定位并修正空焦点传递引起的闪退；未安装或启动应用，修正后运行时仍待复验。

样本先脱敏保存在 `fixtures/inbox/structured-content/next-render-seg-like-001.json`，确认后登记同名 cases 与 manifest；身份、业务 ID、URL 参数和不透明字段已替换或移除，正文保持 UTF-16 长度、非 BMP 位置及标记范围。稳定案例页支持登记的结构化正文对象，并以 JSON 分段或 tiqian 显示；不将其转换成 HTML。

## 2026-10-05 收藏入口的正文卡片与有序列表

用户提供的收藏入口返回包含 5 个回答、19 个分段（17 个 paragraph、1 个 card、1 个 list_node），外层续页携带 `scenes=unknown`；各回答所属问题不同。第 2 条回答的 `card` 使用 `card_type=edu-card`、`content_type=ANSWER`，显示字段为 `title`、`url`、`cover`；第 4 条回答的列表为 `type=ordered`，含 6 个同层条目。本次没有行内 marks，所有正文均已结束但仍带 next URL。

旧解析器没有 card 分支，且只接受 unordered 列表，任一回答抛错都会让整页查询失败。现已把正文卡片映射到共享 `linkCard`，保留标题、链接和封面；未知附加业务元数据不参与正文解析，不安全或缺失链接只保留卡片文字。有序列表在共享文档与原生编号、WebView 的 ol 列表中保持顺序。

脱敏样本 `next-render-collection-card-ordered-001.json` 已在 inbox/cases 登记，manifest 分别选择卡片与有序列表回答。保留分段顺序、分页形状及 UTF-16 长度，正文、身份、业务地址和不透明上下文已替换；完整 5 条响应经过 API 正常化、共享文档及编译回归，未主动请求真实 API。
