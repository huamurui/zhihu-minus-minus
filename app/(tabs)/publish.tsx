import { Text, View } from '@/components/Themed';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useColorScheme } from '@/components/useColorScheme';

import Colors from '@/constants/Colors';
const { width } = Dimensions.get('window');

const PUBLISH_OPTIONS = [
  { id: 'answer', title: '写回答', subtitle: '分享你的见解', icon: 'create-outline', color: '#0084ff' },
  { id: 'article', title: '写文章', subtitle: '记录生活点滴', icon: 'document-text-outline', color: '#ff9607' },
  { id: 'pin', title: '发想法', subtitle: '随时捕捉灵感', icon: 'bulb-outline', color: '#2ecc71' },
  { id: 'question', title: '提问题', subtitle: '向世界发问', icon: 'help-circle-outline', color: '#e74c3c' },
];

export default function PublishScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const tintColor = Colors[colorScheme].tint;
  const textColor = Colors[colorScheme].text;
  const secondaryColor = Colors[colorScheme].textSecondary;
  const cardBg = Colors[colorScheme].surface;

  const handlePublish = (id: string) => {
    router.push(`/publish/${id}` as any);
  };

  return (
    <View style={styles.container}>
      {/* 顶部指示器 */}
      <View style={[styles.headerSection, { paddingTop: insets.top + 40 }]}>
        <Text style={styles.header}>发布内容(WIP)</Text>
        <Text style={styles.subHeader} type="secondary">让世界看到你的思考</Text>
      </View>

      <View style={styles.grid}>
        {PUBLISH_OPTIONS.map((item, index) => (
          <Pressable
            key={item.id}
            style={({ pressed }) => [
              styles.item,
              { backgroundColor: cardBg, borderColor: colorScheme === 'dark' ? '#333' : '#f0f0f0' },
              pressed && { opacity: 0.8, scale: 0.98 } as any
            ]}
            onPress={() => handlePublish(item.id)}
          >
            <View style={[styles.iconContainer, { backgroundColor: item.color + '15' }]}>
              <Ionicons name={item.icon as any} size={32} color={item.color} />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
            </View>
            <View style={styles.arrow}>
              <Ionicons name="chevron-forward" size={18} color={secondaryColor} />
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  headerSection: {
    marginBottom: 40,
    alignItems: 'center',
  },
  header: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  subHeader: {
    fontSize: 16,
    opacity: 0.7,
  },
  grid: {
    width: '100%',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  itemSubtitle: {
    fontSize: 13,
    opacity: 0.6,
  },
  arrow: {
    marginLeft: 8,
  },
  closeBtn: {
    position: 'absolute',
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  closeBlur: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  }
});
