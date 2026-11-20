import Svg, { Path } from 'react-native-svg';
import { commentBubble, commentBubblePath } from '@/constants/commentBubble';
import { useContentActionBarColor } from './ContentActionBarColor';
import { useThemeColor } from './Themed';

const toolbarPath = commentBubblePath(commentBubble.toolbarWeight);

export function CommentBubbleIcon({ size }: { size: number }) {
  const secondary = useThemeColor({}, 'textSecondary');
  const color = useContentActionBarColor(secondary);
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${commentBubble.viewBoxSize} ${commentBubble.viewBoxSize}`}
      accessible={false}
    >
      <Path d={toolbarPath} fill={color} />
    </Svg>
  );
}
