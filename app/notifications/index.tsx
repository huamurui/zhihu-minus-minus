import { Text, View } from '@/components/Themed';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { FlatList, StyleSheet } from 'react-native';

const MOCK_NOTIFS = [
  { id: '1', type: 'like', user: '李四', target: '你的回答：如何学习 RN', time: '10分钟前' },
  { id: '2', type: 'comment', user: '王五', target: '太深刻了！', time: '1小时前' },
];

export default function NotificationScreen() {
  return (
    <View style={styles.container}>
      <FlatList
        data={MOCK_NOTIFS}
        renderItem={({ item }: { item: any }) => (
          <View type="surface" style={styles.card}>
            <Ionicons
              name={item.type === 'like' ? 'heart' : 'chatbubble'}
              size={20}
              color={item.type === 'like' ? '#f44336' : '#0084ff'}
            />
            <View style={[styles.content, { backgroundColor: 'transparent' }]}>
              <Text>
                <Text style={{ fontWeight: 'bold' }}>{item.user}</Text>
                {item.type === 'like' ? ' 赞同了你' : ' 评论了你'}
              </Text>
              <Text type="secondary" style={styles.target} numberOfLines={1}>{item.target}</Text>
              <Text type="secondary" style={styles.time}>{item.time}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: { flexDirection: 'row', padding: 15, marginBottom: 1, alignItems: 'center' },
  content: { marginLeft: 15, flex: 1 },
  target: { fontSize: 13, marginTop: 4 },
  time: { fontSize: 11, marginTop: 4 }
});