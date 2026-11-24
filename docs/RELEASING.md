# 发布指南

发布工作流位于 [`.github/workflows/build.yaml`](../.github/workflows/build.yaml)。Android 与 iOS 使用不同的 GitHub-hosted runner，但在同一次 workflow run 中完成：Ubuntu 构建 Android APK，macOS 构建未签名 IPA，最后按需创建 GitHub Release。

## 发布前准备

1. 同步修改 `package.json` 和 `app.json` 中的版本号。
2. 将准备发布的提交推送到 `main`。只有 `build_mode=release` 时才要求从 `main` 运行。
3. 确认 `v<version>` tag 和同名 GitHub Release 尚不存在；工作流不会覆盖已有版本。
4. 在仓库 `Settings → Secrets and variables → Actions` 中配置以下 5 个 Secret：

   - `EXPO_TOKEN`：Android 本地 EAS Build 使用的 Expo Access Token；
   - `FIREBASE_ANDROID_JSON_B64`：`google-services.json` 的 base64 内容；
   - `FIREBASE_IOS_PLIST_B64`：`GoogleService-Info.plist` 的 base64 内容；
   - `EXPO_PUBLIC_SENTRY_DSN`：Sentry DSN；
   - `SENTRY_AUTH_TOKEN`：构建时上传 source map 的 Sentry Organization Auth Token。

Android job 需要全部 5 个 Secret：`EXPO_TOKEN` 加上 4 个 telemetry Secret；iOS job 只需要 4 个 telemetry Secret。由于当前 workflow 总是同时运行两个平台，因此即使只构建临时 artifact、不创建 Release，也要完整配置 5 个 Secret。Firebase 文件和 Token 不应提交到仓库；base64 的生成方式见 [`docs/TELEMETRY.md`](./TELEMETRY.md)。

## 触发工作流

1. 打开仓库的 **Actions** 页面，选择 **Build Android + iOS and Release**。
2. 点击 **Run workflow**，选择要运行的分支。
3. 选择 `build_mode`：

   - `build`：构建并上传临时 artifact，不创建 GitHub Release，可用于任意分支；
   - `release`：构建成功后创建与 `package.json` 版本对应的 GitHub Release，只允许 `main`。

4. `publish_release` 只对 `release` 模式有意义：关闭时创建草稿 Release，打开时构建成功后直接公开。

## 工作流做什么

1. `quality` job 使用 Node.js 24 执行 `npm ci` 和 `npm run check`，包括 TypeScript、Biome、全部测试和富文本 fixture 分析。
2. `build-android` 使用 EAS CLI 25.3.0 和 `preview` profile，在 Ubuntu 上执行 `assembleRelease` 生成四个单 ABI APK，并检查每个 APK 实际包含的 ABI。prebuild 通过 `withAndroidBuildMemory` 将 Gradle 最大堆设为 4 GB、worker 上限设为 2，并关闭跨项目并行，控制多 ABI 封装的内存峰值。`preview` 是 EAS 构建配置名称，不再写入 APK 文件名。
3. `build-ios` 使用 GitHub 的 `xcode-27` runner 及其默认 Xcode，执行干净 iOS prebuild、CocoaPods 安装和无签名 `xcodebuild`（iOS 最低版本 16.4）。该 runner 提供 iOS 27.1 或更新的 SDK，会启用 iPhone Duo 的完整屏幕布局模式；这不等同于布局已经验证，仍需用 Duo 模拟器或真机检查折叠、展开、非对称安全区及分屏布局。构建及 Sentry 上传完成后，复制 `.app` 到 `Payload`，运行 [`strip-ios-app.py`](../scripts/strip-ios-app.py) 去除局部原生符号，校验 UUID、外部符号和运行时内容不变后打包为 IPA；脚本拒绝签名包，失败会停止发布。原始构建和 dSYM 保留，匹配 dSYM 仍是完整原生栈符号化的必要输入。
4. 两个平台分别上传 artifact，临时 artifact 默认保留 7 天。
5. `release` 模式下载全部产物，从真实 IPA 生成 `altstore-source.json` 和 `SHA256SUMS.txt`，先用 arm64-v8a APK 创建草稿 Release，再上传其余附件，确保旧版一键更新仍将 arm64-v8a 识别为第一个 APK。只有全部附件上传成功后，才按 `publish_release` 公开 Release。
6. Release 的说明由 GitHub 结合 [`.github/release.yml`](../.github/release.yml) 和 PR label 自动生成；工作流额外注明 ABI、未签名 IPA 和校验文件信息。

如果任一质量或平台构建 job 失败，Release job 不会运行。代码或配置修复推送后，应在目标分支重新触发工作流；原 workflow run 的重跑仍使用原提交，仅适用于临时网络等无需改代码的问题。重新触发 `release` 前仍须使用未占用的版本号/tag。

## 发布产物

| 文件 | 说明 |
| --- | --- |
| `zhihu-minus-minus-v<version>-arm64-v8a.apk` | Android arm64-v8a 主包，默认验证包 |
| `zhihu-minus-minus-v<version>-compat-armeabi-v7a.apk` | Android 32 位 ARM 兼容包，未完成完整实机验证 |
| `zhihu-minus-minus-v<version>-compat-x86.apk` | Android 32 位 x86 兼容包，未完成完整实机验证 |
| `zhihu-minus-minus-v<version>-compat-x86_64.apk` | Android 64 位 x86 兼容包，未完成完整实机验证 |
| `zhihu-minus-minus-v<version>-unsigned.ipa` | 未签名 iOS 包，需要用户自行签名和安装 |
| `altstore-source.json` | SideStore / AltStore Classic 订阅源，指向同一 Release 的 IPA |
| `SHA256SUMS.txt` | 全部 APK、IPA 和订阅源的 SHA-256 校验值 |

从 v0.6.2 起，客户端会根据设备支持的 ABI 精确选择更新 APK。无法识别设备 ABI 或找不到匹配附件时，不会盲目下载错误架构，只保留 GitHub Release 下载入口。arm64-v8a 仍需作为第一个附件创建，以兼容 v0.6.1 及更早客户端的更新逻辑。

更新选择器同时兼容上述新文件名和历史带 `-preview-` 的文件名。尚未包含此兼容修改的 v0.6.2 及后续旧客户端只识别历史文件名；首次升级到采用新文件名的版本时，需要通过 GitHub Release 下载入口手动选择设备对应的 APK。发布工作流只生成上述四个 APK，不额外上传旧名称副本。

## iOS 侧载订阅源

SideStore 和 AltStore Classic 共用以下源地址：

```text
https://github.com/huamurui/zhihu-minus-minus/releases/latest/download/altstore-source.json
```

首次包含源文件的正式 Release 发布后，该 URL 才可用。GitHub 的 `latest` 地址仅指向公开的正式 Release：`build` 模式不会生成或发布源，草稿中的源不会覆盖公开版本。手动发布草稿前，确认其包含四个 APK、一个 IPA、订阅源和校验文件，并保持为正式 Release；后续正式版本也须通过此流程附带同名源文件，避免 `latest` 地址失效。

[`scripts/generate-altstore-source.py`](../scripts/generate-altstore-source.py) 使用 Python 3 标准库读取 IPA 中的 `Info.plist` 和应用/扩展可执行文件：版本与 bundle identifier 必须匹配 `app.json`，build number、最低 iOS 版本、权限用途和 IPA 字节数直接取自实际产物。无签名及无 entitlement 的 ad-hoc 签名都会生成空 entitlement 列表；带 XML entitlement 的签名会提取权限键，无法确认的 DER-only entitlement 或冲突权限用途会使发布失败。脚本不读取 telemetry Secret，也不依赖生成的 `ios/` 工程。

源中的 `versions` 仅包含本次发布版本，IPA 下载 URL 固定到该版本 tag，图标固定到该次构建的 commit；不会生成 `marketplaceID` 或 notarized `build` 字段。该源用于普通 IPA 侧载，签名、续期和安装由 SideStore / AltStore Classic 执行，不适用于 AltStore PAL。格式依据 [AltStore 官方文档](https://faq.altstore.io/developers/make-a-source)，SideStore 的兼容约定见 [官方说明](https://docs.sidestore.io/docs/advanced/app-sources)。

本地验证时传入已构建的 IPA：

```bash
python3 scripts/generate-altstore-source.py \
  --ipa "/path/to/zhihu-minus-minus-v<version>-unsigned.ipa" \
  --output /tmp/altstore-source.json \
  --repository huamurui/zhihu-minus-minus \
  --commit "$(git rev-parse HEAD)" \
  --date YYYY-MM-DD
npm test -- tests/altstoreSource.test.js --runInBand
```

将版本号和日期替换为本次产物对应值；同一 IPA、commit、日期和配置会产生相同源文件。本地生成只校验元数据，不会上传 IPA 或公开订阅源；实际安装、更新与签名流程仍需用正式产物在侧载工具中验证。

## Pull Request 检查与预览构建

- **常规门禁**：[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) 会在 Pull Request 和 `main` push 时使用 Node.js 24 运行 `npm ci` 与 `npm run check`。建议在分支保护规则中将 **TypeScript, Biome and tests** job 设置为合并前必须通过。
- **按需预览构建（ChatOps）**：[`.github/workflows/pr-build.yml`](../.github/workflows/pr-build.yml) 允许仓库维护者在任意 Pull Request 下通过评论指令按需触发完整正式包的构建并生成下载链接：
  - `/build` 或 `/build-apk`：构建 4 个 Android 单 ABI APK（默认，耗时约 5 分钟）；
  - `/build-ios`：使用 `xcode-27` runner 的默认 Xcode 构建无签名 iOS IPA；
  - `/build-all`：同时构建 Android APK 与 iOS IPA。
  
  权限与安全规则：
  1. 仅具备仓库 `write` 或 `admin` 权限的协作者可以触发；非维护者触发会被自动驳回，防止外部 Fork PR 滥用 Actions 额度或访问 Secrets。
  2. 指令触发时，机器人会先为该评论添加 🚀 表情响应；构建完成后会自动在 PR 回复包含该次 commit 对应 Artifacts 下载直达链接的说明（保留 7 天）。
  3. 亦可在 GitHub Actions 页面选择 **PR Preview Build (ChatOps)**，输入 PR 编号并选择目标平台手动运行。

## 依赖更新策略

Expo SDK 会约束 React Native 与大量 `expo-*` 包的兼容版本，不能把单个 Expo 模块直接跨 SDK 升级。因此 Dependabot 采用保守策略：

- npm 普通版本更新每月检查一次，只允许 patch，并合并为一个 PR；
- npm 安全更新单独分组，不受普通版本更新级别限制；
- GitHub Actions 每月检查一次，只允许 minor/patch，并合并为一个 PR；
- Expo SDK 主版本升级由维护者手动执行，并使用 `npx expo install --check` 校验整套依赖。

SDK 58 使用 React Native 0.88、React 19.3 与 Node.js 24。NativeWind 4/Tailwind 3、Firebase 26 的 CocoaPods 链路及 TypeScript 6 的编译器 API 暂时保留，升级边界见 [开发指南](./DEVELOPMENT.md#sdk-58-升级与依赖边界)。原生依赖升级后，发布前须重新生成双平台工程并实际构建，不能仅沿用此前 SDK 的验证记录。

依赖 PR 必须包含同步更新的 `package-lock.json` 并通过 `npm ci`。若 `npm ci` 报告 manifest 与 lock file 不一致，该 PR 不应合并。
