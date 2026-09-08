## 逐步替换 RNRH; React Native 文本能力考查;

逐步替换 `react-native-render-html`（RNRH），但不再预设“单 WebView + Block FlashList 虚拟化”作为最终架构。

当前更明确的问题并不主要来自 HTML parser，而来自 **React Native 文本能力的暴露边界**：

1. Android 下文本装饰能力有限，无法可靠实现知识点等场景需要的自定义颜色、粗细、偏移和线型。
2. HTML block 被渲染为多个独立 RN `Text` / native text surface 后，系统选择无法自然跨段落连续进行。
3. RNRH 最终仍然落到 RN `Text` / `View`，因此单纯换一个同类 HTML renderer 很难突破上述限制。
4. “超长正文必须虚拟化”目前尚未被数据证明。对于几十万字级纯文本，真正的性能瓶颈可能更多来自布局重算、图片解码、媒体 View 和大量 React/Fabric 节点，而不是文本 buffer 本身。

因此 Renderer V2 的目标改为：

```text
知乎 HTML
  -> 清洗、规范化、资源分类
  -> ZhihuDocument / RichText IR
  -> Renderer V2
       ├─ Native Rich Text
       │    ├─ Android: Spannable + TextView/Layout
       │    └─ iOS: NSAttributedString + UITextView/TextKit
       ├─ 独立媒体 / 复杂 block
       │    ├─ Image
       │    ├─ Video
       │    ├─ Table
       │    └─ Custom React Component
       └─ 可选 fallback / 实验 backend
            ├─ RNRH
            └─ WebView / 其他方案
```

RNRH 在迁移期保留为旧实现、回归参照和 fallback。

---

## 核心方向：Attributed Text 而不是更多 RN `<Text>`

React Native 内部本身就会把嵌套 `<Text>` 压平为平台 attributed-text 表示：

```text
Android -> SpannableString
iOS     -> NSAttributedString
```

但这些能力没有以完整、可扩展的公共 API 暴露出来。

Renderer V2 希望直接定义一层可跨平台映射的 Rich Text IR，例如：

```ts
type RichTextDocument = {
  text: string
  spans: TextSpan[]
  paragraphs: ParagraphSpan[]
  decorations: Decoration[]
  attachments: InlineAttachment[]
}
```

大致对应：

```ts
type TextSpan = {
  range: [number, number]
  style: TextStyle
}

type ParagraphSpan = {
  range: [number, number]
  style: ParagraphStyle
}

type Decoration = {
  range: [number, number]
  type: 'underline' | 'strikethrough' | 'custom'
  color?: string
  thickness?: number
  offset?: number
  style?: 'solid' | 'dashed' | 'dotted' | 'wavy'
}
```

Native backend 负责把它转换为平台自己的 attributed-text / span 模型，而不是重新实现 shaping、断行、Bidi 和字体 fallback。

目标边界是：

```text
我们负责：
HTML / CSS 语义
range style
paragraph style
custom decoration
selection exposure
inline attachment

平台负责：
font shaping
line breaking
Bidi
glyph placement
native selection handles
copy / accessibility
```

暂不自行实现 Tiqian 一类完整排版引擎。

---

## 为什么这比继续直接使用 RNRH 更有价值

RNRH 的主要链路是：

```text
HTML
 -> DOM / TTree
 -> React Native Text / View
 -> RN 内部 attributed text
```

对于普通富文本这已经足够。

但目前能明确感知到两个 capability gap。

### 1. 高度自定义的文字装饰

目标至少包括：

* 自定义颜色；
* 自定义粗细；
* baseline / glyph 下方偏移；
* solid / dashed / dotted / wavy 等线型；
* 按 source range 应用；
* 跨视觉行连续绘制；
* 与链接、粗体、背景色等 span 独立组合。

Android 端不能依赖 RN 当前的 `textDecoration*` 能力完成这些需求。

Renderer V2 应允许 native backend：

```text
source range
  -> Android Layout / iOS TextKit
  -> 计算每条 visual line 上对应的 geometry
  -> native canvas / text layout decoration
```

因此装饰不必被限制为平台默认 underline。

### 2. 跨段落选择

目前若正文被拆成：

```text
TextView A -> 第一段
TextView B -> 第二段
TextView C -> 第三段
```

每个 TextView 都有独立 selection context，无法自然从 A 选择到 B/C。

对于连续文字流，更合理的模型是：

```text
一个 native text surface

"第一段文字\n第二段文字\n第三段文字"
```

不同段落、粗体、链接和颜色都通过 range style 表达。

这样系统 selection 始终工作在一个连续的 source offset 空间内：

```text
0 -------------------------------- N
```

从而自然支持跨 `\n` 的段落选择。


### 3. 行内图片、公式与 Inline Attachment

知乎正文中并非所有图片都具有 block 语义。

典型例子是：

* `eeimg=1` 行内公式；
* 与文字共同构成一句话的小图片；
* emoji / icon / badge 类元素；
* 未来可能出现的其他 inline embedded content。

这些节点需要真正参与文本排版，而不只是通过一个横向 `View` 把 `Text` 和 `Image` 摆在一起。

目标语义类似：

```text
"前面的文字 \uFFFC 后面的文字"
             ↑
       InlineAttachment
```

Attachment 应具有明确的文本排版属性：

```ts
interface InlineAttachment {
  range: [number, number]

  kind: 'image' | 'formula' | 'custom'

  size: {
    width: number
    height: number
  }

  baselineOffset?: number

  alignment?:
    | 'baseline'
    | 'middle'
    | 'textTop'
    | 'textBottom'

  source: unknown
}
```

Native backend 应让 attachment 作为 glyph-like / replacement object 参与同一个 attributed-text layout：

```text
Android
Spannable
 -> ReplacementSpan / custom inline span
 -> Android Layout

iOS
NSAttributedString
 -> text attachment
 -> TextKit
```

需要验证：

* attachment 与前后文字处于同一 inline formatting context；
* 根据剩余行宽正常换行；
* 不会因为 `eeimg=1` 自动拆成独立 block；
* width / height 能参与当前行测量；
* 能根据公式或图片的视觉基线调整 ascent / descent / baseline offset；
* 不同字号和 line-height 下仍能正确对齐；
* attachment 前后的 source offset 与 selection 保持连续；
* 点击、长按和 accessibility 能映射回原始节点；
* 异步获得 intrinsic size 时有稳定 placeholder / reflow 策略。

其中公式尤其不能简单视为普通图片居中处理。数学公式通常需要有独立的 baseline 信息，使：

```text
       x² + √y
文字 ----------- 文字
       baseline
```

而不是仅按 attachment bounding box 做垂直居中。

因此 Renderer V2 应区分：

```text
Image / Formula
├─ InlineAttachment
│    -> text flow 的一部分
│
└─ BlockMedia
     -> 独立 View
     -> 可进行 viewport-based loading / unloading
```

`eeimg=1` 应优先编译为 `InlineAttachment`，`eeimg=2` 应保持 block media / block formula 语义。

这也意味着媒体虚拟化应主要针对 block 图片、视频等高成本资源；小型 inline attachment 可以随 text flow 常驻，不需要为了回收它们而拆分整个段落或破坏连续 selection。




---

## Text Flow Island

不要求整篇 HTML 强行塞进一个 TextView。

Renderer V2 可以将连续、能够被 attributed-text 模型表达的内容合并为一个 **Text Flow Island**：

```text
Article
│
├─ NativeTextFlow
│    ├─ h1
│    ├─ p
│    ├─ p
│    └─ blockquote
│
├─ Image
│
├─ NativeTextFlow
│    ├─ p
│    ├─ p
│    └─ list
│
├─ CustomComponent
│
└─ NativeTextFlow
     └─ p
```

以下内容优先进入 native text flow：

* `p`
* `span`
* `strong`
* `em`
* `a`
* `code`
* `br`
* `h1` ~ `h6`
* 简单 blockquote
* 简单列表
* 行内公式 / 行内 attachment

以下内容可以成为独立 block：

* 图片；
* 视频；
* table；
* 复杂卡片；
* 真正需要独立 box layout 的自定义组件；
* 暂时无法稳定映射到 attributed text 的节点。

这样既能获得跨段落 selection，也不必把整个 HTML box model 强塞进 TextView。

---

## 关于虚拟化：Measure First

不再预设：

```text
ZhihuDocument.blocks
 -> FlashList
 -> 每段独立 cell
```

作为 Renderer V2 必选架构。

原因是它与连续 native selection 存在天然冲突：

```text
paragraph A -> cell / text surface A
paragraph B -> cell / text surface B
paragraph C -> cell / text surface C
```

cell 被拆分甚至滚出 viewport 后卸载，会破坏连续的 document-level selection。

因此虚拟化改为性能验证后的可选优化。

### 首先测什么

补一份现实上限的纯文本 fixture，例如：

* 10 万字；
* 30 万字；
* 50 万字；
* 大量 inline span；
* 大量 paragraph style。

记录 Android / iOS Release：

* initial render；
* measure / layout；
* 字号变化后的 reflow；
* 宽度变化后的 reflow；
* 长距离滚动 FPS；
* native / Java heap；
* attributed text / layout cache 大小；
* selection 响应。

如果纯文本本身没有明显问题，则不为理论上的极端长度引入 block virtualization。

---

## 媒体资源优先虚拟化

相比纯文本，图片和视频更可能成为真实内存压力。

一张 1080×2000 RGBA 图片解码后理论上即可达到约：

```text
1080 * 2000 * 4 ~= 8 MB
```

因此几十张图片的 decoded bitmap 很容易超过纯文本和其 layout 数据的内存量级。

优先考虑：

```text
远离 viewport
 -> 不加载 / 释放 decoded bitmap

接近 viewport
 -> preload

进入 viewport
 -> mount / decode
```

也就是说可以保留整篇 text layout，同时只对昂贵媒体 attachment 做生命周期管理。

如果后续数据证明真正存在超长文本 layout / memory 问题，再研究：

* text-flow segmentation；
* lazy paragraph layout；
* 分段 native text surface；
* block virtualization；
* Skia / Tiqian 等其他 backend。

不要提前为没有出现的问题付出 selection 和架构复杂度。

---

## 已完成的基线工作

* [x] 将 runtime、fixtures、工具、测试和文档集中到 `features/rich-content/`
* [x] 登记 `lala.md`、`pig.md` 等真实案例
* [x] 修复折叠卡片提前挂载完整正文
* [x] 稳定 RNRH 配置引用
* [x] 推荐流已有完整正文时不再重复请求回答详情
* [x] 长按预览复用列表正文，缺失时仍保留详情请求
* [x] Pager 在空闲期只预取左右相邻回答
* [x] 未聚焦页面不提前挂载完整富文本
* [x] 完成首轮 Android Debug 真机网络、View 数和帧数据基线

这些优化继续保留，与 Renderer V2 backend 设计无冲突。

---

## 下一阶段

### A. Rich Text IR

* [ ] 定义 `ZhihuDocument` / `RichTextDocument`
* [ ] 明确 source offset 与 normalized text offset 的映射
* [ ] 定义 text span / paragraph span / decoration / attachment
* [ ] HTML normalization 后输出稳定 IR
* [ ] fixture 从标签计数推进到 IR 语义断言
* [ ] 保证 unsupported node 有可观测 fallback

### B. Android Native Text PoC

* [ ] Fabric native component
* [ ] `SpannableStringBuilder` backend
* [ ] 单 buffer 多 range style
* [ ] paragraph style
* [ ] link / click range
* [ ] 跨 `\n` 原生 selection
* [ ] selection range event
* [ ] 自定义 underline color / thickness / offset
* [ ] dashed / dotted / wavy decoration PoC
* [ ] decoration 跨视觉行正确绘制
* [ ] 行内公式 / attachment PoC

### C. iOS Native Text PoC

* [ ] `NSMutableAttributedString`
* [ ] `UITextView` / TextKit backend
* [ ] 与 Android 对齐的 range style
* [ ] paragraph style
* [ ] link
* [ ] selection
* [ ] selection range event
* [ ] custom decoration
* [ ] inline attachment

### D. HTML Renderer 接入

* [ ] HTML -> normalized document
* [ ] CSS cascade / inheritance
* [ ] 连续文本节点合并为 Text Flow Island
* [ ] image / video / table / custom block 独立渲染
* [ ] `eeimg=1` 保持真正 inline
* [ ] `eeimg=2` 保持 block
* [ ] 暗色模式
* [ ] 字号缩放
* [ ] 链接点击 / 长按
* [ ] 图片点击 / 长按
* [ ] 与现有 RNRH fixture 对比

### E. Performance / Virtualization

* [ ] 补 10/30/50 万字纯文本 fixture
* [ ] 测 initial layout / reflow / scroll / memory
* [ ] 单独统计媒体资源峰值内存
* [ ] 优先实现图片 / 视频 viewport lifecycle
* [ ] 验证长文章是否真的需要 text virtualization
* [ ] 只有数据证明存在瓶颈时，再决定是否实现 segmentation / FlashList

### F. 可选实验

* [ ] 对比 RN 原生 `<Text>`
* [ ] 对比 native attributed-text backend
* [ ] 对比 WebView
* [ ] 必要时评估 Skia Paragraph
* [ ] 未来有出版级中文排版需求时再评估 Tiqian backend

---

## 暂不做

当前阶段明确不做：

* 自己实现 shaping；
* 自己实现 glyph positioning；
* 自己实现 Unicode line breaking；
* 自己实现字体 fallback；
* 自己实现完整 selection handles；
* 为纯理论上的百万字文章提前设计复杂虚拟化；
* 默认把整篇文章放进 WebView；
* 每段 / 每公式创建一个 WebView；
* 为了 HTML renderer 直接引入完整中文排版引擎。

---

## Definition of Done

Renderer V2 第一阶段完成时应满足：

* `eeimg=1` 行内公式不再被自动拆为独立 block；
* `eeimg=2` 保持块级语义；
* Android / iOS 都能以 native attributed text 渲染连续富文本；
* 同一 text flow 内可以跨段落连续选择；
* JS 能收到稳定的 selection range；
* Android 不再受 RN 默认 `textDecoration*` 限制，可以控制装饰线颜色、粗细和 offset；
* 至少一种自定义 decoration 能跨多视觉行正确绘制；
* 链接、粗体、斜体、颜色、背景、段落样式能够组合；
* 图片、视频和复杂 block 可以从 text flow 中独立出来；
* HTML 清洗、危险 URL、导航和 fallback 有自动化测试；
* Release 构建有真实长文本与混合媒体性能数据；
* 是否进行文本虚拟化由 benchmark 决定，而不是提前作为架构要求。

最终目标不是重新实现浏览器，也不是重新实现 TextKit / Android Layout。

目标是补上 React Native 当前没有完整暴露的 attributed-text 能力，并在这之上提供一个适合知乎 HTML 的、可维护的 Renderer V2。
