import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet } from 'react-native';
import { Text, useThemeColor, View } from './Themed';

export interface HotItem {
    id: string;
    questionId: string;
    title: string;
    excerpt: string;
    image: string | null;
    hotValue: string;
    rank: number;
}

export const HotCard = ({ item }: { item: HotItem }) => {
    const router = useRouter();

    const theme = useThemeColor({}, 'backgroundSecondary');
    return (
        <Pressable

            onPress={() => router.push(`/question/${item.questionId}`)}
            style={({ pressed }) => [
                styles.card,
                { backgroundColor: theme },
                { opacity: pressed ? 0.7 : 1 }
            ]}
        >
            <View style={styles.rankContainer}>
                <Text style={[
                    styles.rankText,
                    item.rank <= 3 ? styles.topRank : styles.normalRank
                ]}>
                    {item.rank}
                </Text>
            </View>

            <View style={styles.contentContainer}>
                <View style={styles.textColumn}>
                    <Text style={styles.title} numberOfLines={2}>
                        {item.title}
                    </Text>
                    <Text type="secondary" style={styles.excerpt} numberOfLines={2}>
                        {item.excerpt}
                    </Text>
                    <Text type="secondary" style={styles.hotValue}>
                        {item.hotValue}
                    </Text>
                </View>

                {item.image && (
                    <Image source={{ uri: item.image }} style={styles.image} />
                )}
            </View>
        </Pressable>
    );
};

const styles = StyleSheet.create({
    card: {
        paddingVertical: 12,
        paddingHorizontal: 15,
        flexDirection: 'row',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: useThemeColor({}, 'border'),
        backgroundColor: 'transparent',
    },
    rankContainer: {
        width: 30,
        alignItems: 'flex-start',
        paddingTop: 2,
    },
    rankText: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    topRank: {
        color: '#ff9607',
    },
    normalRank: {
        color: '#999',
    },
    contentContainer: {
        flex: 1,
        flexDirection: 'row',
    },
    textColumn: {
        flex: 1,
        paddingRight: 10,
    },
    title: {
        fontSize: 16,
        fontWeight: 'bold',
        lineHeight: 22,
        marginBottom: 4,
    },
    excerpt: {
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 4,
    },
    hotValue: {
        fontSize: 12,
        color: '#999',
    },
    image: {
        width: 100,
        height: 68,
        borderRadius: 4,
        backgroundColor: '#f5f5f5',
    },
});
