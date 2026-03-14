import { createCollection, deleteCollection, getMyCollections, updateCollection } from '@/api/zhihu';
import { Text, View } from '@/components/Themed';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, TextInput } from 'react-native';
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
            )
        });
    }, [navigation]);

    const {
        data,
        isLoading,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        refetch,
        isRefetching
    } = useInfiniteQuery({
        queryKey: ['my-collections'],
        queryFn: ({ pageParam = 0 }) => getMyCollections(20, pageParam as number),
        initialPageParam: 0,
        getNextPageParam: (lastPage) => {
            if (!lastPage || lastPage.paging?.is_end) return undefined;
            const nextUrl = lastPage.paging?.next;
            const match = nextUrl?.match(/offset=(\d+)/);
            return match ? parseInt(match[1]) : undefined;
        }
    });

    const createMutation = useMutation({
        mutationFn: createCollection,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['my-collections'] });
            closeModal();
        }
    });

    const updateMutation = useMutation({
        mutationFn: (vars: any) => updateCollection(vars.id, vars.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['my-collections'] });
            closeModal();
        }
    });

    const deleteMutation = useMutation({
        mutationFn: deleteCollection,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['my-collections'] });
        }
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
        if (editingItem) {
            updateMutation.mutate({ id: editingItem.id, data });
        } else {
            createMutation.mutate(data);
        }
    };

    const handleDelete = (item: any) => {
        Alert.alert('确认删除', `确定要删除“${item.title}”吗喵？内部的内容也会一并移出。`, [
            { text: '取消', style: 'cancel' },
            { text: '确定删除', style: 'destructive', onPress: () => deleteMutation.mutate(item.id) }
        ]);
    };

    const collections = data?.pages.flatMap(page => page.data) || [];

    const renderItem = ({ item }: { item: any }) => {
        return (
            <Pressable
                style={({ pressed }) => [styles.card, { borderBottomColor: borderColor }, pressed && { opacity: 0.7 }]}
                onPress={() => router.push(`/collections/${item.id}`)}
                onLongPress={() => {
                    Alert.alert(item.title, '选择操作', [
                        { text: '编辑', onPress: () => openModal(item) },
                        { text: '删除', style: 'destructive', onPress: () => handleDelete(item) },
                        { text: '取消', style: 'cancel' }
                    ]);
                }}
            >
                <View style={styles.iconBox}>
                    <Ionicons name={item.is_public ? "folder" : "folder-outline"} size={24} color={primaryColor} />
                    {!item.is_public && (
                        <View style={styles.lockBadge}>
                            <Ionicons name="lock-closed" size={10} color="#fff" />
                        </View>
                    )}
                </View>
                <View style={styles.content}>
                    <Text style={styles.title}>{item.title}</Text>
                    {item.description ? (
                        <Text type="secondary" numberOfLines={1} style={styles.desc}>{item.description}</Text>
                    ) : null}
                    <Text type="secondary" style={styles.meta}>
                        {item.answer_count || 0} 内容 · {item.follower_count || 0} 关注
                    </Text>
                </View>
                <Pressable onPress={() => openModal(item)} style={styles.moreBtn}>
                    <Ionicons name="ellipsis-horizontal" size={18} color="#ccc" />
                </Pressable>
            </Pressable>
        );
    };

    return (
        <View style={styles.container}>
            <FlashList
                data={collections}
                renderItem={renderItem}
                {...({ estimatedItemSize: 90 } as any)}
                onEndReached={() => {
                    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
                }}
                onRefresh={refetch}
                refreshing={isRefetching}
                ListHeaderComponent={() => (
                    <View style={{ height: 10 }} />
                )}
                ListEmptyComponent={() => (
                    <View style={styles.empty}>
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
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: surfaceColor }]}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{editingItem ? '编辑收藏夹' : '新建收藏夹'}</Text>
                            <Pressable onPress={closeModal}>
                                <Ionicons name="close" size={24} color="#999" />
                            </Pressable>
                        </View>

                        <ScrollView style={styles.form}>
                            <Text style={styles.label}>标题</Text>
                            <TextInput
                                style={[styles.input, { borderColor, color: tintColor }]}
                                value={title}
                                onChangeText={setTitle}
                                placeholder="输入标题"
                                placeholderTextColor="#999"
                            />

                            <Text style={styles.label}>描述 (可选)</Text>
                            <TextInput
                                style={[styles.input, styles.textArea, { borderColor, color: tintColor }]}
                                value={description}
                                onChangeText={setDescription}
                                placeholder="输入描述"
                                placeholderTextColor="#999"
                                multiline
                                numberOfLines={3}
                            />

                            <View style={styles.switchRow}>
                                <View>
                                    <Text style={styles.label}>公开收藏夹</Text>
                                    <Text type="secondary" style={{ fontSize: 12 }}>公开后其他用户可见</Text>
                                </View>
                                <Switch
                                    value={isPublic}
                                    onValueChange={setIsPublic}
                                    trackColor={{ false: "#ddd", true: primaryColor }}
                                />
                            </View>
                        </ScrollView>

                        <Pressable
                            style={[styles.saveBtn, { backgroundColor: primaryColor }]}
                            onPress={handleSave}
                            disabled={createMutation.isPending || updateMutation.isPending}
                        >
                            {(createMutation.isPending || updateMutation.isPending) ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.saveBtnText}>完成</Text>
                            )}
                        </Pressable>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    card: {
        flexDirection: 'row',
        padding: 15,
        alignItems: 'center',
        borderBottomWidth: StyleSheet.hairlineWidth
    },
    iconBox: {
        width: 48,
        height: 48,
        borderRadius: 8,
        backgroundColor: 'rgba(0,132,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative'
    },
    lockBadge: {
        position: 'absolute',
        right: -2,
        bottom: -2,
        backgroundColor: '#ff4d4f',
        borderRadius: 6,
        padding: 2,
        borderWidth: 1,
        borderColor: '#fff'
    },
    content: { marginLeft: 15, flex: 1 },
    title: { fontSize: 16, fontWeight: 'bold' },
    desc: { fontSize: 13, marginTop: 2 },
    meta: { fontSize: 12, marginTop: 4, opacity: 0.6 },
    moreBtn: { padding: 10 },
    empty: { flex: 1, padding: 100, alignItems: 'center' },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end'
    },
    modalContent: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
        height: '70%'
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20
    },
    modalTitle: { fontSize: 18, fontWeight: 'bold' },
    form: { flex: 1 },
    label: { fontSize: 15, fontWeight: '600', marginBottom: 8, marginTop: 15 },
    input: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
    },
    textArea: {
        height: 80,
        textAlignVertical: 'top'
    },
    switchRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 20,
        marginBottom: 30
    },
    saveBtn: {
        height: 50,
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 10,
        marginBottom: 20
    },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
