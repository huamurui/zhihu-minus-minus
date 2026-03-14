import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

const PUBLISH_OPTIONS = [
  {
    id: 'answer',
    title: '写回答',
    subtitle: '分享你的见解',
    icon: 'create-outline',
    color: '#0084ff',
  },
  {
    id: 'article',
    title: '写文章',
    subtitle: '记录生活点滴',
    icon: 'document-text-outline',
    color: '#ff9607',
  },
  {
    id: 'pin',
    title: '发想法',
    subtitle: '随时捕捉灵感',
    icon: 'bulb-outline',
    color: '#2ecc71',
  },
  {
    id: 'question',
    title: '提问题',
    subtitle: '向世界发问',
    icon: 'help-circle-outline',
    color: '#e74c3c',
  },
];

export function PublishView() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const secondaryColor = Colors[colorScheme].textSecondary;

  const handlePublish = (id: string) => {
    router.push(`/publish/${id}` as any);
  };

  return (
    <View className="flex-1 px-6">
      <View
        className="mb-10 items-center"
        style={{ paddingTop: insets.top + 60 }}
      >
        <Text className="text-[28px] font-extrabold mb-2 text-foreground dark:text-foreground-dark">
          发布内容(WIP)
        </Text>
        <Text type="secondary" className="text-base opacity-70">
          让世界看到你的思考
        </Text>
      </View>

      <View className="w-full bg-transparent">
        {PUBLISH_OPTIONS.map((item) => (
          <Pressable
            key={item.id}
            className="flex-row items-center p-5 rounded-[20px] mb-4 border bg-surface dark:bg-surface-dark active:opacity-80"
            style={[
              { borderColor: colorScheme === 'dark' ? '#333' : '#f0f0f0' },
              styles.itemShadow,
            ]}
            onPress={() => handlePublish(item.id)}
          >
            <View
              className="w-14 h-14 rounded-2xl justify-center items-center mr-4"
              style={{ backgroundColor: item.color + '15' }}
            >
              <Ionicons name={item.icon as any} size={32} color={item.color} />
            </View>
            <View className="flex-1 bg-transparent">
              <Text className="text-lg font-bold mb-1 text-foreground dark:text-foreground-dark">
                {item.title}
              </Text>
              <Text className="text-[13px] opacity-60 text-foreground dark:text-foreground-dark">
                {item.subtitle}
              </Text>
            </View>
            <View className="ml-2 bg-transparent">
              <Ionicons
                name="chevron-forward"
                size={18}
                color={secondaryColor}
              />
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  itemShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
});
