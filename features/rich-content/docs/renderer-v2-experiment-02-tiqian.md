# Renderer V2 Implementation 02：Tiqian 初步集成手册

> 暂不实施。 当前 Tiqian 使用较新的 Kotlin / AGP / Compose 工具链；Expo 55/57 默认基座偏旧。RN 0.87 已明显接近其要求，后续 Expo SDK 更新基座后再做尝试。

## 目标

这份文档不是完整 Renderer V2 设计，也不是最终生产方案。

它只回答一个更具体的问题：

> 如何在当前 Expo / React Native 项目里，以尽量小的工程侵入，把 Tiqian 作为 Android native article renderer 跑起来，并逐步做到“基本能看、能选、能显示图片和公式”。

初期不追求：

* 完整知乎 HTML 兼容；
* 极端长文性能；
* 完整媒体生命周期；
* 所有 segment highlight 边角；
* iOS；
* 完整 production fallback；
* 任意 RN component 嵌入 native article。

优先建立最小闭环。

---

# 总体路线

```text
React Native
    ↓
local native module
    ↓
Android native view / ComposeView
    ↓
Tiqian Markdown
    ↓
Tiqian / Tiqian Math
```

数据流：

```text
Zhihu HTML
    ↓
JS normalization / parser
    ↓
简单 Renderer Document
    ↓
native module prop
    ↓
Kotlin adapter
    ↓
MarkdownRenderDocument
    ↓
TiqianMarkdownSurface
```

第一阶段甚至不要求直接接真实知乎 HTML。

可以先：

```text
hardcoded native document
→ 能显示

JS synthetic document
→ 能 bridge

真实知乎 normalized document
→ 再接
```

---

# 工程目录

优先使用 local native module：

```text
modules/
└─ tiqian-renderer/
   ├─ package.json
   ├─ expo-module.config.json
   │
   ├─ src/
   │  ├─ index.ts
   │  ├─ TiqianArticle.tsx
   │  └─ types.ts
   │
   └─ android/
      ├─ build.gradle
      └─ src/main/java/...
         └─ TiqianArticle...
```

不要把第一轮实验直接写进：

```text
android/app/src/main/
```

根目录：

```text
android/
ios/
```

仍然保留为 Expo prebuild 产物。

---

# Phase 0：模块骨架

## 目标

先证明：

```text
Expo App
→ local native module
→ Android native view
```

链路成立。

这一阶段完全不碰 Tiqian。

---

## JS API

先做最小 API：

```tsx
<TiqianArticle text="Hello 中文测试" />
```

例如：

```ts
export type TiqianArticleProps = {
  text: string
}
```

native module 只需要：

```text
text prop
↓
显示 Android TextView / Compose Text
```

---

## 验收

做到：

* `expo prebuild` 后模块自动链接；
* `expo run:android` 可以编译；
* 页面显示 native 内容；
* 修改 `text` prop 可以更新；
* 根 `android/` 不需要提交；
* 删除 `modules/tiqian-renderer` 后项目可恢复。

完成后再进入 Tiqian。

---

# Phase 1：把 Tiqian 跑起来

## 目标

不接知乎 parser。

只验证：

> native module 里能不能正常创建 Tiqian renderer。

---

## Gradle 依赖

在：

```text
modules/tiqian-renderer/android/build.gradle
```

加入 Tiqian 依赖。

初步需要：

```text
org.tiqian:markdown-compose
org.tiqian:math-font-stix
```

如果需要基础 Compose/Tiqian adapter，再补：

```text
tiqian-compose
tiqian-compose-material3
```

具体版本单独集中定义，不要散落在多个文件。

例如：

```text
TIQIAN_VERSION
```

或者只在 module Gradle 文件里出现一次。

---

## 依赖隔离

所有：

```kotlin
import org.tiqian...
```

尽量限制在：

```text
modules/tiqian-renderer/android/
```

内部。

再进一步，可以专门保留：

```text
TiqianAdapter.kt
```

作为应用模型到 Tiqian 模型的边界。

不要让 JS/app 层知道：

```text
MarkdownRenderDocument
MarkdownText
MarkdownParagraph
CjkInlineObject
```

这些 Tiqian 类型。

---

# Phase 1A：Hardcoded Tiqian Surface

先完全绕开 JS document。

native 里硬编码一篇：

```text
标题

第一段中文正文。

第二段包含粗体和链接。

第三段正文。
```

构造：

```text
MarkdownRenderDocument
```

然后：

```text
TiqianMarkdownSurface(...)
```

显示出来。

---

## 这一阶段只验证

* Tiqian 能 mount；
* Android Compose/native host 正常；
* 中文正文正常；
* 段落间距正常；
* Material theme 基本正常；
* width 改变后能重新排版。

---

## 不验证

* selection；
* math；
* images；
* annotation；
* long article。

---

# Phase 1B：基础 Theme

先暴露少量设置：

```ts
type TiqianArticleStyle = {
  fontSize?: number
  lineHeight?: number
  textColor?: string
}
```

不要一开始映射完整 CSS。

目标只是让它能跟现有 App 的阅读设置大致一致。

native：

```text
fontSize
lineHeight
color
```

映射到：

```text
MarkdownStyle
```

---

# Phase 2：JS → Native Document

## 目标

从：

```tsx
<TiqianArticle text="..." />
```

升级为：

```tsx
<TiqianArticle document={document} />
```

但 Document 先保持极简。

---

# 最小 Document V0

先只支持：

```ts
type RendererDocument = {
  blocks: RendererBlock[]
}

type RendererBlock =
  | ParagraphBlock
  | HeadingBlock

type ParagraphBlock = {
  type: 'paragraph'
  text: string
}

type HeadingBlock = {
  type: 'heading'
  level: 1 | 2 | 3 | 4 | 5 | 6
  text: string
}
```

例如：

```ts
const doc = {
  blocks: [
    {
      type: 'heading',
      level: 1,
      text: '标题',
    },
    {
      type: 'paragraph',
      text: '第一段正文',
    },
    {
      type: 'paragraph',
      text: '第二段正文',
    },
  ],
}
```

---

## Native Adapter

Kotlin 侧：

```text
RendererDocument
        ↓
TiqianAdapter
        ↓
MarkdownRenderDocument
```

这一层是整个实验非常重要的边界。

理想结构：

```text
JS RendererDocument
      │
      ▼
NativeRendererDocument.kt
      │
      ▼
TiqianAdapter.kt
      │
      ▼
MarkdownRenderDocument
```

以后如果 Tiqian API 改了：

```text
主要改 TiqianAdapter.kt
```

而不是重写 JS parser。

---

# Phase 2A：Inline Mark

接下来再增加：

```ts
type TextRun = {
  text: string
  marks?: TextMark[]
}

type TextMark =
  | { type: 'strong' }
  | { type: 'emphasis' }
  | { type: 'link'; url: string }
```

Paragraph：

```ts
type ParagraphBlock = {
  type: 'paragraph'
  children: TextRun[]
}
```

例如：

```ts
{
  type: 'paragraph',
  children: [
    { text: '普通文字 ' },
    {
      text: '粗体',
      marks: [{ type: 'strong' }],
    },
    { text: '，然后 ' },
    {
      text: '链接',
      marks: [
        {
          type: 'link',
          url: 'https://example.com',
        },
      ],
    },
  ],
}
```

---

## 验收

做到：

* strong；
* emphasis；
* link；
* heading；
* paragraph。

link 点击回 JS：

```ts
onLinkPress(url)
```

---

# Phase 3：接知乎内容

到这里才开始把现有 HTML pipeline 接进来。

---

# Phase 3A：HTML → RendererDocument

初期只覆盖知乎正文中最常见部分：

```text
p
strong / b
em / i
a
br
h1~h6
blockquote
ul / ol
img
formula
```

先不要试图支持所有 HTML。

---

## 初步结构

```text
Zhihu HTML
   ↓
parse
   ↓
normalize
   ↓
RendererDocument
```

不要：

```text
HTML
→ 直接在 native 里解析
```

也不要：

```text
HTML DOM
→ bridge 整棵 DOM
```

native 只接 semantic document。

---

# Phase 3B：Blockquote / List

扩展：

```ts
type RendererBlock =
  | ParagraphBlock
  | HeadingBlock
  | BlockquoteBlock
  | ListBlock
```

blockquote：

```ts
type BlockquoteBlock = {
  type: 'blockquote'
  blocks: RendererBlock[]
}
```

list：

```ts
type ListBlock = {
  type: 'list'
  ordered: boolean
  items: RendererBlock[][]
}
```

这时已经可以覆盖绝大多数普通知乎文字回答。

---

# Phase 4：公式

公式应该作为 Tiqian 路线第一个真正重要的能力。

---

## V1 先区分两种

```ts
type InlineMathMark = {
  type: 'inlineMath'
  source: string
}

type MathBlock = {
  type: 'math'
  source: string
}
```

先不要把：

```text
eeimg=1
eeimg=2
```

直接带到 native。

JS normalization 应输出最终语义：

```text
InlineMath
MathBlock
```

---

## 初期判定

第一版可以先简单：

```text
普通 eeimg=1
→ InlineMath

eeimg=2
→ MathBlock
```

但代码结构要预留：

```text
classifyZhihuFormula(tex, attrs)
```

后续再补真实知乎的：

* `\tag`
* 顶层 `\\`
* `align`
* 其他 display promotion 规则。

不要把 `eeimg === 1` 写死在 renderer 内部。

---

## Native

```text
InlineMath
↓
MarkdownTextMark.InlineMath

MathBlock
↓
MarkdownMathBlock
```

然后交给：

```text
Tiqian Math
```

---

## 公式第一轮验收

只需要：

1. 普通 inline：

```text
文字 x²+y²=z² 后续文字
```

2. 高 inline：

```text
文字 \frac{a+b}{c+d} 后续文字
```

3. display：

```text
\sum_{i=1}^{n} x_i^2
```

验证：

* 能显示；
* baseline 基本正常；
* inline 真的在正文中；
* display 独立成块；
* 长公式不会直接 crash。

这一阶段不追求完全对齐知乎官方。

---

# Phase 5：图片

## Block Image

先做 block image，再做 inline image。

原因：

```text
block image
```

集成成本明显更低。

---

## Document

```ts
type ImageBlock = {
  type: 'image'
  source: string
  width?: number
  height?: number
  alt?: string
}
```

JS parser 尽量保留：

```text
data-rawwidth
data-rawheight
width
height
```

---

## Native

图片加载交给宿主：

```text
Coil
```

Tiqian 只负责：

```text
layout slot
geometry
```

---

## 第一轮要求

* 能加载；
* 宽度不超过正文；
* 已知 width/height 时保留 aspect ratio；
* 点击可以回调 JS：

```ts
onImagePress(...)
```

暂时不做：

* gallery；
* preload；
* bitmap unload；
* complex cache。

---

# Phase 5B：Inline Image

再加入：

```ts
type InlineImageMark = {
  type: 'inlineImage'
  source: string
  width: number
  height: number
}
```

目标：

```text
文字 [image] 后续文字
```

图片通过 Tiqian inline object 参与排版。

第一版先用简单 baseline：

```text
baseline = image bottom
```

后续再调。

---

# Phase 6：Selection

这一步放在图片和公式之后也可以，取决于开发顺序。

初期只验证普通正文。

---

## API

```tsx
<TiqianArticle selectable />
```

---

## 第一轮 selection 验收

文章：

```text
第一段。

第二段。

第三段。
```

验证：

* 长按；
* 拖手柄；
* 第一段拖到第三段；
* copy；
* Android 系统 selection menu。

如果这一步就失败，就应该暂停后续复杂功能，先搞清楚 Tiqian surface 与 RN host 的 selection/gesture 边界。

---

# Phase 7：知乎划线 / Annotation

做到这里，基本 renderer 已经成立。

然后再接：

```text
segment highlight
```

---

## 初步模型

先不要一开始实现完整跨段 logical annotation。

V1 可以：

```ts
type AnnotationMark = {
  type: 'annotation'
  id: string
  kind: string
}
```

例如：

```ts
{
  text: '这是一段划线内容',
  marks: [
    {
      type: 'annotation',
      id: '123',
      kind: 'segment-highlight',
    },
  ],
}
```

native：

```text
Annotation
↓
Tiqian custom inline mark
↓
DashedUnderline
```

点击：

```ts
onAnnotationPress(id)
```

---

## V1 验收

* dashed underline；
* 点击；
* 单段；
* 跨视觉行。

先不做跨 paragraph logical segment。

---

# Phase 8：真实 Screen Integration

前面都可以放在单独的：

```text
/dev/tiqian
```

实验页里完成。

真正最后才放回 Answer Screen。

---

## 集成

```text
AnswerScreen
├ header
├ TiqianArticle
└ bottom actions
```

---

## 第一阶段只验证

* 进入页面；
* 正文滚动；
* 返回；
* answer pager；
* link；
* selection；
* image click。

暂时不要把所有原来的正文功能一次搬过来。

---

# Phase 9：Renderer Switch

在正式替换前保留：

```ts
renderer: 'rnrh' | 'tiqian'
```

或者 developer setting：

```text
Renderer V2 / Tiqian
```

这样同一个 fixture 可以快速比：

```text
RNRH
vs
Tiqian
```

暂时不删除 legacy renderer。

---

# 第一里程碑：Basic Tiqian Renderer

如果做到下面这些，就算第一阶段成功：

```text
[x] local native module
[x] Tiqian surface mount
[x] JS document bridge
[x] paragraph
[x] heading
[x] bold / emphasis
[x] link
[x] blockquote
[x] list
[x] inline formula
[x] display formula
[x] block image
[x] basic inline image
[x] cross-paragraph selection
[x] simple dashed annotation
```

此时应该已经可以找一个普通真实知乎回答：

```text
知乎 HTML
↓
RendererDocument
↓
Tiqian
```

完整显示。

这个阶段的目标不是完美，而是证明：

> Tiqian 作为 RN native article backend 这条路线成立。

---

# 第二里程碑：真实知乎兼容

第一阶段成功后，再处理：

```text
formula inline/display semantics

table

code block

footnote

figure caption

video/custom block

complex image geometry

segment highlight interaction

cross-paragraph annotation

unsupported-node fallback
```

---

# 第三里程碑：Performance / Lifecycle

再进入：

```text
formula-heavy answer

image-heavy answer

long article

lazy materialization

selection + offscreen lifecycle

image geometry retention

scroll extent stability

background pre-layout
```

这时再引入之前从 Zhihu++ 发现的那些真实 regression fixture。

---

# 第四里程碑：Production Integration

最后处理：

```text
Pager gesture

selection gesture arbitration

media viewer

comment / annotation thread

renderer fallback

error reporting

telemetry / benchmark

iOS strategy
```

---

# 推荐实现顺序

实际编码时，我建议严格按：

```text
01 module skeleton

02 hardcoded Tiqian paragraph

03 JS document bridge

04 paragraph / heading / inline style

05 real Zhihu simple HTML

06 inline + display math

07 block image

08 inline image

09 selection

10 annotation

11 real AnswerScreen
```

不要第一天同时做：

```text
HTML parser
+
Fabric
+
Tiqian
+
math
+
selection
+
image
+
pager
```

否则出了问题很难知道是哪一层。

---

# 建议的文件结构

```text
modules/tiqian-renderer/
├─ src/
│  ├─ index.ts
│  ├─ TiqianArticle.tsx
│  └─ types.ts
│
└─ android/
   └─ src/main/java/.../
      ├─ TiqianArticleModule.kt
      ├─ TiqianArticleView.kt
      ├─ TiqianArticleProps.kt
      ├─ RendererDocument.kt
      ├─ TiqianAdapter.kt
      ├─ TiqianArticleSurface.kt
      └─ TiqianImageProvider.kt
```

应用侧：

```text
features/rich-content/
├─ renderer-v2/
│  ├─ document.ts
│  ├─ parseZhihuHtml.ts
│  ├─ normalizeFormula.ts
│  └─ fixtures/
```

职责：

```text
features/rich-content
→ 理解知乎

modules/tiqian-renderer
→ 理解 RendererDocument + Android

TiqianAdapter
→ 理解 Tiqian
```

尽量保持这三个边界。

---

# 最终原则

整个集成过程优先遵守三条：

## 1. 先跑通，再完善

```text
能显示
→ 能表达
→ 能交互
→ 再优化
```

---

## 2. JS 与 Tiqian 解耦

JS 不直接构造 Tiqian model。

始终保持：

```text
RendererDocument
↓
TiqianAdapter
↓
Tiqian
```

---

## 3. 第一阶段不要解决所有真实世界问题

先完成：

```text
普通文章
+ 公式
+ 图片
+ selection
+ annotation
```

只有这个基本闭环成立之后，再进入：

```text
超长正文
图片生命周期
公式密集
跨段划线
lazy rendering
复杂手势
```

否则 Implementation 02 很容易从一个 renderer experiment，直接膨胀成一次完整排版系统重构。
