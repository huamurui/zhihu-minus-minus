import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/** The top of a long image cut at display resolution; width/height are the whole image's. */
export interface LongImageCrop {
  uri: string;
  cropWidth: number;
  cropHeight: number;
  width: number;
  height: number;
}

export interface NativeImageViewerEvent {
  /** The session `openNativeImageViewer` resolved with. */
  session: number;
  url?: string;
  index?: number;
}

type ViewerEventName = 'onViewerSave' | 'onViewerLongPress' | 'onViewerDismiss';

interface GaleriaModule {
  open(
    urls: string[],
    index: number,
    placeholders: string[],
    saveLabel: string,
  ): Promise<number>;
  cropLongImage(
    url: string,
    maxAspect: number,
    targetWidth: number,
  ): Promise<LongImageCrop | null>;
  addListener(
    eventName: ViewerEventName,
    listener: (event: NativeImageViewerEvent) => void,
  ): { remove(): void };
}

/**
 * The patched Galeria viewer (see patches/@nandorojo+galeria+*.patch). Only
 * Android uses it: it decodes long images in tiles, which the JavaScript
 * viewer cannot. iOS keeps the existing viewer.
 */
const galeria =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<GaleriaModule>('Galeria')
    : null;

export function isNativeImageViewerAvailable(): boolean {
  return galeria != null;
}

/**
 * Opens the native viewer at `index`. `placeholders[i]` is the URL the app
 * already displayed for page i; the viewer shows that cached copy at once and
 * swaps in `urls[i]` when it has loaded. Resolves with the session ID, or 0
 * when nothing was shown.
 */
export async function openNativeImageViewer({
  urls,
  index,
  placeholders,
  saveLabel,
}: {
  urls: readonly string[];
  index: number;
  placeholders: readonly string[];
  saveLabel: string;
}): Promise<number> {
  if (!galeria || urls.length === 0) return 0;
  return galeria.open([...urls], index, [...placeholders], saveLabel);
}

export function addNativeImageViewerListener(
  eventName: ViewerEventName,
  listener: (event: NativeImageViewerEvent) => void,
): { remove(): void } {
  return galeria?.addListener(eventName, listener) ?? { remove() {} };
}

/** Cuts the top of a long image; null when the native module is missing or the image is not decodable. */
export async function cropLongImage(
  url: string,
  maxAspect: number,
  targetWidth: number,
): Promise<LongImageCrop | null> {
  if (!galeria) return null;
  return galeria.cropLongImage(url, maxAspect, targetWidth);
}
