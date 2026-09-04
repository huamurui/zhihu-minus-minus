import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createPin } from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

export default function PublishPinScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const queryClient = useQueryClient();
  const tintColor = useThemeColor({}, 'primary');
  const textColor = Colors[colorScheme].text;
  const secondaryColor = Colors[colorScheme].textSecondary;
  const borderCol = Colors[colorScheme].border;

  const [content, setContent] = useState('');

  const mutation = useMutation({
    mutationFn: () => createPin(content.trim()),
    onSuccess: () => {
      Alert.alert('发布成功', '您的想法已发布！');
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      router.back();
    },
    onError: (err: any) => {
      console.error(err);
      Alert.alert('发布失败', err.response?.data?.error?.message || '未知错误');
    },
  });

  const handlePublish = () => {
    if (!content.trim()) {
      Alert.alert('提示', '请输入想法内容');
      return;
    }
    mutation.mutate();
  };

  const isPublishEnabled = content.trim().length > 0 && !mutation.isPending;

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
        <BouncyButton
          disabled={!isPublishEnabled}
          onPress={handlePublish}
          className="px-5 py-2 rounded-full min-w-[80px] items-center justify-center"
          style={{ backgroundColor: isPublishEnabled ? tintColor : borderCol }}
        >
          {mutation.isPending ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text
              className="text-sm font-bold"
              style={{ color: isPublishEnabled ? 'white' : secondaryColor }}
            >
              发布
            </Text>
          )}
        </BouncyButton>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          className="flex-1 px-5 pt-4"
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            multiline
            autoFocus
            placeholder="这一刻的想法..."
            placeholderTextColor={secondaryColor}
            className="text-lg leading-7 min-h-[200px]"
            style={{ color: textColor, textAlignVertical: 'top' }}
            value={content}
            onChangeText={setContent}
          />
        </ScrollView>

        <View
          className="flex-row px-5 py-3 justify-around bg-transparent"
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
            <Ionicons name="at-outline" size={24} color={tintColor} />
          </Pressable>
          <Pressable className="p-2">
            <Ionicons name="happy-outline" size={24} color={tintColor} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
