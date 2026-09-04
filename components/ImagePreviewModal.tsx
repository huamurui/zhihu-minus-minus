import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, SafeAreaView, StyleSheet, View } from 'react-native';
import ImageViewer from 'react-native-image-zoom-viewer';
import { ImageActionBottomSheet } from '@/components/ImageActionBottomSheet';
import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { saveImageToGallery } from '@/utils/saveImage';

export interface ImagePreviewModalProps {
  visible: boolean;
  imageUrls: string[];
  initialIndex?: number;
  onClose: () => void;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  visible,
  imageUrls,
  initialIndex = 0,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);

  React.useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
    }
  }, [visible, initialIndex]);

  const formattedUrls = React.useMemo(() => {
    return imageUrls.map((url) => ({ url }));
  }, [imageUrls]);

  const currentUrl = imageUrls[currentIndex] || imageUrls[0];

  if (!visible || imageUrls.length === 0) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <ImageViewer
          imageUrls={formattedUrls}
          index={currentIndex}
          onChange={(index) => index != null && setCurrentIndex(index)}
          onCancel={onClose}
          onClick={onClose}
          enableSwipeDown={true}
          onSwipeDown={onClose}
          onLongPress={(image) => setSheetUrl(image?.url || currentUrl)}
          saveToLocalByLongPress={false}
          renderIndicator={() => <></>}
        />

        {/* 顶栏控制条 */}
        <SafeAreaView style={styles.headerSafeArea} pointerEvents="box-none">
          <View style={styles.headerBar}>
            <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={12}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </Pressable>

            {imageUrls.length > 1 && (
              <Text style={styles.pageIndicator}>
                {currentIndex + 1} / {imageUrls.length}
              </Text>
            )}

            <View style={styles.rightActions}>
              <Pressable
                onPress={() => saveImageToGallery(currentUrl)}
                style={styles.iconBtn}
                hitSlop={12}
              >
                <Ionicons name="download-outline" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        </SafeAreaView>

        {/* 长按底部 Action Sheet 盘 */}
        <ImageActionBottomSheet
          visible={Boolean(sheetUrl)}
          imageUrl={sheetUrl}
          onClose={() => setSheetUrl(null)}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.shadow,
  },
  headerSafeArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pageIndicator: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
