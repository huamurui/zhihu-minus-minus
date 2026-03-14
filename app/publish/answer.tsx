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

export default function PublishAnswerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const tintColor = Colors[colorScheme].tint;
  const textColor = Colors[colorScheme].text;
  const secondaryColor = Colors[colorScheme].textSecondary;
  const borderCol = Colors[colorScheme].border;

  const [question, setQuestion] = useState('');
  const [content, setContent] = useState('');

  const isPublishEnabled =
    question.trim().length > 0 && content.trim().length > 0;

  return (
    <View className="flex-1">
      <View
        className="flex-row items-center justify-between px-4 pb-3"
        style={{ paddingTop: insets.top + 10 }}
      >
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="close" size={28} color={textColor} />
        </Pressable>
        <Text className="text-lg font-bold">写回答</Text>
        <Pressable
          disabled={!isPublishEnabled}
          onPress={() => {
            console.log('Publish Answer:', question, content);
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
          className="flex-1 px-5 pt-3"
          keyboardShouldPersistTaps="handled"
        >
          <View
            className="flex-row items-center px-3 py-2.5 rounded-xl mb-5"
            style={{ backgroundColor: borderCol + '30' }}
          >
            <Ionicons name="search" size={18} color={secondaryColor} />
            <TextInput
              placeholder="搜索你感兴趣的问题..."
              placeholderTextColor={secondaryColor}
              className="flex-1 text-base ml-2"
              style={{ color: textColor }}
              value={question}
              onChangeText={setQuestion}
            />
          </View>
          <TextInput
            multiline
            placeholder="写下你的专业回答..."
            placeholderTextColor={secondaryColor}
            className="text-lg leading-7 min-h-[400px]"
            style={{ color: textColor, textAlignVertical: 'top' }}
            value={content}
            onChangeText={setContent}
          />
        </ScrollView>

        <View
          className="flex-row px-5 py-3 justify-around"
          style={{
            paddingBottom: insets.bottom + 20,
            borderTopWidth: 0.5,
            borderTopColor: borderCol,
          }}
        >
          <Pressable className="p-2">
            <Ionicons name="image-outline" size={24} color={tintColor} />
          </Pressable>
          <Pressable className="p-2">
            <Ionicons name="videocam-outline" size={24} color={tintColor} />
          </Pressable>
          <Pressable className="p-2">
            <Ionicons name="list-outline" size={24} color={tintColor} />
          </Pressable>
          <Pressable className="p-2">
            <Ionicons name="text-outline" size={24} color={tintColor} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
