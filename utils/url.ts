export function isExpoInternalUrl(url: string): boolean {
  return (
    url.includes('expo-development-client') || url.includes('expo-auth-session')
  );
}

const ZHIHU_WEB_HOSTS = new Set([
  'zhihu.com',
  'www.zhihu.com',
  'zhuanlan.zhihu.com',
  'oia.zhihu.com',
]);

const ZHIHU_APP_PROTOCOLS = new Set(['zhihu:', 'zhihu--:']);

function extractPath(url: string): string | null {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return null;

  if (!trimmedUrl.includes('://')) {
    return trimmedUrl.startsWith('/') ? trimmedUrl : `/${trimmedUrl}`;
  }

  const parsedUrl = new URL(trimmedUrl);
  if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
    if (!ZHIHU_WEB_HOSTS.has(parsedUrl.hostname.toLowerCase())) return null;
    return parsedUrl.pathname;
  }

  if (ZHIHU_APP_PROTOCOLS.has(parsedUrl.protocol.toLowerCase())) {
    const host = parsedUrl.hostname ? `/${parsedUrl.hostname}` : '';
    return `${host}${parsedUrl.pathname}` || '/';
  }

  return null;
}

function normalizeSupportedPath(path: string): string | null {
  const cleanPath = path.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
  const withoutOia = cleanPath.replace(/^\/oia(?=\/|$)/, '') || '/';

  if (
    withoutOia === '/' ||
    withoutOia === '/feed' ||
    withoutOia === '/home' ||
    withoutOia === '/follow'
  ) {
    return '/';
  }

  const questionAnswerMatch = withoutOia.match(
    /^\/questions?\/(\d+)\/answers?\/(\d+)$/,
  );
  if (questionAnswerMatch) return `/answer/${questionAnswerMatch[2]}`;

  const routePatterns: Array<{
    pattern: RegExp;
    buildPath: (match: RegExpMatchArray) => string;
  }> = [
    {
      pattern: /^\/questions?\/(\d+)$/,
      buildPath: (match) => `/question/${match[1]}`,
    },
    {
      pattern: /^\/answers?\/(\d+)$/,
      buildPath: (match) => `/answer/${match[1]}`,
    },
    {
      pattern: /^\/(?:articles?|p)\/(\d+)$/,
      buildPath: (match) => `/article/${match[1]}`,
    },
    {
      pattern: /^\/pins?\/(\d+)$/,
      buildPath: (match) => `/pin/${match[1]}`,
    },
    {
      pattern: /^\/(?:zvideos?|videos?)\/(\d+)$/,
      buildPath: (match) => `/video/${match[1]}`,
    },
    {
      pattern:
        /^\/(?:people|users?)\/([^/]+)(?:\/(followers|following|mutual|stream))?$/,
      buildPath: (match) =>
        `/user/${match[1]}${match[2] ? `/${match[2]}` : ''}`,
    },
    {
      pattern: /^\/topics?\/([^/]+)$/,
      buildPath: (match) => `/topic/${match[1]}`,
    },
    {
      pattern: /^\/columns?\/([^/]+)$/,
      buildPath: (match) => `/column/${match[1]}`,
    },
    {
      pattern: /^\/collections?\/(\d+)$/,
      buildPath: (match) => `/collections/${match[1]}`,
    },
  ];

  for (const { pattern, buildPath } of routePatterns) {
    const match = withoutOia.match(pattern);
    if (match) return buildPath(match);
  }

  // Zhihu app links sometimes contain only a resource ID.
  if (/^\/\d{15,25}$/.test(withoutOia)) {
    const id = withoutOia.substring(1);
    return id.startsWith('19') ? `/question/${id}` : `/answer/${id}`;
  }
  if (/^\/\d{8,14}$/.test(withoutOia)) {
    return `/question/${withoutOia.substring(1)}`;
  }

  return null;
}

/**
 * 解析并规范化知乎链接，将其转换为应用内的路由路径
 * @param url 原始 URL (可以是 http/https 链接，也可以是 deep link)
 * @returns 规范化的内部路径，如果无法解析为内部路径则返回 null
 */
export function parseZhihuUrl(url: string | null): string | null {
  if (!url) return null;

  try {
    const path = extractPath(url);
    return path ? normalizeSupportedPath(path) : null;
  } catch {
    console.error('[URL Parser] Failed to parse URL');
    return null;
  }
}

/**
 * 判断是否为知乎内部链接
 */
export function isInternalZhihuLink(url: string): boolean {
  return parseZhihuUrl(url) !== null;
}

/**
 * 解码知乎跳转链接，提取真实目标 URL
 * 知乎外部链接格式: https://link.zhihu.com/?target=https%3A%2F%2F...
 */
export function extractZhihuRedirectTarget(url: string): string {
  try {
    const parsed = new URL(url);
    if (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.hostname.toLowerCase() === 'link.zhihu.com'
    ) {
      const target = parsed.searchParams.get('target');
      if (target) return target;
    }
  } catch (_) {}
  return url;
}
