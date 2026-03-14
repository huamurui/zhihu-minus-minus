import { Platform, ToastAndroid, Alert } from 'react-native';

export const showToast = (message: string) => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else if (Platform.OS === 'ios') {
    // Basic fallback for iOS if a toast library isn't installed
    Alert.alert('', message);
  } else {
    console.log(message);
  }
};
