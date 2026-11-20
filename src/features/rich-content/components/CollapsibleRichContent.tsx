import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ContentActionButton } from '@/components/ContentActionButton';
import { useRuntimeThemeColors } from '@/components/Themed';
import { withAlpha } from '@/utils/colorContrast';

export interface CollapsibleRichContentProps {
  contentKey: string;
  children: ReactNode;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  hasMore?: boolean;
  /** Paging controls stay outside the measured and clipped body. */
  footer?: ReactNode;
  /** Auxiliary information shares the toggle row and stays visible for short bodies. */
  footerContent?: ReactNode;
  expandLabel?: string;
  collapseLabel?: string;
  toggleTestID?: string;
}

/** Clip the rendered body without rewriting its text or rebuilding it on toggle. */
export function CollapsibleRichContent({
  contentKey,
  children,
  expanded,
  onExpandedChange,
  hasMore = false,
  footer,
  footerContent,
  expandLabel = '展开回答',
  collapseLabel = '收起回答',
  toggleTestID = 'collapsible-rich-content-toggle',
}: CollapsibleRichContentProps) {
  const colors = useRuntimeThemeColors();
  const { height } = useWindowDimensions();
  const previewHeight = Math.min(320, Math.max(180, height * 0.4));
  const epoch = useMemo(() => ({ contentKey }), [contentKey]);
  const currentEpoch = useRef(epoch);
  currentEpoch.current = epoch;
  const [viewport, setViewport] = useState<{
    epoch: typeof epoch;
    width: number;
  } | null>(null);
  const [measurement, setMeasurement] = useState<{
    epoch: typeof epoch;
    latestWidth: number;
    heights: ReadonlyMap<number, number>;
  } | null>(null);
  const viewportWidth = viewport?.epoch === epoch ? viewport.width : null;
  const measuredHeight =
    measurement?.epoch === epoch
      ? (measurement.heights.get(viewportWidth ?? measurement.latestWidth) ??
        null)
      : null;
  // Avoid hiding a final short line or creating a toggle for a tiny remainder.
  const overflows =
    measuredHeight !== null && measuredHeight > previewHeight + 48;
  const clipped = !expanded && overflows;
  // The next native layout can replace a small placeholder with the entire
  // answer before its onLayout reaches JS. Keep the collapsed row bounded.
  const collapsedMaxHeight = overflows
    ? previewHeight
    : Math.max(previewHeight, measuredHeight ?? 0);
  const showToggle = overflows || hasMore;

  return (
    <View>
      <View
        testID="collapsible-rich-content-viewport"
        onLayout={({ nativeEvent: { layout } }) => {
          if (
            currentEpoch.current !== epoch ||
            !Number.isFinite(layout.width) ||
            layout.width <= 0
          )
            return;
          setViewport((current) =>
            current?.epoch === epoch && current.width === layout.width
              ? current
              : { epoch, width: layout.width },
          );
        }}
        style={[
          styles.viewport,
          !expanded && { maxHeight: collapsedMaxHeight, overflow: 'hidden' },
        ]}
      >
        <View
          key={contentKey}
          testID="collapsible-rich-content-body"
          accessibilityElementsHidden={clipped}
          importantForAccessibility={clipped ? 'no-hide-descendants' : 'auto'}
          onLayout={({ nativeEvent: { layout } }) => {
            if (
              currentEpoch.current !== epoch ||
              !Number.isFinite(layout.width) ||
              layout.width <= 0 ||
              !Number.isFinite(layout.height) ||
              layout.height <= 0
            )
              return;
            setMeasurement((current) => {
              if (
                current?.epoch === epoch &&
                current.heights.get(layout.width) === layout.height
              )
                return current;
              // Inner and outer layout events can arrive in either order.
              // Retain each width until its matching viewport event arrives.
              const heights = new Map(
                current?.epoch === epoch ? current.heights : [],
              );
              heights.set(layout.width, layout.height);
              return { epoch, latestWidth: layout.width, heights };
            });
          }}
          style={styles.body}
        >
          {children}
        </View>
        {clipped ? (
          <LinearGradient
            testID="collapsible-rich-content-fade"
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            colors={[
              withAlpha(colors.backgroundSecondary, 0),
              colors.backgroundSecondary,
            ]}
            style={styles.fade}
          />
        ) : null}
      </View>
      {footer}
      {showToggle || footerContent ? (
        <View style={styles.footer}>
          {footerContent ? (
            <View style={styles.footerContent}>{footerContent}</View>
          ) : null}
          {showToggle ? (
            <ContentActionButton
              testID={toggleTestID}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityHint={clipped ? '展开后可阅读完整正文' : undefined}
              hitSlop={8}
              onPress={() => {
                if (currentEpoch.current === epoch) onExpandedChange(!expanded);
              }}
              style={styles.toggle}
            >
              <Text style={{ color: colors.link, fontSize: 13 }}>
                {expanded ? collapseLabel : expandLabel}
              </Text>
            </ContentActionButton>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    overflow: 'visible',
  },
  body: {
    flexShrink: 0,
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 48,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    columnGap: 12,
    marginTop: 4,
  },
  footerContent: {
    flex: 1,
    minWidth: 0,
  },
  toggle: {
    flexShrink: 0,
    backgroundColor: 'transparent',
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
});
