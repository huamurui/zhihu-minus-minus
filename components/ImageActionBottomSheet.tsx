import type React from 'react';
import { ActionSheet } from '@/components/overlays/ActionSheet';
import { colors } from '@/constants/designTokens';
import { copyImageUrl, saveImageToGallery } from '@/utils/saveImage';

export interface ImageActionBottomSheetProps {
  visible: boolean;
  imageUrl: string | null;
  onClose: () => void;
}

function getImageSourceLabel(imageUrl: string): string {
  try {
    return `图片来源：${new URL(imageUrl).hostname}`;
  } catch {
    return '选择要对图片执行的操作';
  }
}

export const ImageActionBottomSheet: React.FC<ImageActionBottomSheetProps> = ({
  visible,
  imageUrl,
  onClose,
}) => {
  if (!imageUrl) return null;

  return (
    <ActionSheet
      visible={visible}
      onClose={onClose}
      title="图片操作"
      subtitle={getImageSourceLabel(imageUrl)}
      options={[
        {
          key: 'save',
          label: '保存到系统相册',
          icon: 'download-outline',
          color: colors.light.imageActionSave,
          iconBackgroundColor: colors.light.imageActionSaveBackground,
          onPress: () => saveImageToGallery(imageUrl),
        },
        {
          key: 'copy',
          label: '复制图片链接',
          icon: 'copy-outline',
          color: colors.light.imageActionCopy,
          iconBackgroundColor: colors.light.imageActionCopyBackground,
          onPress: () => copyImageUrl(imageUrl),
        },
      ]}
    />
  );
};
