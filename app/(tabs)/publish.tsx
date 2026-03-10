import { Text, View, useThemeColor } from '@/components/Themed';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PUBLISH_OPTIONS = [
  { id: 'answer', title: '写回答', icon: 'create-outline', color: '#0084ff' },
  { id: 'article', title: '写文章', icon: 'document-text-outline', color: '#ff9607' },
  { id: 'pin', title: '发想法', icon: 'bulb-outline', color: '#2ecc71' },
  { id: 'question', title: '提问题', icon: 'help-circle-outline', color: '#e74c3c' },
];

export default function PublishScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tintColor = useThemeColor({}, 'tint');

  return (
    <View style={[styles.container, { paddingTop: insets.top + 60 }]}>
      <Text style={styles.header}>发布内容</Text>
      
      <View style={styles.grid}>
        {PUBLISH_OPTIONS.map((item) => (
          <Pressable
            key={item.id}
            style={({ pressed }) => [
              styles.item,
              pressed && { opacity: 0.7, scale: 0.98 } as any
            ]}
            onPress={() => {
              // TODO: Implement navigation to actual publish pages
              console.log(`Publish: ${item.id}`);
            }}
          >
            <View style={[styles.iconContainer, { backgroundColor: item.color + '15' }]}>
              <Ionicons name={item.icon as any} size={30} color={item.color} />
            </View>
            <Text style={styles.itemTitle}>{item.title}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable 
        style={styles.closeBtn} 
        onPress={() => router.back()}
      >
        <Ionicons name="close" size={30} color="#999" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 40,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
  },
  item: {
    width: '45%',
    aspectRatio: 1,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#eee',
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  closeBtn: {
    position: 'absolute',
    bottom: 50,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  }
});
