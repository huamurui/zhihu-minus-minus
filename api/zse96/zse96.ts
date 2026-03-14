// 预定义的密钥及替换表常量
const ZK = new Uint32Array([
  1170614578, 1024848638, 1413669199, 3951632832, 3528873006, 2921909214,
  4151847688, 3997739139, 1933479194, 3323781115, 3888513386, 460404854,
  3747539722, 2403641034, 2615871395, 2119585428, 2265697227, 2035090028,
  2773447226, 4289380121, 4217216195, 2200601443, 3051914490, 1579901135,
  1321810770, 456816404, 2903323407, 4065664991, 330002838, 3506006750,
  363569021, 2347096187,
]);

const ZB = new Uint8Array([
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
]);

const ALPHABET =
  '6fpLRqJO8M/c3jnYxFkUVC4ZIG12SiH=5v0mXDazWBTsuw7QetbKdoPyAl+hN9rgE';

// KEY16 -> *b"059053f7d15e01d7"
const KEY16 = new Uint8Array([
  0x30, 0x35, 0x39, 0x30, 0x35, 0x33, 0x66, 0x37, 0x64, 0x31, 0x35, 0x65, 0x30,
  0x31, 0x64, 0x37,
]);

// 相当于 Rust 中结合 is_unescaped 规则的手动 url encode
// JS 的 encodeURIComponent 所保留的免转义字符恰好与 Rust 代码规则一致[A-Z a-z 0-9 - _ . ! ~ * ' ( )]
function encodeUriComponent(input: string): number[] {
  const str = encodeURIComponent(input);
  const out = new Array<number>(str.length);
  for (let i = 0; i < str.length; i++) {
    out[i] = str.charCodeAt(i);
  }
  return out;
}

// 模拟读写大端 u32，无符号右移保障类型对齐
function readU32Be(b: Uint8Array, off: number): number {
  return (
    ((b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]) >>> 0
  );
}

function writeU32Be(v: number, out: Uint8Array, off: number): void {
  out[off] = (v >>> 24) & 0xff;
  out[off + 1] = (v >>> 16) & 0xff;
  out[off + 2] = (v >>> 8) & 0xff;
  out[off + 3] = v & 0xff;
}

function rotl(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

// SM4 算法核心非线性/线性变换操作
function gTransform(tt: number): number {
  const t0 = (tt >>> 24) & 0xff;
  const t1 = (tt >>> 16) & 0xff;
  const t2 = (tt >>> 8) & 0xff;
  const t3 = tt & 0xff;

  const b0 = ZB[t0];
  const b1 = ZB[t1];
  const b2 = ZB[t2];
  const b3 = ZB[t3];

  const ti = ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;

  return (ti ^ rotl(ti, 2) ^ rotl(ti, 10) ^ rotl(ti, 18) ^ rotl(ti, 24)) >>> 0;
}

// 加密一个数据块 (等同于魔改的 SM4 encrypt 块加密)
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

// CBC Mode 填充模式块操作
function xBlocks(data: Uint8Array, iv: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  let currentIv = new Uint8Array(iv);

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

// 自定义 Base64 编码变形版本
function customEncode(bytesArg: Uint8Array): string {
  const bytes = Array.from(bytesArg);
  while (bytes.length % 3 !== 0) {
    bytes.push(0);
  }

  let out = '';
  let i = 0;
  let p = bytes.length - 1;

  // Rust 中处理是自后往前，位操作在此一比一还原
  while (p >= 0) {
    let v = 0;

    const b0 = bytes[p];
    const m0 = (58 >>> (8 * (i % 4))) & 0xff;
    i++;
    v |= (b0 ^ m0) & 0xff;

    const b1 = bytes[p - 1];
    const m1 = (58 >>> (8 * (i % 4))) & 0xff;
    i++;
    v |= ((b1 ^ m1) & 0xff) << 8;

    const b2 = bytes[p - 2];
    const m2 = (58 >>> (8 * (i % 4))) & 0xff;
    i++;
    v |= ((b2 ^ m2) & 0xff) << 16;

    out += ALPHABET[v & 63];
    out += ALPHABET[(v >>> 6) & 63];
    out += ALPHABET[(v >>> 12) & 63];
    out += ALPHABET[(v >>> 18) & 63];

    p -= 3;
  }

  return out;
}

/**
 * 等价于 Rust 侧的核心方法
 * @param input 需要加密的字符串
 * @param nowMs 13 位毫秒级时间戳 (支持 number 或 bigint)
 * @returns 加密后的密文结果
 */
export function encryptZseV4(input: string, nowMs: number | bigint): string {
  // 等价于 Rust: now_ms.rem_euclid(127)
  const seed = Number(typeof nowMs === 'bigint' ? nowMs % 127n : nowMs % 127);
  const posSeed = seed < 0 ? seed + 127 : seed;

  const plainBytes = encodeUriComponent(input);
  const plain: number[] = [posSeed, 7];

  // 避免大数组在一些引擎触发 range error 用 loop 推入元素
  for (let j = 0; j < plainBytes.length; j++) {
    plain.push(plainBytes[j]);
  }

  // PKCS#7 块对齐填充
  const pad = 16 - (plain.length % 16);
  for (let j = 0; j < pad; j++) {
    plain.push(pad);
  }

  // 处理 Initial Block
  const first = new Uint8Array(16);
  for (let j = 0; j < 16; j++) {
    first[j] = plain[j] ^ KEY16[j] ^ 42;
  }

  const c0 = rBlock(first);

  const cipher = new Uint8Array(plain.length);
  cipher.set(c0, 0);

  // 多块时按 CBC 迭代执行加密
  if (plain.length > 16) {
    const remainingPlain = new Uint8Array(plain.slice(16));
    const encryptedRemaining = xBlocks(remainingPlain, c0);
    cipher.set(encryptedRemaining, 16);
  }

  return customEncode(cipher);
}
