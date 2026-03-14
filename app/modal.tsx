import { StatusBar } from 'expo-status-bar';
import { Text, View } from '@/components/Themed';

export default function ModalScreen() {
  return (
    <View className="flex-1 items-center justify-center">
      <Text className="text-xl font-bold">Modal</Text>
      <View type="border" className="my-[30px] h-[1px] w-4/5" />
      <StatusBar style="auto" />
    </View>
  );
}
