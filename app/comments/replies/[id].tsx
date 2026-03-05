import apiClient from '@/api/client';
import { Text, View } from '@/components/Themed';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { FlatList, Image, StyleSheet } from 'react-native';

export default function ReplyDetailScreen() {
  const { id } = useLocalSearchParams(); // 根评论 ID

  const { data: replies, isLoading } = useQuery({
    queryKey: ['replies', id],
    queryFn: async () => {
      const res = await apiClient.get(`/comments/${id}/child_comments?limit=20`);
      return res.data.data;
    }
  });

  return (
    <View style={styles.container}>
      <FlatList
        data={replies}
        ListHeaderComponent={() => (
          <View style={styles.header}><Text type="secondary">所有回复</Text></View>
        )}
        renderItem={({ item }: { item: any }) => (
          <View style={[styles.replyRow, { backgroundColor: 'transparent' }]}>
            <Image source={{ uri: item.author.member.avatar_url }} style={styles.avatar} />
            <View style={[styles.contentBox, { backgroundColor: 'transparent' }]}>
              <Text style={styles.authorName}>
                {item.author.member.name}
                {item.reply_to_author && <Text type="secondary" style={styles.replyTo}> 回复 {item.reply_to_author.member.name}</Text>}
              </Text>
              <Text style={styles.content}>
                {item.content}
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 15, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  replyRow: { flexDirection: 'row', padding: 15 },
  avatar: { width: 24, height: 24, borderRadius: 12 },
  contentBox: { flex: 1, marginLeft: 10 },
  authorName: { fontWeight: 'bold' },
  replyTo: { fontWeight: 'normal' },
  content: { marginTop: 4, lineHeight: 20 }
});