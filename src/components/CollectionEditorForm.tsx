import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, useThemeColor, View } from '@/components/Themed';
import { ThemedSwitch } from '@/components/ThemedSwitch';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

interface CollectionEditorFormProps {
  title: string;
  description: string;
  isPublic: boolean;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onPublicChange: (value: boolean) => void;
  onSubmit: () => void;
  pending?: boolean;
  submitLabel?: string;
}

export function CollectionEditorForm({
  title,
  description,
  isPublic,
  onTitleChange,
  onDescriptionChange,
  onPublicChange,
  onSubmit,
  pending = false,
  submitLabel = '完成',
}: CollectionEditorFormProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const primaryColor = useThemeColor({}, 'primary');
  const onPrimary = useThemeColor({}, 'onPrimary');

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>标题</Text>
        <TextInput
          accessibilityLabel="收藏夹标题"
          style={[
            styles.input,
            {
              color: colors.text,
              backgroundColor: colors.backgroundTertiary,
              borderColor: colors.border,
            },
          ]}
          value={title}
          onChangeText={onTitleChange}
          placeholder="输入标题"
          placeholderTextColor={colors.textTertiary}
          returnKeyType="next"
        />

        <Text style={[styles.label, styles.spacedLabel]}>描述（可选）</Text>
        <TextInput
          accessibilityLabel="收藏夹描述"
          style={[
            styles.input,
            styles.descriptionInput,
            {
              color: colors.text,
              backgroundColor: colors.backgroundTertiary,
              borderColor: colors.border,
            },
          ]}
          value={description}
          onChangeText={onDescriptionChange}
          placeholder="输入描述"
          placeholderTextColor={colors.textTertiary}
          multiline
          numberOfLines={3}
        />

        <View style={styles.visibilityRow}>
          <View style={styles.visibilityCopy}>
            <Text style={styles.visibilityTitle}>公开收藏夹</Text>
            <Text type="secondary" style={styles.visibilityDescription}>
              公开后其他用户可见
            </Text>
          </View>
          <ThemedSwitch
            accessibilityLabel="公开收藏夹"
            value={isPublic}
            onValueChange={onPublicChange}
          />
        </View>
      </ScrollView>

      <BouncyButton
        accessibilityRole="button"
        accessibilityLabel={submitLabel}
        accessibilityState={{ disabled: pending }}
        disabled={pending}
        onPress={onSubmit}
        style={[
          styles.submit,
          { backgroundColor: primaryColor },
          pending && styles.disabled,
        ]}
      >
        {pending ? (
          <ActivityIndicator color={onPrimary} />
        ) : (
          <Text style={[styles.submitLabel, { color: onPrimary }]}>
            {submitLabel}
          </Text>
        )}
      </BouncyButton>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  label: {
    marginBottom: 8,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
  spacedLabel: {
    marginTop: 20,
  },
  input: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  descriptionInput: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  visibilityRow: {
    marginTop: 22,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  visibilityCopy: {
    flex: 1,
    paddingRight: 16,
  },
  visibilityTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
  visibilityDescription: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
  },
  submit: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.55,
  },
});
