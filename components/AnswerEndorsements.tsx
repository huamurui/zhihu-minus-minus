import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Ellipse, Path } from 'react-native-svg';
import {
  type AnswerEndorsementElement,
  type AnswerEndorsementText,
  normalizeAnswerEndorsements,
} from '@/api/zhihu/endorsements';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, useRuntimeThemeColors, View } from '@/components/Themed';
import type { RuntimeThemeColors } from '@/constants/theme';

interface AnswerEndorsementsProps {
  endorsements?: unknown;
  enabled?: boolean;
}

function foregroundColor(
  group: string | undefined,
  palette: RuntimeThemeColors,
) {
  if (group === 'GYL02A') return palette.badgeText;
  if (group === 'GBL01A' || group === 'GBL05A' || group === 'GBL07A')
    return palette.link;
  return palette.textSecondary;
}

function CrabIcon({
  color,
  width,
  height,
}: {
  color: string;
  width: number;
  height: number;
}) {
  return (
    <Svg width={width} height={height} viewBox="0 0 24 24" accessible={false}>
      <Path
        d="m6.5 13-4-2m4 4-4 1m5 1-3 3m13-7 4-2m-4 4 4 1m-5 1 3 3M9 10V7m6 3V7"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M6.5 12 4 9.5C1 9 1 5 3.5 3l.5 3 2-2c2.5 3 1 5-1 5.5L8 12Zm11 0L20 9.5c3-.5 3-4.5.5-6.5l-.5 3-2-2c-2.5 3-1 5 1 5.5L16 12Z"
        fill={color}
      />
      <Ellipse cx={12} cy={14} rx={6.5} ry={4.5} fill={color} />
    </Svg>
  );
}

function EndorsementIcon({
  element,
  palette,
}: {
  element: Extract<AnswerEndorsementElement, { type: 'IMAGE' }>;
  palette: RuntimeThemeColors;
}) {
  const color = foregroundColor(element.image_color?.group, palette);
  const width = element.width ?? 16;
  const height = element.height ?? 16;
  if (element.image_key === 'zhicon_icon_24_crab_fill') {
    return <CrabIcon color={color} width={width} height={height} />;
  }
  const name =
    element.image_key === 'zhicon_icon_24_label_daily'
      ? 'newspaper'
      : element.image_key === 'zhicon_icon_24_column_fill'
        ? 'library'
        : element.image_key === 'zhicon_icon_16_arrow_right'
          ? 'chevron-forward'
          : null;
  if (!name) return null;
  return (
    <Ionicons
      name={name}
      color={color}
      size={Math.min(width, height)}
      style={{ width, height }}
      accessible={false}
    />
  );
}

function EndorsementText({
  element,
  palette,
}: {
  element: AnswerEndorsementText;
  palette: RuntimeThemeColors;
}) {
  return (
    <Text
      style={[
        styles.text,
        {
          color: foregroundColor(element.font_color?.group, palette),
          fontSize: element.font_size ?? 13,
          fontWeight: element.is_bold ? 'bold' : 'normal',
        },
      ]}
      numberOfLines={element.max_line ?? 1}
      ellipsizeMode="tail"
      accessibilityLabel={element.content}
    >
      {element.content}
    </Text>
  );
}

/** Native content labels, such as invitation thanks and collection badges. */
export function AnswerEndorsements({
  endorsements,
  enabled = true,
}: AnswerEndorsementsProps) {
  const router = useRouter();
  const palette = useRuntimeThemeColors();
  const tags = useMemo(
    () => normalizeAnswerEndorsements(endorsements),
    [endorsements],
  );
  if (tags.length === 0) return null;

  return (
    <View style={styles.container}>
      {tags.map((tag) => {
        const interactive = enabled && Boolean(tag.actionPath);
        const label = [...tag.elements, ...tag.descriptionElements]
          .filter(
            (element): element is AnswerEndorsementText =>
              element.type === 'TEXT',
          )
          .map((element) => element.content)
          .join(' ');
        const backgroundColor =
          tag.backgroundColor?.group === 'GYL02A'
            ? palette.badgeBackground
            : palette.primaryTransparent;
        return (
          <BouncyButton
            key={tag.key}
            disabled={!interactive}
            accessibilityRole={interactive ? 'button' : 'text'}
            accessibilityLabel={label}
            style={[styles.tag, { backgroundColor }]}
            onPress={() => {
              if (enabled && tag.actionPath)
                router.push(tag.actionPath as Href);
            }}
          >
            <View style={styles.elements}>
              {tag.elements.map((element) =>
                element.type === 'TEXT' ? (
                  <EndorsementText
                    key={element.key}
                    element={element}
                    palette={palette}
                  />
                ) : (
                  <EndorsementIcon
                    key={element.key}
                    element={element}
                    palette={palette}
                  />
                ),
              )}
            </View>
            {tag.descriptionElements.map((element) => (
              <EndorsementText
                key={element.key}
                element={element}
                palette={palette}
              />
            ))}
          </BouncyButton>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
    marginBottom: 8,
  },
  tag: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 4,
  },
  elements: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  text: {
    flexShrink: 1,
  },
});
