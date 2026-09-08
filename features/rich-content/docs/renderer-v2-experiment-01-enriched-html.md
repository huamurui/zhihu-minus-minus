经过进一步调研，当前不准备立即完整重写 RNRH，也暂不把 WebView / FlashList / 自研 Native Rich Text 作为唯一既定路线。

## 实施状态（2026-09-08）

第一批 JS / Fabric 接入已经完成，但尚未宣称实验通过：

* 安装 `react-native-enriched-html@1.1.1`，该版本支持项目当前的 React Native 0.83 / Fabric；
* 增加 `normalizeZhihuHtmlForEnriched`，将知乎 HTML 收窄为库支持的 canonical dialect；
* 只保留允许的 URL scheme，移除 script/form 等节点，并对 unsupported node 产生可观测诊断；
* `eeimg=1` 保持 inline `<img>`，`eeimg=2` 和普通 block image 显式记录降级；
* 开发案例页已增加 `Enriched` 第三后端，可与 RNRH / WebView 渲染同一份稳定 fixture；
* 新增 normalization、危险 URL、link card、inline / block attachment 回归测试。

第二批已经补上公式 SVG attachment 与基础排版对齐：

* 通过 `patch-package` 小范围扩展上游图片 attachment；Android 使用 AndroidSVG rasterize，iOS 复用项目已有的 `SDWebImageSVGCoder`；
* 公式 SVG 随当前正文颜色着色，兼容浅色 / 深色主题；远程图片失败日志不再包含完整 URL；
* 缺失 `width` / `height` 的公式沿用现有 RNRH 后端的尺寸 fallback：行内高度 22、按 `alt` 估宽，块公式使用正文宽度和高度 60；
* 正文字号和行高、h1-h6、引用、代码和列表中 Enriched 可配置的部分，已经参考现有 `ZhihuContent` 统一视觉层级；列表使用较紧凑的缩进，标记颜色继承正文色；
* 代码背景使用现有 renderer 的 `border` token，并绕开 Enriched 对不透明背景自动降 alpha 后在浅色主题几乎不可见的问题；normalization 同时移除了 block 之间仅用于格式化源码的空白，避免它们变成额外文本行；
* Android app debug 构建与 iOS `ReactNativeEnrichedHtml` Simulator target 均已编译通过。

这仍不是公式排版的最终形态。知乎公式端点返回的 SVG 在自身 `width` / `height`（`ex`）和 `vertical-align` 中携带精确 metrics，但 Enriched 当前 `<img>` 模型只接收固定整数尺寸，不接收 baseline offset。第一阶段先消除裂图并取得可比较结果；精确 intrinsic metrics 和 baseline 仍属于下文的 Attachment metrics 扩展，需要真机对照后再做。

基础排版也仍有一组明确的库边界：`htmlStyle` 暂不开放普通段落与标题的上下间距、引用背景与内边距、inline code 内边距、图片圆角、分隔线及图注样式。因此本轮只对齐公开配置能够稳定表达的部分，没有通过插入空行伪造 margin（那会污染复制文本和连续 selection）。这些差异应在真机对照后，再决定是否值得增加通用的 paragraph / attachment style native extension。

当前上游只读 `EnrichedText` 已有 `selectable`，但没有 `onSelectionChange`；`htmlStyle` 的 underline 也只有开关和颜色，没有 thickness / offset / line style。因此这两项仍明确属于下一批 native extension，不在本批伪造 JS 事件或视觉模拟。

真机验证入口：

```text
我的
 -> 富文本测试案例（开发）
 -> 选择案例
 -> Enriched
 -> 打开“正文交互”
```

推荐先使用 `article-formula-heavy-001` 检查连续段落、345 个 inline formula 和一个 block image，再使用 `long-image-heavy-001` 检查长文与 block image 降级。由于新增了原生依赖，不能使用 Expo Go；需要重新 prebuild 并编译 development build。

目前更值得先验证的是：

```text
知乎 HTML
   ↓
normalization / semantic lowering
   ↓
react-native-enriched-html
   ↓
Android: Spannable + TextView
iOS: NSAttributedString + UITextView/TextKit
   ↓
少量 native extension / patch
```

`react-native-enriched-html` 已经提供了比较接近目标的 native rich-text 基础设施：

* Android 使用一个 `TextView` + `Spanned/Spannable`；
* iOS 使用 `UITextView` + attributed string；
* 支持连续文本选择；
* 支持 inline image；
* HTML 最终不是拆成大量独立 RN `<Text>`；
* Fabric / RN 0.83 可用。

因此下一阶段先围绕几个明确问题做小型 PoC，再决定是否需要继续自研。

---

## 1. 跨段落选择

### 当前问题

RNRH 通常将多个 HTML block 渲染为多个 RN `<Text>` / native text surface：

```text
TextView A -> 第一段
TextView B -> 第二段
TextView C -> 第三段
```

系统 selection context 相互独立，因此无法自然从第一段拖到第三段。

### 初步方案

尽可能把连续正文降低成一个 attributed-text buffer：

```text
第一段文字\n
第二段文字\n
第三段文字
```

段落、粗体、链接等差异全部通过 range span / paragraph style 表达。

`react-native-enriched-html` 的 `EnrichedText` 已经接近这个模型，因此先验证：

* Android 是否能从一个 `<p>` 连续选择到后续 `<p>`；
* iOS 是否一致；
* 链接、inline image 等节点是否会打断 selection；
* 超长 selection 是否稳定；
* copy 结果是否保留合理的换行。

如果 native selection 本身可用，再补一个很薄的事件接口：

```tsx
<EnrichedText
  selectable
  onSelectionChange={({ start, end }) => {
    // ...
  }}
/>
```

显示组件只负责把已有 native selection range 暴露给 JS，不自行实现拖拽手柄或 selection controller。

---

## 2. 高度自定义文本装饰

### 当前问题

需要的装饰能力不止普通 underline：

* 自定义颜色；
* thickness；
* baseline / offset；
* dashed / dotted / wavy；
* 跨多视觉行；
* 与文字颜色、链接、粗体等样式独立；
* 后续可能用于知识点、搜索结果、批注等多种 range annotation。

直接依赖 RN / Android 默认 underline 无法完整表达。

### 初步方案

不继续扩展系统 `UnderlineSpan`，而是增加一种通用的 **annotation range**。

例如 HTML normalization 后生成：

```html
<annotation data-kind="knowledge">
  被标记的文字
</annotation>
```

Native parser 只负责将其记录成：

```text
AnnotationSpan
range = 120..168
kind = "knowledge"
data = ...
```

这个 span 本身可以不绘制。

真正的 decoration 在 native text view 完成 layout 后，根据 range 查询每条 visual line 的 geometry：

```text
range 120..168
      ↓
Android Layout / iOS TextKit
      ↓
line 5: x1 -> x2
line 6: x1 -> x2
line 7: x1 -> x2
      ↓
Canvas / TextKit overlay drawing
```

然后由自定义 decoration layer 绘制：

```text
────────
- - - - -
﹏﹏﹏﹏﹏
════════
```

第一阶段只需要证明：

* 一个 annotation range 可以跨行；
* 可以控制颜色；
* 可以控制 thickness；
* 可以控制 offset；
* 不影响文字本身 layout；
* selection highlight 与 decoration 可以共存。

后续再扩展：

```ts
type Decoration = {
  kind: string
  color?: string
  thickness?: number
  offset?: number
  style?: 'solid' | 'dashed' | 'dotted' | 'wavy'
}
```

这个机制尽量保持 generic，不做成知乎专用 `KnowledgeUnderlineSpan`。

---

## 3. 行内图片 / 行内公式

### 当前问题

知乎的图片并不全是 block media。

典型情况：

```text
文字 [公式] 继续文字
```

其中 `eeimg=1` 应当像一个 glyph-like object 一样参与同一条文本行：

* 与前后文字共同换行；
* 有 intrinsic width / height；
* 能撑开当前行；
* 有合理 baseline；
* selection offset 连续；
* 不能因为 renderer 结构被自动拆成独立 block。

### 初步方案

优先利用 `react-native-enriched-html` 已有的 inline image span。

知乎 normalization 层区分：

```text
eeimg=1
 -> InlineAttachment / inline <img>

eeimg=2
 -> BlockMedia / 独立 React Native view
```

第一阶段验证：

```html
<p>
  文字
  <img src="formula" width="60" height="24">
  后面的文字
</p>
```

是否满足：

* 正常同行；
* 行尾空间不足时整体换行；
* 图片前后 selection 连续；
* 图片点击 / 长按可识别；
* 异步加载后 layout 不异常。

### 公式 baseline

普通 `ImageSpan` 的默认垂直对齐未必适合数学公式。

因此可以进一步开放 attachment metrics：

```ts
type AttachmentMetrics = {
  width: number
  height: number
  baselineOffset?: number
  alignment?: 'baseline' | 'middle' | 'textTop' | 'textBottom'
}
```

Native 侧对公式使用专门的 span / attachment：

```text
EnrichedImageSpan
FormulaSpan
CustomAttachmentSpan
```

只定制 measure / ascent / descent / draw，不自行实现整套文字排版。

---

## 4. 知乎 HTML 与库支持 HTML 的差异

### 当前问题

`react-native-enriched-html` 不是浏览器级 HTML renderer，只支持一组有限的 rich-text tag。

知乎正文则包含：

* 特殊 class；
* `eeimg`；
* 公式；
* video；
* 卡片；
* figure；
* 可能的 table；
* 非标准或冗余 DOM；
* 内联 style。

### 初步方案

不 fork parser 去支持整个知乎 HTML。

增加一层独立 normalization：

```text
知乎 HTML
   ↓
sanitize
   ↓
semantic normalization
   ↓
Enriched HTML dialect
```

例如：

```text
知乎 p / strong / em / a
 -> 原样或简单转换

eeimg=1
 -> inline img / formula attachment

eeimg=2
 -> 从 text flow 中抽出为 BlockFormula

video
 -> BlockVideo

卡片
 -> CustomBlock

unsupported
 -> 可观测 fallback
```

这样 `react-native-enriched-html` 只负责它擅长的 **text flow**。

复杂 block 仍由现有 React Native renderer 处理。

整体结构可以是：

```text
ZhihuDocument
│
├─ NativeTextFlow
│   ├ p
│   ├ p
│   └ inline formula
│
├─ BlockImage
│
├─ NativeTextFlow
│   └ p
│
├─ Video
│
└─ NativeTextFlow
```

---

## 5. 图片 / 媒体性能与虚拟化

### 当前判断

暂时不认为“几十万字纯文本”本身足以要求 block-level virtualization。

真正可能占据大量内存的是：

* decoded bitmap；
* GIF；
* video；
* 大量独立 native View；
* React/Fabric node；
* 重复 layout。

而 block virtualization 会直接破坏连续 native selection：

```text
cell A -> text surface A
cell B -> text surface B
```

因此不再预设 FlashList 是正文最终结构。

### 初步方案

先保留 text flow 常驻，只管理高成本媒体的生命周期：

```text
远离 viewport
 -> 不 decode / 释放 bitmap

接近 viewport
 -> preload

进入 viewport
 -> display
```

尤其区分：

```text
inline small attachment
 -> 通常常驻

block large image/video
 -> viewport-aware lifecycle
```

同时补长文 fixture 测：

* 10 万字；
* 30 万字；
* 50 万字；
* 大量 paragraph；
* 大量 inline span。

记录 Release：

* initial layout；
* 字号变化 reflow；
* 滚动 FPS；
* native heap；
* Java heap；
* 图片解码峰值。

只有数据证明纯文本 layout 本身存在不可接受的问题时，再研究 segmentation / virtualization。

---

## 6. 需要给 `react-native-enriched-html` 开的扩展口

如果 PoC 基础能力成立，预期 patch / fork 范围优先限制在以下几点：

### A. Generic annotation range

```text
HTML marker
 -> native AnnotationSpan
 -> 保存 kind / data / range
```

不负责具体视觉效果。

### B. Custom decoration layer

根据 annotation range + native Layout 几何进行额外绘制。

### C. Selection event

```tsx
onSelectionChange({ start, end })
```

直接暴露已有 native selection。

### D. Attachment metrics

允许 inline image / formula 指定：

```text
baseline
alignment
width / height
```

必要时增加 `FormulaSpan`。

### E. Annotation interaction

后续如果需要：

```tsx
onAnnotationPress
onAnnotationLongPress
```

通过 offset / range 找到对应 annotation。

这些能力尽量设计成通用 API；如果实现足够干净，可以考虑向上游提交，而不是永久维护知乎专用 fork。

---

## 7. 第一轮 PoC

先不替换现有 RNRH。

增加一个独立实验入口，将同一个 fixture 分别渲染为：

```text
RNRH
react-native-enriched-html
WebView
```

第一轮只验证以下案例：

### Case A：跨段落选择

```html
<p>第一段文字。</p>
<p>第二段文字。</p>
<p>第三段文字。</p>
```

验收：

* Android 能从第一段拖到第三段；
* iOS 能从第一段拖到第三段；
* copy 结果正确。

### Case B：复杂 inline

```html
<p>
普通文字
<b>粗体</b>
<a>链接</a>
<img src="formula">
后续文字
</p>
```

验收：

* 同一个 text flow；
* 正常换行；
* 点击正常；
* selection 正常。

### Case C：公式 baseline

准备：

* 普通单行公式；
* 带上下标公式；
* 较高公式；
* 位于行末的公式。

观察不同字号与 line-height。

### Case D：自定义 decoration

先实现一个：

```text
range
+ color
+ thickness
+ offset
```

的 solid underline。

确认跨行 geometry 正确后，再做 dashed / wavy。

### Case E：现实长文

使用真实知乎长文章 + 人工 10/30/50 万字 fixture，记录 Release 性能。

---

## 当前决策门

第一轮 PoC 完成后再决定：

### 如果大部分能力成立

走：

```text
知乎 normalization
+
react-native-enriched-html
+
少量 native extensions
+
独立 block media
```

不自研完整 Native Rich Text runtime。

### 如果 HTML / selection / attachment 模型有明显结构性限制

再走：

```text
ZhihuDocument / RichText IR
+
自研 Fabric AttributedText
```

### 如果 native 路径正确性成本过高

保留 WebView 作为复杂内容 fallback / correctness oracle。

---

当前阶段的目标不是一次性确定最终 renderer，而是尽快回答：

> 能否用现成 native rich-text runtime 覆盖 RNRH 当前最明显的能力缺口，只把少数真正缺失的能力补在 native 层？

如果答案是可以，那么完整重写 Renderer V2 的范围可以显著缩小。
