# Fixture 约定

## 目录分层

- `inbox/`：新样本收件箱。可以直接放任意数量的知乎 API `.json`，也可以按来源自行建子目录；不要求先改 manifest。
- `cases/`：已经挑选、命名并纳入稳定回归的样本。
- `manifest.json`：只登记 `cases/` 中需要精确断言的案例。

日常采集时先把文件放进 `inbox/`，运行：

```bash
npm run analyze:rich-content:inbox
```

工具会递归扫描每个 JSON 文件，并读取根对象的 `content` 字段。数组或 `{ "data": [...] }` 之类的响应，先登记到 manifest 并用 `contentPath` 指向正文。这个阶段只做结构统计，不会因为尚未登记期望值而失败。

## 新增真实内容

1. 将脱敏后的完整 API envelope 放入 `inbox/`，推荐命名：`<类型>-<主要特征>-<序号>.json`。
2. 用 inbox 分析命令检查段落、图片、公式、视频、@ 提及和 # 话题等结构。
3. 确认样本有长期价值后，将它移动到 `cases/`，并在 `manifest.json` 中添加案例；同一 JSON 内有多个对象时用 `contentPath` 指向其中一个对象的 `content`。
4. JSON 案例填写 `contentPath`（点号路径，例如 `content` 或 `target.content`），并可用 `expectedMetadata` 断言正文之外的稳定字段；只为已经人工确认的结构添加 `expected` 精确计数。
5. 运行 `npm run analyze:rich-content` 和 `npm run test:rich-content`。

样本应尽量保留知乎返回的真实标签和属性，以便覆盖懒加载图片、公式、视频、链接卡片和异常嵌套。允许替换与结构无关的正文文本，但不要手工“修好”原始 HTML。

## JSON envelope 格式

JSON fixture 保留 API 返回对象本身，正文不再单独复制一份：

```json
{
  "type": "answer",
  "content": "<p>正文 HTML</p>",
  "content_need_truncated": true,
  "author": { "vip_info": { "is_vip": true } },
  "endorsements": [{}, {}]
}
```

对应的 manifest 案例可以这样写（pin 的卡片数据仍保留在 `content`，HTML 正文选择 `content_html`）：

```json
{
  "id": "pin-link-card-001",
  "file": "./cases/pin-link-card-001.json",
  "sourceType": "pin",
  "contentPath": "content_html",
  "traits": ["pin", "link-card", "json-envelope", "metadata"],
  "expected": { "paragraphs": 2, "linkCards": 0 },
  "expectedMetadata": {
    "type": "pin",
    "content.length": 2,
    "content.1.type": "link_card",
    "content.1.data_content_type": "question",
    "content.1.data_content_id": "618885757"
  }
}
```

`expectedMetadata` 的 key 是点号路径，value 做深比较；适合断言类型、权限/截断状态、徽章数量和关系状态等稳定行为字段。点赞数、评论数、时间戳、URL 查询参数等易变或带隐私的信息不要作为长期精确断言。JSON 中仍不得提交 Cookie、请求头、令牌、私密内容或未脱敏的个人联系方式。

HTML 统计还包括 `memberMentions`（`a.member_mention`）和 `topicTags`（`a.hash_tag`）。如果知乎把卡片、图片或其他结构化节点放在 JSON 的 `content` 数组里，它们不会自动计入 HTML 的 `linkCards`/图片统计，应使用 `expectedMetadata` 对数组项断言；这正是 `pin-link-card-001`、`pin-member-mention-muted-001` 和 `pin-topic-tag-001` 的区别。

## 安全与隐私

- 不得提交 Cookie、请求头、访问令牌或私密/付费内容。
- 删除与渲染无关的个人联系方式和追踪参数。
- manifest 记录来源类型和采集日期，不要求保存登录态 API URL。
- 新样本应保持体积必要且可审查；大媒体文件不直接提交，使用无敏感信息的远程占位 URL。

## 现有种子样本

`cases/pig.json` 是脱敏后的完整知乎 answer envelope，正文和正文外元数据一起覆盖无公式长图文的解析与渲染压力。

`cases/question-feed-card-heavy.json` 是 `question_feed_card` envelope，正文位于 `target.content`，用于覆盖 feed card 包装、超长图文、link card、segment 信息和 answer 关系元数据。

`cases/pin-link-card-001.json` 的 pin 正文位于 `content_html`，但知乎问题卡片位于 `content.1`；这类案例必须同时保留两个字段，不能只保存 HTML。

`cases/pin-member-mention-muted.json` 和 `cases/pin-topic-tag-001.json` 分别覆盖 `member_mention` 与 `hash_tag` anchor，并保留 pin 的状态和内容数组。
