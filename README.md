# Android AES-GCM decryption length

This app compares each plaintext with the bytes returned by the published `expo-crypto@58.0.7` after an AES-GCM encrypt/decrypt round trip. It uses a freshly generated key and three synthetic inputs. The empty and binary cases also check that the result preserves valid trailing zero bytes.

## Run on Android

1. Install Node.js 24, the Android SDK and a supported JDK. Enable USB debugging on an Android 8.1 device and confirm it appears in `adb devices`.
2. In the directory containing `package.json`, run `npm ci`, then `npx expo run:android --variant release --device`. Use the standalone build so its native crypto implementation matches the pinned dependency.
3. Open **AES-GCM round trip** and tap **Run AES-GCM round trips**. The three rows should show 58 in / 58 out, 0 in / 0 out, and 5 in / 5 out. Each comparison should pass.

On the affected Android 8.1 provider, the original native implementation returned an extra 16 zero bytes in a separate on-device probe. Record what this app displays on your device. No account or network access is required to run the three checks after installation.
