import { useRouter } from 'expo-router';
import { Image } from 'react-native';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, useThemeColor, View } from '@/components/Themed';
import type { ZhihuColumnSummary } from '@/types/zhihu';
import { getCachedImageSource } from '@/utils/imageSource';

export function ProfileColumnCard({ column }: { column: ZhihuColumnSummary }) {
  const router = useRouter();
  const borderColor = useThemeColor({}, 'border');

  return (
    <BouncyButton
      className="flex-row items-center p-4"
      style={{ borderBottomWidth: 0.5, borderBottomColor: borderColor }}
      accessibilityRole="button"
      accessibilityLabel={column.title}
      onPress={() =>
        router.push({
          pathname: '/column/[id]',
          params: { id: column.id },
        })
      }
    >
      <Image
        source={getCachedImageSource(column.image_url)}
        className="w-14 h-14 rounded-lg"
        resizeMode="cover"
      />
      <View className="flex-1 ml-3 bg-transparent">
        <Text className="text-base font-semibold" numberOfLines={2}>
          {column.title}
        </Text>
        <Text type="secondary" className="text-[13px] mt-0.5" numberOfLines={2}>
          {column.intro || column.excerpt || '这个专栏没有简介喵'}
        </Text>
        <View className="flex-row mt-1 bg-transparent">
          <Text type="secondary" className="text-xs">
            {column.followers ?? 0} 关注者
          </Text>
          <Text type="secondary" className="text-xs ml-3">
            {column.items_count ?? column.articles_count ?? 0} 内容
          </Text>
        </View>
      </View>
    </BouncyButton>
  );
}
