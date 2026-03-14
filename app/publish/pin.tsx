import { Text, View } from '@/components/Themed';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

export default function PublishPinScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const tintColor = Colors[colorScheme].tint;
  const textColor = Colors[colorScheme].text;
  const secondaryColor = Colors[colorScheme].textSecondary;
  const borderCol = Colors[colorScheme].border;

  const [content, setContent] = useState('');

  const isPublishEnabled = content.trim().length > 0;

  return (
    <View className="flex-1">
      <View
        className="flex-row items-center justify-between px-4 pb-3"
        style={{ paddingTop: insets.top + 10 }}
      >
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="close" size={28} color={textColor} />
        </Pressable>
        <Text className="text-lg font-bold">发想法</Text>
        <Pressable
          disabled={!isPublishEnabled}
          onPress={() => {
            console.log('Publish Pin:', content);
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
          className="flex-1 px-5 pt-5"
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            multiline
            autoFocus
            placeholder="分享你现在的想法..."
            placeholderTextColor={secondaryColor}
            className="text-lg leading-7 min-h-[200px]"
            style={{ color: textColor, textAlignVertical: 'top' }}
            value={content}
            onChangeText={setContent}
            maxLength={1000}
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
            { icon: 'image-outline', label: '图片' },
            { icon: 'videocam-outline', label: '视频' },
            { icon: 'at-outline', label: '提到' },
            { icon: 'chatbubble-outline', label: '话题' },
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
