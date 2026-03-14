import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

export default function FeedbackScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const accentColor = Colors[colorScheme].tint;
  const borderColor = Colors[colorScheme].border;
  const surfaceColor = colorScheme === 'dark' ? '#1c1c1e' : '#fff';

  return (
    <View className="flex-1">
      {/* 顶部标题栏 */}
      <View
        type="surface"
        className="h-[60px] flex-row items-center justify-between px-[15px] pt-[10px]"
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: borderColor,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 justify-center items-center -ml-[10px]"
        >
          <Ionicons name="chevron-back" size={24} color={accentColor} />
        </Pressable>
        <Text className="text-lg font-bold">反馈与建议</Text>
        <View className="w-10" />
      </View>

      <ScrollView className="flex-1 p-4">
        <View className="mt-[10px] bg-transparent">
          <Text className="text-base font-bold mb-3">找到我们</Text>
          <Text className="text-sm leading-[22px] mb-5 opacity-70">
            「知乎--」是一个开源项目。如果您在使用过程中遇到任何问题，或者有好的功能建议，欢迎通过以下方式反馈给我。
          </Text>

          <View
            className="rounded-2xl overflow-hidden"
            style={{
              borderWidth: 1,
              borderColor,
              backgroundColor: surfaceColor,
            }}
          >
            <Pressable
              className="flex-row items-center p-4"
              onPress={() =>
                Linking.openURL('https://github.com/huamurui/zhihu-minus-minus')
              }
            >
              <View
                className="w-9 h-9 rounded-[10px] justify-center items-center"
                style={{ backgroundColor: accentColor + '15' }}
              >
                <Ionicons name="logo-github" size={18} color={accentColor} />
              </View>
              <View className="flex-1 ml-3">
                <Text className="text-xs opacity-60 mb-0.5">
                  项目地址 (推荐提交 Issue)
                </Text>
                <Text className="text-sm font-medium">
                  huamurui/zhihu-minus-minus
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#ccc" />
            </Pressable>

            <View
              className="mx-4"
              style={{
                height: StyleSheet.hairlineWidth,
                backgroundColor: borderColor,
              }}
            />

            <Pressable
              className="flex-row items-center p-4"
              onPress={() => Linking.openURL('mailto:huamurui@outlook.com')}
            >
              <View
                className="w-9 h-9 rounded-[10px] justify-center items-center"
                style={{ backgroundColor: accentColor + '15' }}
              >
                <Ionicons name="mail-outline" size={18} color={accentColor} />
              </View>
              <View className="flex-1 ml-3">
                <Text className="text-xs opacity-60 mb-0.5">邮箱</Text>
                <Text className="text-sm font-medium">
                  huamurui@outlook.com
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#ccc" />
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
