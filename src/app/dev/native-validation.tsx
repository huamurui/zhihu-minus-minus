import * as Clipboard from 'expo-clipboard';
import {
  AESEncryptionKey,
  aesDecryptAsync,
  aesEncryptAsync,
} from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { Stack } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useRuntimeThemeColors } from '@/components/Themed';
import {
  ZhihuNativeContent,
  type ZhihuNativeContentSelection,
} from '@/features/rich-content';
import katexRuntime from '@/features/rich-content/assets/katex-runtime.json';
import katexStyle from '@/features/rich-content/assets/katex-style.json';
import {
  inspectApk,
  readAtomically,
  writeAtomically,
} from '@/modules/zhihu-persistence';
import { createAuthSealedDataFromBase64 } from '@/storage/authEncryption';
import { createEncryptedAuthStorage } from '@/storage/encryptedAuthStorage';

// This developer-only route uses isolated synthetic files and an ephemeral key.
const prefix = `${FileSystem.documentDirectory}native-validation-`;
const resultPath = `${prefix}result.json`;
const keyName = 'zhihu_native_validation_temporary_key';
const startedAt = Date.now();
let saveResult: Promise<void> = Promise.resolve();
const results: Record<string, boolean> = {};
const syntheticParagraphs = Array.from(
  { length: 60 },
  (_, index) =>
    `合成长文第 ${index + 1} 段：emoji 🙂，组合音标 é；用于布局和滚动检查。`,
);
const syntheticContent = syntheticParagraphs
  .map((paragraph) => `<p>${paragraph}</p>`)
  .join('');
const copySentinel = 'native-validation-copy-sentinel';
let storageValidation: Promise<void> | undefined;
function recordResult(name: string, passed: boolean) {
  if (results[name] === passed) return saveResult;
  results[name] = passed;
  saveResult = saveResult
    .catch(() => undefined)
    .then(() =>
      writeAtomically(
        resultPath,
        JSON.stringify({ startedAt, checks: results }),
      ),
    );
  return saveResult;
}
const offlineHtml = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${katexStyle.css}</style><div id="inline"></div><div id="block"></div><script>${katexRuntime.script.replace(/<\/script/gi, '<\\/script')}</script><script>
try {
  katex.render('a^2+b^2=c^2', document.getElementById('inline'));
  katex.render('\\\\frac{a^2}{b}+\\\\sqrt{x}', document.getElementById('block'), {displayMode:true});
  document.fonts.ready.then(function () {
    window.ReactNativeWebView.postMessage(JSON.stringify({math:document.querySelectorAll('.katex').length===2,fonts:document.fonts.check('16px KaTeX_Main')}));
  });
} catch (_) { window.ReactNativeWebView.postMessage(JSON.stringify({math:false,fonts:false})); }
</script>`;

async function runStorageValidation() {
  const ownedFiles = [
    'missing.json',
    'atomic.json',
    'primary.json',
    'backup.json',
    'package.bin',
  ];
  try {
    const key = await AESEncryptionKey.generate();
    const encoded = await key.encoded('base64');
    await SecureStore.setItemAsync(keyName, encoded, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    const restored = await SecureStore.getItemAsync(keyName);
    await recordResult('secureStoreKey', restored === encoded);
    const imported = await AESEncryptionKey.import(restored ?? '', 'base64');
    const aad = new TextEncoder().encode('zhihu-auth-file:v1');
    const encrypt = async (value: string) =>
      (
        await aesEncryptAsync(new TextEncoder().encode(value), imported, {
          additionalData: aad,
        })
      ).combined('base64');
    const decrypt = async (value: string) =>
      new TextDecoder('utf-8', { fatal: true }).decode(
        await aesDecryptAsync(createAuthSealedDataFromBase64(value), imported, {
          additionalData: aad,
        }),
      );
    const unicode = '合成账号 🙂 é\u0000';
    await recordResult(
      'aesUnicodeRoundTrip',
      (await decrypt(await encrypt(unicode))) === unicode,
    );
    let rejectsTampering = false;
    const cipher = await encrypt(unicode);
    try {
      await decrypt(`${cipher[0] === 'A' ? 'B' : 'A'}${cipher.slice(1)}`);
    } catch {
      rejectsTampering = true;
    }
    await recordResult('aesRejectsTampering', rejectsTampering);
    const atomicPath = `${prefix}atomic.json`;
    await writeAtomically(atomicPath, 'first');
    await writeAtomically(atomicPath, 'second');
    await recordResult(
      'atomicReplacement',
      (await readAtomically(atomicPath)) === 'second',
    );
    await FileSystem.deleteAsync(`${prefix}missing.json`, { idempotent: true });
    await recordResult(
      'missingFileIsNull',
      (await readAtomically(`${prefix}missing.json`)) === null,
    );
    let rejectsPath = false;
    try {
      await writeAtomically('file:///tmp/not-an-app-document', 'synthetic');
    } catch {
      rejectsPath = true;
    }
    await recordResult('rejectsExternalWrite', rejectsPath);
    const initial = JSON.stringify({
      version: 2,
      state: {
        accounts: [{ cookies: 'z_c0=synthetic-only', me: { id: 'synthetic' } }],
        activeAccountIndex: 0,
        cookies: 'z_c0=synthetic-only',
        me: { id: 'synthetic' },
      },
    });
    const operations = {
      read: (slot: 'primary' | 'backup') =>
        readAtomically(`${prefix}${slot}.json`),
      writeAtomically: (slot: 'primary' | 'backup', value: string) =>
        writeAtomically(`${prefix}${slot}.json`, value),
      encrypt,
      decrypt,
      onPresence: () => {},
      onFailure: () => {},
    };
    await writeAtomically(`${prefix}primary.json`, initial);
    const storage = createEncryptedAuthStorage(operations);
    await recordResult(
      'legacyMigration',
      (await storage.getItem()) === initial &&
        !(await readAtomically(`${prefix}primary.json`))?.includes(
          'synthetic-only',
        ),
    );
    // Exercise a new save (including its read-back check) and a cold restore.
    await storage.setItem(initial);
    await recordResult(
      'persistedAccountRoundTrip',
      (await createEncryptedAuthStorage(operations).getItem()) === initial,
    );
    await writeAtomically(`${prefix}primary.json`, '{truncated');
    await recordResult(
      'backupRecovery',
      (await createEncryptedAuthStorage(operations).getItem()) === initial,
    );
    await storage.removeItem();
    await writeAtomically(`${prefix}primary.json`, '{truncated');
    const empty = await createEncryptedAuthStorage(operations).getItem();
    await recordResult(
      'logoutStaysCleared',
      JSON.parse(empty ?? '{}').state?.cookies === null,
    );
    const packagePath = `${prefix}package.bin`;
    await FileSystem.writeAsStringAsync(packagePath, 'UEsDBHN5bnRoZXRpYw==', {
      encoding: FileSystem.EncodingType.Base64,
    });
    const inspection = await inspectApk(packagePath);
    // SHA-256 of the 13 synthetic bytes: ZIP magic + "synthetic".
    await recordResult(
      'nativeStreamingHash',
      inspection.size === 13 &&
        inspection.isZip &&
        inspection.sha256 ===
          '0ea0879b8c5070c96040559630c36793d16e578becbd651ad5712218a6382e9b',
    );
    await recordResult('storageValidationComplete', true);
  } catch {
    await recordResult('storageValidationComplete', false);
  } finally {
    try {
      await SecureStore.deleteItemAsync(keyName);
    } catch {
      await recordResult('temporaryKeyCleanup', false);
    }
    await Promise.allSettled(
      ownedFiles.map((name) =>
        FileSystem.deleteAsync(`${prefix}${name}`, { idempotent: true }),
      ),
    );
  }
}

export default function NativeValidationScreen() {
  const palette = useRuntimeThemeColors();
  const [finished, setFinished] = useState(false);
  const [selection, setSelection] = useState({
    start: -1,
    end: -1,
    valid: false,
    changes: 0,
  });
  const [copyResult, setCopyResult] = useState('waiting');
  const copyArmed = useRef(false);
  useEffect(() => {
    let mounted = true;
    storageValidation ??= runStorageValidation();
    void storageValidation.finally(() => {
      if (mounted) setFinished(true);
    });
    return () => {
      mounted = false;
    };
  }, []);
  const onNativeReady = useCallback(() => {
    void recordResult('nativeTextLayoutReady', true);
  }, []);
  const onSelection = useCallback((next: ZhihuNativeContentSelection) => {
    const valid = next.start >= 0 && next.end > next.start && !!next.mapping;
    setSelection((previous) => ({
      start: next.start,
      end: next.end,
      valid,
      changes:
        previous.changes +
        Number(previous.start !== next.start || previous.end !== next.end),
    }));
    if (valid) void recordResult('nativeSelectionValid', true);
  }, []);
  const armCopy = async () => {
    copyArmed.current = false;
    try {
      await Clipboard.setStringAsync(copySentinel);
      copyArmed.current = true;
      setCopyResult('armed');
    } catch {
      setCopyResult('false');
    }
  };
  const checkCopy = async () => {
    // Only read after replacing any pre-existing clipboard with a sentinel.
    if (!copyArmed.current) return;
    try {
      const value = await Clipboard.getStringAsync();
      const normalized = value.replace(/\s+/g, ' ').trim();
      const passed =
        normalized.length > 0 &&
        normalized !== copySentinel &&
        syntheticParagraphs.join(' ').includes(normalized);
      setCopyResult(String(passed));
      await recordResult('nativeSystemCopy', passed);
    } catch {
      setCopyResult('false');
      await recordResult('nativeSystemCopy', false);
    }
  };
  return (
    <ScrollView
      testID="native-validation-scroll"
      style={{ backgroundColor: palette.background }}
    >
      <Stack.Screen options={{ title: '合成原生验证' }} />
      <Text testID="native-validation-marker" style={{ color: palette.text }}>
        synthetic-only
      </Text>
      <Text style={{ color: palette.text }}>
        {finished
          ? '存储验证已结束，结果仅含布尔值。'
          : '正在验证加密、原子文件和恢复。'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <Pressable testID="native-validation-copy-arm" onPress={armCopy}>
          <Text style={{ color: palette.link }}>准备合成复制</Text>
        </Pressable>
        <Pressable testID="native-validation-copy-check" onPress={checkCopy}>
          <Text style={{ color: palette.link }}>验证合成复制</Text>
        </Pressable>
      </View>
      <Text
        testID="native-validation-copy-result"
        style={{ color: palette.text }}
      >
        {copyResult}
      </Text>
      <Text
        testID="native-validation-selection"
        style={{ color: palette.text }}
      >
        {JSON.stringify(selection)}
      </Text>
      <Text className="text-link">运行时主题和离线公式</Text>
      <View style={{ height: 160 }}>
        <WebView
          source={{ html: offlineHtml, baseUrl: 'about:blank' }}
          originWhitelist={['about:*']}
          onShouldStartLoadWithRequest={(request) =>
            request.url === 'about:blank' || request.url.startsWith('data:')
          }
          onMessage={(event) => {
            try {
              const data: unknown = JSON.parse(event.nativeEvent.data);
              if (
                typeof data === 'object' &&
                data !== null &&
                'math' in data &&
                'fonts' in data
              ) {
                void recordResult('offlineFormulaRendered', data.math === true);
                void recordResult(
                  'offlineFormulaFontsLoaded',
                  data.fonts === true,
                );
              }
            } catch {
              void recordResult('offlineFormulaRendered', false);
            }
          }}
        />
      </View>
      <View testID="native-validation-body" accessible={false}>
        <ZhihuNativeContent
          objectId="synthetic-native-validation"
          type="answer"
          onLayoutReady={onNativeReady}
          onSelectionChange={onSelection}
          content={syntheticContent}
          renderFallback={() => <Text>原生模块不可用</Text>}
        />
      </View>
    </ScrollView>
  );
}
