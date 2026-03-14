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

export default function PublishQuestionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const tintColor = Colors[colorScheme].tint;
  const textColor = Colors[colorScheme].text;
  const secondaryColor = Colors[colorScheme].textSecondary;
  const borderCol = Colors[colorScheme].border;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const isPublishEnabled = title.trim().length > 5;

  return (
    <View className="flex-1">
      <View
        className="flex-row items-center justify-between px-4 pb-3"
        style={{ paddingTop: insets.top + 10 }}
      >
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="close" size={28} color={textColor} />
        </Pressable>
        <Text className="text-lg font-bold">提问题</Text>
        <Pressable
          disabled={!isPublishEnabled}
          onPress={() => {
            console.log('Publish Question:', title, content);
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
            placeholder="写下你的问题，以问号结尾..."
            placeholderTextColor={secondaryColor}
            className="text-xl font-extrabold py-4 leading-7"
            style={{ color: textColor }}
            value={title}
            onChangeText={setTitle}
            multiline
            maxLength={100}
          />
          <View
            className="my-1"
            style={{ height: 0.5, backgroundColor: borderCol }}
          />
          <TextInput
            multiline
            placeholder="对问题进行补充说明（可选）"
            placeholderTextColor={secondaryColor}
            className="text-base leading-6 min-h-[200px] py-4"
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
            { icon: 'pricetag-outline', label: '话题' },
            { icon: 'person-add-outline', label: '邀请' },
            { icon: 'shield-checkmark-outline', label: '匿名' },
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
