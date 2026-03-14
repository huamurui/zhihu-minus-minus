import { Text, View } from '@/components/Themed';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

export default function PublishScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const secondaryColor = Colors[colorScheme].textSecondary;
  const cardBg = Colors[colorScheme].surface;

  return (
    <View className="flex-1 px-6">
      <View
        className="mb-10 items-center"
        style={{ paddingTop: insets.top + 40 }}
      >
        <Text className="text-[28px] font-extrabold mb-2">发布内容(WIP)</Text>
        <Text className="text-base opacity-70" type="secondary">
          让世界看到你的思考
        </Text>
      </View>

      <View className="w-full">
        {PUBLISH_OPTIONS.map((item) => (
          <Pressable
            key={item.id}
            className="flex-row items-center p-5 rounded-[20px] mb-4"
            style={({ pressed }) => [
              {
                backgroundColor: cardBg,
                borderWidth: 1,
                borderColor: colorScheme === 'dark' ? '#333' : '#f0f0f0',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.05,
                shadowRadius: 10,
                elevation: 2,
              },
              pressed && ({ opacity: 0.8 } as any),
            ]}
            onPress={() => router.push(`/publish/${item.id}` as any)}
          >
            <View
              className="w-14 h-14 rounded-2xl justify-center items-center mr-4"
              style={{ backgroundColor: item.color + '15' }}
            >
              <Ionicons name={item.icon as any} size={32} color={item.color} />
            </View>
            <View className="flex-1">
              <Text className="text-lg font-bold mb-1">{item.title}</Text>
              <Text className="text-[13px] opacity-60">{item.subtitle}</Text>
            </View>
            <View className="ml-2">
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
