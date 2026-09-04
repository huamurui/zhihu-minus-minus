import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/components/useColorScheme';
import { colors } from '@/constants/designTokens';
import { useCollectionStore } from '@/store/useCollectionStore';
import { BouncyButton } from './BouncyButton';
import { Text, useThemeColor, View } from './Themed';

export function CollectionToastOverlay() {
  const {
    toastVisible,
    toastMessage,
    toastContentId,
    toastContentType,
    hideToast,
    openSelector,
  } = useCollectionStore();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (toastVisible) {
      Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }).start();

      const timer = setTimeout(() => {
        hideToast();
      }, 3500);

      return () => clearTimeout(timer);
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [toastVisible, hideToast, anim]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [120, 0],
  });

  const opacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const handleModify = () => {
    if (toastContentId && toastContentType) {
      openSelector(toastContentId, toastContentType);
    }
  };

  // We enforce a solid dark pill regardless of theme because dark cards on a bright screen have extreme contrast and premium feel
  const backgroundColor = isDark
    ? colors.dark.backgroundTertiary
    : colors.dark.toastSurface;
  const textColor = colors.dark.text;
  const actionColor = useThemeColor({}, 'primary');

  return (
    <Animated.View
      style={[
        styles.container,
        {
          bottom: insets.bottom + 20,
          transform: [{ translateY }],
          opacity,
        },
      ]}
      pointerEvents="box-none"
    >
      <View
        style={[styles.toastCard, { backgroundColor }]}
        className="shadow-xl"
      >
        <Text style={[styles.text, { color: textColor }]} numberOfLines={1}>
          {toastMessage}
        </Text>
        <BouncyButton onPress={handleModify} style={styles.actionButton}>
          <Text style={[styles.actionText, { color: actionColor }]}>修改</Text>
        </BouncyButton>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 99999,
  },
  toastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 30,
    width: '100%',
    maxWidth: 450,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 15,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
});
