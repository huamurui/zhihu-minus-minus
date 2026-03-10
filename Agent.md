# 🐱 Agent.md | 项目技术内核与开发手册

本文档是 **Zhihu--** (Zhihu Minus Minus) 项目的核心知识库，也是 Antigravity 与人类合作伙伴共同演进的“航海日志”。它为全系项目的后续维护、功能扩展及 Agent 协助开发提供最高优先级的参考指引。

---

## 🧭 项目架构蓝图

### 1. 通信枢纽 (Networking)
- **核心引擎**: `Axios` + `React Query V5`。
- **签名逻辑**: 集成 `x-zse-96` 签名算法与 `x-zse-93` (ZSE_VERSION: `101_3_3.0`)。拦截器位于 `api/client.ts`。
- **Cookie 策略**: 使用 `react-native-cookies` 在 iOS/Android 原生层拦截 `z_c0` (身份令牌) 与 `d_c0` (设备/加签因子)。
- **User-Agent**: 精确模拟移动端 Chrome 146.0+，以规避大部分 403 频率限制。

### 2. 状态指挥部 (State Management)
- **Zustand (Global)**:
  - `useAuthStore`: 管理登录凭据与全局身份态。
  - `useThemeStore`: 控制亮/暗模式（自动跟随系统及手动覆盖）。

### 3. UI 施工指南 (Design System)
- **NativeWind**: 统一的原子化样式方案。配置文件位于 `tailwind.config.js`。
- **FlashList**: 强制要求在所有 Feed、评论、通知列表项目中使用 `FlashList`，以保证列表帧率。
- **Colors**: 色彩定义详见 `constants/Colors.ts`，主色调知乎蓝 `#0084ff`。

---

## 🛠️ 关键业务逻辑拆解

### 🔐 自动登录与绕过
- **原理**: 嵌入式 `WebView` 捕获拦截。
- **链路**: 
  - 用户手动进入 `login/` 路由。
  - 登录完成后，拦截器检测到 Cookie 重载或 `z_c0` 存在。
  - 通过 `expo-secure-store` 存储 `user_cookies`。
  - 后续请求自动注入 `Cookie`, `Referer: https://www.zhihu.com/`。

### 🧩 资源 ID 与路由解析
- 在解析首页/推荐 Feed 时，需从 `target` 对象中动态探测类型：
  - `question`: 跳转路径 `/question/[id]`
  - `answer`: 跳转路径 `/answer/[id]` (需携带 `question_id`)
  - `article`: 跳转路径 `https://zhuanlan.zhihu.com/p/[id]`
- **核心规则**: 始终优先通过 `target.question.id` 进行跳转，防止 404 失效 ID。

---

## 🏛️ 项目演进里程碑 (Changelog)

- **v0.0.2**:
  - **添加、修复链接跳转与 api**: 热榜，个人页面信息跳转
  - **添加反馈页面**
  - **实现收藏功能**
  - **问题关注，反对回答等 api** 
- **v0.0.1**: 
  - **搜索系统**: 完整实现带高亮与建议库的深度搜索。
  - **导航优化**: 首页切换改为 PagerView 滑动，优化 Tab Bar 与通知角标。
  - **交互增强**: 完善粉丝/关注列表、点赞/收藏状态同步。
- **v0.0.0**: 重构 `user/` 模块，新增“我的收藏”、“我的点赞”及通知聚合。

---

## 📝 开发者/Agent 待办 (TODO)

- [ ] **搜索增强**: 适配 ZSE 加签的搜索接口封装。
- [ ] **富文本对齐**: 修复 `react-native-render-html` 在暗黑模式下某些 HTML 实体的配色冲突。
- [ ] **离线化**: 针对知乎日报实现更激进的 `React Query` 持久化缓存。
- [ ] **打包优化**: 针对 Android AAB 精简无用 Native Modules。

---

## ⚠️ 避坑锦囊 (Gotchas)

1. **403 Forbidden**: 如果签名逻辑正常，检查 `include` 参数。复杂的 `include` 可能会触发更严格的 ZSE 校验位。
2. **FlashList Layout**: 如果列表底部留白异常，检查 `contentContainerStyle` 与 `paddingBottom`。
3. **Cookie Sync**: `WebView` 与 `Axios` 的 Cookie 同步在部分 Android 版本上有延迟，建议手动触发一次 `SecureStore` 重刷。

---
**Status**: 🏗️ 持续开发中 (v0.0.2) - 核心功能与基础架构迭代中  
**Last Updated**: 2026-03-10