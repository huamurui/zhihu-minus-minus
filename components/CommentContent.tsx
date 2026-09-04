import type React from 'react';
import { useState } from 'react';
import { Image } from 'react-native';
import { BouncyButton } from '@/components/BouncyButton';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { Text, useThemeColor, View } from './Themed';

interface CommentContentProps {
  htmlContent: string;
  width: number;
}

export const CommentContent: React.FC<CommentContentProps> = ({
  htmlContent,
}) => {
  const textColor = useThemeColor({}, 'text');

  const [viewerVisible, setViewerVisible] = useState(false);
  const [activeImage, setActiveImage] = useState<string | null>(null);

  // 1. 解析出所有的 HTML 标签，提取出 comment_img 的超链接，并将它们从主文本中拆分
  // 匹配形式：<a href="URL" class="comment_img"...>查看图片</a>
  // 考虑到 class 和 href 顺序不固定，或者有些其他微小差异，采用更宽泛的正则，但一定要捞到 comment_img
  const imageRegex =
    /<a[^>]+class="comment_img"[^>]*href="([^"]+)"[^>]*>.*?<\/a>|<a[^>]+href="([^"]+)"[^>]*class="comment_img"[^>]*>.*?<\/a>/gi;

  // 提取图片链接
  const imageUrls: string[] = [];
  let match: RegExpExecArray | null;

  // 循环匹配所有图片链接
  // biome-ignore lint/suspicious/noAssignInExpressions: safe to use inside regex matching loops
  while ((match = imageRegex.exec(htmlContent)) !== null) {
    const url = match[1] || match[2];
    if (url) {
      imageUrls.push(url);
    }
  }

  // 2. 清理正文中的图片标签，保留纯净文本，并去除其他 HTML 标签以便显示
  const textWithoutImages = htmlContent.replace(imageRegex, '');
  const cleanText = textWithoutImages
    .replace(/<[^>]+>/g, '') // 移除非图片的其他所有 HTML 标签
    .trim();

  const handleOpenImage = (url: string) => {
    setActiveImage(url);
    setViewerVisible(true);
  };

  return (
    <View className="bg-transparent w-full">
      {/* 渲染纯文本 */}
      {cleanText ? (
        <Text
          className="text-[15px] leading-5 mb-2"
          style={{ color: textColor }}
        >
          {cleanText}
        </Text>
      ) : null}

      {/* 评论配图（紧凑网格展示） */}
      {imageUrls.length > 0 && (
        <View className="flex-row flex-wrap gap-2 my-1.5 bg-transparent">
          {imageUrls.map((url, idx) => (
            <BouncyButton
              // biome-ignore lint/suspicious/noArrayIndexKey: 同一条评论可以重复引用同一张图,url 不唯一,复合 key 才能保证不撞。
              key={`${url}-${idx}`}
              onPress={() => handleOpenImage(url)}
              className="rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800/60 border border-gray-200/40 dark:border-gray-700/40"
            >
              <Image
                source={{ uri: url }}
                style={
                  imageUrls.length === 1
                    ? { width: 130, height: 130 }
                    : { width: 88, height: 88 }
                }
                resizeMode="cover"
              />
            </BouncyButton>
          ))}
        </View>
      )}

      {/* 图片灯箱 */}
      <ImagePreviewModal
        visible={viewerVisible && Boolean(activeImage)}
        imageUrls={activeImage ? [activeImage] : imageUrls}
        initialIndex={
          activeImage ? Math.max(0, imageUrls.indexOf(activeImage)) : 0
        }
        onClose={() => setViewerVisible(false)}
      />
    </View>
  );
};
