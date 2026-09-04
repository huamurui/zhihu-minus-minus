'use dom';

import katex from 'katex';
import { colors, typography } from '@/constants/designTokens';

interface MathViewProps {
  formula: string;
  displayMode?: boolean;
  colorScheme?: 'light' | 'dark';
}

export default function MathView({
  formula,
  displayMode = false,
  colorScheme = 'light',
}: MathViewProps) {
  const html = katex.renderToString(formula, {
    displayMode: displayMode,
    throwOnError: false,
    strict: false,
  });

  const textColor = colors[colorScheme].text;

  return (
    <span
      style={{
        display: displayMode ? 'block' : 'inline-block',
        textAlign: displayMode ? 'center' : 'left',
        backgroundColor: 'transparent',
      }}
    >
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"
      />
      <style>{`
        body {
          margin: 0;
          padding: 0;
          background-color: transparent !important;
        }
      `}</style>
      <span
        // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX 的渲染结果只能这样注入。formula 虽来自知乎正文,但 renderToString 的 trust 选项默认为 false,\href/\url/\includegraphics 等可注入 URL 或 HTML 的命令会被拒绝渲染,输出不含可执行内容。
        dangerouslySetInnerHTML={{ __html: html }}
        style={{
          fontSize: `${typography.fontSize.subtitle}px`,
          color: textColor,
        }}
      />
    </span>
  );
}
