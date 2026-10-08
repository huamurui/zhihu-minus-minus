# ZhihuRichText 原生文字模块

`tiqian-super-mini`（原称Native V2）的独立 Expo native view。业务入口由 `features/rich-content` 管理；本模块只接收序列化后的 `RichTextFlow`，不解析 HTML、不访问登录状态。内部模块名与 `native-v2` renderer值保持兼容。

## Android 实现

- 一个 flow 对应一个 Android `TextView` 和一份 UTF-16 `Spannable`，段落分隔符、附件占位符均保留原始 offset。系统长按选择可以跨越这个 flow 内的段落。
- Expo 的属性 setter 先暂存输入，`OnViewDidUpdateProps` 在同一事务中统一提交，正文、配置和宽度只触发一次全文构建。仅 `layoutKey` 或 `selectable` 变化不重建 span；高度任务同时校验提交版本，拒绝旧属性批次的测量。
- 粗体、斜体、下划线、删除线、背景高亮、上下标、等宽代码、链接，以及标题、引用线、列表缩进和段距。
- 根据 Android `Layout` 的实际视觉行绘制实线、虚线、点线和波浪线；软换行不会复用下一行的首个 caret 作为上一行终点。
- `ReplacementSpan` 表示 `U+FFFC` 附件。异步读取图片、HTTP(S) SVG 和 `data:image/…`，解析 SVG 根节点的 `ex`/`em` 尺寸与 `vertical-align`；同一动画帧完成的资源统一回填、保留选区并重新测量。
- 行高是最小值，附件较高时保留其完整 ascent/descent；宽度按容器上限缩小。系统复制会把已选中的附件占位符替换为 `copyText`。
- 统一字号、最小行高和段距；Android 高质量换行及可选系统双齐。没有通过插入空格或改变正文内容模拟中西文间距。
- Android 段后间距由 `LineHeightSpan` 加入末行 descent。引用竖线以 `Layout` 的完整行结束位置识别末行，并扣除引用外部的段距；绘制回调的可见文字 end 会省略换行和末尾空白，不能用来判断段落结束。相邻引用段落之间的线仍保持连续。
- 不使用 `LinkMovementMethod`。普通点击分发链接、知识点或附件 action；长按仍交给系统选择，附件可附加 `attachmentLongPress` 事件。
- 公式使用独立Paint，以当前 `textColor` 的SRC_IN滤镜绘制前景；普通图片保持原色。公式若在四个5%内缩角落中至少三个为近白不透明像素，加载时先转为灰度alpha mask去除浅底，避免底板和文字同时被染白。尺寸、基线和分类保持不变。
- 解码资源按kind、URL、尺寸、字号/系统缩放及容器宽度保留在进程LRU中，以bitmap.byteCount计数，缓存上限24MB。缓存保留未染主题色的glyph/mask，主题切换在绘制时着色；kind防止普通图复用公式mask。重新挂载的文字流可直接使用已缓存几何；资源失败不阻塞正文首测，也不输出资源URL。
- 附件加载由全进程共享的两个worker执行，空闲30秒后回收线程；相同资源key的进行中请求共享一次下载和解码。缓存检查与请求登记使用同一把锁，避免刚完成的资源再次下载。每个view只取消自己的订阅，最后一个订阅退出才取消底层任务；旧请求的迟到结果不能覆盖同key的新请求，generation 与 viewport revision 保护按帧回填，低内存/trim 回调清理进程缓存。

属性批量提交、附件并发、去重、取消和重试，以及引用末行边界与竖线裁剪的纯JVM回归位于 `android/src/test/`，生成工程后在项目 `android/` 目录运行 `./gradlew :zhihu-rich-text:testDebugUnitTest`。这些测试不请求真实图源，不替代Android布局与附件的视觉验收。

## iOS 初步实现

2026-10-01新增UIKit/TextKit系统后端：Expo Apple模块注册 `ZhihuRichTextModule`，与Android共用 `ZhihuRichText` 模块名和JS桥。

- 连续flow直接转为 `NSAttributedString` 与一个不可编辑、内部不滚动的 `UITextView`，文字Insets和lineFragmentPadding为0，由外层正文宿主滚动。
- 范围字体/颜色、高亮、上下标、代码、链接与段落标题、间距、引用、列表缩进使用TextKit 1。装饰线依据视觉行与enclosing rect绘制实线、虚线、点线和波浪线。
- `UIFontMetrics` 的body缩放比例统一应用到字号、行高、段距、标题、装饰与附件；`ex`/`em`尺寸使用已经缩放的字体，不再乘一次比例。
- `NSTextAttachment`表示单个 `U+FFFC`。系统复制使用共享flow范围，并将真实附件替换为 `copyText`；拒绝越界、非整数、boolean偏移和拆分surrogate pair的范围。
- SVG根节点支持 `ex`/`em`、`px`/`pt`、viewBox与vertical-align；仅显式提供宽或高时保持intrinsic比例，基线随fit缩放。SVG使用 `SDWebImageSVGCoder@1.7.0` 的Retina raster路径，普通图片使用ImageIO thumbnail，实际bitmap边长上限2048px。
- 附件以匿名ephemeral session加载，data图片和HTTP(S)资源均限4MiB；进程NSCache限24MB/128条，按图源哈希、kind与几何缓存并合并重复请求。缓存不含主题色，公式转为当前正文色，近白底先去底为alpha mask；普通图片保持原色。
- 点击由当前TextKit glyph范围分发链接、知识点和附件事件；已有选区时不派发普通点击，长按仍保留系统选择。父ScrollView与系统选区拖柄的手势组合需平台交互验收。
- 高度事件核对当前flow/version/layoutKey和generation，布局key变化后重测；附件更新保留选区，旧文档加载及过期测量不会回填新正文。

HTML语义、媒体分界与业务范围校验仍在共享JS层。iOS附件使用podspec声明的 `SDWebImageSVGCoder`，不依赖已移除的Enriched。

iOS完整Simulator app已在iOS27 SDK、deployment target15.1下构建通过；平台显示和交互验证分别记录，不能将Android真机结果视为iOS已验收。详情见[本轮记录](../../features/rich-content/docs/renderer-v2-experiment-03-native-flow.md#2026-10-01初步-ios-原生文字流)。

## Props 与事件

`flowJson` 使用 `features/rich-content/richText.ts` 的 `RichTextFlow` 布局字段（id、textVersion、text、spans、paragraphs、decorations、attachments）；sourceMap 保留在 JS 中进行业务选区映射，不随每个原生 view 的 JSON 重复传输。双端原生会跳过越界、非整数、字符串/boolean 偏移与拆分 surrogate pair 的 range，以及非单字符或没有 `U+FFFC` 的附件范围。Android 不再使用会强制转换/截断数值的 optInt 解析 range；系统选区与复制使用相同校验。标题优先使用 compiler 输出的 `fontSize`、`lineHeight` 和段落上下边距，与其他后端共享指标；旧 flow 缺少字号/行高时保留基础默认值。

`configJson` 支持 `fontSize`、`lineHeight`、`paragraphSpacing`、`textColor`、`secondaryColor`、`linkColor`、`justify` 和 `textAlign`（left/center/right）。尺寸按React Native布局单位传入：Android为dp，iOS为pt。文本、段距和附件应用各自系统字体缩放；`contentWidth`不乘字体缩放。`selectable` 控制系统选择。

JS props还必须提供 `layoutKey`，代表本次字体/宽度/配置输入。更新key会调度重测；高度去重包含key，原生posted measurement会核对当前key和generation，避免旧测量覆盖新布局。宿主应使用紧凑稳定key，不把整篇flow JSON重复塞入事件。

事件均附带 `flowId`、`textVersion`：

| 事件 | 额外字段 |
| --- | --- |
| `onSelectionChange` | `start`、`end`，UTF-16 offset；清除或折叠选择均为 `-1` |
| `onHeightChange` | `layoutKey`、`height`，Android dp / iOS pt；相同flow/version/layoutKey/height去重 |
| `onAction` | `kind`、`id`、`start`、`end`、可选 `url` |

JS 通过 `isRichTextNativeAvailable()` 探测原生模块；`RichTextNativeView` 在Android与iOS延迟加载。Web及其他平台、未包含该模块或view加载失败的客户端，由上层选择fallback。已有安装包需要重新prebuild、安装对应原生依赖并编译；Fast Refresh和Expo Go无法添加此模块。

信息流外层 `FeedExcerpt` 保留原有React Native `Text`，不调用此模块。正文预览宿主可在数据获取及首测期间保留其现有摘要placeholder。

## 当前边界

- 系统选择上下文限于一个 flow。块级图片、表格、卡片、视频等由上层插入，会形成 flow 的边界。
- Android混合方向文本的装饰线使用每行的起止caret，尚未分解所有bidi visual runs；iOS使用TextKit的enclosing rect，完整双向文字仍需平台用例验收。
- 没有 URL 的 LaTeX 显示公式占位符；不在本模块内运行 TeX 排版引擎。资源失败保留占位符，不记录资源 URL 或异常内容。
- SVG 只对根节点尺寸和 `vertical-align` 做基础解析；不实现浏览器 CSS cascade、DOM 选择、分页或完整 Tiqian 排版求解。
- 公式统一前景色是单色阅读策略，不保留彩色公式的分色语义；浅底检测是像素启发式，不是任意SVG背景结构识别。
- 标点压缩、悬挂、中西文独立空间预算尚未实现。双齐和禁则依赖各平台系统文字布局行为，需在目标设备查看实际效果。
- 附件网络请求不携带应用Cookie、签名或认证配置，不输出请求日志；请求超时为8秒，iOS整个资源另限12秒，单资源上限4MiB。iOS SVG解析拒绝DTD/entity、脚本、foreignObject与外部href/CSS URL，只保留本地引用及image data；这不是完整浏览器CSS或任意SVG兼容承诺。
- 首载的可见性、骨架和预览动画由正文宿主管理。首测不等待所有附件请求；未知intrinsic尺寸加载后仍可能必要重排，缓存和按帧更新不等于完整布局已经一次完成。

2026-09-30：Android `assembleDebug`及vivo原型功能查看通过。2026-10-01：首载处理与短公式结构修复完成构建和真机确认。公式前景着色的mask边界及65,536组alpha/gray不变量通过纯Kotlin验证，匿名Ax=b图源为currentColor、无rect/image；最终Android prebuild和arm64 Debug构建通过（约10秒），新版APK更新安装后用户明确确认暗色公式修复。普通图片不着色由回归及native kind guard验证，未宣称所有图源已逐项真机检查。全仓检查及完整边界见[本轮记录](../../features/rich-content/docs/renderer-v2-experiment-03-native-flow.md)，未量化首载白闪，未验收Release性能或跨设备一致性；新增iOS实现的编译与平台验证另行记录。

iOS纯Foundation模型可用 `bash modules/zhihu-rich-text/tests/run-model-smoke.sh` 验证，28项实际Swift模型/viewport断言已通过；JS平台可用性回归9项通过。这些检查不代替UIKit编译或模拟器/真机交互。

## 附件 viewport 生命周期

双端保留完整连续文字流，通过外层滚动宿主的可见范围，预取 viewport 上下各一屏内的附件。Android 在附着期间监听 ViewTreeObserver pre-draw；iOS 观察祖先 UIScrollView 的 contentOffset/bounds/contentSize，脱离 window 时注销观察。离屏、卸载及进入后台取消本 view 的订阅、释放 span/attachment 图像引用，不改动 text/range/已测尺寸；重入时按原资源 key 从共享缓存或加载器恢复。资源完成时同时核对文档 generation 和可见性 revision，防止离屏后再入场的旧回调回填。

24 MiB 进程缓存仍可保留离屏资源以避免重复解码，Android 遇内存压力显式清缓存，iOS 使用 NSCache。该策略管理行内附件，不虚拟化文字流，也不代替块级视频/图片宿主的生命周期；未知资源第一次加载仍可能必要重排。纯模型与 JVM 测试覆盖数值范围、UTF-16、语义复制及取消重入，UIKit/Android 布局、滚动和资源驻留须另外构建和真机验收。
