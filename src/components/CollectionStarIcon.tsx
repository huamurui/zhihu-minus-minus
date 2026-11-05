import type { ColorValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';

// One rounded outline keeps the empty and filled collection states aligned.
const STAR_PATH =
  'M11.3 3.42 Q12 2 12.7 3.42 L14.73 7.54 Q14.97 8.03 15.51 8.11 L20.06 8.77 Q21.63 9 20.49 10.11 L17.2 13.32 Q16.81 13.7 16.9 14.24 L17.68 18.77 Q17.95 20.34 16.55 19.6 L12.48 17.46 Q12 17.21 11.52 17.46 L7.45 19.6 Q6.05 20.34 6.32 18.77 L7.1 14.24 Q7.19 13.7 6.8 13.32 L3.51 10.11 Q2.37 9 3.94 8.77 L8.49 8.11 Q9.03 8.03 9.27 7.54 Z';

export function CollectionStarIcon({
  filled,
  color,
  size,
}: {
  filled: boolean;
  color: ColorValue;
  size: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path
        d={STAR_PATH}
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
