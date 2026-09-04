# Renderer V2：逐步替换 RNRH

## 结论

富文本模块不再把 `react-native-render-html`（RNRH）视为长期架构。后续采用“统一内容模型 + 两种渲染后端”的路线：

```text
知乎 HTML
  -> 清洗、规范化、资源分类
  -> ZhihuDocument（Block + InlineRun）
  -> Renderer V2
       ├─ 单 DOM/WebView：优先保证 CSS、公式、选择等正确性
       └─ 虚拟化 Block：面向真正超长正文控制挂载和内存
```

迁移期间 RNRH 只承担旧实现、回归参照和可回退路径。新实现通过 feature flag 分批接入回答与文章页，达到正确性、性能和安全验收后再删除依赖。

这不是把 RNRH 直接替换成另一个通用 HTML-to-Native 库。当前问题横跨内容模型、平台文本能力和滚动架构，单纯替换解析器无法同时解决。

## 为什么要换

### 1. 行内公式不是普通块级图片

知乎用同一个 `img` 标签表达不同语义，例如 `eeimg=1` 是行内公式，`eeimg=2` 是块级公式。当前 `IMG_Renderer` 被声明为 `CustomBlockRenderer`，行内分支再尝试把 `SvgUri` 放入 `Text`，但 SVG 组件并不是字体排版系统中的真正 inline attachment。

RNRH 的官方图片模型默认也是 block；自定义 content model 可以把 `img` 改成 mixed，但 content model 不能按单个节点动态变化。因此，知乎在同一标签上混用行内和块级语义，与这一模型存在结构性摩擦，而不只是样式缺失。参见 [RNRH 自定义 renderer 与 content model](https://meliorence.github.io/react-native-render-html/docs/guides/custom-renderers) 和 [RNRH 图片模型](https://meliorence.github.io/react-native-render-html/docs/content/images)。

Renderer V2 必须在规范化阶段就把两者拆成 `inlineFormula` 与 `blockFormula`，不能等到通用 `img` renderer 内再猜。

### 2. Android 文本装饰受底层能力限制

当前实现为知识点片段设置了 `textDecorationStyle: 'dashed'` 和独立的 `textDecorationColor`。React Native 文档将这两个属性标记为 iOS-only，因此 Android 上无法靠 RNRH 的 tag style 忠实还原。参见 [React Native Text Style Props](https://reactnative.dev/docs/next/text-style-props)。

这意味着换成另一个最终仍输出 React Native `Text` 的 HTML 库，问题大概率仍在。候选方案必须落到浏览器 CSS、Skia Paragraph 或 Android 原生 span 等真正不同的文字引擎上。

### 3. 真正超长正文需要虚拟化，不只是更快解析

详情正文当前位于 `ScrollView` 中。React Native 文档说明 `ScrollView` 会一次渲染全部子节点，而 `FlatList`/虚拟化列表只渲染可见区域附近的元素。参见 [React Native ScrollView](https://reactnative.dev/docs/scrollview)。

所以即使 HTML 解析更快，只要仍生成并挂载完整 RN View 树，超级长正文的布局时间、View 数量与峰值内存仍会增长。目前的 `long-image-heavy-001`（来自 `pig.json` 的 `content`）主要覆盖长图和混合媒体，不能代表真正的超长文本；测试集必须补一份数量级更高的纯文本/混合 block 样本。

## 目标内容模型

`ZhihuDocument` 是渲染器无关的中间层，初始覆盖：

- Block：`paragraph`、`heading`、`image`、`blockFormula`、`list`、`quote`、`code`、`video`、`linkCard`。
- InlineRun：`text`、`strong`、`emphasis`、`link`、`inlineFormula`、`segment`。
- 资源元数据：原始 URL、宽高、公式文本/图片、媒体类型和离线资源映射。
- 交互元数据：链接、图片预览、长按、知识点片段和文本选择所需的稳定 ID/range。

规范化层负责移除无用 wrapper、识别知乎私有 class/attribute、区分行内/块级公式，并为两个后端提供同一份语义。它也成为 fixture 测试的主要断言对象。

## 渲染后端

### A. 单 DOM/WebView：正确性优先

第一阶段优先实现一页最多一个、内部滚动的 WebView 文档渲染器。浏览器排版可以直接覆盖行内 SVG、CSS decoration、KaTeX、选择与复杂 inline flow，并作为后续原生实现的视觉基准。

约束：

- 不能为公式、段落或 block 创建多个 WebView。
- 不能沿用 `scrollEnabled={false}` + 持续测量整页高度的嵌套方案；正文滚动由单个 WebView 持有。
- KaTeX、CSS、字体和必要脚本随应用离线打包，不依赖 CDN。
- 清洗不可信 HTML：限制标签、属性和 URL protocol，移除脚本、事件属性与 `javascript:` URL。
- bridge 只保留必要事件：ready/error、滚动位置、链接、图片点击/长按、知识点片段、选择。
- 原生 header、Pager 与底部操作栏如何同 WebView 滚动协作，必须在回答页原型中验证，不能只测试孤立正文组件。

现有 `ZhihuDOMContent` 可以提供样式和事件处理参考，但其自动增高、禁用内部滚动的结构不是 V2 的最终方案。

### B. Block AST + FlashList：超长性能优先

第二阶段用 `ZhihuDocument.blocks` 驱动 FlashList，只挂载可见区域附近的 block。图片、视频、代码和块级公式拥有独立、可回收的 cell；段落内部仍保持连续 inline 排版，不能把每个文字 run 虚拟化。

段落引擎需要独立 PoC：

| 候选 | 优点 | 未决问题 |
| --- | --- | --- |
| React Native `Text` | 现有无障碍、选择和事件接入成本低 | Android 装饰样式、行内 SVG/附件能力不足 |
| Skia Paragraph | 文档提供 decoration color/style（包括 dashed）等排版能力 | 行内公式占位、选择、无障碍和链接命中需实测 |
| DOM paragraph | CSS 正确性最好 | 多 WebView 不可接受；需要证明能以单容器或其他方式复用 |
| Android/iOS 原生 span | 平台能力最直接 | 双端实现和维护成本最高 |

Skia Paragraph 目前只是候选；其 [官方文档](https://shopify.github.io/react-native-skia/docs/text/paragraph/) 能确认文本装饰能力，不能据此假定行内图片、选择和无障碍已经满足要求。

## 迁移阶段

### Phase A：基线与正确性 oracle

- [x] 集中 runtime、fixtures、工具和文档。
- [x] 建立 `pig.json`、`article-formula-heavy.json` 等稳定案例及结构/元数据断言。
- [x] 完成 Android Debug 真机网络与挂载基线。
- [ ] 新增真正超长文本、混合 inline、恶意 HTML、深层列表/引用案例。
- [ ] 为当前 RNRH 截取正确/错误表现，形成跨 Android/iOS 的视觉矩阵。

### Phase B：单 DOM/WebView 原型

- [ ] 定义 `ZhihuDocument` 与 HTML normalization 测试。
- [ ] 实现 HTML 清洗、离线资源和最小 bridge。
- [ ] 实现单 WebView 内部滚动，并与详情 header/Pager/操作栏集成。
- [ ] 用 feature flag 在回答和文章页对比 RNRH/V2。
- [ ] 在 Release 构建记录首屏、滚动、内存和 bridge 指标。

### Phase C：V2 接管默认渲染

- [ ] 修复 fixture 视觉和交互差异。
- [ ] 默认启用 DOM renderer，保留可观测的 RNRH fallback。
- [ ] 验证暗色模式、字体缩放、选择、链接、图片、视频和知识点片段。

### Phase D：超长正文虚拟化

- [ ] 实现 Block AST + FlashList renderer。
- [ ] 对段落引擎完成 RN Text / Skia / 原生方案 PoC。
- [ ] 为极长正文定义切换阈值或统一使用虚拟化后端。
- [ ] 验证跨 cell 选择、锚点定位、Pager 保活和媒体回收。

### Phase E：移除旧链路

- [ ] 两端 Release 数据满足验收阈值。
- [ ] fallback 统计证明 V2 覆盖实际内容。
- [ ] 删除 RNRH renderer、兼容转发与 `react-native-render-html` 依赖。

## 验收标准

正确性：

- `eeimg=1` 公式与相邻文字保持同一行，baseline 与行高可接受；`eeimg=2` 仍按块级公式展示。
- Android 能表现知识点片段约定的线型和独立颜色，或经过产品确认采用明确的跨端替代样式。
- 链接、图片点击/长按、视频、卡片、@ 提及、# 话题、文本选择、暗色模式和字号缩放通过 fixture 回归。
- 未支持节点有可观测 fallback，不能静默丢正文。

性能：

- WebView 路径每个详情页面最多一个 WebView，不通过高频高度消息驱动外层布局。
- 虚拟化路径不会一次挂载全部 block；真机滚动、峰值内存和退出回收均有 Release 数据。
- 同设备、同内容、同网络条件下，与当前 RNRH 基线比较中位数/P95，而不是只凭开发模式体感。

安全与维护：

- HTML 清洗、URL protocol、bridge 消息和导航行为有自动化测试。
- 两个 renderer 消费同一 `ZhihuDocument`，不各自复制一套知乎 HTML 猜测逻辑。
- fixture 与 manifest 能持续接收新的真实知乎内容，不把样本硬编码到运行时代码中。
