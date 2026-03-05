这是一份为您整理的项目总结文档 `Agent.md`。它记录了我们从零开始构建这个 **“知乎猫咪版” (Zhihu-RN-Client)** 的所有核心技术细节、架构设计以及填坑指南。

你可以将此文档保存在项目根目录下，作为你后续开发或重构的“航海日志”喵！

---

# 🐱 Zhihu-RN-Client | 项目开发手册

这是一个基于 **React Native (Expo)** 构建的第三方知乎客户端。项目旨在提供纯净、无广告的阅读体验，并深度适配亮暗模式。

## 🛠 技术栈
*   **框架**: Expo (SDK 50+) + React Native
*   **路由**: Expo Router (基于文件系统的强类型路由)
*   **数据流**: TanStack Query v5 (原 React Query)
*   **网络**: Axios (配置 Cookie 拦截与 User-Agent 伪装)
*   **状态管理**: Zustand (持久化存储主题状态)
*   **性能列表**: @shopify/flash-list (高性能丝滑滚动)
*   **动画**: React Native Reanimated (点赞缩放、平滑过渡)
*   **样式**: StyleSheet (知乎蓝品牌色: `#0084ff`)

## 📂 项目结构
```text
/
├── app/                    # Expo Router 路由目录
│   ├── (tabs)/             # 底部 Tab 组 (首页、日报、我的)
│   ├── article/            # 知乎日报详情页 [id].tsx
│   ├── question/           # 问题详情页 [id].tsx
│   ├── answer/             # 回答详情页 [id].tsx
│   ├── user/               # 用户主页 [id].tsx
│   ├── comments/           # 评论列表与二级回复
│   ├── login.tsx           # WebView 登录拦截页
│   └── _layout.tsx         # 全局 Providers 与路由栈配置
├── src/
│   ├── api/                # Axios 实例与请求拦截器
│   ├── components/         # 公共组件 (FeedCard, LikeButton 等)
│   ├── store/              # Zustand 主题存储
│   └── constants/          # 颜色、API 地址常量
└── Agent.md                # 本开发手册
```

## 🔐 核心逻辑实现

### 1. 登录与 Cookie 拦截
*   **实现方式**: 使用 `react-native-webview` 加载知乎登录页。
*   **逻辑**: 注入 JavaScript 定时抓取 `document.cookie`，检测到 `z_c0` (Token) 后使用 `expo-secure-store` 持久化，并自动 `router.back()`。
*   **关键点**: `x-xsrf-token` 需从 Cookie 中动态提取，用于 `POST` 评论等操作。

### 2. API 适配与绕过 403/404
*   **404 修复**: 区分 `Question ID` 与 `Answer ID`。在首页解析时，确保点击标题跳转时使用的是 `target.question.id`。
*   **403 规避**: 
    *   伪装 `User-Agent` 为真实移动端浏览器。
    *   配置 `Referer: https://www.zhihu.com/`。
    *   精简 `include` 查询参数，避免触发 `x-zse-96` 高级签名校验。

### 3. 全局主题切换 (Theming)
*   **状态管理**: Zustand 监听系统配色并支持手动开关。
*   **适配**: 页面通过 `useThemeStore` 获取 `isDark` 状态，动态计算 `theme` 对象（背景、文字、边框色）。

### 4. 交互细节
*   **FeedCard**: 采用多热区点击设计（头像->用户、标题->问题、内容->回答）。
*   **LikeButton**: 基于 Reanimated 的 `withSequence` 实现点赞震动反馈与缩放动画。
*   **评论系统**: 支持展示 `child_comments` 及其对应的回复关系。

## 🚀 快速启动指南
1.  **安装依赖**:
    ```bash
    npx expo install @shopify/flash-list @tanstack/react-query axios react-native-webview expo-secure-store zustand react-native-reanimated react-native-render-html
    ```
2.  **路径别名**:
    确保 `tsconfig.json` 配置了 `"@/*": ["./src/*"]`。
3.  **启动项目**:
    ```bash
    npx expo start -c
    ```

## ⚠️ 踩坑记录
*   **路由类型报错**: 若 `router.push` 报错路径不存在，执行 `npx expo start -c` 重新生成 `.expo/types`。
*   **知乎接口变动**: 若出现 `10003` 错误，说明 `v4` 接口签名升级，需优先尝试 `v3` 接口或简化 `include`。
*   **WebView 无法登录**: 需设置正确的 `userAgent` 属性，否则知乎会强制跳转 App Store。

---
**Status**: 核心阅读功能已完成（v0.5-alpha）
**Author**: 猫咪程序员与他的 Agent 助手 🐱
**Next Step**: 视频播放支持 & 搜索功能实现。