# Rich content rendering

这个目录集中维护知乎富文本渲染的运行时代码、设计记录、真实内容样本、分析工具和回归测试。业务页面只从本模块的 `index.ts` 导入渲染能力，避免实现、样本和验证逻辑散落在仓库各处。

对应 GitHub Issue：[#40](https://github.com/huamurui/zhihu-minus-minus/issues/40)

## 目录

- `components/`：当前 RNRH 渲染器、WebView/DOM 实验实现，以及只在开发案例页启用的 `react-native-enriched-html` PoC。
- `normalization/`：知乎 HTML 到受限 Enriched HTML dialect 的清洗与语义降级。
- `docs/`：Renderer V2 架构、真机基准计划和阶段性结论。
- `fixtures/inbox/`：可以持续投递的脱敏知乎 API `.json` 样本。
- `fixtures/cases/`：已经登记精确期望值的稳定回归案例。
- `fixtures/manifest.json`：稳定案例的来源、特征、正文路径和结构/元数据断言。
- `tests/`：不依赖 React Native 运行时的 fixture 回归测试。
- `tools/`：内容复杂度分析和后续基准辅助工具。
- `queryPolicy.ts`：列表正文复用、统一查询 key 和 Pager 相邻预取策略。
- `index.ts`：供应用层使用的稳定公共入口。

`components/ZhihuContent.tsx` 和 `components/ZhihuDOMContent.tsx` 仅保留兼容转发，不再包含实现。新代码统一使用：

```ts
import { ZhihuContent } from '@/features/rich-content';
```

## 常用命令

```bash
npm run analyze:rich-content
npm run analyze:rich-content:inbox
npm run test:rich-content
```

第一个分析命令校验 manifest 中的稳定案例；带 `inbox` 的命令递归扫描新投递文件，只输出结构统计，不要求先维护 manifest。对于完整知乎 API JSON，案例通过 `contentPath` 选择正文，同时可以用 `expectedMetadata` 覆盖作者、问题、徽章、反应、权限、截断状态、@ 提及和 # 话题等正文之外或 HTML 属性之外的行为输入。

## 开发构建案例页

开发构建可从“我的 → 富文本测试案例（开发）”打开案例列表。列表读取 `fixtures/manifest.json`，支持按 ID、来源类型和 trait 搜索；进入案例后可以在 RNRH、现有 WebView 和 EnrichedText 实验后端之间切换，并可重新挂载正文以观察冷渲染。正文交互默认关闭，也可用页面开关临时打开，以测试图片、链接、选择和段落操作；打开后需注意案例可能保留真实对象 ID。

EnrichedText 后端目前只用于 PoC，不读取或改写生产渲染设置，也不会被业务页选择。它会显示规范化诊断数量；`eeimg=1` 作为行内 attachment 保留，块图和暂不支持的媒体会显式降级。公式 SVG 已通过 `patch-package` 补齐 Android/iOS 解码并适配正文颜色；当前尺寸 fallback 与旧渲染器一致，精确 intrinsic metrics / baseline offset 仍待 native extension。该原生库不能在 Expo Go 中运行，安装依赖后需要重新生成并编译 development build。

案例页只展示已经登记到 `fixtures/cases/` 与 manifest 的稳定样本，`inbox/` 不会直接进入 UI。新增并登记 JSON case 后，Metro 的 fixture context 会自动发现文件，不需要再修改页面注册表。生产构建不显示入口，直接访问 `/dev/*` 也会被重定向到首页。

## 当前范围

项目已经完成测试集集中、首轮真机基线、列表正文复用、长按预览复用和 Pager 相邻回答预取。下一阶段不再把 RNRH 作为长期架构，而是按 [Renderer V2 迁移计划](./docs/renderer-v2-plan.md) 逐步替换：

1. 补齐正确性 oracle 与真正超长文本案例。
2. 建立统一的 `ZhihuDocument`（Block + InlineRun）规范化层。
3. 用 `react-native-enriched-html` 验证单 native text surface、跨段选择和 inline attachment。
4. 只为确认缺失的 selection range、custom decoration 和 attachment metrics 增加小范围 native extension。
5. 用真机数据决定是否需要 text-flow segmentation 或 block virtualization。
6. 达到 Android/iOS Release 验收条件后删除 RNRH 依赖。

RNRH 在迁移期只保留为旧实现、对照和 fallback。桌面 Node 微基准不作为手机端最终性能结论。
