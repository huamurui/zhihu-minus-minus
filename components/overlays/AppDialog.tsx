import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

export interface AppDialogAction {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'destructive';
  disabled?: boolean;
}

interface AppDialogProps {
  visible: boolean;
  onClose?: () => void;
  title: string;
  message?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  children?: React.ReactNode;
  actions?: AppDialogAction[];
  dismissible?: boolean;
}

export function AppDialog({
  visible,
  onClose,
  title,
  message,
  icon,
  children,
  actions = [],
  dismissible = true,
}: AppDialogProps) {
  const colorScheme = useColorScheme();
  const primaryColor = useThemeColor({}, 'primary');
  const primaryTransparent = useThemeColor({}, 'primaryTransparent');
  const { width } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const mountedRef = useRef(visible);
  const onCloseRef = useRef(onClose);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const animateClosed = useCallback(
    (notify: boolean) => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.96,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!finished) return;
        mountedRef.current = false;
        setMounted(false);
        if (notify) onCloseRef.current?.();
      });
    },
    [opacity, scale],
  );

  const requestClose = useCallback(() => {
    if (dismissible) animateClosed(true);
  }, [animateClosed, dismissible]);

  useEffect(() => {
    if (visible) {
      mountedRef.current = true;
      setMounted(true);
      opacity.stopAnimation();
      scale.stopAnimation();
      opacity.setValue(0);
      scale.setValue(0.96);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          damping: 24,
          stiffness: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (mountedRef.current) {
      animateClosed(false);
    }
  }, [animateClosed, opacity, scale, visible]);

  if (!mounted) return null;

  const surface = Colors[colorScheme].backgroundSecondary;
  const tertiary = Colors[colorScheme].backgroundTertiary;
  const primary = primaryColor;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={requestClose}
    >
      <Animated.View
        style={[
          styles.overlay,
          {
            backgroundColor: Colors[colorScheme].blackTransparent,
            opacity,
          },
        ]}
      >
        {dismissible ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭弹窗"
            style={StyleSheet.absoluteFill}
            onPress={requestClose}
          />
        ) : null}
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.dialog,
            {
              width: Math.min(width - 40, 360),
              backgroundColor: surface,
              transform: [{ scale }],
            },
          ]}
        >
          {icon ? (
            <View
              style={[styles.icon, { backgroundColor: primaryTransparent }]}
            >
              <Ionicons name={icon} size={27} color={primary} />
            </View>
          ) : null}
          <Text style={styles.title}>{title}</Text>
          {message ? (
            <Text type="secondary" style={styles.message}>
              {message}
            </Text>
          ) : null}
          {children}
          {actions.length > 0 ? (
            <View style={styles.actions}>
              {actions.map((action) => {
                const variant = action.variant || 'secondary';
                const backgroundColor =
                  variant === 'primary'
                    ? primary
                    : variant === 'destructive'
                      ? Colors[colorScheme].danger
                      : tertiary;
                const color =
                  variant === 'secondary'
                    ? Colors[colorScheme].text
                    : Colors[colorScheme].textInverse;
                return (
                  <BouncyButton
                    key={action.label}
                    accessibilityRole="button"
                    accessibilityLabel={action.label}
                    accessibilityState={{ disabled: action.disabled }}
                    disabled={action.disabled}
                    onPress={action.onPress}
                    style={[
                      styles.action,
                      { backgroundColor },
                      action.disabled && styles.disabled,
                    ]}
                  >
                    <Text style={[styles.actionLabel, { color }]}>
                      {action.label}
                    </Text>
                  </BouncyButton>
                );
              })}
            </View>
          ) : null}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  dialog: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: Colors.light.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  icon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  actions: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
  },
  action: {
    minHeight: 48,
    flex: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.45,
  },
});
