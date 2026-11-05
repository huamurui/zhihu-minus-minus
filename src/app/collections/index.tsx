import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList } from '@shopify/flash-list';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { hasAuthenticationCookie } from '@/api/client';
import {
  createCollection,
  deleteCollection,
  getMyCollections,
  updateCollection,
} from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { CollectionEditorForm } from '@/components/CollectionEditorForm';
import { MoreActionsButton } from '@/components/MoreActionsButton';
import { ActionSheet } from '@/components/overlays/ActionSheet';
import { BottomSheet } from '@/components/overlays/BottomSheet';
import { QueryErrorView } from '@/components/QueryErrorView';
import { useIsLiquidGlassActive } from '@/components/surfaces/FloatingSurface';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useRefreshAction } from '@/hooks/useRefreshAction';
import { useZhihuInfiniteQuery } from '@/hooks/useZhihuInfiniteQuery';
import { useAuthStore } from '@/store/useAuthStore';
import type { ZhihuCollectionSummary } from '@/types/zhihu';
import { refreshInfiniteQuery } from '@/utils/query';
import { getZhihuErrorMessage } from '@/utils/zhihuError';

type CollectionItem = ZhihuCollectionSummary;

export default function MyCollectionsScreen() {
  const colorScheme = useColorScheme();
  const useGlass = useIsLiquidGlassActive();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const cookies = useAuthStore((state) => state.cookies);
  const isAuthenticated = hasAuthenticationCookie(cookies);
  const primaryColor = useThemeColor({}, 'primary');
  const dangerColor = useThemeColor({}, 'danger');
  const onDanger = useThemeColor({}, 'onDanger');
  const backgroundColor = useThemeColor({}, 'background');
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
    isFetching,
    refetch,
    isError,
  } = useZhihuInfiniteQuery({
    queryKey: ['my-collections'],
    queryFn: ({ pageParam = 0 }) => getMyCollections(20, pageParam as number),
    enabled: isAuthenticated,
    initialPageParam: 0,
  });

  const { refresh, refreshing } = useRefreshAction(() =>
    refreshInfiniteQuery(queryClient, ['my-collections']),
  );

  const createMutation = useMutation({
    mutationFn: createCollection,
    onSuccess: () => {
      void refreshInfiniteQuery(queryClient, ['my-collections']);
      closeModal();
    },
    onError: (error) => {
      Alert.alert('创建失败', getZhihuErrorMessage(error));
    },
  });
  const updateMutation = useMutation({
    mutationFn: (vars: {
      id: string | number;
      data: { title: string; description: string; is_public: boolean };
    }) => updateCollection(vars.id, vars.data),
    onSuccess: (_response, { id }) => {
      void refreshInfiniteQuery(queryClient, ['my-collections']);
      void queryClient.invalidateQueries({
        queryKey: ['collection-detail', String(id)],
        exact: true,
      });
      closeModal();
    },
    onError: (error) => {
      Alert.alert('保存失败', getZhihuErrorMessage(error));
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteCollection,
    onSuccess: (_response, id) => {
      queryClient.removeQueries({
        queryKey: ['collection-detail', String(id)],
        exact: true,
      });
      queryClient.removeQueries({
        queryKey: ['collection-contents', String(id)],
        exact: true,
      });
      return refreshInfiniteQuery(queryClient, ['my-collections']);
    },
    onError: (error) => {
      Alert.alert('删除失败', getZhihuErrorMessage(error));
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const openModal = useCallback(
    (item?: CollectionItem) => {
      if (!isAuthenticated) {
        router.push('/login');
        return;
      }
      if (isSaving) return;
      if (item) {
        setEditingItem(item);
        setTitle(item.title);
        setDescription(item.description || '');
        setIsPublic(item.is_public ?? false);
      } else {
        setEditingItem(null);
        setTitle('');
        setDescription('');
        setIsPublic(true);
      }
      setModalVisible(true);
    },
    [isAuthenticated, isSaving, router],
  );

  useEffect(() => {
    navigation.setOptions({
      title: '我的收藏夹',
      headerRight: () => (
        <BouncyButton
          className="p-2 rounded-full"
          onPress={() => openModal()}
          disabled={isSaving}
          style={{ marginRight: useGlass ? 0 : 15 }}
        >
          <Ionicons name="add" size={28} color={primaryColor} />
        </BouncyButton>
      ),
    });
  }, [isSaving, navigation, openModal, primaryColor, useGlass]);
  const closeModal = () => {
    setModalVisible(false);
    setEditingItem(null);
  };

  const handleSave = () => {
    if (isSaving || !isAuthenticated) return;
    if (!title.trim()) {
      Alert.alert('提示', '请输入标题喵');
      return;
    }
    const data = {
      title: title.trim(),
      description: description.trim(),
      is_public: isPublic,
    };
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

  const collections = data?.pages.flatMap((page) => page.data) || [];

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
              backgroundColor: dangerColor,
              borderWidth: 1,
              borderColor: backgroundColor,
            }}
          >
            <Ionicons name="lock-closed" size={10} color={onDanger} />
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
      <MoreActionsButton
        onPress={() => setActionItem(item)}
        accessibilityLabel="收藏夹更多操作"
      />
    </BouncyButton>
  );

  return (
    <View className="flex-1">
      <FlashList
        data={collections}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.id)}
        {...({ estimatedItemSize: 90 } as object)}
        onEndReached={() => {
          if (hasNextPage && !isFetching) void fetchNextPage();
        }}
        onRefresh={isAuthenticated ? () => void refresh() : undefined}
        refreshing={refreshing}
        ListHeaderComponent={() => <View className="h-2.5" />}
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator style={{ margin: 20 }} color={primaryColor} />
          ) : null
        }
        ListEmptyComponent={() => (
          <View className="px-6 py-16 items-center">
            {!isAuthenticated ? (
              <BouncyButton onPress={() => router.push('/login')}>
                <Text type="secondary">登录后查看收藏夹，点此登录</Text>
              </BouncyButton>
            ) : isLoading ? (
              <ActivityIndicator color={primaryColor} />
            ) : isError ? (
              <QueryErrorView
                compact
                message="收藏夹加载失败"
                onRetry={() => void refetch()}
              />
            ) : (
              <Text type="secondary">你还没有收藏夹喵</Text>
            )}
          </View>
        )}
      />

      <BottomSheet
        visible={modalVisible}
        dismissible={!isSaving}
        onClose={() => {
          if (!isSaving) closeModal();
        }}
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
