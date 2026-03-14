import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
} from 'react-native';
import {
  createCollection,
  deleteCollection,
  getMyCollections,
  updateCollection,
} from '@/api/zhihu';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

export default function MyCollectionsScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const primaryColor = '#0084ff';
  const borderColor = Colors[colorScheme].border;
  const surfaceColor = colorScheme === 'dark' ? '#1c1c1e' : '#fff';
  const tintColor = Colors[colorScheme].tint;

  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);

  useEffect(() => {
    navigation.setOptions({
      title: '我的收藏夹',
      headerRight: () => (
        <Pressable onPress={() => openModal()} style={{ marginRight: 15 }}>
          <Ionicons name="add" size={28} color={primaryColor} />
        </Pressable>
      ),
    });
  }, [navigation]);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ['my-collections'],
    queryFn: ({ pageParam = 0 }) => getMyCollections(20, pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.paging?.is_end) return undefined;
      const nextUrl = lastPage.paging?.next;
      const match = nextUrl?.match(/offset=(\d+)/);
      return match ? parseInt(match[1]) : undefined;
    },
  });

  const createMutation = useMutation({
    mutationFn: createCollection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-collections'] });
      closeModal();
    },
  });
  const updateMutation = useMutation({
    mutationFn: (vars: any) => updateCollection(vars.id, vars.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-collections'] });
      closeModal();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteCollection,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['my-collections'] }),
  });

  const openModal = (item?: any) => {
    if (item) {
      setEditingItem(item);
      setTitle(item.title);
      setDescription(item.description || '');
      setIsPublic(item.is_public);
    } else {
      setEditingItem(null);
      setTitle('');
      setDescription('');
      setIsPublic(true);
    }
    setModalVisible(true);
  };
  const closeModal = () => {
    setModalVisible(false);
    setEditingItem(null);
  };

  const handleSave = () => {
    if (!title.trim()) {
      Alert.alert('提示', '请输入标题喵');
      return;
    }
    const data = { title, description, is_public: isPublic };
    if (editingItem) updateMutation.mutate({ id: editingItem.id, data });
    else createMutation.mutate(data);
  };

  const handleDelete = (item: any) => {
    Alert.alert(
      '确认删除',
      `确定要删除"${item.title}"吗喵？内部的内容也会一并移出。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定删除',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(item.id),
        },
      ],
    );
  };

  const collections = data?.pages.flatMap((page) => page.data) || [];

  const renderItem = ({ item }: { item: any }) => (
    <Pressable
      className="flex-row p-[15px] items-center"
      style={({ pressed }) => [
        {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: borderColor,
        },
        pressed && { opacity: 0.7 },
      ]}
      onPress={() => router.push(`/collections/${item.id}`)}
      onLongPress={() => {
        Alert.alert(item.title, '选择操作', [
          { text: '编辑', onPress: () => openModal(item) },
          {
            text: '删除',
            style: 'destructive',
            onPress: () => handleDelete(item),
          },
          { text: '取消', style: 'cancel' },
        ]);
      }}
    >
      <View
        className="w-12 h-12 rounded-lg justify-center items-center relative"
        style={{ backgroundColor: 'rgba(0,132,255,0.05)' }}
      >
        <Ionicons
          name={item.is_public ? 'folder' : 'folder-outline'}
          size={24}
          color={primaryColor}
        />
        {!item.is_public && (
          <View
            className="absolute -right-0.5 -bottom-0.5 rounded-md p-0.5"
            style={{
              backgroundColor: '#ff4d4f',
              borderWidth: 1,
              borderColor: '#fff',
            }}
          >
            <Ionicons name="lock-closed" size={10} color="#fff" />
          </View>
        )}
      </View>
      <View className="ml-[15px] flex-1">
        <Text className="text-base font-bold">{item.title}</Text>
        {item.description ? (
          <Text
            type="secondary"
            numberOfLines={1}
            className="text-[13px] mt-0.5"
          >
            {item.description}
          </Text>
        ) : null}
        <Text type="secondary" className="text-xs mt-1 opacity-60">
          {item.answer_count || 0} 内容 · {item.follower_count || 0} 关注
        </Text>
      </View>
      <Pressable onPress={() => openModal(item)} className="p-2.5">
        <Ionicons name="ellipsis-horizontal" size={18} color="#ccc" />
      </Pressable>
    </Pressable>
  );

  return (
    <View className="flex-1">
      <FlashList
        data={collections}
        renderItem={renderItem}
        {...({ estimatedItemSize: 90 } as any)}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onRefresh={refetch}
        refreshing={isRefetching}
        ListHeaderComponent={() => <View className="h-2.5" />}
        ListEmptyComponent={() => (
          <View className="flex-1 p-[100px] items-center">
            {isLoading ? (
              <ActivityIndicator color={primaryColor} />
            ) : (
              <Text type="secondary">你还没有收藏夹喵</Text>
            )}
          </View>
        )}
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={closeModal}
      >
        <View
          className="flex-1 justify-end"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <View
            className="rounded-t-3xl p-5 h-[70%]"
            style={{ backgroundColor: surfaceColor }}
          >
            <View className="flex-row justify-between items-center mb-5">
              <Text className="text-lg font-bold">
                {editingItem ? '编辑收藏夹' : '新建收藏夹'}
              </Text>
              <Pressable onPress={closeModal}>
                <Ionicons name="close" size={24} color="#999" />
              </Pressable>
            </View>

            <ScrollView className="flex-1">
              <Text className="text-[15px] font-semibold mb-2 mt-[15px]">
                标题
              </Text>
              <TextInput
                className="rounded-lg p-3 text-base"
                style={{ borderWidth: 1, borderColor, color: tintColor }}
                value={title}
                onChangeText={setTitle}
                placeholder="输入标题"
                placeholderTextColor="#999"
              />

              <Text className="text-[15px] font-semibold mb-2 mt-[15px]">
                描述 (可选)
              </Text>
              <TextInput
                className="rounded-lg p-3 text-base h-20"
                style={{
                  borderWidth: 1,
                  borderColor,
                  color: tintColor,
                  textAlignVertical: 'top',
                }}
                value={description}
                onChangeText={setDescription}
                placeholder="输入描述"
                placeholderTextColor="#999"
                multiline
                numberOfLines={3}
              />

              <View className="flex-row justify-between items-center mt-5 mb-[30px]">
                <View>
                  <Text className="text-[15px] font-semibold mb-2 mt-[15px]">
                    公开收藏夹
                  </Text>
                  <Text type="secondary" className="text-xs">
                    公开后其他用户可见
                  </Text>
                </View>
                <Switch
                  value={isPublic}
                  onValueChange={setIsPublic}
                  trackColor={{ false: '#ddd', true: primaryColor }}
                />
              </View>
            </ScrollView>

            <Pressable
              className="h-[50px] rounded-[25px] justify-center items-center mt-2.5 mb-5"
              style={{ backgroundColor: primaryColor }}
              onPress={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white text-base font-bold">完成</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
