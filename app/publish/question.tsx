import { Text, View, useThemeColor } from '@/components/Themed';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/components/useColorScheme';

export default function PublishQuestionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const tintColor = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');
  const secondaryColor = useThemeColor({}, 'textSecondary');
  const borderCol = useThemeColor({}, 'border');
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const isPublishEnabled = title.trim().length > 5;

  return (
    <View style={styles.container}>
      {/* 顶部标题栏 */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeIcon}>
          <Ionicons name="close" size={28} color={textColor} />
        </Pressable>
        <Text style={styles.headerTitle}>提问题</Text>
        <Pressable 
          disabled={!isPublishEnabled} 
          onPress={() => {
            console.log('Publish Question:', title, content);
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
            placeholder="写下你的问题，以问号结尾..."
            placeholderTextColor={secondaryColor}
            style={[styles.titleInput, { color: textColor }]}
            value={title}
            onChangeText={setTitle}
            multiline
            maxLength={100}
          />
          <View style={[styles.divider, { backgroundColor: borderCol }]} />
          <TextInput
            multiline
            placeholder="对问题进行补充说明（可选）"
            placeholderTextColor={secondaryColor}
            style={[styles.input, { color: textColor }]}
            value={content}
            onChangeText={setContent}
          />
        </ScrollView>
        
        <View style={[styles.toolbar, { paddingBottom: insets.bottom + 20, borderTopColor: borderCol }]}>
          <Pressable style={styles.toolItem}>
            <Ionicons name="pricetag-outline" size={24} color={tintColor} />
            <Text style={[styles.toolLabel, { color: tintColor }]}>话题</Text>
          </Pressable>
          <Pressable style={styles.toolItem}>
            <Ionicons name="person-add-outline" size={24} color={tintColor} />
            <Text style={[styles.toolLabel, { color: tintColor }]}>邀请</Text>
          </Pressable>
          <Pressable style={styles.toolItem}>
            <Ionicons name="shield-checkmark-outline" size={24} color={tintColor} />
            <Text style={[styles.toolLabel, { color: tintColor }]}>匿名</Text>
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
    fontSize: 20,
    fontWeight: '800',
    paddingVertical: 16,
    lineHeight: 28,
  },
  divider: {
    height: 0.5,
    marginVertical: 4,
  },
  input: {
    fontSize: 16,
    lineHeight: 24,
    minHeight: 200,
    paddingVertical: 16,
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
