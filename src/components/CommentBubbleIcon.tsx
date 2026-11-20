import type { ColorValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  commentBubble,
  commentBubbleCenterline,
} from '@/constants/commentBubble';
import { useContentActionBarColor } from './ContentActionBarColor';
import { useThemeColor } from './Themed';

export function CommentBubbleIcon({
  size,
  color,
}: {
  size: number;
  color?: ColorValue;
}) {
  const secondary = useThemeColor({}, 'textSecondary');
  const actionBarColor = useContentActionBarColor(secondary);
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${commentBubble.viewBoxSize} ${commentBubble.viewBoxSize}`}
      accessible={false}
    >
      <Path
        d={commentBubbleCenterline}
        fill="none"
        stroke={color ?? actionBarColor}
        strokeWidth={commentBubble.toolbarWeight}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
