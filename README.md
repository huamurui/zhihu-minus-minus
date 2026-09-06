# 🐱 知乎-- (Zhihu Minus Minus)

> [!IMPORTANT]
> **🚧 项目声明**：本项目目前核心功能基本稳定，但仍有不完善之处；知乎 API 的变动也可能导致部分功能失效。
>
> 欢迎提交 Issue、Pull Request 或 Fork 参与改进。也可以看看其他客户端：
> - <https://github.com/zhihulite/Hydrogen>  
> - <https://github.com/zly2006/zhihu-plus-plus>

![zhihu--](./assets/images/favicon.svg)

一款轻量级、纯净、无广告的第三方知乎客户端，基于 **React Native (Expo)** 构建。旨在回归阅读本质，提供极致丝滑的知乎浏览体验。

## ✨ 特性

- **纯净与轻量**: 只有你想看的内容，没有广告，没有臃肿的功能。
- **沉浸式体验**: 适配系统亮色与暗色模式，支持**全局主题色自定义**，支持感应设备自动旋转。
- **多账号与游客**: 支持**多账号无缝切换**，并提供基础阅读的**游客模式**（免登录浏览 Feed 流）。
- **完善的功能**:
  - **首页**: 热榜、推荐、关注动态。顶部 Tab 实时联动，底部 Tab 支持点击刷新。
  - **滑动浏览**: 首页子频道、发布中心、个人中心通过统一的水平滑动轴无缝切换；问题详情页支持**左右滑动快速切换回答**。
  - **搜索**: 全站与个人主页深度搜索，支持联想词、综合搜索、用户搜索及关键词高亮。
  - **内容渲染**: 集中维护的富文本渲染模块，支持图片、公式、链接卡片、段落互动与回答详情预取。
  - **互动交流**: 完善的评论区交互（支持查看图片、二级回复），支持文章 (Articles)、想法与话题 (Topics) 的展示与评论。
  - **个人中心**: 个人主页展示。支持**多收藏夹管理**、**浏览历史记录云端同步**（可选开启/多选删除/一键清空）、全面的关注列表（用户/专栏/话题/收藏夹）。
- **深度链接 (Deep Linking)**: 完整支持 `zhihu.com` 外部链接及 `zhihu://` 协议唤起应用，知乎内部链接智能归一化跳转。
- **个性化交互设置**: 自由定制列表点击反馈（安卓水波纹 / 透明度+缩放模式），自定义动画数值。
- **一键更新**: 支持从 GitHub Releases 自动检测并下载安装新版本。
- **现代化架构**: 全面拥抱 Expo Router、TanStack Query V5、Tailwind CSS (NativeWind) 和 Zustand。

## 📸 界面预览

<div align="center">
  <table style="border-collapse: separate; border-spacing: 15px;">
    <tr>
      <td align="center" valign="top">
        <img src="./screenshot/v0.0.4/photo_2026-03-12_23-31-07.jpg" width="160" style="border-radius: 16px; border: 1px solid #eee; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" />
        <br /><br />
        <b>搜索</b><br />
      </td>
      <td align="center" valign="top">
        <img src="./screenshot/v0.1.3/Screenshot_20260705_190342.jpg" width="160" style="border-radius: 16px; border: 1px solid #eee; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" />
        <br /><br />
        <b>问题详情</b><br />
      </td>
      <td align="center" valign="top">
        <img src="./screenshot/v0.0.4/photo_2026-03-12_23-33-16.jpg" width="160" style="border-radius: 16px; border: 1px solid #eee; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" />
        <br /><br />
        <b>夜间模式</b><br />
      </td>
      <td align="center" valign="top">
        <img src="./screenshot/v0.1.3/Screenshot_20260705_190004.jpg" width="160" style="border-radius: 16px; border: 1px solid #eee; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" />
        <br /><br />
        <b>关注更新</b><br />
      </td>
      <td align="center" valign="top">
        <img src="./screenshot/v0.0.4/photo_2026-03-12_23-31-25.jpg" width="160" style="border-radius: 16px; border: 1px solid #eee; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" />
        <br /><br />
        <b>段落交互</b><br />
      </td>
    </tr>
  </table>
</div>

## 📦 下载与安装

### 🤖 Android

你可以直接前往 [GitHub Releases](https://github.com/huamurui/zhihu-minus-minus/releases) 下载最新的 APK 文件进行安装。

> [!NOTE]
> 请留意 APK 文件名。当前 preview 构建只包含 `arm64-v8a`，不支持 32 位或 x86 设备。

也可以从源码构建：

1. `git clone` 本仓库。
2. 安装环境（参考下方的 **快速开始**）。
3. 生成原生工程并运行本地 EAS 构建：

```bash
npm run prebuild
eas build --platform android --profile preview --local
```

Windows 无法运行 `eas build --local`，请使用 [Windows 本地构建指南](./BUILD_WINDOWS.md) 中的 Gradle 流程。

### 🍎 iOS

本应用不会在 App Store 上架。
[GitHub Releases](https://github.com/huamurui/zhihu-minus-minus/releases) 可以在这里找找，有尝试打包的未签名 ipa 但我没什么 ios 越狱经验和设备，可能无法使用。

- rn 打的 ipa 包 ios 最低要求 ios15.1，但具体什么情况不清楚喵...

如果你有 mac，可以试试自己打包：

1. `git clone` 本仓库。
2. 安装环境（参考下方的 **快速开始**）。
3. 使用自己的 Apple ID 在 Xcode 中进行签名并编译到真机。

```bash
npm run prebuild -- --platform ios
cd ios && pod install
npx expo run:ios --configuration Release --device
```

⬆️ 这个在 ios26 也不好用了，建议 Xcode 里 build。

(有认试过 expo 的线上打包一定要 apple 开发者账号哦...)

## 🚀 快速开始

Windows 上启动、调试和打包 Android 应用，请参考 [Windows 本地构建指南](./BUILD_WINDOWS.md)。

本项目涉及到一些原生库，推荐使用 **Development Build** 进行开发。

基础环境：

- Node.js 20 或更高版本、npm；
- Android：JDK 17、Android SDK、ADB 或模拟器；
- iOS：macOS、Xcode、CocoaPods；
- EAS CLI 仅在使用 EAS 构建时需要。

1. **安装依赖**

```bash
npm ci
```

2. **生成原生项目目录**

```bash
npm run prebuild
```

`android/` 与 `ios/` 是生成物且不会提交到仓库。修改原生依赖、原生配置或 `app.json` 后需要重新运行 prebuild。

3. **运行 Android**（需要 ADB 或模拟器环境）

```bash
npm run android
```

4. **运行 iOS**（需要 Mac 且安装 Xcode）

```bash
npm run ios
```

### 提交前验证

```bash
npm run check
```

`npm run check` 会依次执行 TypeScript、Biome、全部测试和富文本 fixture 分析。全仓只读检查也可单独运行 `npm run lint`；需要应用 Biome 修复时使用 `npm run lint:fix`，并逐项复核改动。截至 2026-09-05（基于 `906aade` 的未提交工作流改动），聚合检查通过；全仓 Biome 为 0 个 error、143 个 warning，详情见 [最新代码审查记录](./docs/CODE_REVIEW_2026-09-05.md)。

富文本模块的目录约定、fixture 与专项命令见 [features/rich-content/README.md](./features/rich-content/README.md)。面向自动化开发者的维护规则见 [AGENTS.md](./AGENTS.md)。

## 📦 GitHub Actions

本项目配置了两类 GitHub Actions 工作流：

- **Pull Request 与 main 分支质量检查**（[`.github/workflows/ci.yml`](.github/workflows/ci.yml)）
- **同时构建 Android APK、iOS 未签名 IPA 并创建 Release**（[`.github/workflows/build.yaml`](.github/workflows/build.yaml)）

### 1. 前置准备 (Fork 与 Secrets 配置)

1. **Fork 仓库**：点击项目右上角的 **Fork** 按钮，将仓库复制到你自己的 GitHub 账号下。
2. **启用 Actions**：进入你 Fork 的仓库，点击 **Actions** 标签页，点击 *“I understand my workflows, go ahead and enable them”* 开启工作流权限。
3. **配置密钥 (Secrets)**：在 Fork 仓库设置中（`Settings` -> `Secrets and variables` -> `Actions`）点击 **New repository secret** 添加：
   - `EXPO_TOKEN` *(Android 构建必填)*: 你的 Expo Token（需先在 [Expo 官网](https://expo.dev) 注册账号，然后在 [Access Tokens](https://expo.dev/settings/access-tokens) 页面新建并复制 Token）。
   - `FIREBASE_ANDROID_JSON_B64` *(可选)*：需要 Firebase 配置时提供 base64 内容；未设置会自动跳过。

### 2. 触发打包步骤

1. 同步修改 `package.json` 与 `app.json` 的版本号，提交并推送到 `main`。
2. 进入仓库的 **Actions** 页面，选择 **Build Android + iOS and Release**。
3. 点击 **Run workflow** 并选择 `main`。默认生成草稿 Release；勾选 `publish_release` 后会在成功构建后直接公开发布。

> [!NOTE]
> Ubuntu 和 macOS job 会在同一次运行中分别构建 APK 与 IPA，再由 Release job 自动下载两个 artifact、生成 `SHA256SUMS.txt` 并上传，无需手动中转 IPA。完整流程和失败重试说明见 [发布指南](./docs/RELEASING.md)。

## 🔐 登录说明

由于知乎 API 的安全性限制（X-ZSE-96 等），目前采用 WebView 自动拦截方案：

- 打开应用 -> 进入“我的” -> 点击登录按钮。
- 在弹出的登录界面完成登录。

## 📝 RoadMap

- [suisuinian.md](./suisuinian.md)

## 🤝 贡献与声明

- **免责声明**: 本项目仅供学习交流使用，不建议用于商业用途。
- **License**: GPL-3.0 license

### 👥 贡献者 (Contributors)

<a href="https://github.com/huamurui/zhihu-minus-minus/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=huamurui/zhihu-minus-minus" />
</a>

---
**Version**: v0.5.0 | **Last Updated**: 2026-09-05
