import type { ColorValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const TRIANGLE_PATH =
  'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z';
// Keep the compact voting capsule and the full-size toolbar optically aligned.
const VOTE_STROKE_WIDTH = 1.8;

export const VoteTriangle = ({
  active,
  color,
  direction,
  size,
}: {
  active: boolean;
  color: ColorValue;
  direction: 'up' | 'down';
  size: number;
}) => {
  return (
    <Svg
      accessible={false}
      height={size}
      viewBox="0 0 24 24"
      width={size}
      style={{
        transform: direction === 'down' ? [{ rotate: '180deg' }] : undefined,
      }}
    >
      <Path
        d={TRIANGLE_PATH}
        fill={active ? color : 'none'}
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={(24 * VOTE_STROKE_WIDTH) / Math.max(1, size)}
      />
    </Svg>
  );
};
