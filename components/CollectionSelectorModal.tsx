import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet } from 'react-native';
import {
  addArticleToCollection,
  addToCollection,
  createCollection,
  getAnswerCollectionStatus,
  getArticleCollectionStatus,
  removeArticleFromCollection,
  removeFromCollection,
} from '@/api/zhihu/collection';
import { BouncyButton } from '@/components/BouncyButton';
import { CollectionEditorForm } from '@/components/CollectionEditorForm';
import { BottomSheet } from '@/components/overlays/BottomSheet';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useCollectionStore } from '@/store/useCollectionStore';
import { showToast } from '@/utils/toast';

interface CollectionStatusItem {
  id: string | number;
  title: string;
  description?: string;
  is_public: boolean;
  is_favorited: boolean;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError<{ error?: { message?: string } }>(error)) {
    return fallback;
  }
  return error.response?.data?.error?.message || fallback;
}

export function CollectionSelectorModal() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const primaryColor = useThemeColor({}, 'primary');
  const primaryTransparent = useThemeColor({}, 'primaryTransparent');
  const queryClient = useQueryClient();
  const {
    selectorVisible,
    selectorContentId,
    selectorContentType,
    closeSelector,
    setCollectedStatus,
  } = useCollectionStore();

  const [editorVisible, setEditorVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newIsPublic, setNewIsPublic] = useState(true);

  useEffect(() => {
    if (!selectorVisible) setEditorVisible(false);
  }, [selectorVisible]);

  const {
    data: statusData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: [
      'collection-selector-status',
      selectorContentId,
      selectorContentType,
    ],
    queryFn: async () => {
      if (!selectorContentId || !selectorContentType) return null;
      return selectorContentType === 'answer'
        ? getAnswerCollectionStatus(selectorContentId)
        : getArticleCollectionStatus(selectorContentId);
    },
    enabled: selectorVisible && !!selectorContentId && !!selectorContentType,
  });

  const collections = (statusData?.data || []) as CollectionStatusItem[];

  const toggleMutation = useMutation({
    mutationFn: async ({
      folderId,
      isFavorited,
    }: {
      folderId: string | number;
      isFavorited: boolean;
    }) => {
      if (!selectorContentId || !selectorContentType) return;
      if (selectorContentType === 'answer') {
        return isFavorited
          ? removeFromCollection(folderId, selectorContentId)
          : addToCollection(folderId, selectorContentId);
      }
      return isFavorited
        ? removeArticleFromCollection(folderId, selectorContentId)
        : addArticleToCollection(folderId, selectorContentId);
    },
    onSuccess: () => {
      void refetch().then((updated) => {
        const id = selectorContentId?.toString();
        if (!id) return;
        const wasCollected =
          useCollectionStore.getState().collectedStatusMap[id] || false;
        const hasCollections =
          updated.data?.data?.some(
            (item: CollectionStatusItem) => item.is_favorited,
          ) || false;

        if (wasCollected !== hasCollections) {
          useCollectionStore
            .getState()
            .updateCollectedCountOffset(id, hasCollections ? 1 : -1);
        }
        setCollectedStatus(id, hasCollections);
        void queryClient.invalidateQueries({
          queryKey: ['answer-collection-status', id],
        });
        void queryClient.invalidateQueries({
          queryKey: ['article-collection-status', id],
        });
      });
    },
    onError: (error: unknown) => {
      showToast(getErrorMessage(error, '操作失败'));
    },
  });

  const createMutation = useMutation({
    mutationFn: createCollection,
    onSuccess: () => {
      showToast('新建成功');
      setEditorVisible(false);
      setNewTitle('');
      setNewDescription('');
      setNewIsPublic(true);
      void queryClient.invalidateQueries({ queryKey: ['my-collections'] });
      void refetch();
    },
    onError: (error: unknown) => {
      showToast(getErrorMessage(error, '创建失败'));
    },
  });

  const handleCreate = () => {
    if (!newTitle.trim()) {
      Alert.alert('提示', '请输入标题');
      return;
    }
    createMutation.mutate({
      title: newTitle.trim(),
      description: newDescription.trim(),
      is_public: newIsPublic,
    });
  };

  const handleClose = () => {
    setEditorVisible(false);
    closeSelector();
  };

  const newButton = (
    <BouncyButton
      accessibilityRole="button"
      accessibilityLabel="新建收藏夹"
      onPress={() => setEditorVisible(true)}
      style={[styles.headerButton, { backgroundColor: primaryTransparent }]}
    >
      <Ionicons name="add" size={17} color={primaryColor} />
      <Text style={[styles.headerButtonLabel, { color: primaryColor }]}>
        新建
      </Text>
    </BouncyButton>
  );

  const backButton = (
    <BouncyButton
      className="rounded-full"
      accessibilityRole="button"
      accessibilityLabel="返回收藏夹列表"
      hitSlop={8}
      onPress={() => setEditorVisible(false)}
      style={styles.backButton}
    >
      <Ionicons name="chevron-back" size={24} color={colors.text} />
    </BouncyButton>
  );

  return (
    <BottomSheet
      visible={selectorVisible}
      onClose={handleClose}
      title={editorVisible ? '新建收藏夹' : '收藏至收藏夹'}
      headerLeft={editorVisible ? backButton : undefined}
      headerRight={editorVisible ? undefined : newButton}
      height={editorVisible ? '76%' : '68%'}
      keyboardAvoiding={editorVisible}
    >
      {editorVisible ? (
        <CollectionEditorForm
          title={newTitle}
          description={newDescription}
          isPublic={newIsPublic}
          onTitleChange={setNewTitle}
          onDescriptionChange={setNewDescription}
          onPublicChange={setNewIsPublic}
          onSubmit={handleCreate}
          pending={createMutation.isPending}
        />
      ) : (
        <View style={styles.selectorBody}>
          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={primaryColor} size="small" />
            </View>
          ) : (
            <FlatList
              data={collections}
              keyExtractor={(item) => item.id.toString()}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isPending =
                  toggleMutation.isPending &&
                  toggleMutation.variables?.folderId === item.id;
                return (
                  <BouncyButton
                    className="rounded-xl"
                    accessibilityRole="checkbox"
                    accessibilityLabel={item.title}
                    accessibilityState={{
                      checked: item.is_favorited,
                      disabled: isPending,
                    }}
                    disabled={isPending}
                    onPress={() =>
                      toggleMutation.mutate({
                        folderId: item.id,
                        isFavorited: item.is_favorited,
                      })
                    }
                    style={[
                      styles.collectionRow,
                      { borderBottomColor: colors.divider },
                    ]}
                  >
                    <View
                      style={[
                        styles.folderIcon,
                        { backgroundColor: primaryTransparent },
                      ]}
                    >
                      <Ionicons
                        name={item.is_public ? 'folder' : 'folder-outline'}
                        size={22}
                        color={
                          item.is_favorited
                            ? primaryColor
                            : colors.textSecondary
                        }
                      />
                    </View>
                    <View style={styles.collectionCopy}>
                      <Text style={styles.collectionTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      {item.description ? (
                        <Text
                          type="secondary"
                          style={styles.collectionDescription}
                          numberOfLines={1}
                        >
                          {item.description}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.statusIcon}>
                      {isPending ? (
                        <ActivityIndicator size="small" color={primaryColor} />
                      ) : (
                        <Ionicons
                          name={
                            item.is_favorited
                              ? 'checkmark-circle'
                              : 'ellipse-outline'
                          }
                          size={23}
                          color={
                            item.is_favorited
                              ? primaryColor
                              : colors.textTertiary
                          }
                        />
                      )}
                    </View>
                  </BouncyButton>
                );
              }}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text type="secondary">暂无收藏夹喵</Text>
                </View>
              }
            />
          )}

          <BouncyButton
            accessibilityRole="button"
            accessibilityLabel="完成选择收藏夹"
            onPress={handleClose}
            style={[styles.doneButton, { backgroundColor: primaryColor }]}
          >
            <Text style={styles.doneLabel}>完成</Text>
          </BouncyButton>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButtonLabel: {
    marginLeft: 2,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  backButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
  },
  selectorBody: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 20,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    flex: 1,
  },
  collectionRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  folderIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  collectionCopy: {
    flex: 1,
  },
  collectionTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
  collectionDescription: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
  },
  statusIcon: {
    width: 36,
    alignItems: 'flex-end',
  },
  empty: {
    paddingVertical: 72,
    alignItems: 'center',
  },
  doneButton: {
    minHeight: 52,
    marginTop: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneLabel: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
});
