import * as Crypto from 'expo-crypto';
import { encryptZseV4 } from './zse96'; // 假设你把之前的代码放在了这个文件

export const ZSE_VERSION = '101_3_3.0';

/**
 * 获取 cookie 中的 d_c0 值
 */
function getDc0(cookieString: string): string {
    const match = cookieString.match(/d_c0=([^;]+)/);
    return match ? match[1] : "";
}

/**
 * 转换后的签名函数
 */
export async function signRequest96(url: string, body: string | null, cookie: string): Promise<string> {
    const dc0 = getDc0(cookie);

    // 解析路径名: "/" + url.substringAfter("//").substringAfter('/')
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    // 拼接签名源字符串
    // Kotlin: listOfNotNull(ZSE_VERSION, pathname, dc0, body).joinToString("+")
    const signSourceParts = [ZSE_VERSION, pathname, dc0, body ?? ""];
    const signSource = signSourceParts.join("+");

    // 使用 expo-crypto 计算 MD5
    // 注意: digestStringAsync 默认返回 hex 格式
    const md5 = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.MD5,
        signSource
    );

    const nowMs = Date.now();

    try {
        // 调用之前重写的 Rust 算法实现
        const rustSign = encryptZseV4(md5, nowMs);
        return `2.0_${rustSign}`;
    } catch (e) {
        console.error("zse96签名失败", e);
        throw new Error("zse96签名失败！请向开发者反馈");
    }
}