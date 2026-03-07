import { Text, View, useThemeColor } from '@/components/Themed';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Image, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import RenderHtml from 'react-native-render-html';

export default function ArticleDetail() {
  const { id } = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({}, 'border');

  const { data, isLoading } = useQuery({
    queryKey: ['article', id],
    queryFn: async () => {
      const res = await axios.get(`https://news-at.zhihu.com/api/4/news/${id}`);
      return res.data;
    }
  });

  if (isLoading) return <View style={styles.center}><Text>正赶往知识的荒原...喵</Text></View>;

  return (
    <ScrollView style={styles.container}>
      <Stack.Screen options={{ title: '文章' }} />
      {/* 顶部大图 */}
      <View style={styles.header}>
        <Image source={{ uri: data.image }} style={styles.topImage} />
        <View style={styles.overlay}>
          <Text style={styles.topTitle}>{data.title}</Text>
          <Text style={styles.imageSource}>{data.image_source}</Text>
        </View>
      </View>

      {/* HTML 内容渲染 */}
      <View style={{ paddingHorizontal: 15, backgroundColor: 'transparent' }}>
        <RenderHtml
          contentWidth={width}
          source={{ html: data.body }}
          // 知乎日报的 HTML 需要配合它提供的 CSS，这里简单处理下图片和段落
          tagsStyles={{
            p: { fontSize: 17, lineHeight: 26, color: textColor, marginBottom: 15 },
            img: { borderRadius: 8, marginVertical: 10 },
            blockquote: { borderLeftWidth: 4, borderLeftColor: borderColor, paddingLeft: 10, color: textColor },
            span: { color: textColor },
            div: { color: textColor },
            h1: { color: textColor },
            h2: { color: textColor },
            h3: { color: textColor },
          }}
        />
      </View>
      <View style={{ height: 50, backgroundColor: 'transparent' }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { width: '100%', height: 300, position: 'relative' },
  topImage: { width: '100%', height: '100%' },
  overlay: { position: 'absolute', bottom: 0, padding: 20, width: '100%', backgroundColor: 'rgba(0,0,0,0.4)' },
  topTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  imageSource: { color: 'rgba(255,255,255,0.7)', fontSize: 10, textAlign: 'right', marginTop: 8 }
});