# Rich content rendering

这个目录集中维护知乎富文本渲染的运行时代码、设计记录、真实内容样本、分析工具和回归测试。业务页面只从本模块的 `index.ts` 导入渲染能力，避免实现、样本和验证逻辑散落在仓库各处。

对应 GitHub Issue：[#40](https://github.com/huamurui/zhihu-minus-minus/issues/40)，当前路线已按正文与[候选后端补充](https://github.com/huamurui/zhihu-minus-minus/issues/40#issuecomment-5595047992) 同步为原生 attributed text / Text Flow Island。详细决策与验收见 [Renderer V2 计划](./docs/renderer-v2-plan.md)。

中文正文排版的规则优先级、Tiqian 源码依据、当前后端的低成本改进与完整实现难度，见 [Tiqian 排版策略评估](./docs/tiqian-typography-strategies.md)。本轮已修正共享字号/行高关系，并建立 [tiqian-super-mini 功能原型](./docs/renderer-v2-experiment-03-native-flow.md)，可先逐项查看功能；性能验收后续推进。

## 目录

- `components/`：WebView/DOM，以及 tiqian-super-mini 的文字流/独立媒体 adapter；原生文字模块支持Android和iOS。
- `normalization/`：中立 HTML → `ZhihuDocument` 初步转换与危险节点/URL过滤。
- `docs/`：Renderer V2 架构、真机基准计划和阶段性结论。
- `fixtures/inbox/`：可以持续投递的脱敏知乎 API `.json` 样本。
- `fixtures/cases/`：已经登记精确期望值的稳定回归案例。
- `fixtures/manifest.json`：稳定案例的来源、特征、正文路径和结构/元数据断言。
- `tests/`：通过 Jest 运行的模型、属性/消息验证、fixture 和后端降级回归测试。
- `tools/`：内容复杂度分析和后续基准辅助工具。
- `types.ts`：当前正文和链接卡片组件的输入契约。
- `document.ts`：Renderer V2 的 `ZhihuDocument` / Block / InlineRun 语义类型。
- `richText.ts`、`compileRichText.ts`：连续文字流IR、媒体分界、范围样式、附件、装饰与选择source map。
- `tableLayout.ts`、`components/NativeTable.tsx`：表格占位网格、合并格、内容高度约束与横向滚动。
- `dev/prototypeCases.ts`：V2开发原型的合成内容。
- `documentTraversal.ts`：文档内容节点遍历和正文预览图片收集。
- `segmentHighlight.ts`：`highlight-wrap` 属性的局部规范化。
- `nativeInteractions.ts`：回答知识点与选区的完整身份、源范围/文本校验，以及不进入业务接口时的本地复制文本。
- `bridge.ts`：WebView 消息类型、文本选择结构与运行时字段验证。
- `queryPolicy.ts`：列表正文复用、统一查询 key 和 Pager 相邻预取策略。
- `structuredContent.ts`：原生 `structured_content` 的字段校验与 JSON → `ZhihuDocument` 映射，不经过 HTML/XML。
- `components/ZhihuStructuredContent.tsx`：结构化正文渲染器，供预览列表和开发对照按分段数据展开收起。
- `index.ts`：供应用层使用的稳定公共入口。

仓库根目录的 `components/ZhihuContent.tsx` 和 `components/ZhihuDOMContent.tsx` 仅保留兼容转发，不再包含实现。新代码统一使用：

```ts
import { ZhihuContent } from '@/features/rich-content';
```

## 类型与数据边界

`ZhihuContent` 接收 HTML 字符串、想法分段数组或已规范化的 `document`，共用正文后端、排版和互动。`ZhihuContentProps`、`LinkCardProps`、`RichContentObjectType` 从公共入口导出；`contentArray` 复用 `types/zhihu.ts` 的 `ZhihuContentSegment`，知识点元数据复用 `ZhihuSegmentInfo`、`ZhihuSegmentMark` 和 `ZhihuSegmentReaction`。单数 `RichContentObjectType` 表示正文对象，复数 `RichContentEntityType` 表示查询接口类型。

`structured_content` 使用 `types/zhihu.ts` 中的 `ZhihuStructuredContent` 类型，组件 `ZhihuStructuredContent` 直接消费 JSON 分段，覆盖 paragraph、heading、无序/有序 list_node、image、hr、card，以及 bold、link、entity_word、formula、seg_like。生产预览通过 `renderer="shared"` 把 `ZhihuDocument` 交给统一 `ZhihuContent`；开发对照保留 blocks/native-v2 两种研究模式。格式按范围端点拆分，互动标记保留完整范围；非 BMP 实样已验证 UTF-16 偏移，切开代理对的标记不启用。只有唯一真实 paragraph.pid 与准确 seg_like 范围可生成段落业务信息，不补造标题或列表段落 ID。

开发构建从“我的 → 富文本测试案例 → structured_content 渲染对照”进入独立测试页。五个主要案例来自用户附件的真实回答，保留全部 48 个分段、99 个 marks 和分页标志，覆盖列表公式、标题与重叠词条、密集公式与分隔、图片布局、段落与链接。身份文字按原长度替换，ID、业务链接和不透明上下文脱敏；正文图和公式图保留原公开 HTTPS 地址，运行时加载，仓库不新增下载图片。可以切换渲染器、展开收起分段、查看脱敏 JSON；额外合成案例演示本地续页追加。样本放在 `fixtures/inbox/structured-content/`，由 `dev/structuredCases.ts` 显式登记，案例切换不写持久设置、不调用正文或互动接口。

`normalizeZhihuDocument` 初步将HTML和知识点元数据转换为 `ZhihuDocument`，`normalizeZhihuContentSegments`处理想法的结构化text/image/link_card等分段，由 `compileZhihuDocument` 和 `native-v2` 后端消费。业务正文可通过持久设置选择该后端，开发页面也可显式覆盖。WebView 链路接收HTML，想法分段在同一 WebView 中保留文字、图片和卡片。该模型与知乎 API 原始 JSON 分开定义：

- `ZhihuBlock` 用 `type` 区分段落、标题、图片、块级公式、列表、引用、代码、视频、链接卡片、表格、分隔线和未支持结构。表格按表头、表体和表尾保留行/单元格，单元格支持对齐、合并跨度和嵌套 `blocks`。
- `ZhihuInlineRun` 覆盖文本、粗体、强调、下划线、删除线、高亮、上下标、行内代码、键盘输入、链接、行内图片/公式、脚注引用、两种知识点结构、换行和未支持结构。容器的 `children` 保留嵌套格式，列表项和引用的 `blocks` 保留块级嵌套。
- 节点具有稳定 `id`，文档和子节点数组只读。知乎 `data-pid` 单独存为 `paragraphId`，知识点 `range` 按 UTF-16 文本偏移使用半开区间 `[start, end)`。
- 图片/视频资源保存 URL、可选原始 URL、尺寸、MIME 类型和离线 URI。公式必须提供 LaTeX 或图片，`inlineFormula` 与 `blockFormula` 分开建模。
- 链接的 `kind` 保留普通链接、@ 提及和 # 话题语义；图片的 `role` 区分正文图与日报作者头像，可选 `layout` 保留结构化正文的 normal/small 布局。
- `unsupported` 保留来源类型和纯文本 fallback，便于后续规范化测试识别遗漏；不把任意字符串并入 `type` 联合。
- 脚注定义只存于 `document.footnotes`，行内 `footnoteReference.definitionId` 指向定义的节点 ID。展示编号 `label` 与节点 ID 分开，允许多次引用同一定义。

Block AST 表达内容语义，不规定逐段 cell 或 FlashList 布局。`compileZhihuDocument` 已将连续的标题、段落、简单引用/列表编成共享UTF-16 buffer，并输出text/paragraph spans、独立decoration、inline attachment和source map。媒体/表格形成flow边界；同一flow可跨段选择，跨媒体选择尚未实现。`mapRichTextSelection` 把flow全局范围映回段落源位置，生成换行/列表符号不推进源偏移，U+FFFC复制时替换为语义文本。

行内公式还须与宿主容器中的相邻文字保持连续，不能只检查节点类型。列表、引用和裸div/root中的混合文本与公式现已一起进入段落，避免短公式虽标为inline却被单独包成paragraph。Android公式附件统一使用正文前景色；普通图片保持原色，识别出的浅色公式底板先转为前景alpha mask。该着色策略不保留彩色公式的分色语义。

模型补充参考了 Zhihu++ 的 Kotlin Markdown AST、图片画廊和知识点高亮处理，映射与规范化约定见 [Markdown 参考记录](./docs/markdown-reference.md)。`segment` 对应接口 `segment_infos` 的范围标记；`segmentHighlight` 对应 HTML `highlight-wrap` 的划线；普通 `highlight` 对应 `mark` 的背景高亮。高亮业务元数据可缺省，缺少交互目标或位置时仍保留视觉结构，不用空 ID 或 0 偏移补造提交数据。跨段 `displayText` 用于菜单/复制，不替代本段偏移坐标系。

最小文档示例：

```ts
import type { ZhihuDocument } from '@/features/rich-content';

const document = {
  id: 'answer:example',
  blocks: [
    {
      id: 'paragraph:one',
      type: 'paragraph',
      paragraphId: 'one',
      children: [
        { id: 'text:one', type: 'text', text: '公式：' },
        {
          id: 'formula:one',
          type: 'inlineFormula',
          formula: { latex: 'E = mc^2' },
        },
      ],
    },
  ],
} satisfies ZhihuDocument;
```

`walkZhihuDocument(document)` 按前序遍历内容块和行内节点，覆盖列表、引用、表格单元格、图注和末尾脚注定义。它使用显式栈，不沿脚注引用重复遍历定义；文档、列表项、表格行/单元格、脚注定义等结构容器本身不被返回。

`getZhihuDocumentPreviewImages(document)` 从该遍历中收集块图和行内图，按规范后的 HTTP(S) URL 去重并保留首次出现顺序。头像、公式图、视频封面、卡片缩略图和非 HTTP(S) URL 不进入正文画廊；`//` URL 规范为 HTTPS，输出只保留资源模型中的字段。

`parseZhihuSegmentHighlight(attributes)` 验证 `highlight-wrap` 的字段并投影为 `ZhihuSegmentHighlightMetadata`；未识别 wrapper 返回 `null`，已识别但没有有效元数据返回 `{}`。计数、布尔值和完整业务目标分别验证；位置仅校验非负安全整数以及 `start < end`，段落边界与文本对应仍需后续 normalization 校验。非法字段被省略，`displayText` 保留原始空白。这个函数只处理已提取的属性，不负责 HTML 解析或业务请求。

类型声明不等于 HTML 清洗或 URL 安全验证；V2 normalization对节点、范围、资源和未支持结构做初步验证，完整知乎dialect仍需后续扩充。当前 `linkCardInfo` / `cardInfo` 属于外部数据边界，字段使用前按 `unknown` 验证，不能直接视为 `ZhihuLinkCardBlock`。

现有 WebView bridge 的 `RichContentBridgeMessage` 覆盖高度、图片点击/长按、链接、知识点和文本选择。消息先解码为 `unknown`，通过 `parseRichContentBridgeMessage` 验证字段后再派发；无效 JSON、未知消息和错误字段被忽略，不记录原始消息。选择范围使用 DOM 文本的 UTF-16 偏移，跨段落时起止 offset 分别属于各自段落。

WebView 正文在 JS 侧经过 HTML 标签、属性、URL 和内联样式白名单；正文和元数据嵌入脚本时另行转义 HTML 分隔符。脚注元数据按文本构造 DOM，卡片描述通过 inert template 提取文本。桥接图片/链接再次验证 URL，页面导航交给宿主处理，避免内容链接替换渲染页。DOM Range 同时处理文字节点与元素子节点边界的选区，跨出真实段落的选区会清除业务选择。KaTeX 脚本、CSS 与 WOFF2 字体由已安装的锁定依赖生成并随应用打包，WebView 公式不再依赖 CDN；公式渲染失败时，正文文字、交互和高度初始化仍继续。正文色和链接色由共享 runtime palette 解析，读取阅读背景与对比度偏好。合成安全回归见 `fixtures/cases/webview-untrusted-content-001.json`，不代表完整浏览器 CSS 或任意嵌入内容支持。

该bridge仍仅服务WebView。独立Android/iOS模块提供带flowId/textVersion的选择、高度和action事件，JS校验当前IR身份后派发；滚动/ready/error协议尚未完整。`ZhihuContent` 默认读取正文后端设置，新安装默认采用 tiqian-super-mini，显式 `renderer` 优先于用户偏好。

Enriched组件、专属dialect normalizer、相关测试、依赖和native patch已于2026-09-30正式移除；[实验01](./docs/renderer-v2-experiment-01-enriched-html.md)仅保留历史研究，不再提供运行入口或fallback。tiqian-super-mini在Android/iOS以外的平台或模块未包含的客户端回退到 WebView。

通常使用 `ZhihuContent` 让正文遵循持久偏好；需要固定后端时可显式传入 `renderer="native-v2"`。该外壳已经封装完整 WebView fallback及图片/链接交互；JSON 文档只在选择 WebView 或缺少原生模块时安全序列化，经过原有清洗及 DOM bridge。字面公式分隔符不被再次当作公式解析，选区只使用文字坐标稳定的真实段落。直接使用 `ZhihuNativeContent` 时必须提供 `renderFallback: () => React.ReactNode`；开发研究模式可提供独立 JSON 分段组件。首次native测量使用同排版骨架或宿主placeholder。模块本身无需反向依赖外壳。

## 正文视频播放

HTML `video` / `source`、`video-box` 和想法 `video` 分段保留安全封面，中央显示“播放视频”，点击进入应用内原生播放器。封面优先读取 `poster`、视频卡片子图的懒加载地址或想法 `thumbnail`；没有封面时保留文字播放入口。`data-lens-id` 与想法 `video_id` / `video_bo_id` 保存为 `lensId`，优先于可能不同的 `zvideo` 页面 ID；知乎 `/video/<id>` 同样是 Lens ID，`/zvideo/<id>` 则先读取视频详情中的播放身份。播放器按 Lens API 返回的 playlist 选择实际资源。

原生和 WebView 正文共用 `utils/zhihuVideoRoute.ts`。直接媒体资源仅接受 HTTP(S) MP4、HLS 等地址；缺少有效身份或资源时显示“视频不可用”。WebView 清洗把原始视频标签改成带封面的应用链接，不加载视频网页或 iframe。视频封面不进入图片预览、正文画廊或图片长按菜单。合成回归 `video-playback-001` 由 inbox 结构检查后登记，所有 ID 和资源地址均为合成数据，不包含签名资源。

## 真实正文的启用入口

该后端于2026-10-01按用户选择命名为 `tiqian-super-mini`（原称Native V2）。设置与开发页面使用新名字；公共 `renderer` 值及持久偏好仍为 `native-v2`，已有选择无需迁移。文字布局继续使用Android TextView和iOS TextKit，Tiqian规则研究仍见相关文档。

“设置 → 外观与阅读 → 正文排版”提供 tiqian-super-mini（默认）和网页排版（WebView）；“功能开关 → 正文排版”进入同一页面。settings version 15 将旧 `rnrh` 或未设置的偏好迁移为 `native-v2`，保留显式 WebView 偏好和旧 `useWebView=true`。缺少模块或不支持的平台按本次渲染回退 WebView，不改写保存的偏好。RNRH 组件、依赖与运行入口已删除，历史实验记录中的 RNRH 仅供参考。

信息流外层的 `FeedExcerpt` 按用户决定单独保留原有React Native `Text`摘要，不进入tiqian-super-mini。长按预览在获取数据和正文首测期间可保留现有摘要placeholder，完成后显示所选正文后端；这不是独立的native摘要渲染入口。

`ZhihuContent` 的 `onLayoutReady` 用于正文首次布局就绪通知。Native后端在实际容器宽度和所有顶层flow的当前布局高度均确认后通知；回答详情据此确认正文尺寸。内容阅读进度记录与恢复目前由 `constants/readingProgress.ts` 统一关闭，历史数据保留。单纯知识点/反应元数据更新可沿用几何一致的已验证高度，避免正文再次退回占位。保留的阅读恢复逻辑要求正文就绪并获得有效的最终尺寸，不能把数据已返回或短placeholder高度当作最终正文，持久数据格式不变。

`renderPlaceholder(phase)` 区分当前原生布局等待：`container-layout` 表示尚未确认实际容器宽度，`text-layout` 表示宽度已确认、等待文字布局高度，`content-layout` 表示没有顶层文字流、等待正文内容层布局。原有不接收参数的占位回调仍可使用。回答详情分别显示“正在确认正文宽度…”“正在排版文字…”“正在布局正文内容…”；只有缺少回答数据并等待查询时显示“正在获取回答…”，已有数据的后台刷新不进入该提示。短文本同样需要首测；已有宽度 hint 时文字测量可与宽度确认并行，因此这些类别表示当前未满足的显示条件，不是严格串行的耗时阶段。同步解析/编译没有独立占位阶段，内容布局也不代表等待图片下载。

回答的原生布局提示在连续等待 120ms 后才显示，宽度、文字和内容层阶段切换共用这次计时；等待期间保留占位空间。正文就绪立即替换占位，没有最短提示展示时间。缺数据的查询提示立即显示，进入新的布局等待时重新计时；短等待结束或离页会取消计时器。这只减少提示闪烁，不改变正文布局放行条件或实际计算耗时。

原生正文不再按屏幕宽度猜测容器宽度。规范化和编译提前执行，实际宽度可用后才挂载文字流和媒体；固定宽度宿主可传入 `initialContentWidth`（扣除自身左右 padding 后的准确宽度），首次 `onLayout` 仍会验证并纠正。外壳缓存实测宽度供后续正文候选初始化，窗口宽度变化后不使用旧缓存。没有顶层 flow 的纯媒体、表格或空正文，须同时确认容器宽度和已挂载内容层的实际布局才通知就绪；已测量旧正文的替换与过期事件校验继续保留。

同一对象正文再次返回时，已测量的正文和高度保留可见，新正文在隐藏层完成当前宽度与所有顶层flow测量后直接替换，不重复显示首次加载占位。等价的想法分段数组也复用原有正文。等待替换时停用旧正文的选择与业务动作，过期候选不会覆盖更新版本；更换对象仍独立走首载流程。详情页回答ID列表到达时保持React Pager与当前正文实例，按回答ID保持当前页。实现与验证边界见[二次加载记录](./docs/renderer-v2-experiment-03-native-flow.md#2026-10-01正文二次加载与-ci-类型修复)。

原生回答在正文就绪提交后主动测量ScrollView的内容View，将实际总高与当前正文来源配对；同高度替换也能重新测量，不再依赖必然产生新的contentSize事件。来源、聚焦状态或测量请求变化时拒绝旧结果，首载placeholder不能认证正文高度。关闭阅读进度期间，这些测量仍供自绘滚动条使用，不触发自动滚动或存储读写。普通后端继续使用原有contentSize路径，持久数据格式不变。

真实回答中的知识点业务菜单接受两类精确验证的标记：当前 `segment_infos` 的段落ID、范围、源切片文本和现有reaction IDs均匹配；或者HTML `highlight-wrap`具有完整当前回答target、反应/片段ID和位置，且包裹内容对应唯一源段落。API或HTML中明确跨段、不完整或其他对象类型的标记仅提供本地复制与安全来源链接；跨段显示文本只在target和片段ID集合一致时用于本地复制。文章、想法和问题不调用回答专属reaction接口。

tiqian-super-mini选区已接回回答的既有业务菜单，但仅开放可逐片验证源映射的普通正文/引用及相邻段落。必须具有唯一真实段落ID，若存在API段落文本也须全文一致；含附件、br、脚注、标题/列表、缺失或重复段落ID等情况保留系统选择和复制，不补造业务范围。业务动作的存在不代表已在本轮真机验证中提交API操作。

反应接口保留完整片段ID集合，并安全解析服务端新建segId。回答段评链接携带原始片段文本和完整段落/范围，当前评论页的根评论和直接回复才使用段评接口；旧链接缺少这些字段时仍可阅读，需重新选择原文后发段评。独立replies页沿用原有comment-ID回复流程，本轮未扩展。

真实知乎格式的补齐以中立文档模型、WebView实现及稳定fixtures为依据，具体覆盖与剩余边界见 [存量案例审计](./docs/renderer-v2-experiment-03-native-flow.md#存量知乎格式审计)。合成演示与真实API格式分别验证，不能仅凭页面中出现“脚注”或“卡片”就认定已覆盖知乎的属性和元数据格式。

## 常用命令

```bash
npm run analyze:rich-content
npm run analyze:rich-content:inbox
npm test -- features/rich-content/tests --runInBand
node features/rich-content/tools/benchmark-normalization.mjs
node features/rich-content/tools/benchmark-flow-layout.mjs
```

第一个分析命令校验 manifest 中的稳定案例；带 `inbox` 的命令递归扫描新投递文件，只输出结构统计，不要求先维护 manifest。对于完整知乎 API JSON，案例通过 `contentPath` 选择正文，同时可以用 `expectedMetadata` 覆盖作者、问题、徽章、反应、权限、截断状态、@ 提及和 # 话题等正文之外或 HTML 属性之外的行为输入。

两个桌面基准先断言新旧结果一致，再测量中位数；规范化基准隔离知识点切片，布局基准隔离度量身份计算。首载优化与平台验证范围见[专项记录](./docs/optimizations-2026-10-01.md#2026-10-08-首载准备)，这些数字不能替代 Release 真机首屏时间。

## 开发构建案例页

开发构建可从“我的 → 富文本测试案例（开发）”打开案例列表，再进入“tiqian-super-mini 原型”。原型使用六组合成内容，提供tiqian-super-mini、WebView 两后端对照、字号/行高/排版和装饰调节、源选区面板与本地知识点菜单，不提交业务操作。稳定fixture页读取 `fixtures/manifest.json`，也可切换这两个后端；这些切换仅影响当前案例，不写入生产正文偏好。正文交互默认关闭，临时打开后需注意样本可能保留真实对象ID。

开发deeplink可用 `zhihu--:///dev/rich-content/prototype?caseId=attachments` 选择合成案例；caseId只接受页面六个已知标识，忽略无效值，不接受URL中的任意HTML。iOS CLI模拟器命令见 [开发指南](../../docs/DEVELOPMENT.md)。

两个后端统一经过 `ZhihuContent` 的交互外壳，复用站内/站外链接分流、内容宽度、图片预览及共享排版指标。Android/iOS V2模块直接消费IR，初步支持选择事件、自定义装饰和行内附件；完整附件几何和无障碍映射仍需后续验收。tiqian-super-mini需要重新生成并编译development build，不能运行于Expo Go；模块缺失时可继续用 WebView 查看内容。

本轮Android V2已完成prebuild、arm64 Debug构建及vivo真机功能查看；Enriched移除前后的验证记录与未验证项见 [实验03](./docs/renderer-v2-experiment-03-native-flow.md)。iOS新增UIKit/TextKit初步adapter，其构建与平台验证另行记录；尚无双端Release验证。Tiqian保留为[历史集成草案](./docs/renderer-v2-experiment-02-tiqian.md)，是否需要接入取决于后续系统布局能力的实际缺口。

稳定案例列表只展示已经登记到 `fixtures/cases/` 与 manifest 的样本；Metro 的 fixture context 会自动发现新增登记文件。独立的 structured_content 对照页使用 `dev/structuredCases.ts` 明确选取的 inbox 样本，不扫描任意附件。生产构建不显示入口，直接访问 `/dev/*` 也会被重定向到首页。

## 当前范围

项目已经完成测试集集中、Android Debug 基线、正文复用和 Pager 相邻预取，并新增中立normalization、Rich Text IR、Android文字流功能原型及初步iOS UIKit/TextKit adapter。Enriched运行链路已正式删除，tiqian-super-mini已提供真实正文的用户可选入口。双端完整平台验收、完整知乎覆盖、跨媒体选择、媒体生命周期与Release对照仍待完成，新安装默认采用 tiqian-super-mini。

真机试用后优先推进tiqian-super-mini。tiqian-super-mini 为默认正文后端；WebView 保留为用户可选后端、缺模块 fallback 及开发对照。

下一阶段按 [Renderer V2 迁移计划](./docs/renderer-v2-plan.md) 推进：

1. 先根据Android真机反馈完善选择、装饰线、行内附件、知识点和媒体交互。
2. 扩充现有 `ZhihuDocument` normalization、Rich Text IR与source map的真实内容覆盖。
3. 验证并完善tiqian-super-mini的iOS adapter与双端一致性；仅在系统布局存在明确缺口时再评估Tiqian接入。
4. 已补充密集样式样本及原生附件 viewport 预取/释放实现；后续完成 Release 混合媒体生命周期验收和纯文本上限矩阵，文本分段/虚拟化由 [Release 基准](./docs/benchmark-plan.md) 决定。
5. 完成双端 Release 验收，持续检查默认后端与 WebView fallback。

RNRH 已删除；WebView 保留为可选后端和 fallback。桌面微基准、已有 Debug 数据和第三方实践不能代替本仓 native backend 的真机验收。

## 2026-10-01 优化与离线资源

`flowLayout.ts` 以端点扫描计算有效度量样式，保持 span 原顺序、重复样式及相邻等价区间的身份；不因 paint/action 更新重复测量。密集合成样本、可复现桌面测量、资源包成本及双端附件生命周期边界见 [专项记录](./docs/optimizations-2026-10-01.md)。

`npm run generate:rich-content:katex` 从安装的 KaTeX 生成 `assets/katex-style.json` 与 `assets/katex-runtime.json`，`postinstall` 自动执行；`node features/rich-content/tools/bundle-katex.mjs --check` 可检查资源是否与当前锁定包一致。资源包含 MIT license，CSS 与 runtime 分包以避免旧 DOM 公式组件重复携带不使用的 auto-render 脚本。更换 KaTeX 时必须同步锁文件与生成资源。

## 2026-10-05 静态审查

本轮仅做静态审查与自动检查，不运行模拟器。移除 RNRH 后，正文只保留 tiqian-super-mini 和 WebView，想法的 WebView fallback 使用一个正文视图。WebView 首载占位不再挂载覆盖正文的触摸层；高度按正文自身测量，正文滚动交给宿主，宽表格保留内部横向滚动。Android 引用线与选择焦点相关修正及未验证边界见实验03的本轮记录。真机触摸、选择和性能仍需后续验证。

本轮另评估并择取本地 `paragraph-layout audit before dual-format planning (2026-10-02)` stash（`c337ed3`）的修复。列表项与多段脚注的编号由首次文字段落消费一次，图片等媒体不会提前清空编号；嵌套列表先出现时，未消费的父项编号先单独展示，生成前缀不推进真实正文源偏移。相邻列表项采用共享列表段距，项内多段、列表结束及项尾媒体前保留正文段距；合成案例 `paragraph-list-layout-001` 覆盖引用、首部图片和嵌套列表。

WebView 的 `selectable` 在加载前后及运行中通过脚本同步，关闭时清空选区并拒绝迟到的选择事件；切换不替换 HTML source。共享 `Themed.Text` 的行高随字号同比例缩放，宿主只传未缩放的字号与行高，避免详情标题、导航和关注按钮重复缩放。

stash 的高度测量优化已被本轮 WebView 修复覆盖，RNRH 专属组件、交互工具和测试不再适用；原 stash 保留。此次补充仅修改 JS/TS 与合成 fixture，未改变原生模块或配置；自动检查不替代双端触摸、选择和实际排版验证。

## 回答预览列表

问题详情的回答列表在点击时同时准备普通详情与预览首卡缓存。普通详情仅复用完整、非付费且未截断的正文，保留段落互动、链接卡片及作者等原始字段；已有详情缓存不被列表覆盖。列表种子标为过期，以便先显示正文、后台补齐详情元数据；游客接口生成的摘要 HTML 不作为完整正文。

回答阅读方式与正文后端分开设置：前者决定点击普通卡片后的入口，后者决定详情及预览展开正文的排版。预览首卡使用点击列表已有的 `content`，固定展开走普通 `ZhihuContent`，保留实际段落和卡片元数据；缺正文时复用普通详情缓存或原 `getAnswer`。首卡缓存按会话隔离且只在点击时写入，部分或付费正文不作为完整详情；首卡始终展示全部可用正文并开放完整交互，不提供收起按钮。v2 单回答请求因用户反馈服务端 `40362` 已停用，具体记录见仓库 next-render 文档。首卡固定在第一项，后续流使用 `/next-render` 并按回答 ID 去重。两者分别重试，后续流失败不阻塞首卡阅读，下拉刷新同时刷新两者。后续正文直接消费新接口的 `structured_content`，与详情共用 `ZhihuContent` 的后端选择、字号行距、段落互动、选字、图片图库/长按和链接。展开收起按真实 segments 进行，正文续页与外层回答列表分别管理。展开时读取第一续页，再按可见正文末尾距离自动续取，正常模式不显示加载更多正文按钮。自动续页限制单请求并按帧测量，远离正文末尾或收起时暂停；错误时保留手动重试。后续生产卡片的展开/收起按钮位于右下角、操作栏上方；只有问题来源把同一问题的信息集中在列表头；其他来源可包含不同问题，每张卡片显示各自问题。初始 next-render 始终使用所选回答 ID 和 `type=answer`，按入口区分 `unknown`、`recommend`、`profile_answer`、`question_feed`，仅后者附带问题流参数。预览卡片底部与普通 Feed 卡片共用赞同、评论和更多按钮的图标尺寸及布局，赞同和评论靠左排列，更多靠右；预览卡片在赞同旁提供同尺寸的反对按钮。长回答展开阅读时提供赞同、评论与更多的悬浮栏，后续卡片还可在悬浮栏收起正文，首卡不允许收起；卡片操作栏可见时隐藏。未知或损坏的附加标记保留原文，未知块有明确文字时保留其文字；真正缺失正文或请求失败提供重试，不把缺失正文标为已完成。正常渲染不显示进入详情按钮，请求失败仍保留详情入口。开发对照保留页面内的渲染与展开设置，不写入生产阅读方式。

用户后续提供的成功响应包含 `seg_like` 段落互动标记。`count` 对应共享 `like_count`，其余点赞/评论状态和片段 ID 按实际字段保留。业务动作要求唯一真实 PID、准确原文范围、有效片段 ID；重复 PID、交叉范围、跨段反应和混合公式保留正文与复制，不猜测业务坐标。完整正文先校验身份再切片，隐藏分段中的重复 PID 也不会被误启用。WebView 精确片段事件携带内部节点 ID，仍通过相同业务校验；选区继续按真实整段计算偏移。普通首卡互动成功刷新原回答接口；后续卡片刷新当前回答已加载的正文续页和后续流来源。脱敏回归 `next-render-seg-like-001` 保留 5 个回答、39 个段落及 UTF-16 范围，开发页不调用互动接口。

收藏来源的脱敏响应 `next-render-collection-card-ordered-001` 覆盖跨问题的 5 条回答。正文 card 使用共享 linkCard，保留标题、封面及安全链接；有序列表与原生编号、WebView ol 共用相同文档语义。未知卡片业务元数据不影响正文，链接不安全或缺失时保留文字。
