import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

export default function PublishArticleScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const tintColor = Colors[colorScheme].tint;
  const textColor = Colors[colorScheme].text;
  const secondaryColor = Colors[colorScheme].textSecondary;
  const borderCol = Colors[colorScheme].border;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const isPublishEnabled = title.trim().length > 0 && content.trim().length > 0;

  return (
    <View className="flex-1">
      <View
        className="flex-row items-center justify-between px-4 pb-3"
        style={{ paddingTop: insets.top + 10 }}
      >
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="close" size={28} color={textColor} />
        </Pressable>
        <Text className="text-lg font-bold">写文章</Text>
        <Pressable
          disabled={!isPublishEnabled}
          onPress={() => {
            console.log('Publish Article:', title, content);
            router.back();
          }}
          className="px-5 py-2 rounded-full"
          style={({ pressed }) => [
            { backgroundColor: isPublishEnabled ? tintColor : borderCol },
            pressed && { opacity: 0.8 },
          ]}
        >
          <Text
            className="text-sm font-bold"
            style={{ color: isPublishEnabled ? 'white' : secondaryColor }}
          >
            发布
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          className="flex-1 px-6 pt-3"
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            autoFocus
            placeholder="请输入文章标题"
            placeholderTextColor={secondaryColor}
            className="text-[22px] font-extrabold py-4 mb-5"
            style={{
              color: textColor,
              borderBottomWidth: 0.5,
              borderBottomColor: borderCol,
            }}
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />
          <TextInput
            multiline
            placeholder="这一刻的想法..."
            placeholderTextColor={secondaryColor}
            className="text-lg leading-7 min-h-[400px]"
            style={{ color: textColor, textAlignVertical: 'top' }}
            value={content}
            onChangeText={setContent}
          />
        </ScrollView>

        <View
          className="flex-row px-5 py-3"
          style={{
            paddingBottom: insets.bottom + 20,
            borderTopWidth: 0.5,
            borderTopColor: borderCol,
          }}
        >
          {[
            { icon: 'image-outline', label: '插图' },
            { icon: 'text-outline', label: '排版' },
            { icon: 'at-outline', label: '提到' },
            { icon: 'settings-outline', label: '设置' },
          ].map((tool) => (
            <Pressable key={tool.icon} className="flex-row items-center mr-6">
              <Ionicons name={tool.icon as any} size={24} color={tintColor} />
              <Text
                className="text-sm ml-1 font-medium"
                style={{ color: tintColor }}
              >
                {tool.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
