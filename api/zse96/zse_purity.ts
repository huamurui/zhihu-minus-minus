import * as Crypto from 'expo-crypto';

const ZK = [
  1170614578, 1024848638, 1413669199, -343334464, -766094290, -1373058082,
  -143119608, -297228157, 1933479194, -971186181, -406453910, 460404854,
  -547427574, -1891326262, -1679095901, 2119585428, -2029270069, 2035090028,
  -1521520070, -5587175, -77751101, -2094365853, -1243052806, 1579901135,
  1321810770, 456816404, -1391643889, -229302305, 330002838, -788960546,
  363569021, -1947871109,
];
const ZB = [
  20, 223, 245, 7, 248, 2, 194, 209, 87, 6, 227, 253, 240, 128, 222, 91, 237, 9,
  125, 157, 230, 93, 252, 205, 90, 79, 144, 199, 159, 197, 186, 167, 39, 37,
  156, 198, 38, 42, 43, 168, 217, 153, 15, 103, 80, 189, 71, 191, 97, 84, 247,
  95, 36, 69, 14, 35, 12, 171, 28, 114, 178, 148, 86, 182, 32, 83, 158, 109, 22,
  255, 94, 238, 151, 85, 77, 124, 254, 18, 4, 26, 123, 176, 232, 193, 131, 172,
  143, 142, 150, 30, 10, 146, 162, 62, 224, 218, 196, 229, 1, 192, 213, 27, 110,
  56, 231, 180, 138, 107, 242, 187, 54, 120, 19, 44, 117, 228, 215, 203, 53,
  239, 251, 127, 81, 11, 133, 96, 204, 132, 41, 115, 73, 55, 249, 147, 102, 48,
  122, 145, 106, 118, 74, 190, 29, 16, 174, 5, 177, 129, 63, 113, 99, 31, 161,
  76, 246, 34, 211, 13, 60, 68, 207, 160, 65, 111, 82, 165, 67, 169, 225, 57,
  112, 244, 155, 51, 236, 200, 233, 58, 61, 47, 100, 137, 185, 64, 17, 70, 234,
  163, 219, 108, 170, 166, 59, 149, 52, 105, 24, 212, 78, 173, 45, 0, 116, 226,
  119, 136, 206, 135, 175, 195, 25, 92, 121, 208, 126, 139, 3, 75, 141, 21, 130,
  98, 241, 40, 154, 66, 184, 49, 181, 46, 243, 88, 101, 183, 8, 23, 72, 188,
  104, 179, 210, 134, 250, 201, 164, 89, 216, 202, 220, 50, 221, 152, 140, 33,
  235, 214,
];
const ALPHABET =
  '6fpLRqJO8M/c3jnYxFkUVC4ZIG12SiH=5v0mXDazWBTsuw7QetbKdoPyAl+hN9rgE';
const KEY16 = new Uint8Array([
  0x30, 0x35, 0x39, 0x30, 0x35, 0x33, 0x66, 0x37, 0x64, 0x31, 0x35, 0x65, 0x30,
  0x31, 0x64, 0x37,
]); // "059053f7d15e01d7" as bytes

const Q = (n: number, b: number) => (n << b) | (n >>> (32 - b));
const G = (n: number) => {
  const r =
    ((ZB[(n >>> 24) & 0xff] << 24) |
      (ZB[(n >>> 16) & 0xff] << 16) |
      (ZB[(n >>> 8) & 0xff] << 8) |
      ZB[n & 0xff]) >>>
    0;
  return (r ^ Q(r, 2) ^ Q(r, 10) ^ Q(r, 18) ^ Q(r, 24)) >>> 0;
};

const encryptBlock = (b: Uint8Array) => {
  const o = new Int32Array(36);
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  o[0] = view.getInt32(0);
  o[1] = view.getInt32(4);
  o[2] = view.getInt32(8);
  o[3] = view.getInt32(12);
  for (let i = 0; i < 32; i++) {
    o[i + 4] = (o[i] ^ G(o[i + 1] ^ o[i + 2] ^ o[i + 3] ^ ZK[i])) >>> 0;
  }
  const r = new Uint8Array(16);
  const rView = new DataView(r.buffer);
  for (let i = 0; i < 4; i++) {
    rView.setInt32(i * 4, o[35 - i]);
  }
  return r;
};

const customEncode = (bytes: Uint8Array) => {
  // 填充到3的倍数
  const len = Math.ceil(bytes.length / 3) * 3;
  const data = new Uint8Array(len);
  data.set(bytes);

  let out = '';
  let i = 0;
  for (let p = data.length - 1; p >= 0; p -= 3) {
    let v = 0;
    const m0 = (58 >> (8 * (i % 4))) & 0xff;
    i++;
    v |= (data[p] ^ m0) & 0xff;
    const m1 = (58 >> (8 * (i % 4))) & 0xff;
    i++;
    v |= ((data[p - 1] ^ m1) & 0xff) << 8;
    const m2 = (58 >> (8 * (i % 4))) & 0xff;
    i++;
    v |= ((data[p - 2] ^ m2) & 0xff) << 16;

    out += ALPHABET[v & 63];
    out += ALPHABET[(v >> 6) & 63];
    out += ALPHABET[(v >> 12) & 63];
    out += ALPHABET[(v >> 18) & 63];
  }
  return out;
};

function encodeUtf8(value: string): Uint8Array {
  const bytes: number[] = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

/** Encrypt the x-zse-83 form payload used by Zhihu's web token refresh flow. */
export const encryptZseV4 = (input: string): string => {
  const inputBytes = encodeUtf8(input);
  const plain = new Uint8Array(2 + inputBytes.length);
  plain[0] = 210;
  plain.set(inputBytes, 2);

  const pad = 16 - (plain.length % 16);
  const padded = new Uint8Array(plain.length + pad);
  padded.set(plain);
  padded.fill(pad, plain.length);

  const cipher = new Uint8Array(padded.length);
  const firstBlock = new Uint8Array(16);
  for (let index = 0; index < 16; index += 1) {
    firstBlock[index] = padded[index] ^ KEY16[index] ^ 42;
  }

  let previous = encryptBlock(firstBlock);
  cipher.set(previous, 0);
  for (let offset = 16; offset < padded.length; offset += 16) {
    const block = new Uint8Array(16);
    for (let index = 0; index < 16; index += 1) {
      block[index] = padded[offset + index] ^ previous[index];
    }
    previous = encryptBlock(block);
    cipher.set(previous, offset);
  }

  return customEncode(cipher);
};

/**
 * 生成知乎 x-zse-96 签名 (2.0版本) - 移植自 zhi-purity
 * @param path 请求路径 (如 /api/v4/me?include=is_realname)
 * @param dc0  d_c0 Cookie 的值
 * @param xZst81 可选的 x-zst-81 Header 值
 */
export const getSignaturePurity = async (
  path: string,
  dc0: string,
  xZst81?: string,
) => {
  // 构造 Source 拼接串
  const parts = ['101_3_3.0', path, dc0];
  if (xZst81) parts.push(xZst81);
  const source = parts.join('+');

  // 1. MD5 哈希
  const md5Hex = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.MD5,
    source,
  );

  // 2. 构造明文 (Seed 固定为 12)
  const seed = 12;
  const encodedMd5 = encodeURIComponent(md5Hex);
  const plain = new Uint8Array(2 + encodedMd5.length);
  plain[0] = seed;
  plain[1] = 0x00;
  for (let i = 0; i < encodedMd5.length; i++) {
    plain[2 + i] = encodedMd5.charCodeAt(i);
  }

  // 3. PKCS7 填充
  const pad = 16 - (plain.length % 16);
  const paddedPlain = new Uint8Array(plain.length + pad);
  paddedPlain.set(plain);
  for (let i = 0; i < pad; i++) {
    paddedPlain[plain.length + i] = pad;
  }

  // 4. SM4 CBC 加密
  const cipher = new Uint8Array(paddedPlain.length);
  const firstBlock = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    firstBlock[i] = paddedPlain[i] ^ KEY16[i] ^ 42;
  }

  let prev = encryptBlock(firstBlock);
  cipher.set(prev, 0);

  for (let i = 16; i < paddedPlain.length; i += 16) {
    const block = new Uint8Array(16);
    for (let j = 0; j < 16; j++) {
      block[j] = paddedPlain[i + j] ^ prev[j];
    }
    prev = encryptBlock(block);
    cipher.set(prev, i);
  }

  // 5. 自定义混淆编码
  return `2.0_${customEncode(cipher)}`;
};
