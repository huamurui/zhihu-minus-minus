import * as Crypto from 'expo-crypto';
import { LAESUtils } from './laes';

// 初始化加密器
const laes = new LAESUtils();

/**
 * 知乎专用的 LAES 加密器配置
 * Key 和 IV 来自 zhihu_zse_96 项目的 test.js 示例
 */
const ZHIHU_KEY = "541a3a5896fbefd351917c8251328a236a7efbf27d0fad8283ef59ef07aa386dbb2b1fcbba167135d575877ba0205a02f0aac2d31957bc7f028ed5888d4bbe69ed6768efc15ab703dc0f406b301845a0a64cf3c427c82870053bd7ba6721649c3a9aca8c3c31710a6be5ce71e4686842732d9314d6898cc3fdca075db46d1ccf3a7f9b20615f4a303c5235bd02c5cdc791eb123b9d9f7e72e954de3bcbf7d314064a1eced78d13679d040dd4080640d18c37bbde";
const ZHIHU_IV = [102, 48, 53, 53, 49, 56, 53, 54, 97, 97, 53, 55, 53, 102, 97, 97];

const encryptor = laes.createEncryptor(ZHIHU_KEY, ZHIHU_IV);

// 版本号，目前常用 101_3_3.0
export const ZSE_VERSION = "101_3_3.0";

/**
 * 生成 x-zse-96 签名
 * @param path API 路径 (例如 /api/v4/members/...)
 * @param dc0 d_c0 cookie 的值
 */
export async function generateZse96(path: string, dc0: string = ""): Promise<string> {
    const timestamp = Math.floor(Date.now() / 1000).toString();

    // 签名字符串格式：version + path + dc0 + "|" + timestamp
    // 注意：某些情况下如果没有 dc0，可能格式略有不同，但通常 dc0 是必需的
    const signatureString = `${ZSE_VERSION}+${path}+${dc0}|${timestamp}`;

    // 1. 计算 MD5
    const md5Result = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.MD5,
        signatureString
    );

    // 2. LAES 加密
    const encrypted = encryptor(md5Result);

    // 3. 返回带 2.0_ 前缀的结果
    return `2.0_${encrypted}`;
}

/**
 * 提取 Cookie 中的 d_c0 字段
 */
export function getDc0(cookie: string | null): string {
    if (!cookie) return "";
    const match = cookie.match(/d_c0="?([^;"]+)"?/);
    return match ? match[1] : "";
}
