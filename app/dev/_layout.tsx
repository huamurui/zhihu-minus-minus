import { Redirect, Stack } from 'expo-router';

export default function DevOnlyLayout() {
  if (!__DEV__) return <Redirect href="/" />;

  return <Stack />;
}
