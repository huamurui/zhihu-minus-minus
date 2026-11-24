以下文档是 [Xeonzilla](https://github.com/Xeonzilla) 整理，尝试在 windows 上启动调试并打包 Android 端 app 的指南。  

特别的，由于 expo 官方的打包命令工具 `eas build --local` 强依赖 linux/macos 环境。所以 win 打包不能用这个，详见下方 `四、构建 APK`。

文章大半在处理网络环境和安卓打包的常规问题，对于 windows 打包生产 apk 核心是下面这几行

```powershell
# 1. 生成原生 Android 工程
npx expo prebuild --platform android

# 2. 禁用 Sentry 自动上传（本地没有 auth token 会卡住）
$env:SENTRY_DISABLE_AUTO_UPLOAD = "true"; $env:SENTRY_NO_UPLOAD = "1"

# 3. 编译打包 (指定 arm64 架构提速)
cd android; .\gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a

```

下文也有提到关于开发模式的运行，如果可以 

```bash
npm run android
```

这样可以的话，就不要使用原生安卓开发的那一套命令了。

---

# Windows 本地构建 Android APK 指南

> 适用范围：在 Windows 上从源码本地构建本项目（Expo 58 / React Native 0.88）的 Android APK，无需 EAS 云构建、无需 Android Studio。
> 流程源于 2026-08 Windows 10 的构建记录，现已更新 SDK 58 环境要求；旧记录不代表 SDK 58 已完成 Windows 构建或真机验证。

## 一、环境准备

| 组件 | 要求 | 说明 |
|---|---|---|
| Node.js | **24.x** | 与 CI 和发布工作流保持一致，运行 Expo / Metro |
| JDK | **17**（LTS） | 与项目构建基线一致，Gradle 版本以 prebuild 生成的 wrapper 为准 |
| Android SDK | 命令行工具即可 | 不需要完整 Android Studio |

先完成下一节的 `npm ci` 与 prebuild，再按生成的 Android 工程安装 SDK 组件。检查 `android/build.gradle`、`android/gradle.properties` 及 React Native Gradle 配置中的 `compileSdkVersion`、`buildToolsVersion`、`ndkVersion` 和 CMake 版本，不沿用 SDK 55 的 API 36 / NDK 27.1 固定清单。安装命令形式如下（把尖括号替换为生成配置的实际值）：

```powershell
sdkmanager "platforms;android-<compileSdkVersion>" "build-tools;<buildToolsVersion>" "ndk;<ndkVersion>" "cmake;<cmakeVersion>" "platform-tools"
```

安装后执行 `sdkmanager --licenses` 接受全部许可。

环境变量：
- `JAVA_HOME` → JDK 17 安装目录
- `ANDROID_HOME` 与 `ANDROID_SDK_ROOT` → SDK 根目录（两者指向同一路径，部分工具只认其中一个）

> 使用 scoop 的参考做法：`scoop bucket add java`，然后 `scoop install temurin17-jdk android-clt`，scoop 会自动设置 `JAVA_HOME` / `ANDROID_HOME`，`ANDROID_SDK_ROOT` 需手动补设。

## 二、安装依赖并生成原生工程

```powershell
npm ci               # 按 package-lock.json 安装；postinstall 会自动执行 patch-package
npx expo prebuild --platform android    # 生成 android/ 目录（已被 .gitignore 忽略）
```

从 SDK 55 更新时，先保留本机必要的生成目录配置，再运行 `npx expo prebuild --platform android --clean`，重新构建并安装开发包；旧包不包含新原生模块。

**重要**：`android/` 是 `expo prebuild` 的生成物，不入库。这意味着：
1. 下文对 `android/` 内文件的所有手工修改（镜像 URL 等）在**每次重新 prebuild 后都会被重置**，需要重做；
2. 反过来，拉取上游代码后 `android/` **不会自动更新**——若 `app.json` 的 `version` 或其他原生字段变了，必须重新 prebuild，否则打出的包版本号或原生配置可能仍是旧的。

## 三、国内网络镜像配置（关键）

国内网络环境下有三处会被墙/超时，不处理则构建必失败：

### 3.1 Gradle 发行包（services.gradle.org 超时）

wrapper 的下载地址与版本由 prebuild 模板决定。若 `services.gradle.org` 超时，可为同一版本换源；不要为了匹配旧文档降级 Gradle。

改 `android/gradle/wrapper/gradle-wrapper.properties` 的 `distributionUrl` 为国内镜像：

```properties
distributionUrl=https\://mirrors.cloud.tencent.com/gradle/gradle-<当前版本>-bin.zip
```

（或先手动下载 zip，再指向本地文件 `file\:///D:/path/to/gradle-<当前版本>-bin.zip`。）

### 3.2 Google Maven 仓库（dl.google.com TLS 阻断）

androidx 等依赖从 `dl.google.com` 下载时会报 `Remote host terminated the handshake`（报错文案有误导性，实为国内对 Google 源的 TLS 阻断，并非 TLS 版本问题）。mavenCentral 本身可达，只有 Google 源必须走镜像。

新建全局初始化脚本 `C:\Users\<你>\.gradle\init.d\aliyun-mirror.gradle`，前置阿里云镜像（对所有 Gradle 项目生效，删除该文件即还原）：

```groovy
allprojects {
    repositories {
        maven { url 'https://maven.aliyun.com/repository/google' }
        maven { url 'https://maven.aliyun.com/repository/central' }
        maven { url 'https://maven.aliyun.com/repository/public' }
        maven { url 'https://maven.aliyun.com/repository/gradle-plugin' }
    }
    buildscript {
        repositories {
            maven { url 'https://maven.aliyun.com/repository/google' }
            maven { url 'https://maven.aliyun.com/repository/central' }
            maven { url 'https://maven.aliyun.com/repository/gradle-plugin' }
        }
    }
}
```

### 3.3 间歇性 TLS 握手中断（高并发下载）

即使换了镜像，高并发下载时仍可能出现零星 `Remote host terminated the handshake`（每次失败的包不同）。对策：

在全局 `C:\Users\<你>\.gradle\gradle.properties` 中提高重试次数：

```properties
systemProp.org.gradle.internal.repository.max.retries=10
```

并在构建命令中加 `--no-parallel` 降低并发（见下文）。

## 四、构建 APK

以下命令均在**项目根目录**执行（PowerShell）。

### 4.1 Debug 包（开发用 dev-client）

```powershell
Push-Location android
& .\gradlew.bat :app:assembleDebug -PreactNativeArchitectures=arm64-v8a --no-parallel --console=plain
Pop-Location
```

产物位于 `android/app/build/outputs/apk/debug/`。启用本项目 ABI split 后，ARM64 文件名为 `app-arm64-v8a-debug.apk`，不能继续使用旧的 universal `app-debug.apk` 路径；以实际目录输出为准。

- `-PreactNativeArchitectures=arm64-v8a`：原生编译与 ABI split 都只选择 ARM64，产物为 `app-arm64-v8a-debug.apk`（Release 为 `app-arm64-v8a-release.apk`）；实际提速取决于缓存与机器。可以用逗号指定多个受支持 ABI；空值或非法 ABI 会中止构建。首次使用更新后的插件时先重新执行 `npx expo prebuild --platform android --no-install`，它会更新已有 split 块。缺省配置仍生成四种独立 ABI APK，CI 的四 ABI 构建不受影响。构建目录可能残留此前的 APK，以本次 `output-metadata.json` 和 APK 内的 `lib/` 为准。
- **debug 包不打包 JS**（`debuggableVariants` 默认含 `debug`），必须连 Metro 才能运行，不能脱机日用；它是 dev-client，启动进开发菜单。

### 4.2 Release 包（可脱机日用）

Release 构建会触发 Sentry sourcemap 上传，本地没有 `SENTRY_AUTH_TOKEN` 时应禁用上传。CI 则提供 Secret 并执行上传：

```powershell
$env:SENTRY_DISABLE_AUTO_UPLOAD = "true"
$env:SENTRY_NO_UPLOAD = "1"
Push-Location android
& .\gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-parallel --console=plain
Pop-Location
```

产物位于 `android/app/build/outputs/apk/release/`，ARM64 文件名为 `app-arm64-v8a-release.apk`，内置 JS，可离线运行。包体积和构建时间随依赖、缓存与机器变化，不沿用旧版本测量作为当前基线。

Sentry 8.28.0 的 Metro 解析器需要识别 Windows 路径分隔符，否则打包可能成功，应用却在冷启动时因缺少 `buildFeedbackIntegration` 而退出。`npm ci` 自动应用[项目补丁](../patches/@sentry+react-native+8.28.0.patch)。升级 Sentry 后可运行 `npm test -- tests/metroSourcemaps.test.js --runInBand` 并在设备上冷启动本地 Release 包。

> 注意：`expo prebuild` 生成的本地 Android 工程通常使用本机的 debug keystore 为这个 release 变体签名；GitHub Actions 中的 EAS preview 构建可能使用 EAS 管理的另一份凭据。只有两个 APK 的 applicationId 与签名证书都一致时才能互相覆盖安装。若签名不同，需要先卸载旧包（会清除应用数据），或显式为两条构建链配置同一份 keystore。

**坑**：release 构建期间不要同时开着 Metro——编译原生 C++ 时会在 `node_modules/*/android/.cxx` 下快速创建/删除临时目录，Metro 的文件扫描器会撞上 ENOENT 直接崩溃，等构建完再启动 Metro。

## 五、装机与开发调试（Debug 包）

```powershell
adb install -r android\app\build\outputs\apk\debug\app-arm64-v8a-debug.apk
adb reverse tcp:8081 tcp:8081
npx expo start --dev-client
# 让 dev-client 直接连上本机 Metro：
adb shell am start -a android.intent.action.VIEW -d 'zhihu--://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081'
```

之后修改 TS 代码即 Fast Refresh 热更新，无需重新构建原生（除非改动原生依赖、patches 或 `app.json` 的原生字段）。

### 可选：让 debug 包与日用正式版共存

默认 debug 与 release 的 applicationId 相同，会互相覆盖。在 `android/app/build.gradle` 的 `buildTypes.debug` 中加：

```groovy
applicationIdSuffix '.debug'
versionNameSuffix '-debug'
```

即得独立包名 `com.huamu013.ZhihuMinusMinus.debug`。（同样是生成物改动，重新 prebuild 后需重加；长期方案是写成 Expo config plugin。）

### 已知机型坑：ColorOS 拦截全新包安装

ColorOS 对 adb 安装**全新 applicationId** 的包会拦截并报误导性错误（如"不支持的文件格式"），而覆盖更新已存在的包则放行。root 机可绕过：

```powershell
adb push app.apk /data/local/tmp/x.apk
adb shell su -c "pm install -r -d /data/local/tmp/x.apk"
```

### dev-client 的验证盲区

dev-client 冷启动先进 expo-dev-launcher 界面、不会自动连 Metro，因此**无法验证"清后台 → 点外部链接冷启动"类场景**（deep link 直达页面）。此类验证必须安装本地 release 包，再用 adb 模拟外部点击：

```powershell
adb shell am start -a android.intent.action.VIEW -d "https://zhuanlan.zhihu.com/p/<id>" com.huamu013.ZhihuMinusMinus
```

## 六、常见问题速查

| 现象 | 原因 | 解法 |
|---|---|---|
| wrapper 下载 Gradle 超时 | services.gradle.org 被墙 | §3.1 换腾讯/华为镜像 |
| `Remote host terminated the handshake`（androidx 依赖） | dl.google.com TLS 阻断 | §3.2 阿里云镜像 init 脚本 |
| 换镜像后仍零星 handshake 失败 | 高并发 TLS 连接被 RST | §3.3 提高重试 + `--no-parallel` |
| assembleRelease 在 Sentry 阶段失败 | 缺 SENTRY_AUTH_TOKEN | §4.2 两个环境变量禁用上传 |
| release 构建中 Metro 崩溃（exit 7） | .cxx 临时目录竞争 | 构建期间不开 Metro |
| 打出的包版本号是旧的 | android/ 生成物未随 git 更新 | 重新 prebuild |
| tsc 满屏路由类型错误 | typedRoutes 类型未生成 | 先 `npx expo start` 一次，生成 `.expo/types` |
| ColorOS 装不上新包 | 系统拦截全新包名 | 覆盖安装放行；或 root 后 pm install |
