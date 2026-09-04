import { StyleSheet } from 'react-native';
import { AppDialog } from '@/components/overlays/AppDialog';
import { Text, useThemeColor } from '@/components/Themed';

export function ClipboardLinkModal({
  visible,
  url,
  onClose,
  onOpen,
}: {
  visible: boolean;
  url: string;
  onClose: () => void;
  onOpen: () => void;
}) {
  const primaryColor = useThemeColor({}, 'primary');

  return (
    <AppDialog
      visible={visible}
      onClose={onClose}
      title="发现知乎链接"
      message="是否要打开剪贴板中的链接？"
      icon="link-outline"
      actions={[
        { label: '忽略', onPress: onClose, variant: 'secondary' },
        { label: '立即打开', onPress: onOpen, variant: 'primary' },
      ]}
    >
      <Text style={[styles.url, { color: primaryColor }]} numberOfLines={3}>
        {url}
      </Text>
    </AppDialog>
  );
}

const styles = StyleSheet.create({
  url: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
});
