import { Text, View, useThemeColor } from '@/components/Themed';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/components/useColorScheme';

export default function PublishArticleScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const tintColor = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');
  const secondaryColor = useThemeColor({}, 'textSecondary');
  const borderCol = useThemeColor({}, 'border');
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const isPublishEnabled = title.trim().length > 0 && content.trim().length > 0;

  return (
    <View style={styles.container}>
      {/* 顶部标题栏 */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeIcon}>
          <Ionicons name="close" size={28} color={textColor} />
        </Pressable>
        <Text style={styles.headerTitle}>写文章</Text>
        <Pressable 
          disabled={!isPublishEnabled} 
          onPress={() => {
            console.log('Publish Article:', title, content);
            router.back();
          }}
          style={({ pressed }) => [
            styles.publishBtn,
            { backgroundColor: isPublishEnabled ? tintColor : borderCol },
            pressed && { opacity: 0.8 }
          ]}
        >
          <Text style={[styles.publishText, { color: isPublishEnabled ? 'white' : secondaryColor }]}>发布</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          <TextInput
            autoFocus
            placeholder="请输入文章标题"
            placeholderTextColor={secondaryColor}
            style={[styles.titleInput, { color: textColor, borderBottomColor: borderCol }]}
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />
          <TextInput
            multiline
            placeholder="这一刻的想法..."
            placeholderTextColor={secondaryColor}
            style={[styles.input, { color: textColor }]}
            value={content}
            onChangeText={setContent}
          />
        </ScrollView>

        <View style={[styles.toolbar, { paddingBottom: insets.bottom + 20, borderTopColor: borderCol }]}>
          <Pressable style={styles.toolItem}>
            <Ionicons name="image-outline" size={24} color={tintColor} />
            <Text style={[styles.toolLabel, { color: tintColor }]}>插图</Text>
          </Pressable>
          <Pressable style={styles.toolItem}>
            <Ionicons name="text-outline" size={24} color={tintColor} />
            <Text style={[styles.toolLabel, { color: tintColor }]}>排版</Text>
          </Pressable>
          <Pressable style={styles.toolItem}>
            <Ionicons name="at-outline" size={24} color={tintColor} />
            <Text style={[styles.toolLabel, { color: tintColor }]}>提到</Text>
          </Pressable>
          <Pressable style={styles.toolItem}>
            <Ionicons name="settings-outline" size={24} color={tintColor} />
            <Text style={[styles.toolLabel, { color: tintColor }]}>设置</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeIcon: {
    padding: 4,
  },
  publishBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  publishText: {
    fontSize: 14,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  titleInput: {
    fontSize: 22,
    fontWeight: '800',
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    marginBottom: 20,
  },
  input: {
    fontSize: 18,
    lineHeight: 28,
    minHeight: 400,
    textAlignVertical: 'top',
  },
  toolbar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 0.5,
  },
  toolItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 24,
  },
  toolLabel: {
    fontSize: 14,
    marginLeft: 4,
    fontWeight: '500',
  }
});
