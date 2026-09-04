import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native';
import {
  createCollection,
  deleteCollection,
  getMyCollections,
  updateCollection,
} from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { CollectionEditorForm } from '@/components/CollectionEditorForm';
import { ActionSheet } from '@/components/overlays/ActionSheet';
import { BottomSheet } from '@/components/overlays/BottomSheet';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

interface CollectionItem {
  id: string | number;
  title: string;
  description?: string;
  is_public: boolean;
  answer_count?: number;
  follower_count?: number;
}

export default function MyCollectionsScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const primaryColor = useThemeColor({}, 'primary');
  const borderColor = Colors[colorScheme].border;
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<CollectionItem | null>(null);
  const [actionItem, setActionItem] = useState<CollectionItem | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);

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
      return match ? parseInt(match[1], 10) : undefined;
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
    mutationFn: (vars: {
      id: string | number;
      data: { title: string; description: string; is_public: boolean };
    }) => updateCollection(vars.id, vars.data),
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

  const openModal = useCallback((item?: CollectionItem) => {
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
  }, []);

  useEffect(() => {
    navigation.setOptions({
      title: '我的收藏夹',
      headerRight: () => (
        <Pressable onPress={() => openModal()} style={{ marginRight: 15 }}>
          <Ionicons name="add" size={28} color={primaryColor} />
        </Pressable>
      ),
    });
  }, [navigation, openModal, primaryColor]);
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

  const handleDelete = (item: CollectionItem) => {
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

  const collections =
    (data?.pages.flatMap((page) => page.data) as
      | CollectionItem[]
      | undefined) || [];

  const renderItem = ({ item }: { item: CollectionItem }) => (
    <BouncyButton
      className="flex-row p-[15px] items-center"
      style={{
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: borderColor,
      }}
      onPress={() => router.push(`/collections/${item.id}`)}
      onLongPress={() => setActionItem(item)}
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
              borderColor: Colors[colorScheme].textInverse,
            }}
          >
            <Ionicons
              name="lock-closed"
              size={10}
              color={Colors[colorScheme].textInverse}
            />
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
      <Pressable onPress={() => setActionItem(item)} className="p-2.5">
        <Ionicons
          name="ellipsis-horizontal"
          size={18}
          color={Colors[colorScheme].tabIconDefault}
        />
      </Pressable>
    </BouncyButton>
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

      <BottomSheet
        visible={modalVisible}
        onClose={closeModal}
        title={editingItem ? '编辑收藏夹' : '新建收藏夹'}
        height="72%"
        keyboardAvoiding
      >
        <CollectionEditorForm
          title={title}
          description={description}
          isPublic={isPublic}
          onTitleChange={setTitle}
          onDescriptionChange={setDescription}
          onPublicChange={setIsPublic}
          onSubmit={handleSave}
          pending={createMutation.isPending || updateMutation.isPending}
        />
      </BottomSheet>

      <ActionSheet
        visible={Boolean(actionItem)}
        onClose={() => setActionItem(null)}
        title={actionItem?.title || '收藏夹操作'}
        options={
          actionItem
            ? [
                {
                  key: 'edit',
                  icon: 'create-outline',
                  label: '编辑收藏夹',
                  onPress: () => openModal(actionItem),
                },
                {
                  key: 'delete',
                  icon: 'trash-outline',
                  label: '删除收藏夹',
                  destructive: true,
                  onPress: () => handleDelete(actionItem),
                },
              ]
            : []
        }
      />
    </View>
  );
}
