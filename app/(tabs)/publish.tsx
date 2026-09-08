import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, ThemedIcon, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

const PUBLISH_OPTIONS = [
  {
    id: 'answer',
    title: '写回答',
    subtitle: '分享你的见解',
    icon: 'create-outline',
    colorType: 'primary',
  },
  {
    id: 'article',
    title: '写文章',
    subtitle: '记录生活点滴',
    icon: 'document-text-outline',
    colorType: 'warning',
  },
  {
    id: 'pin',
    title: '发想法',
    subtitle: '随时捕捉灵感',
    icon: 'bulb-outline',
    colorType: 'success',
  },
  {
    id: 'question',
    title: '提问题',
    subtitle: '向世界发问',
    icon: 'help-circle-outline',
    colorType: 'danger',
  },
] as const;

const PUBLISH_ROUTES = {
  answer: '/publish/answer',
  article: '/publish/article',
  pin: '/publish/pin',
  question: '/publish/question',
} as const;

export default function PublishView() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const _secondaryColor = Colors[colorScheme].textSecondary;

  const colors = {
    primary: useThemeColor({}, 'primary'),
    warning: useThemeColor({}, 'warning'),
    success: useThemeColor({}, 'success'),
    danger: useThemeColor({}, 'danger'),
  };

  const handlePublish = (id: keyof typeof PUBLISH_ROUTES) => {
    router.push(PUBLISH_ROUTES[id]);
  };

  return (
    <View className="flex-1 px-6">
      <View
        className="mb-10 items-center"
        style={{ paddingTop: insets.top + 60 }}
      >
        <Text className="text-[28px] font-extrabold mb-2 text-foreground dark:text-foreground-dark">
          发布内容
        </Text>
        <Text type="secondary" className="text-base opacity-70">
          让世界看到你的思考
        </Text>
      </View>

      <View className="w-full bg-transparent">
        {PUBLISH_OPTIONS.map((item) => (
          <BouncyButton
            key={item.id}
            className="flex-row items-center p-5 rounded-[20px] mb-4 border bg-surface dark:bg-surface-dark"
            style={[{ borderColor: Colors[colorScheme].border }]}
            onPress={() => handlePublish(item.id)}
          >
            <View
              className="w-14 h-14 rounded-2xl justify-center items-center mr-4"
              style={{ backgroundColor: `${colors[item.colorType]}15` }}
            >
              <ThemedIcon
                name={item.icon}
                size={32}
                colorType={item.colorType}
              />
            </View>
            <View className="flex-1 bg-transparent">
              <Text className="text-lg font-bold mb-1 text-foreground dark:text-foreground-dark">
                {item.title}
              </Text>
              <Text className="text-[13px] opacity-60 text-foreground dark:text-foreground-dark">
                {item.subtitle}
              </Text>
            </View>
            <View className="ml-2 bg-transparent">
              <ThemedIcon
                name="chevron-forward"
                size={18}
                colorType="secondary"
              />
            </View>
          </BouncyButton>
        ))}
      </View>
    </View>
  );
}
