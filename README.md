# 🐱 知乎 -- (Zhihu Minus Minus)

![zhihu--](./assets/images/favicon.svg)

一款轻量级、纯净、无广告的第三方知乎客户端，基于 **React Native (Expo)** 构建。旨在回归阅读本质，提供极致丝滑的知乎浏览体验。

## ✨ 特性

- **极致纯净**: 只有你想看的内容，没有广告，没有臃肿的功能。
- **顺滑体验**: 使用 `@shopify/flash-list` 深度优化，列表滚动极度丝滑，媲美原生。
- **沉浸式阅读**: 完美适配 iOS/Android 系统亮色与暗色模式，专注每一个文字。
- **功能完备**:
  - **首页**: 热榜、推荐、关注动态。
  - **日报**: 完整集成知乎日报，回顾过往精彩。
  - **详情**: 优雅的问题展示、回答/文章详情、评论交互（支持二级回复）。
  - **个人**: 我的主页、个人点赞/收藏、浏览历史记录。
- **现代化架构**: 全面拥抱 Expo Router、TanStack Query V5、Tailwind CSS (NativeWind) 和 Zustand。

## 🛠️ 技术栈

- **框架**: [Expo SDK 55](https://expo.dev/) (React Native 0.83+)
- **路由**: Expo Router (Typed Routes) 基于文件系统的强类型路由。
- **数据**: TanStack Query (React Query) + Axios (自校验签名拦截)。
- **样式**: NativeWind (Tailwind CSS for React Native)。
- **状态**: Zustand (持久化全局配置)。
- **动效**: React Native Reanimated + Expo Haptics 触感反馈。
- **Cookie**: `@react-native-cookies/cookies` & `react-native-nitro-cookies`。

## 🚀 快速开始

本项目涉及到原生 Cookie 管理库，推荐使用 **Development Build** 进行开发。

1. **准备环境**
   ```bash
   npm install -g expo-cli
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **运行 Android** (需要 ADB 或模拟器环境)
   ```bash
   npm run android
   ```

4. **运行 iOS** (需要 Mac 且安装 Xcode)
   ```bash
   npm run ios
   ```

## 🔐 登录说明

由于知乎 API 的安全性限制（X-ZSE-96 等），目前采用 WebView 自动拦截方案：
- 打开应用 -> 进入“我的” -> 点击登录按钮。
- 在弹出的扫码或验证码页面完成登录。
- 应用会自动捕捉 `z_c0` (Token) 等关键 Cookie 并安全地存储在 `SecureStore` 中，后续 API 请求将自动带上凭证和签名。

## 🚧 开发计划 (Roadmap)

- [x] 知乎日报集成 (Daily Feed)
- [x] 首页热榜与推荐流
- [x] 高性能回答/文章阅读引擎
- [x] 二级架构评论系统
- [x] 个人中心与历史记录 (History)
- [x] 自动签名算法 (X-ZSE-96)
- [x] 点赞/收藏管理
- [ ] 深度搜索功能 (Search)
- [ ] 动态发表与富文本编辑
- [ ] 图片/视频全屏预览优化

---

## 🤝 贡献与声明

- **免责声明**: 本项目仅供学习交流使用，不建议用于商业用途。
- **License**: GPL-3.0 license

---
**Author**: [huamurui](https://github.com/huamurui) & [Antigravity Agent] 🐱
