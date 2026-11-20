import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Image, Text as NativeText } from 'react-native';
import type { CommentStickers } from '@/api/zhihu/comment';
import { BouncyButton } from '@/components/BouncyButton';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { parseCommentContent } from '@/utils/commentContent';
import { getCachedImageSource } from '@/utils/imageSource';
import { Text, useThemeColor, View } from './Themed';

interface CommentContentProps {
  htmlContent: string;
  stickers?: CommentStickers;
  width: number;
}

function CommentImage({
  url,
  label,
  size,
  inline = false,
}: {
  url: string;
  label: string;
  size: number;
  inline?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  if (url === failedUrl)
    return inline ? <NativeText>{label}</NativeText> : <Text>{label}</Text>;
  return (
    <Image
      accessibilityLabel={label}
      fadeDuration={0}
      source={getCachedImageSource(url)}
      style={{ width: size, height: size }}
      resizeMode={inline ? 'contain' : 'cover'}
      onError={() => setFailedUrl(url)}
    />
  );
}

export const CommentContent = React.memo(function CommentContent({
  htmlContent,
  stickers,
  width,
}: CommentContentProps) {
  const router = useRouter();
  const linkColor = useThemeColor({}, 'link');
  const [gallery, setGallery] = useState<{
    urls: string[];
    initialIndex: number;
  } | null>(null);
  const parts = useMemo(() => parseCommentContent(htmlContent), [htmlContent]);
  const images = parts.filter((part) => part.kind === 'image');
  const inline = parts.filter((part) => part.kind !== 'image');

  return (
    <View className="bg-transparent w-full">
      {inline.some((part) => part.text.trim()) && (
        <Text className="text-[15px] leading-5 mb-2">
          {inline.map((part) => {
            if (part.kind === 'text') return part.text;
            if (part.kind === 'mention')
              return (
                <NativeText
                  key={part.offset}
                  accessibilityRole="link"
                  style={{ color: linkColor }}
                  onPress={(event) => {
                    event.stopPropagation();
                    router.push({
                      pathname: '/user/[id]',
                      params: { id: part.member },
                    });
                  }}
                >
                  {part.text}
                </NativeText>
              );
            const url =
              part.kind === 'placeholder' ? stickers?.[part.text] : part.url;
            if (!url) return part.text;
            return (
              <CommentImage
                key={part.offset}
                url={url}
                label={part.text}
                size={20}
                inline
              />
            );
          })}
        </Text>
      )}
      {images.length > 0 && (
        <View className="flex-row flex-wrap gap-2 my-1.5 bg-transparent">
          {images.map((image, index) => (
            <BouncyButton
              key={image.offset}
              accessibilityRole="button"
              accessibilityLabel={`查看评论图片 ${index + 1}`}
              onPress={(event) => {
                event.stopPropagation();
                // FlashList may recycle this comment while its viewer is open.
                setGallery({
                  urls: images.map((part) => part.url),
                  initialIndex: index,
                });
              }}
              className="rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800/60 border border-gray-200/40 dark:border-gray-700/40"
            >
              <CommentImage
                url={image.url}
                label={image.text}
                size={Math.min(width, images.length === 1 ? 130 : 88)}
              />
            </BouncyButton>
          ))}
        </View>
      )}
      {gallery && (
        <ImagePreviewModal
          visible
          imageUrls={gallery.urls}
          initialIndex={gallery.initialIndex}
          onClose={() => setGallery(null)}
        />
      )}
    </View>
  );
});
