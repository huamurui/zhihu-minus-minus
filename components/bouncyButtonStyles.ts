import type { ViewStyle } from 'react-native';

const CONTENT_STYLE_KEYS = [
  'alignContent',
  'alignItems',
  'columnGap',
  'flexDirection',
  'flexWrap',
  'gap',
  'justifyContent',
  'padding',
  'paddingBottom',
  'paddingEnd',
  'paddingHorizontal',
  'paddingLeft',
  'paddingRight',
  'paddingStart',
  'paddingTop',
  'paddingVertical',
  'rowGap',
] as const satisfies readonly (keyof ViewStyle)[];

export function getRippleButtonStyles(style: ViewStyle) {
  const container: ViewStyle = {
    ...style,
    borderRadius: style.borderRadius ?? 8,
    overflow: 'hidden',
  };
  const content: ViewStyle = {
    alignSelf: 'stretch',
    // 只有调用方明确设置高度时才填满，普通图标按钮按内容高度显示。
    flexGrow: style.height != null && style.height !== 'auto' ? 1 : 0,
    flexShrink: 1,
    minHeight: style.minHeight,
  };

  // 外层保留尺寸、外边距和圆角；内层负责内容布局，避免新增裁剪层改变按钮排版。
  const moveContentStyle = <K extends keyof ViewStyle>(key: K) => {
    if (style[key] !== undefined) {
      content[key] = style[key];
      delete container[key];
    }
  };
  for (const key of CONTENT_STYLE_KEYS) moveContentStyle(key);

  return { container, content };
}
