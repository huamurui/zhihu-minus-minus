/**
 * 提取分隔符之后的子串，若未找到则返回原串（等同于 Kotlin 的 substringAfter）
 */
function substringAfter(str: string, delimiter: string): string {
    const idx = str.indexOf(delimiter);
    return idx === -1 ? str : str.substring(idx + delimiter.length);
}

/**
 * 零依赖的 MD5 实现，输出小写 Hex 字符串
 */
function md5Hex(str: string): string {
    const rotateLeft = (n: number, s: number) => (n << s) | (n >>> (32 - s));
    const addUnsigned = (x: number, y: number) => {
        const lX4 = x & 0x3fffffff, lY4 = y & 0x3fffffff;
        const lX8 = x & 0x80000000, lY8 = y & 0x80000000;
        const lResult = lX4 + lY4;
        return ((lResult & 0x3fffffff) | lX8 | lY8 | ((lResult & 0x40000000) ^ (x & 0x40000000) ^ (y & 0x40000000)) | (((lResult & 0x80000000) ^ lX8 ^ lY8) << 1)) >>> 0;
    };
    const F = (x: number, y: number, z: number) => (x & y) | (~x & z);
    const G = (x: number, y: number, z: number) => (x & z) | (y & ~z);
    const H = (x: number, y: number, z: number) => x ^ y ^ z;
    const I = (x: number, y: number, z: number) => y ^ (x | ~z);

    const FF = (a: number, b: number, c: number, d: number, x: number, s: number, ac: number) => addUnsigned(b, rotateLeft(addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac)), s));
    const GG = (a: number, b: number, c: number, d: number, x: number, s: number, ac: number) => addUnsigned(b, rotateLeft(addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac)), s));
    const HH = (a: number, b: number, c: number, d: number, x: number, s: number, ac: number) => addUnsigned(b, rotateLeft(addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac)), s));
    const II = (a: number, b: number, c: number, d: number, x: number, s: number, ac: number) => addUnsigned(b, rotateLeft(addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac)), s));

    const bytes = new TextEncoder().encode(str);
    const words: number[] = [];
    for (let i = 0; i < bytes.length; i++) {
        const idx = i >>> 2;
        if (words[idx] === undefined) words[idx] = 0;
        words[idx] |= bytes[i] << ((i % 4) * 8);
    }
    const msgLen = bytes.length * 8;
    const lenIdx = bytes.length >>> 2;
    if (words[lenIdx] === undefined) words[lenIdx] = 0;
    words[lenIdx] |= 0x80 << ((bytes.length % 4) * 8);

    const finalLenIdx = (((bytes.length + 8) >>> 6) << 4) + 14;
    while (words.length <= finalLenIdx + 1) words.push(0);
    words[finalLenIdx] = msgLen >>> 0;
    words[finalLenIdx + 1] = Math.floor(msgLen / 4294967296);

    let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;

    for (let i = 0; i < words.length; i += 16) {
        let AA = a, BB = b, CC = c, DD = d;
        a = FF(a, b, c, d, words[i + 0], 7, 0xd76aa478); d = FF(d, a, b, c, words[i + 1], 12, 0xe8c7b756); c = FF(c, d, a, b, words[i + 2], 17, 0x242070db); b = FF(b, c, d, a, words[i + 3], 22, 0xc1bdceee);
        a = FF(a, b, c, d, words[i + 4], 7, 0xf57c0faf); d = FF(d, a, b, c, words[i + 5], 12, 0x4787c62a); c = FF(c, d, a, b, words[i + 6], 17, 0xa8304613); b = FF(b, c, d, a, words[i + 7], 22, 0xfd469501);
        a = FF(a, b, c, d, words[i + 8], 7, 0x698098d8); d = FF(d, a, b, c, words[i + 9], 12, 0x8b44f7af); c = FF(c, d, a, b, words[i + 10], 17, 0xffff5bb1); b = FF(b, c, d, a, words[i + 11], 22, 0x895cd7be);
        a = FF(a, b, c, d, words[i + 12], 7, 0x6b901122); d = FF(d, a, b, c, words[i + 13], 12, 0xfd987193); c = FF(c, d, a, b, words[i + 14], 17, 0xa679438e); b = FF(b, c, d, a, words[i + 15], 22, 0x49b40821);

        a = GG(a, b, c, d, words[i + 1], 5, 0xf61e2562); d = GG(d, a, b, c, words[i + 6], 9, 0xc040b340); c = GG(c, d, a, b, words[i + 11], 14, 0x265e5a51); b = GG(b, c, d, a, words[i + 0], 20, 0xe9b6c7aa);
        a = GG(a, b, c, d, words[i + 5], 5, 0xd62f105d); d = GG(d, a, b, c, words[i + 10], 9, 0x02441453); c = GG(c, d, a, b, words[i + 15], 14, 0xd8a1e681); b = GG(b, c, d, a, words[i + 4], 20, 0xe7d3fbc8);
        a = GG(a, b, c, d, words[i + 9], 5, 0x21e1cde6); d = GG(d, a, b, c, words[i + 14], 9, 0xc33707d6); c = GG(c, d, a, b, words[i + 3], 14, 0xf4d50d87); b = GG(b, c, d, a, words[i + 8], 20, 0x455a14ed);
        a = GG(a, b, c, d, words[i + 13], 5, 0xa9e3e905); d = GG(d, a, b, c, words[i + 2], 9, 0xfcefa3f8); c = GG(c, d, a, b, words[i + 7], 14, 0x676f02d9); b = GG(b, c, d, a, words[i + 12], 20, 0x8d2a4c8a);

        a = HH(a, b, c, d, words[i + 5], 4, 0xfffa3942); d = HH(d, a, b, c, words[i + 8], 11, 0x8771f681); c = HH(c, d, a, b, words[i + 11], 16, 0x6d9d6122); b = HH(b, c, d, a, words[i + 14], 23, 0xfde5380c);
        a = HH(a, b, c, d, words[i + 1], 4, 0xa4beea44); d = HH(d, a, b, c, words[i + 4], 11, 0x4bdecfa9); c = HH(c, d, a, b, words[i + 7], 16, 0xf6bb4b60); b = HH(b, c, d, a, words[i + 10], 23, 0xbebfbc70);
        a = HH(a, b, c, d, words[i + 13], 4, 0x289b7ec6); d = HH(d, a, b, c, words[i + 0], 11, 0xeaa127fa); c = HH(c, d, a, b, words[i + 3], 16, 0xd4ef3085); b = HH(b, c, d, a, words[i + 6], 23, 0x04881d05);
        a = HH(a, b, c, d, words[i + 9], 4, 0xd9d4d039); d = HH(d, a, b, c, words[i + 12], 11, 0xe6db99e5); c = HH(c, d, a, b, words[i + 15], 16, 0x1fa27cf8); b = HH(b, c, d, a, words[i + 2], 23, 0xc4ac5665);

        a = II(a, b, c, d, words[i + 0], 6, 0xf4292244); d = II(d, a, b, c, words[i + 7], 10, 0x432aff97); c = II(c, d, a, b, words[i + 14], 15, 0xab9423a7); b = II(b, c, d, a, words[i + 5], 21, 0xfc93a039);
        a = II(a, b, c, d, words[i + 12], 6, 0x655b59c3); d = II(d, a, b, c, words[i + 3], 10, 0x8f0ccc92); c = II(c, d, a, b, words[i + 10], 15, 0xffeff47d); b = II(b, c, d, a, words[i + 1], 21, 0x85845dd1);
        a = II(a, b, c, d, words[i + 8], 6, 0x6fa87e4f); d = II(d, a, b, c, words[i + 15], 10, 0xfe2ce6e0); c = II(c, d, a, b, words[i + 6], 15, 0xa3014314); b = II(b, c, d, a, words[i + 13], 21, 0x4e0811a1);
        a = II(a, b, c, d, words[i + 4], 6, 0xf7537e82); d = II(d, a, b, c, words[i + 11], 10, 0xbd3af235); c = II(c, d, a, b, words[i + 2], 15, 0x2ad7d2bb); b = II(b, c, d, a, words[i + 9], 21, 0xeb86d391);

        a = addUnsigned(a, AA); b = addUnsigned(b, BB); c = addUnsigned(c, CC); d = addUnsigned(d, DD);
    }
    const toHex = (n: number) => {
        let h = "";
        for (let j = 0; j < 4; j++) {
            h += ((n >>> (j * 8)) & 0xff).toString(16).padStart(2, '0');
        }
        return h;
    };
    return toHex(a) + toHex(b) + toHex(c) + toHex(d);
}

// ----------------------------------------------------
// Rust 加密算法部分的等效翻译
// ----------------------------------------------------

const ZK = new Uint32Array([
    1170614578, 1024848638, 1413669199, 3951632832, 3528873006, 2921909214, 4151847688, 3997739139,
    1933479194, 3323781115, 3888513386, 460404854, 3747539722, 2403641034, 2615871395, 2119585428,
    2265697227, 2035090028, 2773447226, 4289380121, 4217216195, 2200601443, 3051914490, 1579901135,
    1321810770, 456816404, 2903323407, 4065664991, 330002838, 3506006750, 363569021, 2347096187,
]);

const ZB = new Uint8Array([
    20, 223, 245, 7, 248, 2, 194, 209, 87, 6, 227, 253, 240, 128, 222, 91, 237, 9, 125, 157, 230,
    93, 252, 205, 90, 79, 144, 199, 159, 197, 186, 167, 39, 37, 156, 198, 38, 42, 43, 168, 217,
    153, 15, 103, 80, 189, 71, 191, 97, 84, 247, 95, 36, 69, 14, 35, 12, 171, 28, 114, 178, 148,
    86, 182, 32, 83, 158, 109, 22, 255, 94, 238, 151, 85, 77, 124, 254, 18, 4, 26, 123, 176, 232,
    193, 131, 172, 143, 142, 150, 30, 10, 146, 162, 62, 224, 218, 196, 229, 1, 192, 213, 27, 110,
    56, 231, 180, 138, 107, 242, 187, 54, 120, 19, 44, 117, 228, 215, 203, 53, 239, 251, 127, 81,
    11, 133, 96, 204, 132, 41, 115, 73, 55, 249, 147, 102, 48, 122, 145, 106, 118, 74, 190, 29, 16,
    174, 5, 177, 129, 63, 113, 99, 31, 161, 76, 246, 34, 211, 13, 60, 68, 207, 160, 65, 111, 82,
    165, 67, 169, 225, 57, 112, 244, 155, 51, 236, 200, 233, 58, 61, 47, 100, 137, 185, 64, 17, 70,
    234, 163, 219, 108, 170, 166, 59, 149, 52, 105, 24, 212, 78, 173, 45, 0, 116, 226, 119, 136,
    206, 135, 175, 195, 25, 92, 121, 208, 126, 139, 3, 75, 141, 21, 130, 98, 241, 40, 154, 66, 184,
    49, 181, 46, 243, 88, 101, 183, 8, 23, 72, 188, 104, 179, 210, 134, 250, 201, 164, 89, 216,
    202, 220, 50, 221, 152, 140, 33, 235, 214,
]);

function encodeUriComponentCustom(input: string): Uint8Array {
    const isUnescaped = (b: number) => {
        return (b >= 0x41 && b <= 0x5A) || // A-Z
            (b >= 0x61 && b <= 0x7A) || // a-z
            (b >= 0x30 && b <= 0x39) || // 0-9
            b === 0x2D || b === 0x5F || b === 0x2E || // - _ .
            b === 0x21 || b === 0x7E || b === 0x2A || // ! ~ *
            b === 0x27 || b === 0x28 || b === 0x29;   // ' ( )
    };

    const bytes = new TextEncoder().encode(input);
    const out: number[] = [];
    const hex = "0123456789ABCDEF";

    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (isUnescaped(b)) {
            out.push(b);
        } else {
            out.push(0x25); // '%'
            out.push(hex.charCodeAt(b >> 4));
            out.push(hex.charCodeAt(b & 0x0F));
        }
    }
    return new Uint8Array(out);
}

function readU32Be(b: Uint8Array, off: number): number {
    return ((b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]) >>> 0;
}

function writeU32Be(v: number, out: Uint8Array, off: number) {
    out[off] = (v >>> 24) & 0xFF;
    out[off + 1] = (v >>> 16) & 0xFF;
    out[off + 2] = (v >>> 8) & 0xFF;
    out[off + 3] = v & 0xFF;
}

function gTransform(tt: number): number {
    const b0 = (tt >>> 24) & 0xFF;
    const b1 = (tt >>> 16) & 0xFF;
    const b2 = (tt >>> 8) & 0xFF;
    const b3 = tt & 0xFF;

    const ti = ((ZB[b0] << 24) | (ZB[b1] << 16) | (ZB[b2] << 8) | ZB[b3]) >>> 0;
    const rotl = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0;

    return (ti ^ rotl(ti, 2) ^ rotl(ti, 10) ^ rotl(ti, 18) ^ rotl(ti, 24)) >>> 0;
}

function rBlock(input16: Uint8Array): Uint8Array {
    const tr = new Uint32Array(36);
    tr[0] = readU32Be(input16, 0);
    tr[1] = readU32Be(input16, 4);
    tr[2] = readU32Be(input16, 8);
    tr[3] = readU32Be(input16, 12);

    for (let i = 0; i < 32; i++) {
        const ta = gTransform((tr[i + 1] ^ tr[i + 2] ^ tr[i + 3] ^ ZK[i]) >>> 0);
        tr[i + 4] = (tr[i] ^ ta) >>> 0;
    }

    const out = new Uint8Array(16);
    writeU32Be(tr[35], out, 0);
    writeU32Be(tr[34], out, 4);
    writeU32Be(tr[33], out, 8);
    writeU32Be(tr[32], out, 12);
    return out;
}

function xBlocks(data: Uint8Array, iv: Uint8Array): Uint8Array {
    const out = new Uint8Array(data.length);
    let currentIv = iv;
    for (let offset = 0; offset < data.length; offset += 16) {
        const mixed = new Uint8Array(16);
        for (let i = 0; i < 16; i++) {
            mixed[i] = data[offset + i] ^ currentIv[i];
        }
        currentIv = rBlock(mixed);
        out.set(currentIv, offset);
    }
    return out;
}

function customEncode(bytes: number[] | Uint8Array): string {
    const bytesArr = Array.from(bytes);
    while (bytesArr.length % 3 !== 0) {
        bytesArr.push(0);
    }

    const alphabet = "6fpLRqJO8M/c3jnYxFkUVC4ZIG12SiH=5v0mXDazWBTsuw7QetbKdoPyAl+hN9rgE";
    let out = "";
    let i = 0;
    let p = bytesArr.length - 1;

    while (p >= 0) {
        let v = 0;

        const b0 = bytesArr[p];
        const m0 = (58 >>> (8 * (i % 4))) & 0xFF;
        i++;
        v |= (b0 ^ m0) & 0xFF;

        const b1 = bytesArr[p - 1];
        const m1 = (58 >>> (8 * (i % 4))) & 0xFF;
        i++;
        v |= ((b1 ^ m1) & 0xFF) << 8;

        const b2 = bytesArr[p - 2];
        const m2 = (58 >>> (8 * (i % 4))) & 0xFF;
        i++;
        v |= ((b2 ^ m2) & 0xFF) << 16;

        out += alphabet[(v & 63)];
        out += alphabet[((v >>> 6) & 63)];
        out += alphabet[((v >>> 12) & 63)];
        out += alphabet[((v >>> 18) & 63)];

        p -= 3;
    }

    return out;
}

function encryptZseV4(input: string, nowMs: number): string {
    const seed = (nowMs % 127) & 0xFF;

    const plain: number[] = [];
    plain.push(seed);
    plain.push(7);

    const encoded = encodeUriComponentCustom(input);
    for (let i = 0; i < encoded.length; i++) {
        plain.push(encoded[i]);
    }

    const pad = 16 - (plain.length % 16);
    for (let i = 0; i < pad; i++) {
        plain.push(pad);
    }

    const first = new Uint8Array(16);
    const KEY16 = new TextEncoder().encode("059053f7d15e01d7");
    for (let i = 0; i < 16; i++) {
        first[i] = plain[i] ^ KEY16[i] ^ 42;
    }

    const c0 = rBlock(first);
    const cipher: number[] = [];
    for (let i = 0; i < c0.length; i++) {
        cipher.push(c0[i]);
    }

    if (plain.length > 16) {
        const plainBytes = new Uint8Array(plain);
        const rest = xBlocks(plainBytes.subarray(16), c0);
        for (let i = 0; i < rest.length; i++) {
            cipher.push(rest[i]);
        }
    }

    return customEncode(cipher);
}

// ----------------------------------------------------
// 主导出 API 
// ----------------------------------------------------

/**
 * 完整模拟 zse96 请求签名的 TypeScript 方案。
 * 原 Kotlin 脚本中有两个外部上下文参数 (zse93 盐值 和 Cookie d_c0)，这里以参数的方式传递进去。
 * 
 * @param url   请求的 URL 
 * @param body  请求的 Body，如果是 GET/空，请传入 null 或 ""
 * @param zse93 类似 "101_3_3.0" 一类的版本常量值
 * @param dc0   用户的 Cookie: d_c0，如果没有请传入空字符串 ""
 */
export function signRequest96(
    url: string,
    body: string | null | undefined,
    zse93: string,
    dc0: string
): string {
    // 模拟 Kotlin url.substringAfter("//").substringAfter('/')
    const afterDouble = substringAfter(url, "//");
    const afterSlash = substringAfter(afterDouble, "/");
    const pathname = "/" + afterSlash;

    // 过滤 null / undefined，但如果为 "" 则予以保留（与 Kotlin listOfNotNull 行为一致）
    const parts = [zse93, pathname, dc0, body].filter(x => x != null);
    const signSource = parts.join("+");

    const md5Str = md5Hex(signSource);
    const nowMs = Date.now();

    // 调用等效翻译的 Rust Signer
    const rustSign = encryptZseV4(md5Str, nowMs);

    return `2.0_${rustSign}`;
}