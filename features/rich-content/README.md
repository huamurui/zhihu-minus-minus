# Rich content rendering

这个目录集中维护知乎富文本渲染的运行时代码、设计记录、真实内容样本、分析工具和回归测试。业务页面只从本模块的 `index.ts` 导入渲染能力，避免实现、样本和验证逻辑散落在仓库各处。

对应 GitHub Issue：[#40](https://github.com/huamurui/zhihu-minus-minus/issues/40)

## 目录

- `components/`：当前 RNRH 渲染器和已有 WebView/DOM 实验实现；迁移期间作为旧链路与参考。
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

## 当前范围

项目已经完成测试集集中、首轮真机基线、列表正文复用、长按预览复用和 Pager 相邻回答预取。下一阶段不再把 RNRH 作为长期架构，而是按 [Renderer V2 迁移计划](./docs/renderer-v2-plan.md) 逐步替换：

1. 补齐正确性 oracle 与真正超长文本案例。
2. 建立统一的 `ZhihuDocument`（Block + InlineRun）规范化层。
3. 先用单个、内部滚动的离线 DOM/WebView 解决公式、装饰线和复杂 inline flow 的正确性。
4. 再用 Block AST + FlashList 控制超级长正文的挂载量与内存。
5. 达到 Android/iOS Release 验收条件后删除 RNRH 依赖。

RNRH 在迁移期只保留为旧实现、对照和 fallback。桌面 Node 微基准不作为手机端最终性能结论。
