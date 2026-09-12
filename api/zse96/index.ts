import { getSignaturePurity } from './zse_purity';

export { hmacSha1Hex } from './hmac';
export { encryptZseV4 } from './zse_purity';

export const ZSE_VERSION = '101_3_3.0';

/**
 * 获取 cookie 中的 d_c0 值
 */
function getDc0(cookieString: string): string {
  const match = cookieString.match(/d_c0=([^;]+)/);
  return match ? match[1] : '';
}

/**
 * 转换后的签名函数
 */
export async function signRequest96(
  url: string,
  _body: string | null, // 新逻辑不再需要 body
  cookie: string,
): Promise<string> {
  const dc0 = getDc0(cookie);

  // 解析路径名: "/" + url.substringAfter("//").substringAfter('/')
  // 核心：Zhihu 签名需要包含 query string (search params)
  const urlObj = new URL(url, 'https://www.zhihu.com');
  const pathname = urlObj.pathname + urlObj.search;

  try {
    // 调用移植自 zhi-purity 的新签名算法
    return await getSignaturePurity(pathname, dc0);
  } catch (e) {
    console.error('zse96签名失败', e);
    throw new Error('zse96签名失败！请向开发者反馈');
  }
}
