import { Link, Stack } from 'expo-router';
import { Text, View } from '@/components/Themed';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View className="flex-1 items-center justify-center p-5">
        <Text className="text-xl font-bold">This screen doesn't exist.</Text>
        <Link href="/" className="mt-[15px] py-[15px]">
          <Text className="text-sm" style={{ color: '#2e78b7' }}>
            Go to home screen!
          </Text>
        </Link>
      </View>
    </>
  );
}
