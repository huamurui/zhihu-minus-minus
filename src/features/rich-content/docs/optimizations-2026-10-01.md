# 2026-10-01 富文本优化专项

## 度量身份计算

原实现对每对相邻 span 端点扫描全部度量 span。内部 `flowLayout.ts` 改为端点事件扫描和活跃索引树，按原输入顺序枚举活跃样式，保留重叠、重复样式和相邻等价区间合并；paint、action 与 sourceMap 不进入几何身份。

`dense-metric-spans-001` 是合成的 16 段正文，编译成一个 flow、8,224 个度量 span。运行 `node src/features/rich-content/tools/benchmark-flow-layout.mjs`，先逐段断言输出一致，再各测七轮中位数。2026-10-01 本地 Node 25.8.0 结果：旧算法 88.66 ms，新算法 6.40 ms，约 13.85 倍。回归另以固定随机种子覆盖 200 组交叠、重复、空区间和相邻样式。该数值仅衡量桌面 JS 身份计算，不代表原生布局或 Release 首载性能；大量深度交叠本身仍需要枚举活跃样式。

## KaTeX 离线资源

WebView 原先从 CDN 读取 KaTeX 0.16.9，而应用依赖已锁定 0.16.47。现在从已安装依赖生成同版脚本、auto-render、CSS 和 20 份 WOFF2 字体，字体全部使用 data URL，公式无需请求 CDN。旧 DOM 公式组件继续使用该依赖的 renderToString，共用离线 CSS，不引入新的业务公共入口。

生成 JSON 总大小为 664,889 字节（约 649 KiB，含 MIT license），CSS/runtime 拆分避免旧 DOM bundle 携带不使用的浏览器 runtime。此数值是生成文件原始大小，最终平台 bundle/IPA 压缩增量须从构建产物测量。`postinstall` 自动生成；`npm run generate:rich-content:katex` 显式更新；`node src/features/rich-content/tools/bundle-katex.mjs --check` 校验可重现性。离线回归直接在无网络 VM 执行本地 runtime 排版分式和根式，并检查所有 font face 的 data URL、安装版本一致性及 WebView 无外链脚本。

`offline-formula-001` 可从开发案例页切换 WebView 查看行内/块级公式。正文 HTML 仍经清洗，KaTeX trust 保持默认 false；不承诺任意 TeX 命令或外部图片离线可用。

## 原生附件和范围

双端原生行内附件按滚动 viewport 上下各一屏预取，离屏/卸载/后台取消该 view 的请求订阅、释放图像引用而保留尺寸。重复资源继续共享加载器和 24 MiB 进程缓存；Android 内存压力回调清缓存。迟到结果须匹配文档 generation 与可见性 revision。首次未知 intrinsic 尺寸仍允许必要重排，文字流保持连续。

Android JSON range 从 optInt 改为严格数值整数，拒绝字符串、boolean、非有限值、越界及 UTF-16 surrogate pair 中点，与 iOS 对齐；选区、action、装饰、附件和复制共用校验，只有单个 U+FFFC 可以替换为语义 copyText。Swift Foundation smoke 为 28 项断言；Android 纯 JVM 测试覆盖同类输入与离屏取消/重入状态。Android 离线 prebuild 后使用 JDK 17.0.18、SDK 36 编译 `:zhihu-rich-text:testDebugUnitTest`，12 个测试通过（8 个请求协作、2 个 viewport、2 个范围/复制用例）。

该轮实现与纯逻辑验证不替代双端实际滚动、选区、无障碍、内存驻留和 Release 性能验收。平台构建与真机结果在仓库整体审查记录中单独登记。

## 2026-10-08 首载准备

本轮只处理首载路径的三项工作，不改变整篇正文的展示门槛或文字流分段策略：

- Android 将 `flowJson/configJson/contentWidth/layoutKey/selectable` 暂存为一批，在 Expo `OnViewDidUpdateProps` 中统一提交。同一批属性最多构建一次全文；仅 key/选择开关改变时走测量或选择更新。提交版本阻止过期测量回填，包括 key 改走又恢复的情况。
- JS 在原生正文宽度未知时先保留外壳及占位，同时准备 document/IR；实际宽度到达后再挂载正文。固定宽度预览传入准确的 `initialContentWidth`，其他宿主使用实际布局；后续候选复用外壳宽度，窗口宽度改变后失效。纯 block 和空文档在内容层挂载、实际宽度匹配后才能就绪，避免将空壳测量误认成正文完成。
- 知识点规范化对每段一次建立节点长度和偏移索引，再用递增游标切片。完整节点复用、局部切片 ID、嵌套格式及零长度附件/换行边界与旧算法一致；全文一致性、重叠和 UTF-16 范围校验保留。`segment-slicing-boundaries-001` 由合成 inbox 样本登记，差分覆盖 200 组嵌套分区，并以文本读取次数验证不再逐 mark 扫描全文。

运行 `node src/features/rich-content/tools/benchmark-normalization.mjs` 可复现：单段重复 `<b>甲乙</b>`，每两个字符的首字各有一个非重叠知识点；同一完整规范化流程仅切换新旧切片函数，先断言 document 与 diagnostics 完全一致，再取七轮中位数。2026-10-08 本地 Node 22 结果如下：

| 格式节点 / marks | 旧算法 | 游标算法 |
| ---: | ---: | ---: |
| 500 | 37.04 ms | 0.69 ms |
| 1,000 | 123.55 ms | 0.59 ms |
| 2,000 | 498.19 ms | 2.04 ms |
| 4,000 | 1,672.84 ms | 3.60 ms |

这是密集标记合成压力结果，不是典型回答耗时或应用首屏提速比例。共同的工具 loader 已支持 `@/` 导入，原 `benchmark-flow-layout.mjs` 可直接运行且新旧输出一致。

验证包括全仓 `npm run check`、富文本组件就绪/宽度回归，以及 Android prebuild、`:zhihu-rich-text:testDebugUnitTest` 和 `:zhihu-rich-text:compileDebugKotlin`。Android 25 项 JVM 测试通过，其中 5 项新增测试覆盖属性排列、无变化提交、轻量更新与旧测量拒绝；首次离线 Gradle 缺少四个 AndroidX 缓存包，补齐后编译和测试通过。未重新打包安装应用，未运行 iOS UIKit 或双端真机/Release 首屏测试，不能据此量化首屏收益。

## 2026-10-08 回答加载提示分类

短文本也会创建新的原生正文实例、确认容器宽度并接收高度回调。“正在斟酌文字”原先同时用于缺数据和原生布局等待，不能据此判断是否复用了推荐流正文，也不能将等待直接归因于长文测量。

回答入口和详情内缺少数据的查询统一显示“正在获取回答…”。原生占位按已有状态派生 `container-layout`、`text-layout`、`content-layout`，分别显示“正在确认正文宽度…”“正在排版文字…”“正在布局正文内容…”。有准确宽度 hint 时，文字高度可能先于容器确认到达，此时仍显示宽度确认；纯内容块和空正文等待内容层布局，不等待图片下载。解析与编译同步执行，不虚构独立加载阶段。只区分提示，不改变显示门槛、增加延时或记录正文/请求数据。

回归覆盖单字正文的阶段变化、宽度 hint 的逆序回调、无文字流内容和空正文、过期测量拒绝，以及已缓存正文与首次/后台请求的提示区分。真机看到哪种提示停留仍需实际观察，本次分类本身不衡量各阶段耗时。

用户随后确认短文和长文都只是短暂出现文字排版提示，选择为原生布局提示增加 120ms 出现延迟。阶段切换不重置计时；计时不延迟正文显示、不增加最短展示时间；获取回答仍即时反馈。专用回归使用虚拟时钟覆盖边界、阶段切换、请求转布局、卸载清理和再次挂载。

## 2026-10-08 高度回传通道调查

以当前安装的 Expo Modules Core 55 / RN 0.83 源码为准，双端已经使用 Fabric 和 JSI。当前流程仍包含原生测量、异步高度事件、JS 更新 `measuredHeight` 与就绪状态、React 回写 `style.height`，再由 Fabric 布局和挂载。JSI 不会自动消除这些调度步骤；仅凭加载提示闪烁无法量化通信耗时。

优先研究 Expo 已提供的原生尺寸更新：Android 的 `shadowNodeProxy.setViewSize` / `setStyleSize`，以及 iOS 的 `ExpoFabricView.setViewSize`，可以直接更新 Fabric state，减少尺寸经 JS/React 回写的环节。当前固定 `style.height` 优先级高于原生 intrinsic size，须同时调整高度的管理方式；文档就绪、过期事件拒绝、替换层晋升与阅读尺寸确认仍需保留。原生 state 更新仍要经历布局和挂载，见 [React Native 渲染流程](https://reactnative.dev/architecture/render-pipeline#react-native-renderer-state-updates)。本次仅调查，尚未采用该路线。

次要候选是合并测量排程：Android 的 `ExpoView.requestLayout` 自身会排入 `measureAndLayout`，本模块也排入测量任务；双端高度通知还分别使用 `post` / 主队列异步任务。需要先采样确认是否重复，再验证原生布局调用期间通知和过期事件处理，不能直接删除或承诺节省一帧。

事件合并主要减少重复通知，不会提前首个高度；当前已按布局身份和高度去重。Expo 视图事件没有稳定的同步开关，RN 实验性同步派发也不等于随时直接运行 JS。Reanimated worklet 可绕过部分 JS 调度，但高度属于布局属性，不能使用只适合透明度、变换等属性的同步更新快路，整体就绪逻辑也仍在 React，见 [Reanimated 性能说明](https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/)。现阶段优先用 Release 包对比，再决定是否试验原生尺寸管理；[React Native 官方性能指南](https://reactnative.dev/docs/performance)同样要求以 Release 构建评估性能。

本轮 `npm run check` 通过（130 suites、1399 tests、18 fixtures），保留原有 ProfileTabList 的一条 Biome info。Android prebuild 后执行 `:app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-parallel` 成功，采用 JDK 17 并禁用本地 Sentry 上传；产物是 0.8.0 / versionCode 800 的 ARM64 本地签名 Release APK，已校验签名、ABI、非 debuggable 和内置 Hermes 字节码。构建时暂停的项目 Metro 已恢复。未安装该包或进行 Release 真机耗时采样，iOS 本轮仅源码调查。

## 2026-10-29 Fabric 尺寸实验

在 Expo SDK 58 / RN 0.88 下，开发原型新增默认关闭的“Fabric 原生尺寸（实验）”开关。双端原生文字流将测得的尺寸写入 Expo Fabric state，JS 保留高度事件、布局身份和过期事件校验，不再在实验路径中将测量高度回写为固定样式。由于 state 更新和事件并不保证先后顺序，宿主等待当前高度与实际 `onLayout` 的宽高匹配后才通知就绪；同尺寸 reflow 可以复用已确认的布局。原有生产路径保持不变，切换实验开关会重新挂载原型正文。

这是验证通道可行性的实验，不代表已测得加速。需要重新编译原生构建，在双端对照短文、长文、宽度与字号变化、异步附件、选择及切换；再按 [Release 基准计划](./benchmark-plan.md) 在相同设备、内容和缓存条件下至少各测五次，记录首屏、布局次数和交互结果。模拟事件回归不能证明 Fabric state 的实际提交时序、真机排版或性能。

### Android Debug 设备初步对照

2026-10-29 使用 vivo V2509A、Android 16，已安装的 0.9.5 Debug 测试包；开发原型选择合成“行内附件”案例、tiqian-super-mini、字号 17、行高 1.6。实验开关开启与关闭均能看到正文。该测试包显示实验开关，但未核验其精确源码版本。

在同一页面交替开启和关闭开关，各五次。每次先重置该应用的 `dumpsys gfxinfo`，点击开关（会重新挂载正文），等待两秒后读取应用整体帧统计；重置后另一次读取确认计数为零。以下是每次采样的 Android 帧耗时百分位，不是正文从开始到就绪的耗时：

| 模式 | 帧数（每次） | 卡顿帧（每次） | P50（ms） | P95（ms，五次） | P99（ms，五次） |
| --- | --- | --- | --- | --- | --- |
| 原生尺寸开启 | 156 | 1 | 8 | 10、9、9、10、10 | 16、17、14、18、17 |
| 原生尺寸关闭 | 156 | 1 | 8 | 10、9、10、9、9 | 17、14、16、17、17 |

两组 P99 中位数均为 17 ms；采样包含开关动画及应用其他绘制，案例短且资源处于热状态。Debug 构建、两秒窗口及整体帧统计无法证明首屏或原生布局速度变化，也不能外推长文、冷缓存、Release 或 iOS。未采集正文就绪时间、布局次数和逐帧 trace，尚不能据此判定优化收益。

### Android Debug 正文布局计时

同日、同一设备及 Debug 测试包，改用合成“跨段选择”短文本案例（单个文字流），字号 17、行高 1.6。开发服务器临时加入只输出模式和耗时的计时标记，采样后恢复源码。每次点击开关都会重新挂载正文；以 JS 收到开关变化为起点，以该文字流的当前高度事件和匹配宽高的 `onLayout` 均已到达为共同终点，允许一布局单位的舍入误差。输出延后到计时结束后，避免同步日志直接落入计时区间。交替切换六组，首组作为预热，后五组结果如下，单位为毫秒：

| 模式 | 五次耗时 | 中位数 |
| --- | --- | ---: |
| 原生尺寸开启 | 100.55、105.33、99.88、98.91、100.75 | 100.55 |
| 原生尺寸关闭 | 90.75、89.52、91.13、90.49、91.25 | 90.75 |

此次开启比关闭的中位数长 9.80 ms，未观察到加速。计时包含开关回调后的 React 更新、正文准备、容器宽度确认及原生文字流测量和布局事件，不是纯原生排版耗时；终点是 JS 收到匹配布局事件，并非屏幕最终呈现的帧。两种路径的正文自身就绪通知时机不同，因此这里不直接比较各自的 `onLayoutReady`。样本量小，且为热缓存、Debug 包和单一短文本，不能推断 Release、长文或其他设备的效果；测试包精确源码版本未核验。

## 2026-10-08 问题回答列表复用

问题页原先只在点击时写入预览首卡缓存，普通详情读取的 `answer-detail` 未获得列表正文。现在同步写入完整回答种子，再跳转详情；保留原始段落互动、链接卡片及作者字段，并补请求付费、截断标记和链接卡片元数据。复用沿用推荐流的完整正文判定，游客摘要、截断或付费正文不作为完整详情；已有详情缓存不被列表覆盖。种子的 `dataUpdatedAt` 为 0，首屏直接读取正文，后台请求继续补齐详情元数据。

新增缓存回归覆盖原始字段保留、已有缓存及时间戳保护、部分正文拒绝，以及真实 QueryObserver 首帧有数据且后台刷新不进入 loading。页面回归确认缓存写入先于路由跳转。`npm run check` 通过（131 suites、1413 tests、18 fixtures），仅有原有 Biome info。更新后的 ARM64 Release APK 构建成功并校验签名、非 debuggable、ABI 和 Hermes 字节码；未安装或测量真机首屏耗时。
