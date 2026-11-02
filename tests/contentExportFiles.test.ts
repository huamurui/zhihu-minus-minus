import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { strFromU8, unzipSync } from 'fflate';
import { Platform } from 'react-native';
import { ContentExportError } from '../src/features/content-export/errors';
import {
  assertOfflinePrintHtml,
  createExportDirectory,
  discardExportDirectory,
  sanitizeExportFilename,
  saveExport,
  saveExportImages,
  shareExport,
  writeImageExport,
  writePdfExport,
  writeTextExport,
} from '../src/features/content-export/files';
import { base64ToBytes } from '../src/features/content-export/ioShared';
import { stitchPngImages } from '../src/features/content-export/pngStitch';
import { serializeExportHtml } from '../src/features/content-export/serializers';
import type {
  ExportResult,
  ExportTaskContext,
} from '../src/features/content-export/types';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///test/cache/',
  EncodingType: { Base64: 'base64' },
  getInfoAsync: jest.fn(async () => ({
    exists: true,
    isDirectory: false,
    size: 16,
  })),
  makeDirectoryAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
  writeAsStringAsync: jest.fn(async () => undefined),
  readAsStringAsync: jest.fn(async () => 'aW1hZ2U='),
  copyAsync: jest.fn(async () => undefined),
  moveAsync: jest.fn(async () => undefined),
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: jest.fn(async () => ({
      granted: true,
      directoryUri: 'content://synthetic/directory',
    })),
    createFileAsync: jest.fn(async () => 'content://synthetic/file'),
  },
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(async () => ({
    uri: 'file:///test/print/temp.pdf',
    numberOfPages: 1,
  })),
}));
jest.mock('expo-media-library/legacy', () => ({
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  saveToLibraryAsync: jest.fn(async () => undefined),
}));
jest.mock('../src/features/rich-content', () => ({
  ...jest.requireActual('../src/features/rich-content/presentation'),
  ...jest.requireActual('../src/features/rich-content/exportResources'),
}));
jest.mock('../src/features/content-export/pngStitch', () => ({
  stitchPngImages: jest.fn(),
}));

const directory = 'file:///test/cache/exports/job-test-1-abcd/';
function context(controller = new AbortController()): ExportTaskContext {
  return {
    signal: controller.signal,
    assertActive: jest.fn(),
    onProgress: jest.fn(),
  };
}
function result(names = ['内容.md']): ExportResult {
  return {
    directory,
    files: names.map((name) => ({
      name,
      uri: `${directory}${encodeURIComponent(name)}`,
      mimeType: name.endsWith('.png') ? 'image/png' : 'text/markdown',
    })),
    warnings: [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(FileSystem.writeAsStringAsync).mockResolvedValue(undefined);
  jest.mocked(FileSystem.copyAsync).mockResolvedValue(undefined);
  jest.mocked(FileSystem.moveAsync).mockResolvedValue(undefined);
  jest.mocked(FileSystem.readAsStringAsync).mockResolvedValue('aW1hZ2U=');
  jest.mocked(stitchPngImages).mockImplementation(async function* (images) {
    for await (const _image of images) {
      /* Drain sequential input before yielding the merged result. */
    }
    yield { bytes: new Uint8Array([137, 80, 78, 71]), width: 1, height: 2 };
  });
  jest.mocked(Print.printToFileAsync).mockResolvedValue({
    uri: 'file:///test/print/temp.pdf',
    numberOfPages: 1,
  });
  jest
    .mocked(FileSystem.StorageAccessFramework.createFileAsync)
    .mockResolvedValue('content://synthetic/file');
  jest
    .mocked(FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync)
    .mockResolvedValue({
      granted: true,
      directoryUri: 'content://synthetic/directory',
    });
});
afterEach(() => {
  jest.restoreAllMocks();
});

test('creates isolated cache job directories and refuses cleanup outside ownership', async () => {
  const first = await createExportDirectory(context());
  const second = await createExportDirectory(context());
  expect(first).not.toBe(second);
  expect(first).toMatch(
    /^file:\/\/\/test\/cache\/exports\/job-[\da-z]+-[\da-z]+-[\da-z]+\/$/,
  );
  await discardExportDirectory(first);
  await expect(
    discardExportDirectory('file:///test/cache/exports/../'),
  ).rejects.toMatchObject({ code: 'storage' });
  expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);
});

test('constrains generated filenames without destroying Chinese titles', () => {
  expect(sanitizeExportFilename('../中文/测试\\标题?\n')).toBe(
    '_中文_测试_标题__',
  );
  expect(sanitizeExportFilename('CON')).toBe('知乎内容');
  expect(sanitizeExportFilename('.  ')).toBe('知乎内容');
  expect([...sanitizeExportFilename('文'.repeat(100))]).toHaveLength(64);
});

test('writes Markdown as UTF-8 and packages exact relative image paths in a ZIP', async () => {
  const task = context();
  const md = await writeTextExport(
    { directory, title: '正文', format: 'markdown', content: '# 正文\n' },
    task,
  );
  expect(md.files[0]).toMatchObject({
    name: '正文.md',
    mimeType: 'text/markdown',
  });
  expect(
    strFromU8(
      base64ToBytes(
        jest.mocked(FileSystem.writeAsStringAsync).mock.calls[0][1],
      ),
    ),
  ).toBe('# 正文\n');
  const packed = await writeTextExport(
    {
      directory,
      title: '正文',
      format: 'markdown',
      content: '![图](assets/asset-1.png)',
      assets: [
        { path: 'assets/asset-1.png', bytes: new Uint8Array([1, 2, 3]) },
      ],
    },
    task,
  );
  expect(packed.files[0]).toMatchObject({
    name: '正文.zip',
    mimeType: 'application/zip',
  });
  const entries = unzipSync(
    base64ToBytes(jest.mocked(FileSystem.writeAsStringAsync).mock.calls[1][1]),
  );
  expect(Object.keys(entries)).toEqual(['正文.md', 'assets/asset-1.png']);
  expect(strFromU8(entries['正文.md'])).toBe('![图](assets/asset-1.png)');
  expect(entries['assets/asset-1.png']).toEqual(new Uint8Array([1, 2, 3]));
});

test('rejects ZIP traversal paths and removes the unfinished directory', async () => {
  await expect(
    writeTextExport(
      {
        directory,
        title: '正文',
        format: 'markdown',
        content: '',
        assets: [{ path: '../private.png', bytes: new Uint8Array() }],
      },
      context(),
    ),
  ).rejects.toMatchObject({ code: 'storage' });
  expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(directory, {
    idempotent: true,
  });
});

test('encodes reserved URI characters in titles so files cannot escape their task directory', async () => {
  const output = await writeTextExport(
    { directory, title: 'C# %2F 标题', format: 'markdown', content: '正文' },
    context(),
  );
  expect(output.files[0].name).toBe('C# %2F 标题.md');
  expect(output.files[0].uri).toBe(
    `${directory}C%23%20%252F%20%E6%A0%87%E9%A2%98.md`,
  );
  expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
    output.files[0].uri,
    expect.any(String),
    expect.any(Object),
  );
});

test('cleans a late filesystem write after the originating account changes', async () => {
  const task = context();
  jest
    .mocked(FileSystem.writeAsStringAsync)
    .mockImplementationOnce(async () => {
      jest.mocked(task.assertActive).mockImplementation(() => {
        throw new ContentExportError('账号已切换');
      });
    });
  await expect(
    writeTextExport(
      { directory, title: '正文', format: 'html', content: '<p>文本</p>' },
      task,
    ),
  ).rejects.toThrow('账号已切换');
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(directory, {
    idempotent: true,
  });
});

test('requires static embedded resources before PDF printing', () => {
  expect(() =>
    assertOfflinePrintHtml(
      '<p><a href="https://www.zhihu.com/question/1">来源</a><img src="data:image/png;base64,YQ=="></p>',
    ),
  ).not.toThrow();
  for (const html of [
    '<img src="https://pic.zhimg.com/a.png">',
    '<script>alert(1)</script>',
    '<link href="a.css">',
    '<p onclick="alert(1)">x</p>',
    '<style>@import "https://example.com/a.css"</style>',
  ]) {
    expect(() => assertOfflinePrintHtml(html)).toThrow('导出资源尚未完全嵌入');
  }
});

test('accepts tutorial code mentioning remote CSS and embedded KaTeX fonts and SVG', () => {
  const html = serializeExportHtml(
    {
      target: { type: 'answer', id: '1', sessionVersion: 0 },
      title: '测试',
      sourceUrl: 'https://www.zhihu.com/answer/1',
      completeness: 'complete',
      warnings: [],
      document: {
        id: 'document',
        blocks: [
          {
            id: 'code',
            type: 'code',
            text: '@import "./style.css"; url(https://example.com/a.png)',
          },
          {
            id: 'formula',
            type: 'blockFormula',
            formula: { latex: '\\sqrt{x}+\\overrightarrow{AB}' },
          },
        ],
      },
    },
    { includeImages: true, allowRemoteImages: false },
  );
  expect(html).toContain('<svg');
  expect(() => assertOfflinePrintHtml(html)).not.toThrow();
  expect(() =>
    assertOfflinePrintHtml(
      '<svg><image href="https://example.com/image.png"/></svg>',
    ),
  ).toThrow();
  expect(() =>
    assertOfflinePrintHtml('<p style="background:url(../private.png)">x</p>'),
  ).toThrow();
});

test('copies PDF into its job and cleans the printer temporary file', async () => {
  const output = await writePdfExport(
    { directory, title: '正文', html: '<p>正文</p>' },
    context(),
  );
  expect(output.files[0]).toMatchObject({
    name: '正文.pdf',
    mimeType: 'application/pdf',
  });
  expect(FileSystem.copyAsync).toHaveBeenCalledWith({
    from: 'file:///test/print/temp.pdf',
    to: `${directory}${encodeURIComponent('正文.pdf')}`,
  });
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
    'file:///test/print/temp.pdf',
    { idempotent: true },
  );
});

test('cancels PDF immediately and removes a later native print result', async () => {
  let resolve: (value: Print.FilePrintResult) => void = () => {};
  jest.mocked(Print.printToFileAsync).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const controller = new AbortController();
  const pending = writePdfExport(
    { directory, title: '正文', html: '<p>正文</p>' },
    context(controller),
  );
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  resolve({ uri: 'file:///test/print/late.pdf', numberOfPages: 1 });
  await Promise.resolve();
  expect(FileSystem.copyAsync).not.toHaveBeenCalled();
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
    'file:///test/print/late.pdf',
    { idempotent: true },
  );
});

test('merges capture pieces into one named PNG and shares the image directly', async () => {
  const seen: Uint8Array[] = [];
  const merged = new Uint8Array([137, 80, 78, 71]);
  jest
    .mocked(FileSystem.readAsStringAsync)
    .mockResolvedValueOnce('cGFnZTE=')
    .mockResolvedValueOnce('cGFnZTI=');
  jest.mocked(stitchPngImages).mockImplementationOnce(async function* (images) {
    for await (const bytes of images) seen.push(bytes);
    yield { bytes: merged, width: 1, height: 2 };
  });
  const output = await writeImageExport(
    {
      directory,
      title: '正文',
      uris: ['file:///test/page1.png', 'file:///test/page2.png'],
    },
    context(),
  );
  expect(seen.map((bytes) => strFromU8(bytes))).toEqual(['page1', 'page2']);
  expect(output.files.map((file) => file.name)).toEqual(['正文.png']);
  expect(
    base64ToBytes(jest.mocked(FileSystem.writeAsStringAsync).mock.calls[0][1]),
  ).toEqual(merged);
  expect(FileSystem.moveAsync).toHaveBeenCalledWith({
    from: `${directory}${encodeURIComponent('正文-01.png')}`,
    to: `${directory}${encodeURIComponent('正文.png')}`,
  });
  await shareExport(output, context());
  expect(Sharing.shareAsync).toHaveBeenCalledWith(
    output.files[0].uri,
    expect.objectContaining({ mimeType: 'image/png' }),
  );
  expect(FileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);
});

test.each([
  [
    '/private/var/tmp/ReactNative/capture.png',
    'file:///private/var/tmp/ReactNative/capture.png',
  ],
  [
    '/private/var/tmp/ReactNative/中文 #?%.png',
    'file:///private/var/tmp/ReactNative/%E4%B8%AD%E6%96%87%20%23%3F%25.png',
  ],
  [
    'file:///private/var/tmp/ReactNative/capture.png',
    'file:///private/var/tmp/ReactNative/capture.png',
  ],
])('exports an iOS capture from %s', async (capture, uri) => {
  const platform = Platform.OS;
  Platform.OS = 'ios';
  try {
    const output = await writeImageExport(
      { directory, title: '正文', uris: [capture] },
      context(),
    );
    expect(FileSystem.getInfoAsync).toHaveBeenCalledWith(uri);
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    expect(output.files).toHaveLength(1);
    expect(output.files[0].mimeType).toBe('image/png');
  } finally {
    Platform.OS = platform;
  }
});

test('shares multiple bounded merged images in a ZIP when one image is too tall', async () => {
  jest.mocked(stitchPngImages).mockImplementationOnce(async function* (images) {
    for await (const bytes of images)
      yield { bytes, width: 1000, height: 16000 };
  });
  const output = await writeImageExport(
    {
      directory,
      title: '正文',
      uris: ['file:///test/page1.png', 'file:///test/page2.png'],
    },
    context(),
  );
  expect(output.files.map((file) => file.name)).toEqual([
    '正文-01.png',
    '正文-02.png',
  ]);
  expect(FileSystem.moveAsync).not.toHaveBeenCalled();
  await shareExport(output, context());
  expect(Sharing.shareAsync).toHaveBeenCalledWith(
    `${directory}${encodeURIComponent('导出图片.zip')}`,
    expect.objectContaining({ mimeType: 'application/zip' }),
  );
  const entries = unzipSync(
    base64ToBytes(jest.mocked(FileSystem.writeAsStringAsync).mock.calls[2][1]),
  );
  expect(Object.keys(entries)).toEqual(['正文-01.png', '正文-02.png']);
});

test('removes a partially written image export when merging fails', async () => {
  jest.mocked(stitchPngImages).mockImplementationOnce(async function* (images) {
    for await (const bytes of images) {
      yield { bytes, width: 1, height: 1 };
      throw new ContentExportError('截图数据无法合并');
    }
  });
  await expect(
    writeImageExport(
      { directory, title: '正文', uris: ['file:///test/page.png'] },
      context(),
    ),
  ).rejects.toThrow('截图数据无法合并');
  expect(FileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);
  expect(FileSystem.moveAsync).not.toHaveBeenCalled();
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(directory, {
    idempotent: true,
  });
});

test('refuses oversized merged output before writing it', async () => {
  const oversized = new Uint8Array(1);
  Object.defineProperty(oversized, 'byteLength', {
    value: 64 * 1024 * 1024 + 1,
  });
  jest.mocked(stitchPngImages).mockImplementationOnce(async function* () {
    yield { bytes: oversized, width: 1, height: 1 };
  });
  await expect(
    writeImageExport(
      { directory, title: '正文', uris: ['file:///test/page.png'] },
      context(),
    ),
  ).rejects.toMatchObject({ code: 'resource-limit' });
  expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(directory, {
    idempotent: true,
  });
});

test('cancels between merged writes and cleans the unfinished directory', async () => {
  const controller = new AbortController();
  jest.mocked(stitchPngImages).mockImplementationOnce(async function* (images) {
    for await (const bytes of images) yield { bytes, width: 1, height: 1 };
  });
  jest
    .mocked(FileSystem.writeAsStringAsync)
    .mockImplementationOnce(async () => {
      controller.abort();
    });
  await expect(
    writeImageExport(
      {
        directory,
        title: '正文',
        uris: ['file:///test/page1.png', 'file:///test/page2.png'],
      },
      context(controller),
    ),
  ).rejects.toMatchObject({ code: 'cancelled' });
  expect(FileSystem.readAsStringAsync).toHaveBeenCalledTimes(1);
  expect(FileSystem.moveAsync).not.toHaveBeenCalled();
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(directory, {
    idempotent: true,
  });
});

test('discards a completed PNG rename when the originating account becomes inactive', async () => {
  const task = context();
  jest.mocked(FileSystem.moveAsync).mockImplementationOnce(async () => {
    jest.mocked(task.assertActive).mockImplementation(() => {
      throw new ContentExportError('账号已切换');
    });
  });
  await expect(
    writeImageExport(
      { directory, title: '正文', uris: ['file:///test/page.png'] },
      task,
    ),
  ).rejects.toThrow('账号已切换');
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(directory, {
    idempotent: true,
  });
});

test('does not open sharing after the originating session becomes inactive', async () => {
  const task = context();
  jest.mocked(Sharing.isAvailableAsync).mockImplementationOnce(async () => {
    jest.mocked(task.assertActive).mockImplementation(() => {
      throw new ContentExportError('账号已切换');
    });
    return true;
  });
  await expect(shareExport(result(), task)).rejects.toThrow('账号已切换');
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
});

test('Android SAF cancellation creates no file', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest
    .mocked(FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync)
    .mockResolvedValueOnce({ granted: false });
  await expect(saveExport(result(), context())).resolves.toBe(false);
  expect(
    FileSystem.StorageAccessFramework.createFileAsync,
  ).not.toHaveBeenCalled();
});

test.each([
  ['内容.md', 'text/markdown', '内容.md'],
  ['内容.html', 'text/html', '内容'],
  ['内容.pdf', 'application/pdf', '内容'],
  ['内容.png', 'image/png', '内容'],
  ['内容.zip', 'application/zip', '内容'],
])(
  'Android SAF preserves the required filename for %s',
  async (name, mimeType, providerName) => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const output = result([name]);
    await expect(
      saveExport(
        { ...output, files: [{ ...output.files[0], mimeType }] },
        context(),
      ),
    ).resolves.toBe(true);
    expect(
      FileSystem.StorageAccessFramework.createFileAsync,
    ).toHaveBeenCalledWith(
      'content://synthetic/directory',
      providerName,
      mimeType,
    );
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      'content://synthetic/file',
      'aW1hZ2U=',
      { encoding: 'base64' },
    );
  },
);

test('Android SAF forwards native Base64 data without decoding or re-encoding it in JavaScript', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const decode = jest.spyOn(globalThis, 'atob');
  const encode = jest.spyOn(globalThis, 'btoa');
  await expect(saveExport(result(), context())).resolves.toBe(true);
  expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith(
    result().files[0].uri,
    { encoding: 'base64' },
  );
  expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
    'content://synthetic/file',
    'aW1hZ2U=',
    { encoding: 'base64' },
  );
  expect(decode).not.toHaveBeenCalled();
  expect(encode).not.toHaveBeenCalled();
});

test.each([
  { exists: false, isDirectory: false, size: 0 },
  { exists: true, isDirectory: true, size: 0 },
  { exists: true, isDirectory: false, size: 64 * 1024 * 1024 + 1 },
] as const)(
  'Android SAF refuses unreadable or oversized output: %j',
  async (info) => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const uri = result().files[0].uri;
    jest
      .mocked(FileSystem.getInfoAsync)
      .mockResolvedValueOnce(
        info.exists
          ? { ...info, uri, modificationTime: 0 }
          : { exists: false, uri, isDirectory: false },
      );
    await expect(saveExport(result(), context())).rejects.toMatchObject({
      code: 'storage',
    });
    expect(FileSystem.readAsStringAsync).not.toHaveBeenCalled();
    expect(
      FileSystem.StorageAccessFramework.createFileAsync,
    ).not.toHaveBeenCalled();
  },
);

test('Android SAF creates no destination when cancelled during the native file read', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const controller = new AbortController();
  jest.mocked(FileSystem.readAsStringAsync).mockImplementationOnce(async () => {
    controller.abort();
    return 'aW1hZ2U=';
  });
  await expect(saveExport(result(), context(controller))).rejects.toMatchObject(
    {
      code: 'cancelled',
    },
  );
  expect(
    FileSystem.StorageAccessFramework.createFileAsync,
  ).not.toHaveBeenCalled();
  expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
});

test('Android SAF removes its destination when a native write fails', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest
    .mocked(FileSystem.writeAsStringAsync)
    .mockRejectedValueOnce(new Error('synthetic failure'));
  await expect(saveExport(result(), context())).rejects.toMatchObject({
    code: 'save',
  });
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
    'content://synthetic/file',
    { idempotent: true },
  );
});

test('Android SAF removes a just-created destination when the account changes', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const task = context();
  jest
    .mocked(FileSystem.StorageAccessFramework.createFileAsync)
    .mockImplementationOnce(async () => {
      jest.mocked(task.assertActive).mockImplementation(() => {
        throw new ContentExportError('账号已切换');
      });
      return 'content://synthetic/file';
    });
  await expect(saveExport(result(), task)).rejects.toThrow('账号已切换');
  expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
    'content://synthetic/file',
    { idempotent: true },
  );
});

test('saves every image page after a single photo permission request', async () => {
  await saveExportImages(result(['01.png', '02.png']), context());
  expect(MediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(true, [
    'photo',
  ]);
  expect(MediaLibrary.saveToLibraryAsync).toHaveBeenNthCalledWith(
    1,
    `${directory}01.png`,
  );
  expect(MediaLibrary.saveToLibraryAsync).toHaveBeenNthCalledWith(
    2,
    `${directory}02.png`,
  );
});
