import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
    Linking,
    Pressable,
    ScrollView,
    StyleSheet,
} from 'react-native';

import { Text, View, useThemeColor } from '@/components/Themed';

export default function FeedbackScreen() {
    const router = useRouter();

    const accentColor = useThemeColor({}, 'tint');
    const borderColor = useThemeColor({}, 'border');
    const surfaceColor = useThemeColor({ light: '#fff', dark: '#1c1c1e' }, 'background');
    const textColor = useThemeColor({}, 'text');

    return (
        <View style={styles.container}>
            {/* 顶部标题栏 */}
            <View type="surface" style={[styles.header, { borderBottomColor: borderColor }]}>
                <Pressable onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={24} color={accentColor} />
                </Pressable>
                <Text style={styles.title}>反馈与建议</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.content}>
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>找到我们</Text>
                    <Text style={[styles.description, { color: textColor, opacity: 0.7 }]}>
                        「知乎--」是一个开源项目。如果您在使用过程中遇到任何问题，或者有好的功能建议，欢迎通过以下方式反馈给我。
                    </Text>

                    <View style={[styles.infoCard, { backgroundColor: surfaceColor, borderColor: borderColor }]}>
                        <Pressable
                            style={styles.infoRow}
                            onPress={() => Linking.openURL('https://github.com/huamurui/zhihu-minus-minus')}
                        >
                            <View style={[styles.iconBoxSmall, { backgroundColor: accentColor + '15' }]}>
                                <Ionicons name="logo-github" size={18} color={accentColor} />
                            </View>
                            <View style={styles.infoRight}>
                                <Text style={styles.infoLabel}>项目地址 (推荐提交 Issue)</Text>
                                <Text style={styles.infoValue}>huamurui/zhihu-minus-minus</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color="#ccc" />
                        </Pressable>

                        <View style={[styles.divider, { backgroundColor: borderColor }]} />

                        <Pressable
                            style={styles.infoRow}
                            onPress={() => Linking.openURL('mailto:huamurui@outlook.com')}
                        >
                            <View style={[styles.iconBoxSmall, { backgroundColor: accentColor + '15' }]}>
                                <Ionicons name="mail-outline" size={18} color={accentColor} />
                            </View>
                            <View style={styles.infoRight}>
                                <Text style={styles.infoLabel}>邮箱</Text>
                                <Text style={styles.infoValue}>huamurui@outlook.com</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color="#ccc" />
                        </Pressable>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        height: 60,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 15,
        borderBottomWidth: StyleSheet.hairlineWidth,
        paddingTop: 10,
    },
    backBtn: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: -10,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    content: {
        flex: 1,
        padding: 16,
    },
    section: {
        marginTop: 10,
        backgroundColor: 'transparent',
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    description: {
        fontSize: 14,
        lineHeight: 22,
        marginBottom: 20,
    },
    infoCard: {
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    iconBoxSmall: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    infoRight: {
        flex: 1,
        marginLeft: 12,
    },
    infoLabel: {
        fontSize: 12,
        opacity: 0.6,
        marginBottom: 2,
    },
    infoValue: {
        fontSize: 14,
        fontWeight: '500',
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        marginHorizontal: 16,
    },
});
