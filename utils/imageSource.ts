import type { ImageURISource } from 'react-native';

// Bound JS bookkeeping; the native image pipeline owns image bytes and eviction.
const MAX_IMAGE_SOURCES = 512;
const sources = new Map<string, ImageURISource>();

/** Reuse unchanged URLs and prefer native cached bytes over revalidation. */
export function getCachedImageSource(
  uri: string | null | undefined,
): ImageURISource | undefined {
  if (!uri) return undefined;

  const existing = sources.get(uri);
  if (existing) {
    sources.delete(uri);
    sources.set(uri, existing);
    return existing;
  }

  // Keep the complete URL: different sizes and version queries are different images.
  const source: ImageURISource = /^https?:\/\//i.test(uri)
    ? { uri, cache: 'force-cache' }
    : { uri };
  sources.set(uri, source);
  if (sources.size > MAX_IMAGE_SOURCES) {
    const oldest = sources.keys().next().value;
    if (oldest !== undefined) sources.delete(oldest);
  }
  return source;
}
