import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { strToU8, zipSync } from 'fflate';
import { Parser } from 'htmlparser2';
import { Platform } from 'react-native';
import type { ExportAssetFile } from './assets';
import { ContentExportError } from './errors';
import {
  assertExportActive,
  base64ToBytes,
  bytesToBase64,
  ExportIoError,
} from './ioShared';
import { stitchPngImages } from './pngStitch';
import type { ExportFile, ExportResult, ExportTaskContext } from './types';

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_IMAGE_FILES = 120;
const activeDirectories = new Set<string>();
let sequence = 0;

interface WriteOptions {
  readonly directory: string;
  readonly title: string;
  readonly warnings?: readonly string[];
}

function exportRoot(): string {
  const cache = FileSystem.cacheDirectory;
  if (!cache?.startsWith('file://')) throw new ExportIoError('storage');
  return `${cache.replace(/\/$/, '')}/exports/`;
}

function assertDirectory(directory: string): void {
  if (
    !directory.startsWith(exportRoot()) ||
    !/^job-[\da-z]+-[\da-z]+-[\da-z]+\/$/.test(
      directory.slice(exportRoot().length),
    )
  ) {
    throw new ExportIoError('storage');
  }
}

function fileUri(directory: string, name: string): string {
  // Titles may contain #, %, spaces or encoded separators; never interpret them as URI syntax.
  return `${directory}${encodeURIComponent(name)}`;
}

async function remove(uri: string): Promise<void> {
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

export function sanitizeExportFilename(title: string): string {
  const name = title
    .normalize('NFKC')
    .replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069/\\:*?"<>|]/gu, '_')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .replace(/\s+/g, ' ');
  const limited = [...name].slice(0, 64).join('');
  if (!limited || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(limited)) {
    return '知乎内容';
  }
  return limited;
}

/** Remove only stale export-owned directories; never touch another active job. */
export async function cleanupExpiredExports(): Promise<void> {
  const root = exportRoot();
  try {
    if (!(await FileSystem.getInfoAsync(root)).exists) return;
    for (const entry of await FileSystem.readDirectoryAsync(root)) {
      const directory = `${root}${entry}/`;
      if (activeDirectories.has(directory)) continue;
      if (!/^job-[\da-z]+-[\da-z]+-[\da-z]+$/.test(entry)) continue;
      const info = await FileSystem.getInfoAsync(directory);
      if (
        info.exists &&
        info.isDirectory &&
        typeof info.modificationTime === 'number' &&
        Date.now() / 1000 - info.modificationTime > 24 * 60 * 60
      ) {
        await remove(directory);
      }
    }
  } catch {
    // Cache housekeeping must not prevent a new export.
  }
}

export async function createExportDirectory(
  context: ExportTaskContext,
): Promise<string> {
  assertExportActive(context);
  const directory = `${exportRoot()}job-${Date.now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2, 10) || '0'}/`;
  activeDirectories.add(directory);
  try {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    assertExportActive(context);
    return directory;
  } catch (error) {
    await discardExportDirectory(directory);
    assertExportActive(context);
    throw error instanceof ContentExportError
      ? error
      : new ExportIoError('storage');
  }
}

export async function discardExportDirectory(directory: string): Promise<void> {
  assertDirectory(directory);
  activeDirectories.delete(directory);
  await remove(directory);
}

async function writeBytes(uri: string, bytes: Uint8Array): Promise<void> {
  if (bytes.byteLength > MAX_OUTPUT_BYTES)
    throw new ExportIoError('resource-limit');
  await FileSystem.writeAsStringAsync(uri, bytesToBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
  });
}

async function runWrite(
  options: WriteOptions,
  context: ExportTaskContext,
  operation: () => Promise<readonly ExportFile[]>,
): Promise<ExportResult> {
  assertDirectory(options.directory);
  try {
    assertExportActive(context);
    context.onProgress?.({ phase: 'write' });
    const files = await operation();
    assertExportActive(context);
    return {
      directory: options.directory,
      files,
      warnings: options.warnings ?? [],
    };
  } catch (error) {
    await discardExportDirectory(options.directory);
    assertExportActive(context);
    throw error instanceof ContentExportError
      ? error
      : new ExportIoError('storage');
  }
}

export async function writeTextExport(
  options: WriteOptions & {
    readonly format: 'markdown' | 'html';
    readonly content: string;
    readonly assets?: readonly ExportAssetFile[];
  },
  context: ExportTaskContext,
): Promise<ExportResult> {
  return runWrite(options, context, async () => {
    const stem = sanitizeExportFilename(options.title);
    const text = strToU8(options.content);
    if (text.byteLength > MAX_OUTPUT_BYTES)
      throw new ExportIoError('resource-limit');
    const packed =
      options.format === 'markdown' && options.assets !== undefined;
    const name = `${stem}.${packed ? 'zip' : options.format === 'html' ? 'html' : 'md'}`;
    let bytes = text;
    if (packed) {
      const entries: Record<string, Uint8Array> = { [`${stem}.md`]: text };
      let size = text.byteLength;
      for (const asset of options.assets ?? []) {
        if (!/^assets\/asset-\d+\.(png|jpg|gif|webp)$/.test(asset.path)) {
          throw new ExportIoError('storage');
        }
        size += asset.bytes.byteLength;
        if (size > MAX_OUTPUT_BYTES) throw new ExportIoError('resource-limit');
        entries[asset.path] = asset.bytes;
      }
      // Images are already compressed. Store entries without blocking on deflate.
      bytes = zipSync(entries, { level: 0 });
    }
    assertExportActive(context);
    const uri = fileUri(options.directory, name);
    await writeBytes(uri, bytes);
    return [
      {
        uri,
        name,
        mimeType: packed
          ? 'application/zip'
          : options.format === 'html'
            ? 'text/html'
            : 'text/markdown',
      },
    ];
  });
}

/** PDFs may use links, but all rendering resources must already be embedded. */
export function assertOfflinePrintHtml(html: string): void {
  let valid = true;
  let inStyle = false;
  const checkCss = (css: string) => {
    if (/@import\b/i.test(css)) valid = false;
    for (const match of css.matchAll(
      /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi,
    )) {
      const value = (match[1] ?? match[2] ?? match[3]).trim();
      if (
        !/^data:(?:font\/[\w-]+|application\/[\w-]+|image\/(?:png|jpeg|gif|webp));base64,[a-z\d+/=]+$/i.test(
          value,
        ) &&
        !/^#[\w-]+$/.test(value)
      )
        valid = false;
    }
  };
  const parser = new Parser({
    onopentag(name, attributes) {
      if (name === 'style') inStyle = true;
      if (
        [
          'script',
          'iframe',
          'object',
          'embed',
          'video',
          'audio',
          'link',
          'base',
          'foreignobject',
        ].includes(name)
      )
        valid = false;
      if (
        name === 'meta' &&
        attributes['http-equiv']?.toLowerCase() === 'refresh'
      )
        valid = false;
      for (const [key, value] of Object.entries(attributes)) {
        if (key === 'style') checkCss(value);
        if (key.startsWith('on') || key === 'srcset') valid = false;
        if (
          (key === 'href' || key === 'xlink:href') &&
          name !== 'a' &&
          !/^#[\w-]+$/.test(value)
        )
          valid = false;
        if (
          ['src', 'poster', 'data', 'background'].includes(key) &&
          !/^data:image\/(png|jpeg|gif|webp);base64,[a-z\d+/=]+$/i.test(value)
        )
          valid = false;
      }
    },
    ontext(text) {
      if (inStyle) checkCss(text);
    },
    onclosetag(name) {
      if (name === 'style') inStyle = false;
    },
  });
  parser.write(html);
  parser.end();
  if (!valid)
    throw new ContentExportError('导出资源尚未完全嵌入，无法生成 PDF');
}

async function printToTemporaryFile(
  html: string,
  print: typeof import('expo-print'),
  context: ExportTaskContext,
): Promise<import('expo-print').FilePrintResult> {
  let accepted = true;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const pending = print.printToFileAsync({
    html,
    width: 595.28,
    height: 841.89,
    base64: false,
  });
  // The native print API has no cancellation primitive. Discard its late result.
  void pending.then(
    (late) => {
      if (!accepted && late.uri.startsWith('file://')) void remove(late.uri);
    },
    () => {},
  );
  const interrupted = new Promise<never>((_resolve, reject) => {
    abort = () => {
      accepted = false;
      reject(new ExportIoError('cancelled'));
    };
    context.signal.addEventListener('abort', abort, { once: true });
    if (context.signal.aborted) abort();
    timeout = setTimeout(() => {
      accepted = false;
      reject(new ContentExportError('PDF 生成超时，请重试或减少图片'));
    }, 60_000);
  });
  try {
    return await Promise.race([pending, interrupted]);
  } finally {
    clearTimeout(timeout);
    if (abort) context.signal.removeEventListener('abort', abort);
  }
}

export async function writePdfExport(
  options: WriteOptions & { readonly html: string },
  context: ExportTaskContext,
): Promise<ExportResult> {
  return runWrite(options, context, async () => {
    assertOfflinePrintHtml(options.html);
    if (strToU8(options.html).byteLength > MAX_OUTPUT_BYTES)
      throw new ExportIoError('resource-limit');
    let print: typeof import('expo-print');
    try {
      print = require('expo-print');
    } catch {
      throw new ExportIoError('pdf-unavailable');
    }
    const result = await printToTemporaryFile(options.html, print, context);
    try {
      assertExportActive(context);
      if (!result.uri.startsWith('file://')) throw new ExportIoError('storage');
      const info = await FileSystem.getInfoAsync(result.uri);
      if (!info.exists || info.isDirectory || info.size > MAX_OUTPUT_BYTES) {
        throw new ExportIoError('resource-limit');
      }
      assertExportActive(context);
      const name = `${sanitizeExportFilename(options.title)}.pdf`;
      const uri = fileUri(options.directory, name);
      await FileSystem.copyAsync({ from: result.uri, to: uri });
      return [{ uri, name, mimeType: 'application/pdf' }];
    } finally {
      if (result.uri.startsWith('file://')) await remove(result.uri);
    }
  });
}

export async function writeImageExport(
  options: WriteOptions & { readonly uris: readonly string[] },
  context: ExportTaskContext,
): Promise<ExportResult> {
  return runWrite(options, context, async () => {
    if (!options.uris.length || options.uris.length > MAX_IMAGE_FILES) {
      throw new ExportIoError('resource-limit');
    }
    async function* readCaptures(): AsyncGenerator<Uint8Array> {
      let inputSize = 0;
      for (const [index, original] of options.uris.entries()) {
        assertExportActive(context);
        // iOS view-shot returns a native absolute path; Expo expects a file URI.
        // Keep the original capture path unchanged for view-shot's releaseCapture.
        const uri =
          Platform.OS === 'ios' && original.startsWith('/')
            ? `file://${original.split('/').map(encodeURIComponent).join('/')}`
            : original;
        if (!uri.startsWith('file://')) throw new ExportIoError('storage');
        const info = await FileSystem.getInfoAsync(uri);
        if (!info.exists || info.isDirectory)
          throw new ExportIoError('storage');
        if (inputSize + info.size > MAX_OUTPUT_BYTES) {
          throw new ExportIoError('resource-limit');
        }
        assertExportActive(context);
        const encoded = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        assertExportActive(context);
        if (
          encoded.length >
          Math.ceil((MAX_OUTPUT_BYTES - inputSize) / 3) * 4
        ) {
          throw new ExportIoError('resource-limit');
        }
        const bytes = base64ToBytes(encoded);
        inputSize += bytes.byteLength;
        if (inputSize > MAX_OUTPUT_BYTES)
          throw new ExportIoError('resource-limit');
        yield bytes;
        assertExportActive(context);
        context.onProgress?.({
          phase: 'merge',
          completed: index + 1,
          total: options.uris.length,
        });
      }
    }
    context.onProgress?.({
      phase: 'merge',
      completed: 0,
      total: options.uris.length,
    });
    const output: ExportFile[] = [];
    const stem = sanitizeExportFilename(options.title);
    let size = 0;
    for await (const image of stitchPngImages(readCaptures(), context)) {
      assertExportActive(context);
      size += image.bytes.byteLength;
      if (size > MAX_OUTPUT_BYTES) throw new ExportIoError('resource-limit');
      if (output.length >= MAX_IMAGE_FILES)
        throw new ExportIoError('resource-limit');
      const name = `${stem}-${String(output.length + 1).padStart(2, '0')}.png`;
      const uri = fileUri(options.directory, name);
      await writeBytes(uri, image.bytes);
      assertExportActive(context);
      output.push({ name, uri, mimeType: 'image/png' });
    }
    assertExportActive(context);
    if (!output.length) throw new ExportIoError('storage');
    if (output.length === 1) {
      const name = `${stem}.png`;
      const uri = fileUri(options.directory, name);
      await FileSystem.moveAsync({ from: output[0].uri, to: uri });
      assertExportActive(context);
      output[0] = { name, uri, mimeType: 'image/png' };
    }
    return output;
  });
}

function assertResult(result: ExportResult): void {
  assertDirectory(result.directory);
  if (!result.files.length || result.files.length > MAX_IMAGE_FILES)
    throw new ExportIoError('storage');
  for (const file of result.files) {
    if (
      file.uri !== fileUri(result.directory, file.name) ||
      /[/\\]/.test(file.name) ||
      file.name.startsWith('.')
    ) {
      throw new ExportIoError('storage');
    }
  }
}

async function readOutputBase64(file: ExportFile): Promise<string> {
  const info = await FileSystem.getInfoAsync(file.uri);
  if (!info.exists || info.isDirectory || info.size > MAX_OUTPUT_BYTES) {
    throw new ExportIoError('storage');
  }
  return FileSystem.readAsStringAsync(file.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

/** Expo sharing supports one file. Multiple image pages are shared in one ZIP. */
export async function shareExport(
  result: ExportResult,
  context: ExportTaskContext,
): Promise<void> {
  assertResult(result);
  assertExportActive(context);
  if (!(await Sharing.isAvailableAsync()))
    throw new ExportIoError('share-unavailable');
  assertExportActive(context);
  let file = result.files[0];
  if (result.files.length > 1) {
    const entries: Record<string, Uint8Array> = {};
    let size = 0;
    for (const image of result.files) {
      assertExportActive(context);
      const bytes = base64ToBytes(await readOutputBase64(image));
      size += bytes.byteLength;
      if (size > MAX_OUTPUT_BYTES) throw new ExportIoError('resource-limit');
      entries[image.name] = bytes;
    }
    const name = '导出图片.zip';
    file = {
      name,
      uri: fileUri(result.directory, name),
      mimeType: 'application/zip',
    };
    assertExportActive(context);
    await writeBytes(file.uri, zipSync(entries, { level: 0 }));
  }
  assertExportActive(context);
  await Sharing.shareAsync(file.uri, {
    mimeType: file.mimeType,
    dialogTitle: '保存或分享导出内容',
  });
}

/** Android uses SAF; iOS exposes “Save to Files” through its system share sheet. */
export async function saveExport(
  result: ExportResult,
  context: ExportTaskContext,
): Promise<boolean> {
  assertResult(result);
  assertExportActive(context);
  if (Platform.OS !== 'android') {
    await shareExport(result, context);
    return true;
  }
  const permission =
    await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  assertExportActive(context);
  if (!permission.granted) return false;
  for (const file of result.files) {
    let created: string | undefined;
    try {
      assertExportActive(context);
      const encoded = await readOutputBase64(file);
      assertExportActive(context);
      created = await FileSystem.StorageAccessFramework.createFileAsync(
        permission.directoryUri,
        // Providers may not know an extension for text/markdown; Expo passes the name through.
        file.mimeType === 'text/markdown'
          ? file.name
          : file.name.replace(/\.[^.]+$/, ''),
        file.mimeType,
      );
      assertExportActive(context);
      await FileSystem.writeAsStringAsync(created, encoded, {
        encoding: FileSystem.EncodingType.Base64,
      });
      assertExportActive(context);
    } catch (error) {
      if (created) await remove(created);
      assertExportActive(context);
      throw error instanceof ContentExportError
        ? error
        : new ExportIoError('save');
    }
  }
  return true;
}

export async function saveExportImages(
  result: ExportResult,
  context: ExportTaskContext,
): Promise<void> {
  assertResult(result);
  assertExportActive(context);
  if (result.files.some((file) => file.mimeType !== 'image/png'))
    throw new ExportIoError('storage');
  let gallery: typeof import('expo-media-library/legacy');
  try {
    gallery = require('expo-media-library/legacy');
  } catch {
    throw new ExportIoError('gallery-unavailable');
  }
  const permission = await gallery.requestPermissionsAsync(true, ['photo']);
  assertExportActive(context);
  if (!permission.granted) throw new ExportIoError('permission');
  for (const file of result.files) {
    assertExportActive(context);
    try {
      await gallery.saveToLibraryAsync(file.uri);
    } catch {
      throw new ExportIoError('save');
    }
    assertExportActive(context);
  }
}
