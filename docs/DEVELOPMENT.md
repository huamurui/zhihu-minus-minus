# 开发指南

本文面向需要在本地运行、调试、测试或扩展知乎--的开发者。用户安装说明见 [`README.md`](../README.md)，Windows Android 原生构建的网络和 Gradle 细节见 [`BUILD_WINDOWS.md`](./BUILD_WINDOWS.md)。

除非另有说明，以下命令均在仓库根目录执行。

## 内容补充功能验证

- 想法：详情菜单仅向当前作者提供编辑和删除，编辑读取 `content/plugin` 的 `draft_plugin`（缺省时使用 `online_plugin`），保存草稿与发布分别调用 `content/drafts`、`content/publish`。保留原始正文块、图片及插件扩展字段，未知媒体暂停编辑。云端保存前先保存本地草稿，云端 ID 保存在兼容 v1 的 v2 草稿 JSON 中；无需 SQLite migration。验证新建草稿后再次保存/发布复用 ID、编辑已发布想法的 `isPublished`、图片增删、读取失败保留当前编辑，以及账号切换后的旧确认框、迟到响应和重复提交。
- 评论：`is_author`、关注关系、`author_tag`、`reply_author_tag` 和非 IP 的 `comment_tag` 统一生成身份提示，主评论、回复预览、回复列表及父评论路由均保留。父评论路由快照携带来源会话版本；缺少版本或会话变化时弃用整个快照，按当前会话重新请求父评论，避免保留旧关注、投票及删除权限。验证身份提示去重、未知字段、标签异常值、切换账号及同账号重新登录。
- 问题日志：从问题菜单进入 `/question/{id}/log`，WebView 加载知乎日志网址前同步当前账号 Cookie。事件使用布局提交阶段更新的请求标识，未提交的路由渲染不影响当前页面。验证加载/HTTP 失败重试、返回、主题、账号切换，以及旧页面回调不能影响新会话。
- 推荐反馈：回答/文章的更多和长按菜单发送表单 `POST /zrec-feedback/uninterested`（`content_type` 分别为 1/2）。成功后精确移除本账号推荐查询和 SQLite 启动缓存中的该内容，保留分页信息；失败保留卡片。验证重复点击、刷新/分页并发、账号切换及非推荐列表隔离。其他内容类型的编码尚未确认，暂不提供此操作。

专项回归见 `pinApi`、`pinActions`、`pinEditor`、`publishingDraftRepository`、`commentIdentity`、`parentCommentSession`、`questionLog`、`recommendFeedback` 和 `recommendFeedbackApi` 测试。日志与推荐反馈的并发回归通过 Suspense 和 transition 保留未提交渲染，确认当前页面事件、隐藏集合和请求去重仍生效。实际云端写入、删除、推荐反馈和 WebView Cookie 行为仍需用测试账号在 Android/iOS 验证。

## 技术基线

- Node.js 24.x、npm；`.nvmrc`、CI 和发布工作流统一使用 Node.js 24。
- Python 3：用于未签名 iOS 包的符号裁剪校验、AltStore/SideStore 订阅源及对应测试，仅使用标准库；实际裁剪调用 Xcode 的 `strip`。
- Expo SDK 58、React Native 0.88、React 19.3、严格模式 TypeScript 6。
- Android：JDK 17、Android SDK、ADB 或模拟器；Android API、Build Tools、NDK 与 Gradle 版本以 SDK 58 prebuild 生成的工程配置为准，不能复用旧 SDK 的固定版本。
- iOS：macOS、Xcode 26.4 或更高版本、CocoaPods；最低部署版本为 iOS 16.4。
- 应用必须使用 Development Build 或 Release 原生包，Expo Go 不包含项目所需的原生模块。

## SDK 58 升级与依赖边界

从 SDK 55 的本地工程升级时，停止 Metro，切换到 Node.js 24 并运行 `npm ci`。先备份生成目录内必要的本机签名和 `.xcode.env.local` 配置，再运行 `npx expo prebuild --clean`，重新编译、安装 Development Build，最后用 `npm start -- --clear` 启动 Metro。SDK 58 的 prebuild 默认清理并重新生成原生目录；只有显式 `--no-clean` 才保留原目录，不能依赖默认命令保留手工修改；原生依赖升级也不能仅靠 Fast Refresh 生效。应用配置及本地模块的 iOS target 同步为 16.4。若保留 `.xcode.env.local`，确认其中的 `NODE_BINARY` 指向兼容的 Node.js 24，不能继续沿用 Node.js 25 路径。

依赖按以下兼容边界维护：

- Expo、React、React Native 和 Expo 管理的原生包按 SDK 58 推荐组合更新，使用 `npx expo install --check` 核对。Jest 30 与 `jest-expo` 58、独立的 `@react-native/jest-preset` 配套。
- NativeWind 使用稳定版 4.2.7，配套 Tailwind CSS 3.4.19。NativeWind 5 当前仍是 RC，迁移涉及 CSS、Babel、Metro 与主题配置，不能单独把 Tailwind 升到 4；见 [NativeWind 官方迁移说明](https://www.nativewind.dev/v5/guides/migrate-from-v4)。
- Sentry 使用 Expo 推荐的 8.28 系列，保持原生自动采集、日志、会话、性能追踪及 Replay 关闭，错误继续经过应用内隐私开关和脱敏。其 Expo Router 集成仍有 [SDK 58 旧路径警告](https://github.com/getsentry/sentry-react-native/issues/6901)，当前应用未启用导航性能追踪；生产导出与真实错误上报仍需检查。
- Firebase app/analytics 保持 26.4.0。27 起 iOS 仅支持 Swift Package Manager，而当前发布脚本和本地模块仍使用 CocoaPods；见 [Firebase 27 发布说明](https://github.com/invertase/react-native-firebase/releases/tag/v27.0.0)。
- TypeScript 使用 6.0.3。TypeScript 7.0 不再提供编译器 JS API，当前主题测试和 Expo 工具仍需要该 API，因此暂不切换原生编译器；见 [TypeScript 7 官方说明](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6-0)。
- HTML 解析器升级为 `htmlparser2` 12，直接声明配套 `domhandler`；它们改用 ESM 后，Jest 需要转换对应解析器依赖。KaTeX 更新后由 `postinstall` 重新生成离线 JS、CSS 和字体资源，正文、导出及 fixture 分析须一并回归。

2026-10-22 的 `npm audit` 仍报告构建/传递依赖告警，集中于 braces、node-forge、sprintf-js、postcss-selector-parser 和 @grpc/grpc-js。前三者没有已发布的修复版；后两者的修复需要越过 Tailwind 3 或 Firestore 的声明版本范围，因此未强制 override，也未执行会降级 Expo 的自动修复。此次 Android 生产 source map 中未发现这些包或 Firestore；这不代表构建工具链的审计告警已清零。

升级后运行 `npm run check`、Expo 依赖检查以及双平台 prebuild。发布前仍需编译原生包并检查登录、冷/热链接、长文选择、双击手势、图片保存、视频、离线公式和 telemetry 开关；这些不能由 JavaScript 测试或 prebuild 单独证明。

## 首次启动

```bash
git clone https://github.com/huamurui/zhihu-minus-minus.git
cd zhihu-minus-minus
npm ci
npx expo prebuild
```

`android/`、`ios/` 和 `.expo/` 是生成物，不提交到仓库。`prebuild` 会应用 Expo config plugins，包括 ABI split、App 图标、iOS Firebase static linkage 和自定义原生模块配置。

本地开发不需要 Firebase 文件或 Sentry DSN。仓库仅保留 `.env.example` 作为模板，`.env` 和 `.env.local` 均不进入 Git 或 EAS 构建归档。若要验证 telemetry，将 `.env.example` 复制为根目录的 `.env.local`，按 [`docs/TELEMETRY.md`](./TELEMETRY.md) 配置；不要把 `google-services.json`、`GoogleService-Info.plist` 或 Token 提交到 Git。

## 运行与调试

### Android

确保设备或模拟器已连接并能被 `adb devices` 识别：

```bash
npm run android
```

如果已经安装好 Development Build，只启动 Metro：

```bash
npm run start -- --dev-client
```

Windows 用户请先阅读 [`BUILD_WINDOWS.md`](./BUILD_WINDOWS.md)；其中还记录了命令行 SDK、Gradle 镜像、ABI 和 Sentry 本地构建的常见问题。

Android 构建内存由 [`withAndroidBuildMemory`](../plugins/withAndroidBuildMemory.js) 在 prebuild 时写入：Gradle 最大堆 4 GB、Metaspace 1 GB，最多两个 worker，并关闭跨项目并行；Kotlin daemon 单独保持最大堆 2 GB、Metaspace 512 MB，避免跟随 Gradle 扩容。SDK 58 默认的 2 GB Gradle 堆曾在四 ABI 的 `packageRelease` 封装阶段出现 `Java heap space`。这类失败应检查构建 JVM 的 `org.gradle.jvmargs` 和 worker 数，不能只提高 Node 的 `NODE_OPTIONS` 或 Gradle 客户端的 `JAVA_OPTS`；参见 [Gradle 内存配置](https://docs.gradle.org/current/userguide/config_gradle.html)。已存在的本地 Android 工程运行 `npx expo prebuild --platform android --no-clean --no-install` 后生效，EAS managed 构建会自动应用。低内存机器可通过用户级 Gradle 配置将 `org.gradle.workers.max` 降为 `1`。

### iOS

```bash
npm run ios
```

首次或修改原生依赖后：

```bash
npm run prebuild -- --platform ios
(cd ios && pod install)
npx expo run:ios --configuration Debug --device
```

需要真机 Release 验证时，在 Xcode 打开生成的 `ios/*.xcworkspace`，选择自己的 Team 后构建。Release IPA 是未签名的，不能替代签名流程。

个人签名安装 Development Build 时，选择证书所属的 Personal Team；证书名称括号里的标识不一定是 Team ID，实际 Team 可由证书主体的 OU 核实。使用 `xcodebuild` 时通过命令参数传入 `DEVELOPMENT_TEAM`，不要把个人 Team 固定进仓库配置。完成构建后用 `xcrun devicectl device install app --device <设备标识> <Debug-iphoneos/*.app>` 安装，再启动 Metro（`npm run start -- --dev-client`）；设备需已配对并开启开发者模式。

只生成本地未签名 IPA 可运行 `bash scripts/build-unsigned-ipa.sh`。脚本每次执行干净 iOS prebuild（`--clean --no-install`）后安装 Pods，自动发现唯一 workspace 和 scheme，并把当前版本 IPA 写入项目根目录。未导出 `SENTRY_AUTH_TOKEN` 时跳过上传；导出 Token 后默认上传 source map，等待服务端处理，上传失败会终止构建。显式设置 `SENTRY_DISABLE_AUTO_UPLOAD=true` 或 `SENTRY_NO_UPLOAD=1` 仍可跳过上传。脚本在干净 prebuild 前备份 `.xcode.env.local`，随后恢复其内容和权限，prebuild 失败时也会尝试恢复。脚本不会删除其他版本产物；已有同版本 IPA 在构建和打包成功后替换。旧 `.xcode.env.local` 中若残留禁用上传设置，需自行移除后再验证上传。产物已被 Git 忽略，仍需另行签名才能安装。

本地和 CI 的 IPA 包装都会先复制 `.app` 到临时 `Payload`，再运行 [`scripts/strip-ios-app.py`](../scripts/strip-ios-app.py) 去除 arm64 Mach-O 的局部符号。脚本拒绝已有签名，验证 UUID、导出/外部符号、动态绑定信息和代码/数据段不变后才替换副本；失败不会发布新 IPA。原始构建和 dSYM 保留，Sentry 上传在包装前完成。没有匹配 dSYM 的离线原生栈会减少函数名，因此正式构建必须保留并按现有流程上传匹配 dSYM；JS bundle、错误栈和 source map 不受此步骤影响。测量与边界见 [SDK 58 体积分析](./EXPO58_SIZE_ANALYSIS.md)。

SDK 58 的原生模板已经提供 Scene 生命周期，直接由 Expo 管理 AppDelegate 和 SceneDelegate；旧的 `withIosSceneLifecycle` 和 `ZhihuSceneDelegate.swift` 适配已移除。升级时必须重新生成工程，避免残留旧的窗口启动代码。冷/热链接与前后台切换仍需在原生包中验证；平台依据见 [Apple 迁移说明](https://developer.apple.com/documentation/uikit/transitioning-to-the-uikit-scene-based-life-cycle) 与 [Expo Scene 说明](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md)。

Firebase 26 继续通过 CocoaPods 链接，`withIosFirebaseCocoaPods` 保留禁用 Firebase SPM 的配置，并把 Pods 最低部署版本统一提升到 16.4。[Firebase app 补丁](../patches/@react-native-firebase+app+26.4.0.patch) 回植上游 Scene 模板锚点适配，让初始化注入 SDK 58 的 AppDelegate。开启 telemetry 时需确认 Firebase 初始化只执行一次；分别检查开启和关闭 telemetry 的干净 iOS prebuild，不复用已迁移的 `ios/` 代替验证。

iOS 原生 tab 自动收起使用 [Screens 补丁](../patches/react-native-screens+4.30.0.patch)，按祖先裁切后的可见面积选择当前竖向列表，忽略隐藏、禁用及横向滚动容器。首页左右切页时监听外层横向容器的几何变化，主动更新 UIKit 底边滚动绑定；Fabric 惰性挂载、布局和返回页面也会刷新，离页移除监听。不能缓存首次找到的列表，否则已访问的离屏页仍可能控制 tab 收起。`bash scripts/test-ios-tab-scroll-binding.sh` 在临时 iOS 模拟器中直接测试生产 finder/tracker 的 UIKit 行为，退出时删除测试模拟器。仍需在原生应用中检查首次打开各列表、连续左右滑动、取消半途切页、切换底部 tab 和从详情返回后的收起/展开。

#### iOS 外链验证

`app.json` 的顶层 `scheme: "zhihu--"` 与 `ios.scheme: "zhihu"` 会由 Expo 合并到生成的 `Info.plist` 的 `CFBundleURLTypes`。链接继续由 `src/app/+native-intent.tsx` 和 `src/utils/url.ts` 统一解析；不需要额外注册 `Linking` 导航处理器。修改协议配置后须重新 prebuild、编译并安装原生包，Fast Refresh 或 JavaScript 更新不会更新系统的协议注册。

在临时源码副本中运行 `npm run prebuild -- --platform ios --no-install`，确认生成的 URL schemes 同时包含 `zhihu--` 和 `zhihu`。SDK 58 默认清理原生目录，不要用现有本机签名工程做无备份的配置验证。运行 `npm test -- tests/url.test.ts --runInBand` 和 `npm run check` 后，用重新安装的原生包验证：

- 分别在应用未运行和后台运行时，从外部打开问题、回答、文章等受支持的 `zhihu://` 链接，确认进入正确内容；同时检查原有 `zhihu--://` 入口。
- 在 Safari 与微信中分别点击实际分享页的“App 内打开”，确认按钮发出的 URL 能否交给本应用。`zhihu://hybrid?…` 等查询参数包装路径目前不在通用解析范围内，不应将某个直接内容链接成功视为所有分享链接均可用。
- 分别检查仅安装知乎--和同时安装官方知乎的情况。多个应用注册同一个 scheme 时，iOS 的目标应用未定义，不能承诺优先打开知乎--，见 [Apple URL scheme 说明](https://developer.apple.com/documentation/xcode/defining-a-custom-url-scheme-for-your-app)。

当前未配置 `ios.associatedDomains`。直接接收知乎 HTTPS Universal Links 需要知乎域名的 AASA 文件授权本应用，仅增加客户端域名配置不能实现；参见 [Apple Associated Domains 说明](https://developer.apple.com/documentation/xcode/supporting-associated-domains)。prebuild 与 JavaScript 测试只验证生成配置和路由，不能替代 Safari、微信及真机冷/热启动检查。

### Web

```bash
npm run web
```

Web 适合检查路由和不依赖原生模块的页面，不代表 Android/iOS 的原生行为已经验证。

### 空段落排版验证

富文本空段保留数量：每组连续空段的首个压窄并移除段距，其余保留正文行高和段后间距。合成样本 `src/features/rich-content/fixtures/cases/empty-paragraph-spacing-001.json` 覆盖首尾、连续空段、普通正文和图片两侧；正文中的多个 `<br>` 不合并。双端原生模块增加了精确空行度量与复制锚点过滤，需要重新 prebuild、编译并安装 Development Build 后再检查，单独重启 Metro 不会更新原生代码。

相关验证命令为 `npm test -- src/features/rich-content/tests --runInBand`、`npm run analyze:rich-content`、`npm run check`，以及原生模块 README 中的 Android JVM/iOS 模型检查。平台验收应查看单个/多个空段、图片间单空段、引用和列表、字体缩放，以及跨空段复制时空行数量与正文字符是否保留；同时切换到 WebView 对照。

## 什么时候需要重新 prebuild

以下改动后应重新生成原生工程：

- `app.json`、`app.config.ts` 或 Expo config plugin；
- `package.json` 中的原生依赖、`modules/` 下的本地原生模块；
- 原生权限、intent filter、iOS deployment target、Firebase 或 Sentry 构建配置；
- App 图标资源或 ABI split 配置。

只改 `src/app/`、`src/components/`、`src/features/`、`src/hooks/`、`src/api/`、`src/store/`、`src/storage/`、`src/utils/` 中的 TypeScript/样式时，通常只需要 Fast Refresh。不要直接把生成目录中的修补提交回仓库；如果配置需要长期保留，应写入 `app.config.ts` 或 config plugin。

### 字体打包体积

图标按家族路径导入，例如 `import Ionicons from '@expo/vector-icons/Ionicons'`，避免包根入口把其他家族的字体和 glyph map 一起带入 Metro 依赖图。当前仅使用 Ionicons 图标字体；收藏的空心和实心星形由 `CollectionStarIcon` 内联 SVG 绘制，卡片、悬浮操作栏和菜单共用，不再依赖 FontAwesome6 及其 regular、solid、brands 三份字体。

SDK 58 升级后移除旧版 `expo-symbols` 的字体导入补丁，使用 SDK 配套包的资源处理。可用 `npx expo export --platform android --dump-assetmap --output-dir /tmp/zhihu-android-export` 检查生产资源清单，确认业务未使用的 FontAwesome6 字体没有被带入。字体清单验证后仍需在真机检查菜单、收藏和导航图标；最终 APK 大小以同一构建环境的 Release 产物为准。

SDK 55 与 58 的实际 CI 包、ZIP 条目和相同 JS 的 Hermes 编译对比见 [SDK 58 包体积分析](./EXPO58_SIZE_ANALYSIS.md)。不要用 `node_modules` 大小、Gradle 堆配置或单个新增依赖推断最终安装包增量。

## 验证命令

排查页面异常时，可在“设置 → 报错日志”复制本机脱敏记录；根路由错误界面也可直接复制并重试。日志跨重启保留错误安全摘要、稳定错误码、固定业务 `area` / `operation`，以及可用的 `buildNumber`、`commit`、`sourceFingerprint`、白名单代码路径、行列和 `debug_id`。未知消息、动态属性名、账号和请求数据仍会脱敏，不能替代原生崩溃报告。捕获和隐私约束见 [`TELEMETRY.md`](./TELEMETRY.md)。

`app.config.ts` 在读取配置时生成诊断 manifest，记录允许保留的仓库源码路径及内容指纹。开发期间修改源码后，Fast Refresh 不会自动刷新 manifest 指纹；应重启 Metro 并重新加载应用，再收集定位用日志。`commit` 在无 Git 元数据的源码归档中可能缺失，`sourceFingerprint` 仅标识纳入清单的源码，不能代替精确匹配的构建产物；Release 的 bundle 行列仍须使用同次构建的 source map 还原，并核对 `debug_id`（若有）。

提交前运行聚合检查：

```bash
npm run check
```

`tsconfig.json` 显式加载 `expo/types`，为 CSS 等资源导入提供官方类型声明。CI 的干净检出不包含被 Git 忽略的 `expo-env.d.ts`，类型检查不能依赖本地 Expo 启动或 prebuild 生成该文件。

`npm run check` 依次执行类型检查、只读 Biome 检查、全部 Jest 测试和富文本 fixture 分析。测试运行在 `jest-expo` preset 下；当前 `testMatch` 收集 `tests/` 下的 `.test.ts` / `.test.tsx` / `.test.js`，以及 `src/features/rich-content/tests/` 下的 `.test.ts` / `.test.tsx`。组件交互断言可使用 React Native Testing Library；其他目录或扩展名需要同步调整 `jest.config.js`。常用命令如下：

```bash
npm run typecheck
npm run lint
npm test
npm run test:watch
npm run test:coverage
npm test -- tests/themeMode.test.js --runInBand
npm test -- src/features/rich-content/tests/fixture-analysis.test.ts --runInBand
npm run analyze:rich-content
npm run analyze:rich-content:inbox
```

本地macOS具备Swift工具链时，可运行 `bash modules/zhihu-rich-text/tests/run-model-smoke.sh`，直接编译并检查iOS纯Foundation模型的UTF-16范围、非法输入和附件语义复制。它不加载UIKit，不替代iOS app编译、装饰/附件视觉及系统手势验收。

`npm run lint` 不修改文件；需要自动修复时使用 `npm run lint:fix` 或 `npm run format`，然后逐项检查 diff。富文本专项的 fixture 投递、脱敏和 manifest 规则见 [`src/features/rich-content/README.md`](../src/features/rich-content/README.md)。

Biome 2.6 使用 `linter.rules.preset: "recommended"`；Markdown 格式化保持关闭，避免工具升级重排历史文档。`noReactNativeRawText` 明确识别原生 Tab 标签、主题 Text 及测试里的 RN Text 别名；`MathView.tsx` 是 `use dom` 组件，仅该文件不使用 RN 文本规则。其他局部例外限于作为图片资源使用的应用图标 SVG（不要求内联 SVG 的 title）、测试中每次用例只创建一次的宿主组件，以及 `toast.ts` 中有 `Platform.OS` 守卫的 Android 调用。业务源码的组件工厂和其他推荐规则仍保持检查；这些例外与范围集中在 `biome.json`。

### 内容导出验证

导出模块位于 [`src/features/content-export/`](../src/features/content-export/README.md)，通过内容身份和账号会话重新获取正文，再从统一文档模型生成 Markdown、HTML、PDF 或分段长图。修改解析、资源准备、文件写入或账号隔离后，先运行 `npm test -- tests/contentExport --runInBand`，再运行 `npm run check`；涉及富文本转换时同时保留富文本专项测试和 fixture 分析。

`expo-print` 与 `react-native-view-shot` 是原生依赖，新增或升级后分别运行 `npx expo prebuild --platform android --no-install` 和 `npx expo prebuild --platform ios --no-install`，重新编译 Development Build；生成目录不提交。导出当前仅支持 Android/iOS，Web 不能替代平台验收。真机需检查缺图重试、离线 HTML/公式、PDF 分页、长图边界与取消、SAF 保存、iOS“存储到文件”和多图相册权限；保存面板打开不能作为文件已保存的证据。完整测试矩阵和资源限制见模块 README。

### 双栏布局与导航状态

入口为 [`src/features/adaptive-layout/AdaptiveStack.tsx`](../src/features/adaptive-layout/AdaptiveStack.tsx)，路由分类和可见页面选择集中在 [`layout.ts`](../src/features/adaptive-layout/layout.ts)。手机、平板和 Web 统一使用自适应导航容器，双栏仅由默认关闭的 `enableLargeScreenLayout` 控制，不检查设备类型、屏幕大小或横竖屏。开关立即生效，无须重启应用；旋转、窗口缩放和开关变化只调整尺寸与可见性，不重新选择或挂载导航容器。

两栏共用一个 Stack。布局从当前历史向前寻找最近的详情页，并在最近列表页处停止，分别显示在右、左侧；当前是列表页时右侧显示提示，不能显示该列表之前的旧详情，没有列表来源的详情深链接使用全屏。设置、登录、编辑器、视频和其他未明确分类的路由始终使用全屏，并作为历史扫描的边界，避免显示不相关的旧页面；设置中的布局开关在各种尺寸下均可操作。新增路由默认全屏，只有明确适合并列浏览时才加入 `getPaneRole` 的列表或详情分类。

横竖屏切换只重新计算尺寸和可见性，不派发 push、replace、reset 或 pop，也不清理历史。页面保持原有 route key、params 与 React 状态，隐藏页停止接收触摸并从无障碍树中隐藏。双栏中的列表选择通过 `usePaneRouter` 标记来源，`PaneStackRouter` 只替换该列表之后的详情分支，并同步浏览器历史；重复选择同一内容复用 route key 和页面状态。详情内部的普通链接仍加入历史，例如“问题 → 回答 → 评论”依次返回回答、问题，最后关闭右栏。单栏、深链接与未标记的导航保留 Expo Router 的原有语义，不建立独立返回栈。尺寸变化与返回动作必须分开处理，不能为了恢复双栏重建路由或复制详情页。这里保留的是同一次运行中的页面状态，不增加跨进程的导航历史恢复。

列表初始占可用宽度的 `1/3`，分隔线交互宽度为 16dp。所有尺寸均按保存的比例分配扣除分隔线后的可用宽度，不设置固定的两栏最小宽度，避免窄屏左栏被挤空。细竖线常驻，拖拽握柄默认隐藏，按住时显示，松手或取消后隐藏。两栏之间须长按激活后才可拖动，普通点击和滑过不改变栏宽；激活时高亮并按震动设置提供轻触觉反馈，拖动时实时显示比例，松手保存 `largeScreenListRatio`，取消或尺寸变化则恢复已保存比例；设置 v19 为旧用户补充默认关闭的 `enableLargeScreenLayout` 和默认比例，保留已保存的合法偏好。比例限制为 `0.2..0.6`，非有限数值回退为 `1/3`。唯一开关位于“设置 → 外观与阅读 → 双栏布局（试验性） → 启用双栏布局”，关闭再开启仍保留上次调整的比例。正文、Pager 与弹层通过栏位上下文获取实际宽度和可见性，不能将整窗宽度当作详情栏宽度，也不能让隐藏页面的 Modal 继续覆盖当前内容。

双栏列表选择回答时显式传入 `readingMode: detail`，右栏只打开该回答。双栏中 Pager 禁止手势翻页，切换到单栏后恢复；尺寸变化不替换 Pager 或强制切换已经打开的阅读模式。新增列表内容入口应使用 `usePaneRouter`；详情正文链接继续使用普通路由。

隐藏页面保留最后可见尺寸和 effects，不使用 `display: none` 或 React Activity，以免滚动容器归零、刷新卡住或标题状态被重新初始化。栏位可见性单独控制自动续页、弹层和活跃状态；嵌套原生 Tab 仍需处于选中状态，隐藏持有输入焦点的栏位时收起键盘。回答翻页与删除内容使用来源路由的参数更新或带目标栈的动作，不能误改另一栏当前页面。删除回答的延迟回调还需核对回答、登录会话和 Pager scope；旧页面已被替换或已切换回答时，不得关闭新内容。

首页顶部标签与搜索、底部导航在窄栏中均可横向滚动，按钮保留可操作宽度，选中项和栏宽变化会将当前控件滚入可视区。不要通过压缩按钮或裁切导航来容纳窄栏。

手机、平板和 Web 均使用自适应容器及 JavaScript header，没有原生 Stack 转场动画和原生侧滑返回；可使用页面返回按钮，Android 还可使用系统返回。单栏和双栏共用同一容器，关闭双栏不会更换导航实现。平台手势、键盘、安全区以及原生正文重排须用 Development Build 验证，逻辑测试不能证明这些体验已经通过验收。

使用 Node.js 24 运行以下定向回归，再运行完整质量门禁：

```bash
npm test -- tests/adaptiveNavigation.test.tsx tests/adaptiveLayoutSettings.test.ts tests/navigationInteractionSettings.test.tsx tests/paneDivider.test.tsx tests/homeNavigationRow.test.tsx tests/answerNeighborRendering.test.tsx tests/paneDimensions.test.tsx tests/paneOverlays.test.tsx tests/paneSelection.test.ts --runInBand
npm run check
```

专项测试分别覆盖导航历史与旋转、偏好迁移与宽度持久化、布局开关、栏内尺寸和隐藏页弹层。下表为需执行的验收矩阵，不代表已完成真机验证；Android/iOS 手机、Android 平板、iPad 和 Web 均须覆盖单开关控制布局，窗口缩放另在支持分屏的设备或 Web 中检查。

| 场景 | 操作 | 预期 |
| --- | --- | --- |
| 单开关切换 | 手机、平板和 Web 分别在设置中关闭再开启“启用双栏布局”，返回已打开的列表和详情，再重启应用 | 设置始终全屏且开关可操作；开关立即控制单栏与双栏，无须重启，已保存的偏好在重启后恢复 |
| 旋转与窗口缩放 | 滚动列表及长回答，横屏 → 竖屏 → 横屏，连续缩放窗口，并关闭再开启双栏 | 布局模式只随开关变化；页面不重复挂载或重置，当前内容、列表状态与返回顺序保留；控件可见且可用 |
| 长按拖动分隔线 | 普通点击与快速滑过；长按后连续拖动、拖至两端、取消拖动或旋转，并关闭震动后重复，再重启应用 | 细竖线常驻，握柄默认隐藏，按住显示、松手隐藏；普通触摸不改变栏宽；长按激活有高亮和可关闭的震动，拖动实时反馈比例；松手保存一次，取消/旋转恢复已保存比例，重启恢复已提交比例 |
| 嵌套导航与返回 | 列表 → 问题 → 回答 → 评论，详情内再打开用户主页或另一篇内容，交替操作左右栏 | 列表重选替换右栏，同条内容不重置；详情内部逐级返回，最后关闭右栏，无重复详情、丢失列表或跳回首页 |
| 冷/热深链接 | 关闭应用及应用已打开时，分别打开问题、回答、文章和想法链接；进入后旋转并返回 | 内容与参数正确，有列表来源时展示双栏，无列表来源时详情可全屏使用，返回不制造虚构历史 |
| 系统返回与全屏页面 | Android 返回键/手势与页面返回按钮分别返回，iPad 使用页面返回；进入登录、编辑器和视频后旋转及退出 | 一次返回只消费一次导航或弹层关闭操作，全屏页面不露出旧栏位，退出后恢复原有浏览上下文 |
| 弹层、键盘与主题 | 在两栏打开评论输入、菜单、收藏和图片预览，隐藏所属页面再返回，配合旋转、亮暗主题切换 | 隐藏页不残留遮罩或拦截触摸；弹层尺寸、关闭操作、键盘避让和安全区正常，无内容被遮挡 |

### 主要界面回归场景

主要界面的代码回归覆盖分页、搜索提交、评论上传与提交、历史选择、账号切换和公共菜单。修改这些流程后，除运行 `npm run check`，还应在 Android/iOS Development Build 上检查以下场景；自动化逻辑测试不能替代原生布局和手势验收：

- 主题与详情切换：在同一次运行中切换亮色 → 暗色 → 亮色，并验证跟随系统切换；每次切换后从首页 Feed 进入问题、回答、个人主页再返回，分别覆盖已有缓存和首次加载，并在切换阅读背景、前后台切换后重复。根 `GestureHandlerRootView` 必须保持与运行时主题一致的不透明底色，不能只给页面或 `Stack.contentStyle` 设置背景。`rootThemeBackground` 回归检查底色随主题和阅读偏好更新且导航不重新挂载；页面切换、双栏开关和旋转时是否闪白仍需 Android/iOS 真机检查，冷启动正常不能替代运行中切换主题的验证。
- 自定义主题色：色相、饱和度、亮度滑块拖动时更新色块与 Hex 预览，成功松手后提交一次并刷新全局主题；轻点轨道和短距离调整也直接提交。纵向滚动不应改色，拖动取消时恢复开始前的预览。`appearanceSettings` 覆盖提交、取消、连续调整及重新展开后的状态一致性；Android/iOS 真机还需检查滑块与页面滚动竞争，确认不用再点击阅读背景选项才能生效。
- 首页、搜索和日报：快速点击历史词/建议词、切换分类、刷新过程中触底、分页失败后重试，以及过滤/曝光去重后整页为空。服务端返回结束标记或重复游标时应停止追加。
- 图片稳定性：头像、Feed 缩略图及其他使用缓存源的常用界面图片关闭 Android 原生默认淡入，避免图片视图重新加载时反复渐显；缓存和列表回收仍可能产生等待。真机需检查首页及评论头像、快速滚动回收、刷新、进入详情后返回、前后台切换和慢网首次加载，确认无明显闪动或错头像。富文本后端的图片加载独立验证。
- 关注更新：头像接口返回缺失、null 或非数组的 `data` 时应隐藏头像栏并关闭该区域的手势；数组中的畸形用户条目应丢弃，正常条目仍可显示、进入最近发布和标记已读，后续正常响应能恢复显示。头像栏原生触摸期间锁定首页 PagerView，检查从头像上横滑、滑到首尾、纵向滚动、取消手势及返回后首页横滑恢复。“最近发布”固定进入时的头像顺序，左右切换或按钮切换用户，保留已访问页的列表与刷新状态；相邻用户仅预加载，实际选中才标记已读。检查从中间用户进入、单用户/缺失缓存入口、后台头像刷新后顺序不跳动、每页独立未读分界和分页，以及已读请求失败回滚不覆盖新更新。回归见 `recentMoments`、`nestedHorizontalGesture`、`recentMomentStream`、`recentMomentRead` 和 `userStreamScreen`；Android/iOS 均需真机检查嵌套横滑与页面边缘返回手势。
- 回答、文章、想法和评论：分别验证首次失败、分页失败、排序切换、多行输入和图片输入栏。文章与想法的根评论、回复统一使用 Comment V5 发布接口，分别验证文字和图片评论发布成功后刷新列表、失败后保留草稿。评论列表和回复详情共用 `useCommentKeyboardLayout`，按页面底边与键盘顶边的实际重叠量定位输入栏，弹起时保持 12px 间距，收起后恢复设备底部安全区。Android 在 edge-to-edge 根视图中使用 `measure` 的 `pageY`，不能直接把已扣系统导航栏的键盘 `height` 当作上移量，也不能重复补偿窗口已经缩小的部分；`keyboardDidShow` 后立即定位。iOS 使用窗口坐标测量，并跟随键盘事件时长和 frame 变化。回归见 `commentKeyboardLayout`；真机需覆盖 Android 手势/三键导航、窗口缩放、有/无底部安全区、多行输入与图片附件，以及 iOS 键盘弹起、收起和高度切换。评论提交期间不得重复发送或清空新编辑；移除图片、重新选择同图及离页后，旧上传结果不得回填。想法多选投票应遵守选择上限、一次提交完整选项，提交及刷新期间不可重复发送。
- 问题与回答顶部：页顶导航透明，问题页显示返回与右侧更多按钮，回答页顶部保留返回，完整问题标题在正文中；接近折叠边界的最后 48px 随滚动逐渐显示背景、紧凑标题与作者，背景高度与信息位置同步变化。回答导航保留作者小头像和姓名，其顶部更多操作问题、正文底栏更多操作当前回答；横向切页按回答 ID 直接恢复展开/折叠及渐显进度，取消横滑、列表重排、离屏页滚动及旧回调不得污染当前页，切换问题或排序时清空本次导航状态。右侧自绘滚动条只作位置提示，不拦截手势，需检查短文隐藏、长文顶部/底部、弹性过滚、旋转及大字体后比例与导航间距；重新打开内容时应从顶部开始且不出现恢复提示。回归见 `answer-pager-transition`、`detailNavigationHeader`、`detailHeaderAppearance`、`readingProgress`、`readingProgressDisabled` 和 `scrollIndicator`。
- 回答相邻预加载：前台回答详情立即预取前后各一条完整回答，数据就绪后提前挂载正文；预加载本身不触发收藏查询或阅读进度恢复。切页时保留提升为当前页或仍在相邻窗口中的请求，只取消离开窗口且没有活跃查询的请求。未阅读的预热正文移出窗口后卸载，再次进入需重新确认原生布局就绪。列表异步插入或重排时按回答 ID 保持当前页；[Pager 9 Android 补丁](../patches/react-native-pager-view+9.0.7.patch) 避免用零宽高初始化 Compose Pager，并在本次原生挂载事务之后校验和执行最新定位命令，取消被手势或重置取代的命令。页面容器按 React child ID 保持身份，Fabric 移动子页时保留必要的 detach，并在重新插入时显式恢复既有 Compose 容器中的子视图。JS 仍保留有效布局与位置事件补偿，旧列表回调不得改变当前焦点，新手势接管后停止补偿。真机需检查慢网下提前请求、请求未完成时快速左右切换、推荐入口首屏列表晚到、列表追加/重排，以及首次回答长按、选区拖柄、双击和返回后再进入；回归见 `answerPrefetchResources`、`answerNeighborRendering` 和 `answer-pager-transition`。原生命令队列回归使用 `cd android && ./gradlew :react-native-pager-view:testDebugUnitTest`；这些测试不替代真机触摸验证。
- 阅读反馈协议：`src/api/zhihu/lastRead.ts` 使用 Web `POST https://www.zhihu.com/lastread/touch`，以 FormData 的 `items` 字段批量发送 `[类型, 字符串 ID, 动作]`；multipart boundary 由运行时生成。`touchAnswersRead` 发送回答 `touch`，`readContents` 发送问题/回答 `read`，均去除空 ID 和重复条目，保留大整数 ID 字符串。仅登录会话发送，旧会话请求不能转发到新账号；40352 验证失败不弹出全局验证码。此反馈独立于浏览历史、本地曝光去重和可选 telemetry 开关，不接入知乎分析埋点，也不承诺服务端去重。
- 首页列表批量触达：推荐、关注和同城共用 `useFeedPageReadTouch`。在前台活动列表开始加载下一页时，一次性 `touch` 上一页原始接口响应中的全部回答 ID；取值在卡片解析、本地过滤、折叠、去重之前，不要求点开或实际曝光。触底、自动补页、分页重试和手动继续加载共用入口；首屏加载、下拉刷新、后台重验证、终页和重复游标不单独触发。成功或进行中的同批次不重复发送，失败不阻塞分页，重试同一页时可重试反馈；新响应即使 ID 相同也属于新批次。批次绑定原请求认证会话，只有截断卡片的磁盘启动缓存没有完整批次，不合成上报；内存查询批次不写入持久缓存。回归见 `feedPageReadTouch`、`lastReadApi` 和 `apiClientSession`。
- 详情阅读反馈：回答详情保留当前页选中、数据可用、原生排版就绪及路由聚焦/应用前台条件；同次阅读中首次打开某问题的回答，合并发送 `[["question", "问题 ID", "read"], ["answer", "回答 ID", "read"]]`，同题后续回答仅发送回答 `read`，切到新问题首次再带上问题。直接进入问题页，待当前会话的问题数据可用后发送问题 `read`。按阅读视图、认证会话和内容 ID 去重，失败在后续阅读机会重试，相邻预取和离屏预渲染不触发。回答预览列表保留 `useAnswerReadTouch`，仅触达可见且已展开的普通或结构化正文；未展开摘要不触发。相关 hook、`answerNeighborRendering` 和 `answerPreviewList` 覆盖触发门槛；真机需验证 Android/iOS multipart 序列化与接口响应、列表翻页请求顺序、同题切页、慢网、前后台和账号切换。
- 内容操作菜单：Feed、创作卡片与问题/回答/文章/想法详情的更多入口统一为 `···`；收藏、系统分享链接、分享标题与链接、复制链接、复制 Markdown 及作者编辑/删除均为一级操作。Feed 长按复用同一动作构建，菜单关闭后再执行系统分享，内容身份或账号变化、离页和关闭中的连续点击不得执行旧动作。验证未知收藏状态读取/失败重试、游客登录入口、收藏请求禁用、日报和文章链接区分、复制返回失败与分享取消。回归见 `contentActionsMenu`、`contentActions`、`clipboard`、`detailPageMoreMenus`、`collectionAction`、卡片复用和 overlay 测试；真机需覆盖 iOS/Android 分享目标、剪贴板权限、长菜单滚动与弹窗关闭动画。
- 正文双击：回答详情、文章和想法共用 `useDoubleTapAction` 与 settings v18 的 `doubleTapAction`（关闭、点赞、评论区），未配置时只弹出首次设置，重置设置后重新引导；日报及未聚焦的回答不启用，选择关闭时禁用手势识别器。手势宿主覆盖整个阅读滚动视口，短内容下方的空白和底部留白也可触发；顶部导航与底部浮动操作栏保持在手势宿主之外，滚动内容的高度、留白及阅读测量逻辑不变。`isDoubleTapEnabled` 同时驱动正文 `suppressDoubleTapSelection`，由各渲染后端协调双击与长按选择，避免页面各自调时间阈值；实现及 WebView/RN Text 的覆盖边界见 [富文本说明](../src/features/rich-content/README.md)。Android 的 [RNGH 补丁](../patches/react-native-gesture-handler+3.3.0.patch) 补全双击成功时的原生触摸终止，由 `postinstall` 自动应用；升级手势库时需复核上游交接行为，并验证双击、长按和惯性滚动。修改原生仲裁后需重新 prebuild 和编译原生包，Fast Refresh 不会更新 Kotlin/Swift。点赞成功后立即保留结果并更新共享缓存，连续双击及缓存尚未回传时不重复请求；外部取消点赞后可再次双击点赞。回归见 `doubleTapAction`、`doubleTapActionSheet`、`featureSettings`、`settings-renderer-migration`、`detailPageMoreMenus` 和 `answerNeighborRendering`。Android/iOS 真机需分别验证原生与 WebView 正文及空白区域的双击、长按选择、链接、图片、视频、纵向滚动及回答横向切页，并检查首次弹窗、读屏选中状态和关闭后原有正文交互。
- 正文图片与预览：Fresco 默认把图片最长边降采样到 2048，长截图会被压成很窄的一条再拉宽，文字发糊；`getImageResizeMethod`（`src/utils/imageDecode.ts`）按实际下载文件的尺寸判断是否全尺寸解码，`_720w` 这类地址按服务端缩放后的尺寸计算（`getServedImageSize`），超过 80MB 的位图仍走默认降采样。Android 原生正文中高宽比超过 3 的图片只显示顶部 1.5 倍宽度并标「长图」（`useLongImageCrop`）：整张绘制会超过 GPU 纹理上限而被压缩；顶部由原生按显示宽度裁切并缓存，裁切失败时显示整图。Android 的 `ImagePreviewModal` 改用原生 Galeria 预览（`src/utils/nativeImageViewer.ts`），[Galeria 补丁](../patches/@nandorojo+galeria+3.1.0.patch) 增加分块解码（SubsamplingScaleImageView）、先显示页面已加载的缓存副本再换原图、长图铺满宽度从顶部开始、页码与保存按钮，长按时先关闭预览再弹出 `ImageActionBottomSheet`；事件带会话 ID，旧会话的迟到事件被忽略。正文把 `originalUrl` 随画廊传入预览，原生预览加载原图，评论等没有原图的入口加载显示地址。iOS 继续使用原 JS 预览。修改补丁后需重新 prebuild 并编译原生包。回归见 `imageDecode`、`native-long-image` 与 `imagePreviewNative`；真机需检查长截图正文与放大清晰度、预览打开时无黑屏等待、多图翻页页码、保存、长按菜单、下滑与返回键关闭。
- 历史、收藏和用户列表：验证带连字符的历史标识、视频/问题跳转、长按选择、重复删除、刷新与翻页互斥，以及游客入口和账号切换后的状态。
- 个人主页：自己与他人主页的“创作”均通过 `useUserCreations` 读取最近发布流，使用资料返回的 member ID；与 `stream` 入口共享查询、分页去重和刷新逻辑。“我赞同过”通过 `useUserAnswersVotedByMe` 读取 `/members/{url_token 或 id}/relations/vote`，返回当前登录账号赞同过的该主页用户的回答，游客显示登录入口。首次访问标签时请求，固定 `sort_by=created`，从 `paging.next` 读取 offset 并按回答 ID 去重；查询 key 包含目标用户与当前认证会话版本，刷新只精确重置该查询。标签与顶部栏的数量来自 `paging.totals`，表示当前账号赞同过该用户的回答数，卡片展示回答作者。封面与顶部栏复用 `ProfileCover`，使用相同完整图像尺寸，顶部副本上移 112px 后固定，再渐入固定半径的模糊图层。顶部搜索图标进入 `/user/[id]/search`，主页不再内嵌搜索框。回归测试见 `userCreations`、`userAnswersVotedByMe`、`profileScroll`、`profileCover`、`profileTabList`、`profileHeader`、`userProfileScreen` 和个人搜索测试。原生验收需覆盖空/短/长列表、头部半展开时双向切换、封面缩至顶部栏后的固定与模糊、深滚动后返回页顶再切换、我赞同过列表的首次失败与分页失败重试、游客登录入口及账号切换后的缓存隔离、回答与作者跳转、搜索输入与清空及返回原主页位置、简介展开收起、横屏及大字体；标签栏和导航栏按实际高度定位，列表应保持阅读位置，搜索页应保持输入焦点。
- 话题、专栏和消息：话题结构页下拉应刷新父话题、子话题和最佳回答者；个人主页的“专栏”位于“文章”之后，首次访问通过 `useUserColumns` 读取 `/members/{id}/column-contributions`，展示封面、简介、关注者和内容数，按专栏 ID 去重，并沿用个人主页的分页及刷新。专栏刷新应回到首批内容，`type=answer` 的条目使用 `question.title` 并进入回答详情，文章继续进入文章详情；通知和私信长用户名不得挤掉时间，分页失败应提供重试。
- 发布和登录：小屏、横屏及大字体下四个发布入口均可滚动到达；回答邀请链接携带查询参数或结尾斜线时仍进入正确问题；搜索/邀请请求失败应区分于空结果；登录加载期间仍可取消。
- 公共菜单和对话框：使用长文案、多操作项和白色/黄色自定义主色，检查滚动、操作可达性、按钮文字对比度，以及关闭动画期间连续选择只执行第一次操作。更新说明的嵌套滚动也需要双端验证。
- Android 应用内更新：确认更新后，根布局常驻下载任务，进度、校验、失败重试与安装入口通过底部状态条呈现；下载过程中仍能滚动正文、切换 Tab 和进入其他页面。状态条外层不拦截页面手势，位置按底部安全区再上移 80px，避开普通导航与阅读操作栏；键盘、小屏、横屏、大字体及自定义底栏仍需真机检查遮挡。下载及 SHA-256/大小/ZIP 校验通过后只显示“安装”，点击才打开系统安装器；返回应用后可再次安装，无论系统安装是否取消都不据此宣称安装成功。关闭状态条/卸载根组件会清理未交接的已校验文件，已交接文件按原有 24 小时保留策略清理；安装器打开失败可直接重试已校验文件。取消、断网、校验失败、失败重试、旧任务晚到回调及关闭/安装竞态回归见 `updateChecker`、`useUpdateDownload`、`updateDownload` 测试。下载使用现有 Expo 文件传输，不增加系统通知或后台任务权限；切到后台后传输能否继续由系统决定，进程被终止后不恢复任务。

上述检查只使用合成内容；真实接口、系统选图和键盘行为需在目标平台另行验证，不将真实账号、正文或登录 URL 写入测试与截图。

富文本后续路线按 [Issue #40](https://github.com/huamurui/zhihu-minus-minus/issues/40) 更新为原生 attributed text / Text Flow Island，实施进度与未完成项见 [Renderer V2 计划](../src/features/rich-content/docs/renderer-v2-plan.md)，Release指标见 [基准计划](../src/features/rich-content/docs/benchmark-plan.md)。“设置 → 外观与阅读 → 正文排版”提供 tiqian-super-mini（默认）与网页排版两个选项；“功能开关 → 正文排版”也会进入同一页面。业务 `ZhihuContent` 默认读取持久偏好，也可显式传 `renderer` 覆盖。从“我的 → 富文本测试案例（开发）”进入功能原型或稳定fixture，可对照这两个后端；案例内切换仅保留于该页面，不写生产偏好。生产构建隐藏开发入口并重定向 `/dev/*`，但真实正文仍可通过设置选择tiqian-super-mini。开发包另有 `zhihu--:///dev/native-validation` 合成验证页，检查 AES、原子文件、恢复、流式哈希、离线公式及原生长文布局；结果文件只含时间戳和布尔值，不能导出真实账号或密钥。

新增的 [tiqian-super-mini 功能原型](../src/features/rich-content/docs/renderer-v2-experiment-03-native-flow.md) 经过 HTML → `ZhihuDocument` → Rich Text IR → 本地 `modules/zhihu-rich-text`，初步支持同一流跨段选择、source map、装饰和行内附件。入口为上述案例列表的“tiqian-super-mini 原型”，也可在开发构建打开 `zhihu--:///dev/rich-content/prototype`。Android使用TextView/Spannable，iOS新增UIKit/TextKit adapter，两端共享Document、IR与JS交互宿主。未包含该模块或不支持的平台回退到 WebView。新增或变更模块后，对目标平台运行 `npx expo prebuild --platform android --no-install` 或 `npx expo prebuild --platform ios --no-install`，并重新编译/安装development build；Fast Refresh不能添加原生模块，Expo Go不支持此能力。iOS SVG解码依赖由本地podspec声明，prebuild后需安装Pods。

SDK 58 将 iOS 最低版本提升为 16.4，旧版 `expo-router` 的 iOS 15 `UIAction.subtitle` 可用性补丁已移除。重新 prebuild 后安装 Pods，不能继续使用 SDK 55 的生成工程。

已安装development build并连接Metro的iOS模拟器可直接打开合成案例：

```bash
xcrun simctl openurl booted 'zhihu--:///dev/rich-content/prototype?caseId=attachments'
```

`caseId`限页面内的selection、decorations、attachments、segments、media、typography六个合成案例；忽略无效值，初次打开默认selection，其他query不注入正文。开发URL解析只保留合法且不超过64字符的caseId，生产构建继续隐藏和重定向开发页面。CLI可用于启动和截图，不能据此宣称系统选区拖柄、附件长按或父滚动手势已人工验收。

公共推荐入口为 `ZhihuContent`，默认采用用户正文偏好，需要固定后端时可传 `renderer="native-v2"`；该外壳已封装完整 WebView fallback。直接使用 `ZhihuNativeContent` 必须提供 `renderFallback` callback，由宿主返回完整正文与图片/链接交互；HTML 宿主使用 WebView，结构化宿主使用 JSON 分段组件。V2选区和知识点事件仅在native模块可用时生效。

`structured_content` 的渲染对照位于“我的 → 富文本测试案例 → structured_content 渲染对照”。独立 `ZhihuStructuredContent` 直接按 JSON 分段展开收起，可比较 React Native 分段节点和 tiqian 原生文本流。后者直接向 `ZhihuNativeContent.document` 传递 `ZhihuDocument`；未提供该属性时，原 HTML normalization 路径保持不变，结构化模式在缺少原生模块时回退分段节点。五个主要案例来自附件中的真实回答，保持全部分段、marks 与分页状态，身份、ID、业务链接和不透明上下文已脱敏；公开正文与公式图片地址保留并在运行时加载，图片不下载进仓库。原附件缺少真实续页，另有合成案例演示追加；测试页不请求正文或互动接口、不更改持久阅读设置。样本来自 `src/features/rich-content/fixtures/inbox/structured-content/`，原始请求与字段结构见 [next-render 记录](./ZHIHU_NEXT_RENDER.md)。

正文后端偏好保存为 `richContentRenderer`，默认 `native-v2`（tiqian-super-mini）。settings version 15 将旧 `rnrh` 或未设置的偏好迁移到默认后端，保留明确选择的 `webview` 及旧 `useWebView=true`。缺少原生模块或平台不是Android/iOS时，本次渲染回退 WebView，保留偏好；RNRH 依赖和入口已删除。

2026-09-30按用户决定正式移除Enriched：组件、专属normalizer与测试、依赖、native patch和开发入口均已删除，研发集中到本地tiqian-super-mini。[Enriched 实验记录](../src/features/rich-content/docs/renderer-v2-experiment-01-enriched-html.md)仅保留研究与历史构建依据。原生依赖移除后需用锁文件安装依赖，重新prebuild、编译和真机检查，以免旧生成工程继续链接已移除的库。2026-10-01增加iOS原生adapter、Expo Apple模块注册和共享JS入口；初期平台结果见实验03，后续双端Release构建、合成页面与系统交互的覆盖范围见 [本轮审查记录](./CODE_REVIEW_2026-10-01.md)，完整平台验收仍需逐项推进。Tiqian保留为[历史集成草案](../src/features/rich-content/docs/renderer-v2-experiment-02-tiqian.md)，未接入本轮Android原型。

2026-09-30初始main同步的 `npm ci`、Android / iOS prebuild和质量检查属于移除Enriched之前的记录。本轮tiqian-super-mini实现、Android Debug真机查看与Enriched移除后的验证结果以 [实验03](../src/features/rich-content/docs/renderer-v2-experiment-03-native-flow.md) 为准；prebuild和逻辑测试通过不代表双端原生排版、选择或Release性能已验收。

## 代码结构与数据边界

应用源码集中在 `src/`。Expo Router 自动发现 `src/app/`，`@/*` 别名指向 `src/*`；静态资源位于 `src/assets/`，通过 `@/assets/*` 引用；`@/modules/*` 单独指向根目录的 `modules/`。从旧目录结构更新后，先停止已有 Metro，再运行 `npm start -- --clear` 清理路径缓存。Expo、Metro、Babel、Tailwind、Jest、TypeScript 和 Biome 的入口配置保留在根目录，命令仍从仓库根目录运行。

| 目录 | 责任 |
| --- | --- |
| `src/app/` | Expo Router 页面、路由和页面级编排 |
| `src/api/` | Axios 客户端、X-ZSE-96 签名及知乎接口适配；响应边界使用显式类型 |
| `src/components/` | 跨页面 UI；业务专属渲染优先放进对应 feature |
| `src/constants/` | 主题、设计 Token 和共享常量 |
| `src/features/` | 独立业务能力，包括 `adaptive-layout/`、`rich-content/` 和 `publishing/` |
| `src/hooks/` | 可复用交互、查询和乐观更新逻辑 |
| `src/storage/` | Expo SQLite、本地 Feed 缓存和曝光记录；schema 通过有序 migration 演进 |
| `src/store/` | Zustand 全局状态与持久化迁移 |
| `src/types/` | 跨 API、页面和组件复用的领域类型 |
| `src/utils/` | 无页面依赖的查询、URL、过滤、阅读进度、telemetry 等工具 |
| `plugins/`、`modules/` | Expo config plugins 和本地原生模块 |
| `tests/` | 不依赖完整原生运行时的回归测试 |
| `scripts/` | 图标生成、发布辅助与未签名 iOS 打包脚本 |
| `src/assets/` | 图标和其他应用静态资源 |
| `docs/` | 开发与发布说明；`docs/screenshot/` 存放 README 展示截图 |

新增知乎接口时，优先在 `src/types/zhihu.ts` 或对应 `src/api/zhihu/*.ts` 声明响应类型，让 `apiClient` 的泛型和导出函数返回类型一起表达边界。外部 JSON 不确定时先接为 `unknown`，再通过规范化函数或类型守卫收窄。

## 持久化与敏感数据

- RN 普通和 Animated 图片统一通过 `src/utils/imageSource.ts` 的 `getCachedImageSource` 创建 source。HTTP(S) 使用 `cache: 'force-cache'`，用于优先复用已有原生缓存，缓存未命中时仍可加载；升级 RN 后仍需检查双端缓存行为。按完整 URL（含版本参数、尺寸及主机）区分图片，不按账号或页面另存副本，也不定时清空或主动刷新；同 URL 的服务器原地替换不会主动校准。JS source 索引最多 512 条，灯箱另保存最多 256 条成功加载的原始尺寸，并关闭库的主动预加载，重新打开已有尺寸的图片不再调用 `getSize`。这两个索引只存元数据；图片字节仍由 RN 原生缓存管理和淘汰，未新增自建磁盘图片库或统一 MB 上限。WebView、SVG 和原生行内附件仍使用各自加载链路。回归见 `imageSource`、`imagePreviewModal` 和富文本测试；同页重复头像、重新进页、重启、离线命中及系统淘汰后的请求次数仍须 Android/iOS 真机验证。
- 登录态主存于应用沙箱的 `auth-storage.json`，用于容纳多账号 Cookie；旧版本的 SecureStore Cookie 只在首次缺少文件时用于兼容导入。主文件与当前备份使用 AES-GCM，密钥另存 SecureStore，原子读取负责 Android `.bak` 恢复；旧明文与旧 store 均保留兼容迁移，详见 [账号保存与恢复](./AUTH_STORAGE.md)。
- 设置和 telemetry 开关使用 SecureStore；内容阅读进度的记录与恢复目前由 `src/constants/readingProgress.ts` 中的 `ENABLE_READING_PROGRESS = false` 统一停用，回答、文章、日报和想法均不恢复历史位置或保存新进度，也不读取或迁移旧记录。页面尺寸测量与回答滚动条继续工作。已有阅读进度数据保留，持久格式仍为最多 100 条的双快照文件，迁移逻辑保留且仅在启用后运行，两个快照提交后才清理旧 SecureStore。推荐流缓存、曝光与创作草稿使用 Expo SQLite；缓存 24 小时过期、曝光 30 天保留并定期限量，草稿规则见 [发布编辑器](../src/features/publishing/README.md)。
- 内容过滤仅作用于推荐流，总开关默认开启；质量过滤（含赞同数阈值，`filterEnableQuality`）和带推广标记的内容（`filterBlockLabeled`）默认关闭，其他广告/营销规则沿用各自默认值。首次使用、重置设置及旧数据缺失这两项时均采用关闭值，升级保留已保存的总开关和各项选择；持久字段与格式不变。设置 v17 新增 `filterRegexPatterns`，迁移与更新时移除空白、重复、非法或不受支持的规则；新规则默认留空，修改其他设置或保存归一后相同的规则时保留数组引用，避免重复过滤和重编译。`src/utils/feedRegex.ts` 使用已有 htmlparser2 提取完整正文纯文本，只读取 Pin 的文字段落，忽略摘要、截断正文与纯媒体内容。关注豁免先于广告、正则与质量规则；正则与质量开关独立，折叠/隐藏和设置页统计共用 `evaluateFeedItem`。相关回归运行 `npm test -- tests/feedFilter.test.ts tests/FeedRegexSettings.test.tsx tests/settings-renderer-migration.test.ts --runInBand`。
- 推荐流解析集中在 `src/utils/recommendFeed.ts`；Feed 外层 `promotion_extra` 的 JSON 字符串或对象中，只有明确的 `is_card === true` 才归一为 `isAdPromotion`，由现有“知乎广告平台推广”开关过滤，独立于 `target.is_labeled` 和正文广告链接。空值、损坏 JSON 和不带明确标记的结构不据此过滤；本地缓存只新增可选布尔信号，不保存投放参数或追踪 URL。旧缓存缺失该信号时仍可读取，需要刷新推荐流重新取得标记。回归见 `recommendFeedPromotion` 和 `feedFilter`。
- 自定义正则采用纯 JavaScript [RE2JS](https://github.com/le0pard/re2js) 的有限状态匹配引擎，使用 RE2 语法与 `DOTALL`，内建 Unicode 码点匹配。默认不支持前后查找或反向引用，不调用宽松的 JS 正则转换器，也不回退执行原生 `RegExp`。例如 `^.{0,50}$` 和 `广告\s*推广` 可继续使用；Unicode 转义使用实际字符或 `\x{...}`，属性类使用 RE2 的 `\p{Han}` 等语法。
- 资源边界集中在 `FEED_REGEX_LIMITS`：最多 20 条规则，单条源长度最多 256，编辑器输入最多 16384；编译后超过 4096 条指令的规则不接受。HTML 最多 262144、纯文本最多 65536、Pin 最多 2048 段（字符串长度限额以 UTF-16 码元计）；超限正文跳过，不能截断后匹配。表达式按规则数组身份缓存，用 `matcher(text).find()` 请求匹配边界并搜索任意位置，命中即停止，不切换为 `test()` / `RE2Set.match()`；RE2JS 已升级到 2.9.0，原有 Unicode 与病态表达式测试用于检查升级后的匹配行为和资源边界。正文按不可变 FeedItem 身份缓存。复杂嵌套重复不再走指数回溯，但长文本与复杂规则仍有处理开销，不能把这些准入限制当作实际内存或耗时的硬上限。可用性测试用带超时的子进程执行实际 helper，覆盖病态嵌套重复和大量不同 Unicode 字符；升级 RE2JS 时必须复核匹配路径并重跑测试。
- Cookie、`z_c0`、`d_c0`、`_xsrf`、X-ZSE 请求头、完整 Axios config、真实登录 URL 和未脱敏正文都不能进入日志、fixture、截图或测试快照。
- API 调试日志只允许记录 method、脱敏后的 path、status 和独立 request id。新增日志前检查成功、失败和异常对象分支。
- 真机正文样本先脱敏，放入 `src/features/rich-content/fixtures/inbox/`，确认结构后再登记到 `cases/` 和 manifest。

## 路由、缓存和原生变更

### 网络恢复与首次游客浏览

根布局通过 `useQueryConnectivity` 将 `expo-network` 和原生 AppState 接入 TanStack 的在线/前台状态。首次网络快照不得覆盖更新的网络事件，回到前台重新读取状态；相同在线事件去重。确认断网恢复或 Wi-Fi/移动网络类型切换时，`restartInterruptedQueries` 先取消仍在执行的活跃读取，再保留缓存与 `fetchMeta` 重启，使首屏和下一页无需等旧连接超时。后台可能漏掉断开与重连事件，前台确认在线后也重启回前台前就已挂起的读取，不取消此后新发起的请求。已经暂停的查询沿原任务继续，本地 `networkMode: always` 查询与非活跃查询不主动重启。

已有页缓存的无限列表不因回前台/重连而从头串行重抓全部页，已有内容可继续阅读；无缓存首屏照常恢复，在途翻页保留原方向，已终止的分页失败仍可手动重试。普通无 HTTP 响应的传输失败最多自动重试一次；408、429 和 5xx 保留两次重试。知乎风控 `40362`（HTTP 403，“您当前请求存在异常，暂时限制本次访问”）在关注者列表等接口上由缺少反爬 Cookie `__zse_ck` 触发：它由知乎页面脚本写入 WebView Cookie 存储，API 客户端以 `withCredentials: false` 只发送账号保存的 Cookie，登录时也不一定取到它。读取请求收到 40362 时，若 WebView 的 `z_c0` 与当前账号一致且有不同的 `__zse_ck`，只把这一项合并进当前账号 Cookie 并重试一次；添加账号期间跳过读取，写入请求不自动重试。列表失败页向 `QueryErrorView` 传入 `error`，在页面文案下显示安全提示、HTTP 状态和知乎错误码。游客推荐与同城接口遇传输失败不再串行尝试兼容接口，HTTP 兼容回退保持。

写入查询默认使用 `networkMode: always`、`retry: false`，离线时按请求失败和既有回滚处理，避免评论、私信和发布排队后在恢复网络时自动提交。不要为恢复读取而取消或重放 mutation。离线首屏处于 `pending/paused`，页面需保留加载状态，不能显示“暂无内容”或“内容已删除”。

首次游客初始化由 `useGuestBootstrap` / `GuestBootstrap` 管理：已有原生设备 Cookie 时立即放行，否则短暂等待隐藏 WebView；等待期间首页显示加载状态，网页错误或最多 5 秒后允许 API 继续尝试，不再无限等待 Cookie，也不在成功后固定再等 2 秒。失败后在本次游客会话的下一次联网恢复时最多补试一次，不能重新关闭已放行的 Feed；取得 Cookie 后只重启当前游客的活跃错误/无数据 Feed。异步读取、旧网页消息、定时器和换账号均按代次/会话隔离；匿名 Cookie 只用于请求，不写入认证 store，不通过网页消息传出其值。

登录后切游客会立即登记原生 Cookie 同步，游客初始化与 API 读取原生 Cookie 前等待旧账号清理，不能在保存账号文件的等待间隙先创建游客 Cookie 再把它清空。含登录凭据的旧原生 Cookie 不用于游客 WebView。问题详情和回答列表查询均按会话隔离并拒绝旧响应；游客回答正文独立缓存并保留摘要/截断标记，详情与 Pager 不再请求登录态 Web 正文。相关回归覆盖 `guestBootstrap`、`profileSessionActions`、`apiClientSession`、`guestAnswerReading`、`answerPagerSource` 和 `answerNeighborRendering`；真机需验证首次游客、登录后切游客、重新登录，以及回答失败后的重试和左右切换。

新增 `expo-network` 后必须重新编译原生应用，Fast Refresh 无法添加模块。运行 `npm ci`、`npx expo prebuild --platform android --no-install`、`npx expo prebuild --platform ios --no-install` 和 `npm run check`。回归包括 `queryConnectivity`、`queryRecovery`、`queryClient`、`queryRetry`、`feedFallback` 与 `guestBootstrap`；真机重点验证 Android 飞行模式恢复、Wi-Fi 切换流量、首屏/刷新/翻页中的断网、后台恢复，以及清除应用数据后在线和离线首次游客启动。原生连接状态不能保证知乎服务可达，路由器有连接但上游断网仍需通过请求超时/失败反馈处理；自动化测试不替代这类真机验证。

视频使用 SDK 58 对应的 `expo-video`，正文保留视频封面和播放按钮，`data-lens-id` 和 `/video/` 链接经 Lens 获取实时资源，独立 `/zvideo/` 链接先读取 `/zvideos/{id}` 的媒体信息。两种 ID 不能混用；播放地址仅保存在运行时，打开或重试时重新获取，优先尝试 AVC playlist，再切换备用资源。原 WebView 视频页已移除，网页正文排版也通过应用内入口进入原生播放器；视频封面不进入图片预览和画廊。页面失焦或进入后台会暂停，播放器卸载时释放。

新增播放器依赖后运行 `npm ci`，分别运行 `npx expo prebuild --platform android --no-install` 和 `npx expo prebuild --platform ios --no-install`，再重新编译安装；Fast Refresh 无法添加原生模块。平台验收需覆盖回答、文章、想法及独立视频入口、横竖视频、暂停/进度/全屏、后台/返回，以及过期资源重试和备用资源切换。请求和播放器失败提示不输出底层异常或签名播放 URL。

- 新增深链接时同时检查 `src/app/+native-intent.tsx`、`src/utils/url.ts` 和 `app.json` 的 intent filters，并覆盖冷启动和热启动路径。
- TanStack Query key 必须包含所有影响结果的参数；精确失效和 `src/utils/query.ts` 的 reset 语义要保持一致。
- 修改 SQLite schema 时递增 `src/storage/localDatabase.ts` 的数据库版本并新增事务 migration；不要重写已发布 migration。
- 修改 Zustand 持久结构时递增对应 store version，并实现从旧版本的迁移。
- `package.json` 和 `app.json` 的应用版本必须同步；发布 tag 使用 `v<version>`，且同一版本不能重复发布。

## GitHub Actions 与发布

- [`ci.yml`](../.github/workflows/ci.yml) 在 Pull Request 和 `main` push 时运行 `npm ci` 与 `npm run check`。
- [`pr-build.yml`](../.github/workflows/pr-build.yml) 支持维护者在 Pull Request 下评论 `/build`、`/build-apk`、`/build-ios` 或 `/build-all`，按需触发单平台或双平台正式包预览构建，并在 PR 评论中回复产物下载入口。
- [`build.yaml`](../.github/workflows/build.yaml) 手动构建四个 Android 单 ABI APK 和一个未签名 iOS IPA；`build_mode=build` 只保留 7 天的 artifact，`build_mode=release` 还会创建 Release。
- Release 必须从 `main` 运行，且 `package.json`、`app.json` 版本一致，`v<version>` tag 尚不存在。`publish_release=false` 创建草稿，`true` 才直接公开。
- 构建工作流的 Android job 需要 `EXPO_TOKEN` 加上 4 个 telemetry Secret，iOS job 需要其中 4 个 telemetry Secret；由于两个 job 总是一起运行，完整 workflow 需要配置 `EXPO_TOKEN`、`FIREBASE_ANDROID_JSON_B64`、`FIREBASE_IOS_PLIST_B64`、`EXPO_PUBLIC_SENTRY_DSN` 和 `SENTRY_AUTH_TOKEN`。详情见 [`docs/RELEASING.md`](./RELEASING.md) 和 [`docs/TELEMETRY.md`](./TELEMETRY.md)。

## 完成标准

- 实现、用户文档和配置行为一致；
- 不扩大公共边界，不把敏感数据加入日志或测试样本；
- 类型检查、相关测试、富文本分析和改动文件的 Biome 检查通过；
- 路由、缓存、持久化或原生配置变更附带迁移和对应验证；
- 最终说明中列出已运行的命令、未运行的真机/平台验证和剩余风险。

## 回答阅读方式与预览列表

回答和文章的卡片底部、详情及预览悬浮栏在评论左侧提供 `CollectionButton`，问题页回答卡片与创作卡片保持相同顺序。按钮复用 `useCollectionAction`，以全局收藏状态覆盖服务端初始值，收藏后显示实心星标。列表通过 `getContentCollectionMetadata` 保留 Web/App 返回的收藏状态与数量，未知状态和数量不补成 false/0；数量使用服务端值、随刷新更新，不叠加会话累计 offset，避免重复计数；未知状态仅在点击时读取现有收藏状态查询，再执行收藏或取消，不随列表挂载批量请求。读取中及提交中禁用，读取失败可重试，卡片复用、卸载或账号切换后忽略旧读取结果；更多菜单保留收藏入口。预览浮栏在窄屏将收起按钮并入右侧操作组，赞同数字可单行省略；极窄屏省略浮栏收藏与评论的可见数量，完整数量保留在无障碍属性中。专项回归见 `collectionButton`、`feedCardActionRow`、`feedCardRecycling` 和详情/预览测试，真机需验证窄屏及大字体下收藏、评论和更多按钮均可点击。

回答入口 `/answer/[id]` 按 `answerReadingMode` 选择详情或预览卡片列表，默认 `detail`；settings version 16 给旧设置补齐该值。`readingMode=detail` 用于主动切换到详情。问题页、收藏夹与点赞页先显示普通摘要卡片，不在列表中加载完整正文。长按 FeedCard 的临时预览菜单保持原有行为。

回答和想法详情通过 `ContentRelationshipNotice` 在作者信息之后、正文之前显示 `/answers/{id}/relationship?desktop=true` 或 `/pins/{id}/relationship?desktop=true` 返回的互动关系文案。正文首次展示时立即用当前赞同数显示默认文案，缺少计数时显示“赞同信息”；提示始终占用一行，服务端文案较长时省略显示，无障碍标签保留全文，加载、空响应、失败及回答焦点切换不会插入或移除这一行。回答只在当前页聚焦且已有详情时请求，缓存包含内容类型、ID 和账号会话；赞同数变化后重新获取文案。默认赞同文案以及 `reaction_endorse` 且跳转目标为当前内容的知乎赞同者页面时，点击提示打开应用内的 `VoterListModal`；未知跳转保留文字并禁用点击，未聚焦回答禁用点击。文字颜色使用运行时主题 token，服务端颜色代码不直接作为样式。

回答和普通文章详情复用 `AnswerEndorsements` 在正文上方展示 `endorsements` 标签，回答中位于赞同关系提示之前；详情、问题分页及用户回答列表请求将该字段包含在 `include` 中，不另发标签请求。分页源保留列表标签，与回答 ID、账号会话一起传入详情；详情未返回该字段时使用列表标签，明确返回空数组时则清除标签。点击入口另用 `answer-endorsements`、账号会话和回答 ID 缓存标签，确保所选回答不在第一页时也能使用已收到的元数据；详情和预览仅订阅这份缓存，不发独立标签请求。仅有元数据的列表条目仍不能作为完整正文缓存。Feed 映射、可用正文缓存种子、普通与结构化预览保留标签，预览卡片也在正文之前展示。原始结构复用 `src/types/zhihu.ts` 的共享类型，经 `normalizeAnswerEndorsements` 校验后显示有序 `TEXT` / `IMAGE` 和可读描述；空标签、无效字段和未知图标不影响正文。已支持谢邀螃蟹、日报、专栏及右箭头图标，文字颜色和浅色背景映射到运行时主题 token。只有合法知乎 HTTP(S) 地址且能映射到已有路由的 `action_url` 才启用站内跳转；没有链接的日报标签和未知目标保留展示，未聚焦回答禁用标签点击。谢邀、日报、专栏及无正文列表结构由 API、组件和页面测试覆盖。

问题来源的预览列表将同一问题的标题、描述及问题操作集中在列表头；其他来源可能跨问题，每张卡片保留各自的问题标题。卡片显示回答作者、正文和回答操作，首卡默认展开，也允许收起；所有长正文卡片使用右下角紧凑的展开/收起按钮。折叠依据完整已加载正文的实测高度，不按段数切片；预览高度随视口适配，短内容与略超限的尾段完整展示，有正文续页时仍保留展开入口。正常渲染没有详情跳转按钮，请求失败时仍提供详情入口。展开长正文并滚过 300px、所有可见卡片操作栏均离开视口时显示悬浮回答操作栏；滚动结束强制重测，回收卡片或换会话后拒绝旧测量。预览与问题页共用 `useDetailHeaderState`、`DetailNavigationHeader` 和渐显计算：初始透明，标题离开顶部时渐显标题与背景，按实测标题及字号更新阈值。回答 Pager 保留独立的身份、位置与焦点管理。

回答、文章、想法与预览浮栏共用 `ContentActionBar` 的胶囊浮面、模糊背景和主题色。底部定位统一传入安全区 `bottomInset`，可用 `bottomOffset` 保留文章页额外的 10dp 间距；`getContentActionBarBottom` 将实际底距限制为至少 12dp，较大的原有底距不变。浮栏胶囊高度统一为 48dp。正文底部留白、阅读恢复提示与回答滚动指示器使用同一底距计算结果及公共浮栏高度，随胶囊高度同步调整。普通 Feed 卡片与预览卡片底部共用 `FeedCardActionRow`，统一赞同和评论的图标尺寸及靠左紧凑布局，更多按钮靠右，预览卡片额外在赞同旁提供同为 16dp 的反对按钮；预览首卡和后续卡片的悬浮栏均提供收起按钮，收起后滚回该卡片顶部。评论、展开/收起等按钮复用 `ContentActionButton` 的胶囊点击反馈，更多操作继续用 `MoreActionsButton`。全局 `BouncyButton` 的默认圆角保持原有规则，普通卡片与正文交互不受操作栏样式影响。

回答路由显式传递 `answerScene`；问题 ID 只描述回答所属问题，不推断来源。推荐及其本地缓存卡片使用 `recommend`；其他无明确来源的卡片（关注动态、搜索、收藏、历史、站内链接等）默认 `unknown`；问题回答页使用 `question_feed`；成员回答列表使用 `profile_answer`，其所属用户由接口来源确认；主页其他页签、主页搜索和最近创作则核对真实作者匹配当前用户后使用该场景，同时保留 `memberId` 与 `memberSort`。用户点赞或活动中的其他作者回答按 `unknown` 处理。左右滑动详情通过 `useAnswerPagerSource` 默认请求当前问题的回答列表，覆盖推荐、问题及 `unknown` 来源；`profile_answer` 继续通过成员回答接口跨问题分页。入口没有问题 ID 时，先从点击回答的详情解析；列表等待或失败不阻塞当前回答阅读，列表返回后保留当前回答。原始来源场景与预览列表的 next-render 请求规则不因这一默认行为而改变。来源缓存和 Pager 身份包含账号会话、场景、目标及排序，换来源或账号后拒绝旧回调/旧响应。跨题翻页时使用当前回答的标题、问题 ID 和跳转；可复用的用户列表 HTML 正文通过已有卡片缓存预热，付费或截断正文不作为完整详情。

预览首卡优先使用点击列表已有的 `content`；FeedCard、问题回答卡片与 CreationCard 只在点击时写入按会话隔离的临时首卡缓存，不将付费或截断列表正文标为完整详情。缺正文时复用普通详情缓存，仍缺失才沿用原 `getAnswer`。首卡使用普通 `ZhihuContent` 接收全部可用正文，保留实际 `segment_infos` 与 `link_card_info` 及完整交互；共用 `CollapsibleRichContent` 测量自然高度并裁剪，默认展开且允许收起，刷新或切换账号、来源后恢复默认展开。展开收起不修改正文输入或重挂载正文宿主；布局变化时重新测量，回收卡片拒绝旧测量。`/answers/v2` 因用户反馈服务端 `40362` 已停用，原因和验证边界记于 next-render 文档。首卡固定为首项，后续流按回答 ID 去重；首卡与 `/next-render` 分别重试，后续流等待或失败不阻塞首卡阅读，首卡重试保留后续列表，下拉刷新等待两者完成。后续接口使用结构化 JSON 正文，初始 `/next-render` 请求固定 `id=所选回答ID`、`type=answer`、`context_expand=1` 和 `is_native=1`，按上述来源选择 `scenes`。只有 `question_feed` 附带问题容器、会话和游标参数，其他三个场景不附带这些字段。回答列表分页与单回答正文 `/next-content-render` 分页分开：展开时获取第一续页，随后只在可见的展开卡片末尾进入视口下方半屏范围时自动续取。测量按帧合并、滚动检查节流，全列表只有一个自动续页请求在途；远离末尾、收起、换来源或账号后停止继续请求。正常正文不显示加载更多按钮，请求失败保留重试且不自动重试循环。两者保留服务端完整续页 URL，先检查 `is_end`，限制地址来源与路径，拒绝重复续页。查询按当前账号会话隔离；正文从实际 paragraph.pid 和 seg_like 派生互动信息，不混用旧 HTML 业务 ID 或补造范围。首卡段落互动手动刷新普通回答；后续卡片互动成功后手动刷新该回答已加载的正文续页，再刷新外层流来源；失效查询不会自动抓取 disabled 的正文缓存。旧来源/账号回调不能作用于复用的卡片。生产预览通过 `ZhihuContent.document` 共用详情的渲染后端及交互；选择 WebView/缺模块时才安全转换为 HTML，默认原生路径不生成 HTML。未知附加标记保留原文；真实正文结构缺失或加载失败显示重试。未取得的初始会话与游标参数暂为空，续页沿用服务器值；用户提供的成功响应证明该次空值请求成功，仍未主动调用真实 API。
