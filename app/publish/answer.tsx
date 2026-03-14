import { Text, View } from '@/components/Themed';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

  const isPublishEnabled = question.trim().length > 0 && content.trim().length > 0;

  return (
    <View style={styles.container}>
      {/* 顶部标题栏 */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeIcon}>
          <Ionicons name="close" size={28} color={textColor} />
        </Pressable>
        <Text style={styles.headerTitle}>写回答</Text>
        <Pressable 
          disabled={!isPublishEnabled} 
          onPress={() => {
            console.log('Publish Answer:', question, content);
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
          <View style={[styles.searchContainer, { backgroundColor: borderCol + '30' }]}>
            <Ionicons name="search" size={18} color={secondaryColor} />
            <TextInput
              placeholder="搜索你感兴趣的问题..."
              placeholderTextColor={secondaryColor}
              style={[styles.searchInput, { color: textColor }]}
              value={question}
              onChangeText={setQuestion}
            />
          </View>
          
          <TextInput
            multiline
            placeholder="写下你的专业回答..."
            placeholderTextColor={secondaryColor}
            style={[styles.input, { color: textColor }]}
            value={content}
            onChangeText={setContent}
          />
        </ScrollView>

        <View style={[styles.toolbar, { paddingBottom: insets.bottom + 20, borderTopColor: borderCol }]}>
          <Pressable style={styles.toolItem}>
            <Ionicons name="image-outline" size={24} color={tintColor} />
          </Pressable>
          <Pressable style={styles.toolItem}>
            <Ionicons name="videocam-outline" size={24} color={tintColor} />
          </Pressable>
          <Pressable style={styles.toolItem}>
            <Ionicons name="list-outline" size={24} color={tintColor} />
          </Pressable>
          <Pressable style={styles.toolItem}>
            <Ionicons name="text-outline" size={24} color={tintColor} />
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
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 20,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    marginLeft: 8,
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
    justifyContent: 'space-around',
  },
  toolItem: {
    padding: 8,
  }
});
