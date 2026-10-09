import { render } from '@testing-library/react-native';
import { StableAvatar } from '../components/StableAvatar';
import { getCachedImageSource } from '../utils/imageSource';

test.each([
  'https://example.test/avatar.jpg',
  'http://example.test/cover.png',
])('remote source %s selects the native cache-first policy', (uri) => {
  expect(getCachedImageSource(uri)).toEqual({ uri, cache: 'force-cache' });
  expect(getCachedImageSource(uri)).toBe(getCachedImageSource(uri));
});

test('image versions, transforms and hosts retain separate cache identities', () => {
  const urls = [
    'https://example.test/avatar.jpg?v=1',
    'https://example.test/avatar.jpg?v=2',
    'https://example.test/avatar_xl.jpg?v=1',
    'https://other.test/avatar.jpg?v=1',
  ];
  const sources = urls.map(getCachedImageSource);
  expect(new Set(sources).size).toBe(urls.length);
  expect(sources.map((source) => source?.uri)).toEqual(urls);
});

test('local images keep their original source and missing avatars produce no source', () => {
  const uri = 'file:///synthetic/avatar.png';
  expect(getCachedImageSource(uri)).toEqual({ uri });
  expect(getCachedImageSource('data:image/png;base64,synthetic')).toEqual({
    uri: 'data:image/png;base64,synthetic',
  });
  expect(getCachedImageSource(null)).toBeUndefined();
  expect(getCachedImageSource(undefined)).toBeUndefined();
  expect(getCachedImageSource('')).toBeUndefined();
});

test('source bookkeeping evicts old addresses while preserving their cache policy', () => {
  const uri = 'https://example.test/evicted-avatar.jpg';
  const original = getCachedImageSource(uri);
  for (let index = 0; index < 512; index += 1) {
    getCachedImageSource(`https://example.test/bounded-source-${index}.jpg`);
  }
  const revisited = getCachedImageSource(uri);
  expect(revisited).not.toBe(original);
  expect(revisited).toEqual(original);
});

test('avatar updates and reopening a page keep the same cached source', async () => {
  const uri = 'https://example.test/stable-avatar.jpg';
  const host = await render(<StableAvatar uri={uri} style={{ width: 24 }} />);
  const source = host.container.queryAll((node) => node.type === 'Image')[0]
    .props.source;
  await host.rerender(<StableAvatar uri={uri} style={{ width: 36 }} />);
  expect(
    host.container.queryAll((node) => node.type === 'Image')[0].props.source,
  ).toBe(source);
  await host.unmount();

  const reopened = await render(<StableAvatar uri={uri} />);
  expect(
    reopened.container.queryAll((node) => node.type === 'Image')[0].props
      .source,
  ).toBe(source);
  await reopened.rerender(
    <StableAvatar uri="https://example.test/new-avatar.jpg" />,
  );
  expect(
    reopened.container.queryAll((node) => node.type === 'Image')[0].props
      .source,
  ).toEqual({
    uri: 'https://example.test/new-avatar.jpg',
    cache: 'force-cache',
  });
});
