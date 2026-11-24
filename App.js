import { AESEncryptionKey, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';
import { useState } from 'react';
import { Button, ScrollView, Text, View } from 'react-native';

async function checkRoundTrips() {
  const key = await AESEncryptionKey.generate();
  const json = '{"state":{"accounts":[],"label":"合成🙂"},"version":2}';
  const cases = [
    ['UTF-8 JSON', new TextEncoder().encode(json)],
    ['Empty input', new Uint8Array(0)],
    ['Binary ending in two zeros', Uint8Array.of(1, 2, 3, 0, 0)],
  ];
  const lines = [];
  for (const [label, input] of cases) {
    try {
      const sealed = await aesEncryptAsync(input, key);
      const output = await aesDecryptAsync(sealed, key);
      const equal = input.length === output.length
        && input.every((value, index) => value === output[index]);
      lines.push(`${label}: ${input.length} in, ${output.length} out, ${equal ? 'PASS' : 'FAIL'}`);
    } catch (error) {
      lines.push(`${label}: ${error instanceof Error ? error.message : 'Native call failed'}`);
    }
  }
  return lines.join('\n');
}

export default function App() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState('');

  async function run() {
    setRunning(true);
    setResults('');
    try {
      setResults(await checkRoundTrips());
    } catch (error) {
      setResults(error instanceof Error ? error.message : 'Key generation failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 64 }}>
      <Button disabled={running} title={running ? 'Running…' : 'Run AES-GCM round trips'} onPress={run} />
      <View style={{ marginTop: 16 }}>
        <Text selectable>{results}</Text>
      </View>
    </ScrollView>
  );
}
