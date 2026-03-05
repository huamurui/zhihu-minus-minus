import apiClient from '@/api/client';
import { useThemeStore } from '@/store/useThemeStore';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { FlatList, Image, StyleSheet, Text, View } from 'react-native';

export default function ReplyDetailScreen() {
  const { id } = useLocalSearchParams(); // 根评论 ID
  const { isDark } = useThemeStore();

  const { data: replies, isLoading } = useQuery({
    queryKey: ['replies', id],
    queryFn: async () => {
      const res = await apiClient.get(`/comments/${id}/child_comments?limit=20`);
      return res.data.data;
    }
  });

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#121212' : '#fff' }}>
      <FlatList
        data={replies}
        ListHeaderComponent={() => (
          <View style={styles.header}><Text style={{color: '#888'}}>所有回复</Text></View>
        )}
        renderItem={({ item }) => (
          <View style={styles.replyRow}>
            <Image source={{ uri: item.author.member.avatar_url }} style={styles.avatar} />
            <View style={styles.contentBox}>
              <Text style={{ fontWeight: 'bold', color: isDark ? '#eee' : '#333' }}>
                {item.author.member.name} 
                {item.reply_to_author && <Text style={{fontWeight: 'normal', color: '#999'}}> 回复 {item.reply_to_author.member.name}</Text>}
              </Text>
              <Text style={{ color: isDark ? '#ccc' : '#444', marginTop: 4, lineHeight: 20 }}>
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
  header: { padding: 15, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  replyRow: { flexDirection: 'row', padding: 15 },
  avatar: { width: 24, height: 24, borderRadius: 12 },
  contentBox: { flex: 1, marginLeft: 10 }
});