import { useRouter } from 'expo-router';
import { Image, Pressable } from 'react-native';
import { Text, View } from './Themed';

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

    return (
        <Pressable
            className="flex-row py-3 px-4 border-b border-border dark:border-border-dark bg-surface dark:bg-surface-dark"
            onPress={() => router.push(`/question/${item.questionId}`)}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
            <View className="w-[30px] items-start pt-0.5 bg-transparent">
                <Text
                    className={`text-lg font-bold ${item.rank <= 3 ? 'text-[#ff9607]' : 'text-tertiary dark:text-tertiary-dark'}`}
                >
                    {item.rank}
                </Text>
            </View>

            <View className="flex-1 flex-row bg-transparent">
                <View className="flex-1 pr-2.5 bg-transparent">
                    <Text className="text-base font-bold leading-[22px] mb-1 text-foreground dark:text-foreground-dark" numberOfLines={2}>
                        {item.title}
                    </Text>
                    <Text className="text-sm leading-5 mb-1 text-secondary dark:text-secondary-dark" numberOfLines={2}>
                        {item.excerpt}
                    </Text>
                    <Text className="text-xs text-tertiary dark:text-tertiary-dark">
                        {item.hotValue}
                    </Text>
                </View>

                {item.image && (
                    <Image source={{ uri: item.image }} className="w-[100px] h-[68px] rounded bg-surface-tertiary dark:bg-surface-tertiary-dark" />
                )}
            </View>
        </Pressable>
    );
};
