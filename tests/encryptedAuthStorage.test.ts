import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AESSealedData, aesDecryptAsync } from 'expo-crypto';
import {
  createAuthSealedDataFromBase64,
  decryptAuthState,
} from '../src/storage/authEncryption';
import { createEncryptedAuthStorage } from '../src/storage/encryptedAuthStorage';

jest.mock('expo-crypto', () => ({
  AESEncryptionKey: { import: jest.fn(async () => ({})) },
  AESSealedData: {
    fromCombined: jest.fn((combined: unknown) => {
      if (!(combined instanceof Uint8Array) || combined.length < 28) {
        throw new Error('synthetic Android ByteArray boundary');
      }
      return { combined };
    }),
  },
  aesDecryptAsync: jest.fn(),
}));
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'synthetic-key-policy',
  getItemAsync: jest.fn(async () => Buffer.alloc(32, 7).toString('base64')),
}));

// Only synthetic credentials and an ephemeral test key are used here.
const snapshot = (cookie: string | null, version = 2) =>
  JSON.stringify({
    state: {
      accounts: cookie
        ? [{ cookies: cookie, me: { id: 'synthetic-member' } }]
        : [],
      activeAccountIndex: cookie ? 0 : -1,
      cookies: cookie,
      me: cookie ? { id: 'synthetic-member' } : null,
    },
    version,
  });
const A = snapshot('z_c0=synthetic-a');
const B = snapshot('z_c0=synthetic-b');
const EMPTY = snapshot(null);

test('production decryption preserves saved AES-GCM bytes across the Android boundary', async () => {
  const key = Buffer.alloc(32, 7);
  const iv = Buffer.from(Array.from({ length: 12 }, (_, index) => index));
  const plaintext = '合成账号 🙂 é';
  const aad = Buffer.from('zhihu-auth-file:v1');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const combined = Buffer.concat([
    iv,
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const encoded = combined.toString('base64');
  const nativeBoundary = jest.mocked(AESSealedData.fromCombined);
  // Model the installed Android native signature, despite the JS string type.
  expect(() => AESSealedData.fromCombined(encoded)).toThrow('ByteArray');
  nativeBoundary.mockClear();
  jest
    .mocked(aesDecryptAsync)
    .mockResolvedValue(new Uint8Array(Buffer.from(plaintext)));

  await expect(decryptAuthState(encoded)).resolves.toBe(plaintext);
  expect(nativeBoundary).toHaveBeenCalledWith(new Uint8Array(combined));
  expect(aesDecryptAsync).toHaveBeenCalledWith(
    { combined: new Uint8Array(combined) },
    {},
    { additionalData: new Uint8Array(aad) },
  );
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    combined.subarray(0, 12),
  );
  decipher.setAAD(aad);
  decipher.setAuthTag(combined.subarray(-16));
  expect(
    Buffer.concat([
      decipher.update(combined.subarray(12, -16)),
      decipher.final(),
    ]).toString('utf8'),
  ).toBe(plaintext);
});

test('malformed combined encoding fails with a fixed message before decryption', () => {
  const nativeBoundary = jest.mocked(AESSealedData.fromCombined);
  nativeBoundary.mockClear();
  jest.mocked(aesDecryptAsync).mockClear();
  expect(() => createAuthSealedDataFromBase64('%synthetic-invalid%')).toThrow(
    '账号密文格式无效',
  );
  expect(nativeBoundary).not.toHaveBeenCalled();
  // Valid base64 can still encode an incomplete IV/tag layout.
  expect(() => createAuthSealedDataFromBase64('AA==')).toThrow(
    '账号密文格式无效',
  );
  expect(aesDecryptAsync).not.toHaveBeenCalled();
});

function harness(initial: Partial<Record<'primary' | 'backup', string>> = {}) {
  const files = new Map<'primary' | 'backup', string>(
    Object.entries(initial) as ['primary' | 'backup', string][],
  );
  const key = randomBytes(32);
  const encryption = {
    encrypt: jest.fn(async (value: string) => {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const bytes = Buffer.concat([
        iv,
        cipher.update(value, 'utf8'),
        cipher.final(),
        cipher.getAuthTag(),
      ]);
      return bytes.toString('base64');
    }),
    decrypt: jest.fn(async (value: string) => {
      const bytes = Buffer.from(value, 'base64');
      const cipher = createDecipheriv(
        'aes-256-gcm',
        key,
        bytes.subarray(0, 12),
      );
      cipher.setAuthTag(bytes.subarray(-16));
      return Buffer.concat([
        cipher.update(bytes.subarray(12, -16)),
        cipher.final(),
      ]).toString('utf8');
    }),
  };
  const operations = {
    ...encryption,
    read: jest.fn(
      async (slot: 'primary' | 'backup') => files.get(slot) ?? null,
    ),
    writeAtomically: jest.fn(
      async (slot: 'primary' | 'backup', value: string) => {
        files.set(slot, value);
      },
    ),
    onPresence: jest.fn(),
    onFailure: jest.fn(),
  };
  return {
    files,
    operations,
    storage: createEncryptedAuthStorage(operations),
    reopen: () => createEncryptedAuthStorage(operations),
  };
}

test.each([0, 1, 2])(
  'migrates a valid legacy v%s snapshot without losing accounts',
  async (version) => {
    const legacy = snapshot('z_c0=synthetic-a', version);
    const h = harness({ primary: legacy });
    expect(await h.storage.getItem()).toBe(legacy);
    expect(h.files.get('primary')).not.toContain('synthetic-a');
    expect(h.files.get('backup')).toBe(h.files.get('primary'));
    expect(await h.reopen().getItem()).toBe(legacy);
  },
);

test('recovers a corrupted primary from the current encrypted backup', async () => {
  const h = harness({ primary: A });
  await h.storage.getItem();
  await h.storage.setItem(B);
  h.files.set('primary', '{truncated');
  expect(await h.reopen().getItem()).toBe(B);
  expect(h.files.get('primary')).toBe(h.files.get('backup'));
});

test('a successfully cleared session cannot resurrect from an older backup', async () => {
  const h = harness({ primary: A });
  await h.storage.getItem();
  await h.storage.removeItem();
  h.files.set('primary', '{corrupt');
  expect(JSON.parse((await h.reopen().getItem()) ?? '')).toEqual(
    JSON.parse(EMPTY),
  );
});

test('does not overwrite unreadable encrypted files or import a legacy native session', async () => {
  const h = harness({ primary: A });
  await h.storage.getItem();
  const saved = h.files.get('primary');
  h.operations.decrypt.mockRejectedValue(
    new Error('synthetic unavailable key'),
  );
  const storage = h.reopen();
  await expect(storage.getItem()).rejects.toThrow('无法读取');
  await expect(storage.setItem(B)).rejects.toThrow('未覆盖');
  expect(h.files.get('primary')).toBe(saved);
  expect(h.operations.onPresence).toHaveBeenLastCalledWith(true);
});

test('keeps a legacy snapshot readable and intact when migration cannot encrypt', async () => {
  const h = harness({ primary: A });
  h.operations.encrypt.mockRejectedValue(
    new Error('synthetic keystore failure'),
  );
  expect(await h.storage.getItem()).toBe(A);
  expect(h.files.get('primary')).toBe(A);
  await expect(h.storage.setItem(B)).rejects.toThrow('未覆盖');
  h.operations.encrypt.mockRestore();
});

test('interruption before primary replacement leaves the old primary usable', async () => {
  const h = harness({ primary: A });
  await h.storage.getItem();
  const write = h.operations.writeAtomically.getMockImplementation();
  h.operations.writeAtomically.mockImplementation(async (slot, value) => {
    if (slot === 'primary') throw new Error('synthetic interruption');
    await write?.(slot, value);
  });
  await expect(h.storage.setItem(B)).rejects.toThrow('保存登录');
  h.operations.writeAtomically.mockImplementation(write ?? (async () => {}));
  expect(await h.reopen().getItem()).toBe(A);
});

test('preserves an Android 8 save rejected by padded decryption and recovers it after the cipher fix', async () => {
  const h = harness();
  expect(await h.storage.getItem()).toBeNull();
  expect(h.storage.hasReadableSnapshot()).toBe(true);
  const decrypt = h.operations.decrypt.getMockImplementation();
  if (!decrypt) throw new Error('Synthetic decryption implementation missing');
  // Model the old native bridge returning its entire allocation, including the
  // unwritten 16-byte GCM tag allowance, after successful authentication.
  h.operations.decrypt.mockImplementation(
    async (value) => `${await decrypt(value)}${'\u0000'.repeat(16)}`,
  );

  await expect(h.storage.setItem(A)).rejects.toThrow('保存登录状态失败');
  const saved = new Map(h.files);
  expect(saved.get('primary')).toBeDefined();
  expect(saved.get('primary')).not.toContain('synthetic-a');
  expect(saved.get('backup')).toBe(saved.get('primary'));
  expect(h.operations.onFailure).toHaveBeenLastCalledWith(true);

  const restarted = h.reopen();
  await expect(restarted.getItem()).rejects.toThrow('无法读取已保存账号');
  expect(restarted.hasReadableSnapshot()).toBe(false);
  await expect(restarted.ensureWritable()).rejects.toThrow(
    '请先恢复已保存账号',
  );
  await expect(restarted.setItem(B)).rejects.toThrow('未覆盖原文件');
  expect(h.files).toEqual(saved);

  h.operations.decrypt.mockImplementation(decrypt);
  expect(await restarted.getItem()).toBe(A);
  expect(restarted.hasReadableSnapshot()).toBe(true);
  expect(h.files).toEqual(saved);
  await restarted.ensureWritable();
  await restarted.setItem(B);
  expect(await h.reopen().getItem()).toBe(B);
  expect(h.operations.onFailure).toHaveBeenLastCalledWith(false);
});

test('serializes recovery with a later write so it cannot overwrite the new backup', async () => {
  const h = harness({ primary: A });
  let release: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const read = h.operations.read.getMockImplementation();
  h.operations.read.mockImplementationOnce(async (slot) => {
    await waiting;
    return (await read?.(slot)) ?? null;
  });
  const loading = h.storage.getItem();
  const saving = h.storage.setItem(B);
  release();
  await loading;
  await saving;
  h.files.set('primary', '{corrupt');
  expect(await h.reopen().getItem()).toBe(B);
});

test('initial absence alone permits legacy import; an explicit empty save marks presence', async () => {
  const h = harness();
  expect(await h.storage.getItem()).toBeNull();
  expect(h.operations.onPresence).toHaveBeenLastCalledWith(false);
  await h.storage.setItem(EMPTY);
  expect(h.operations.onPresence).toHaveBeenLastCalledWith(true);
});

test('tampered ciphertext is rejected, and reset requires an explicit call', async () => {
  const h = harness({ primary: A });
  await h.storage.getItem();
  const envelope = JSON.parse(h.files.get('primary') ?? '');
  envelope.data = Buffer.alloc(40).toString('base64');
  h.files.set('primary', JSON.stringify(envelope));
  h.files.set('backup', JSON.stringify(envelope));
  const storage = h.reopen();
  await expect(storage.getItem()).rejects.toThrow('无法读取');
  await storage.reset();
  expect(await h.reopen().getItem()).toBe(EMPTY);
});

test('writable retry cannot silently replace a recovered account with the unhydrated empty state', async () => {
  const h = harness({ primary: A });
  await h.storage.getItem();
  const decrypt = h.operations.decrypt.getMockImplementation();
  h.operations.decrypt.mockRejectedValue(
    new Error('synthetic temporary key failure'),
  );
  const storage = h.reopen();
  await expect(storage.getItem()).rejects.toThrow('无法读取');
  h.operations.decrypt.mockImplementation(decrypt ?? (async () => ''));
  await expect(storage.ensureWritable()).rejects.toThrow('先恢复');
  expect(storage.hasReadableSnapshot()).toBe(false);
  expect(await storage.getItem()).toBe(A);
  await storage.ensureWritable();
});

test('a readable legacy snapshot can resume migration after its key becomes available', async () => {
  const h = harness({ primary: A });
  const encrypt = h.operations.encrypt.getMockImplementation();
  h.operations.encrypt.mockRejectedValue(
    new Error('synthetic key unavailable'),
  );
  expect(await h.storage.getItem()).toBe(A);
  expect(h.storage.hasReadableSnapshot()).toBe(true);
  h.operations.encrypt.mockImplementation(encrypt ?? (async () => ''));
  await h.storage.ensureWritable();
  await h.storage.setItem(B);
  expect(await h.reopen().getItem()).toBe(B);
});

test.each(['truncated', 'missing'] as const)(
  'recovery adapter restores an interrupted Android AtomicFile backup when the base is %s',
  async (baseState) => {
    const h = harness({ primary: A });
    await h.storage.getItem();
    // Model the Android 7–10 AtomicFile contract: startWrite renames the
    // previous base to .bak; openRead restores it before returning any bytes.
    // This is an adapter integration test, not execution of Android's JVM stub.
    const nativeBackups = new Map([['backup', h.files.get('backup')]]);
    h.files.set('primary', '{corrupt-primary');
    if (baseState === 'truncated') h.files.set('backup', '{interrupted');
    else h.files.delete('backup');
    const read = h.operations.read.getMockImplementation();
    h.operations.read.mockImplementation(async (slot) => {
      const previous = nativeBackups.get(slot);
      if (previous !== undefined) {
        h.files.set(slot, previous);
        nativeBackups.delete(slot);
      }
      return (await read?.(slot)) ?? null;
    });
    expect(await h.reopen().getItem()).toBe(A);
    expect(h.files.get('primary')).toBe(h.files.get('backup'));
    expect(h.operations.onPresence).toHaveBeenLastCalledWith(true);
    expect(h.operations.onFailure).toHaveBeenLastCalledWith(false);
  },
);

test('explicit key reset waits for outstanding encryption and serializes later saves', async () => {
  const h = harness({ primary: A });
  await h.storage.getItem();
  const write = h.operations.writeAtomically.getMockImplementation();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  h.operations.writeAtomically.mockImplementationOnce(async (slot, value) => {
    await gate;
    await write?.(slot, value);
  });
  const saving = h.storage.setItem(B);
  const resetKey = jest.fn(async () => {});
  const clearing = h.storage.reset(resetKey);
  const following = h.storage.setItem(A);
  await Promise.resolve();
  expect(resetKey).not.toHaveBeenCalled();
  release();
  await saving;
  await clearing;
  await following;
  expect(resetKey).toHaveBeenCalledTimes(1);
  expect(await h.reopen().getItem()).toBe(A);
});
