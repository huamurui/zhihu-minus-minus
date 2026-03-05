import { decryptConf, encryptConf } from './config';

/**
 * LAESUtils - 移植自 zhihu_zse_96 项目
 * 基于自定义 AES 算法的加密/解密工具类
 */
export class LAESUtils {
  private encryptConf: any;
  private decryptConf: any;
  private isDebug: boolean;

  constructor(isDebug = false) {
    this.encryptConf = encryptConf;
    this.decryptConf = decryptConf;
    this.isDebug = isDebug;
  }

  private logDebug(messages: any) {
    if (this.isDebug) {
      console.log(messages);
    }
  }

  static hexToBytes(hexStr: string): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < hexStr.length; i += 2) {
      bytes.push(parseInt(hexStr.substr(i, 2), 16));
    }
    return bytes;
  }

  static bytesToHex(byteArray: number[]): string {
    return byteArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  static padData(data: number[]): number[] {
    const blockSize = 16;
    const paddingLen = blockSize - (data.length % blockSize);
    const fillBytes = [0xB9, 0xBA, 0xB8, 0xB3, 0xB1, 0xB2, 0xB0, 0xBF, 0xBD, 0xBE, 0xBC, 0xB7, 0xB5, 0xB6, 0xB4, 0x9B];
    const fillByte = fillBytes[paddingLen - 1];
    return [...data, ...Array(paddingLen).fill(fillByte)];
  }

  calculateAdjustedLength(data: number[] | Uint8Array, length: number): number {
    const threshold = 16;
    const byteIndex = length - 1;

    if (!(0 <= byteIndex && byteIndex < data.length)) {
      throw new Error("Index out of range");
    }

    const lastByteValue = data[byteIndex];

    if (lastByteValue <= threshold) {
      return length - lastByteValue;
    } else if (lastByteValue >= length) {
      return length;
    } else {
      return length - lastByteValue;
    }
  }

  transform(data: number[], lookupTable: any): number[] {
    const outputArr = new Array(data.length);
    for (let i = 0; i < data.length; i++) {
      if (data[i] < 0) {
        outputArr[i] = lookupTable[data[i] + 256];
      } else {
        outputArr[i] = lookupTable[data[i]];
      }
    }
    return outputArr;
  }

  textToMatrix(text: bigint): number[][] {
    const matrix: number[][] = [];
    for (let i = 0; i < 16; i++) {
      const shiftAmount = BigInt(8 * (15 - i));
      const byte = Number((text >> shiftAmount) & 0xFFn);
      if (i % 4 === 0) {
        matrix.push([byte]);
      } else {
        matrix[Math.floor(i / 4)].push(byte);
      }
    }
    return matrix;
  }

  stateToBytes(state: number[][]): number[] {
    return state.flat();
  }

  stateToHex(state: number[][]): string {
    return LAESUtils.bytesToHex(this.stateToBytes(state));
  }

  xorArrayTemplate(arr1: number[], arr2: number[], lookup: (p: number) => number): number[] {
    const result: number[] = [];
    for (let i = 0; i < arr1.length; i++) {
      const p1 = (arr2[i] & 0xF) ^ ((arr1[i] << 4) & 0xFF);
      const v1 = (lookup(p1) >> 4) & 0xFF;
      const p2 = ((arr2[i] >> 4) & 0xF) ^ ((arr1[i] >> 4) << 4);
      const v2 = (lookup(p2) >> 4) & 0xFF;
      result.push(v1 ^ (v2 << 4));
    }
    return result;
  }

  addRoundKeys(state: number[][], roundKey: number[][], lookup: (idx: number) => number): number[][] {
    return state.map((row, i) => this.xorArrayTemplate(row, roundKey[i], lookup));
  }

  subBytes(sBox: any, state1: number[][], state2: number[][]): number[][] {
    return state1.map((row, i) =>
      row.map((val, j) =>
        (sBox[state2[i][j] & 0xF ^ ((state1[i][j] << 4) & 0xFF)] >> 4 & 0xFF) ^
        ((sBox[(state2[i][j] >> 4 & 0xF) ^ ((state1[i][j] >> 4) << 4)] >> 4 & 0xFF) << 4)
      )
    );
  }

  shiftRows(sBox: any, state: number[][], state3: number[][]): number[][] {
    return state.map((row, i) =>
      row.map((val, j) =>
        (sBox[state3[i][j] & 0xF ^ ((state[i][j] << 4) & 0xFF)] >> 4 & 0xFF) ^
        ((sBox[(state3[i][j] >> 4 & 0xF) ^ ((state[i][j] >> 4) << 4)] >> 4 & 0xFF) << 4)
      )
    );
  }

  mixColumns(sBox: any, state: number[][], state4: number[][]): number[][] {
    return state.map((row, i) =>
      row.map((val, j) =>
        (sBox[state4[i][j] & 0xF ^ ((state[i][j] << 4) & 0xFF)] >> 4 & 0xFF) ^
        ((sBox[(state4[i][j] >> 4 & 0xF) ^ ((state[i][j] >> 4) << 4)] >> 4 & 0xFF) << 4)
      )
    );
  }

  buildKey(template: any, indices: number[], source: string): string {
    let result = '';
    for (const i of indices) {
      const byte = parseInt(source.substr(i, 2), 16);
      result += template[byte * 4];
    }
    return result;
  }

  encrypt(inputNum: bigint, mkeySchedule: number[][]): number[][] {
    const conf = this.encryptConf;
    const keySchedule = conf.key_schedule;
    const sBox = conf.s_box;
    const dict1 = conf.dict1;
    const dict2 = conf.dict2;
    const dict3 = conf.dict3;
    const dict4 = conf.dict4;
    const dict5 = conf.dict5;
    const roundConstants = conf.round_constants;

    let state = this.addRoundKeys(
      this.textToMatrix(inputNum),
      mkeySchedule.slice(0, 4),
      i => keySchedule[i]
    );

    const keyTemplates = [
      { template: dict1, indices: [0, 8, 16, 24] },
      { template: dict2, indices: [10, 18, 26, 2] },
      { template: dict3, indices: [20, 28, 4, 12] },
      { template: dict4, indices: [30, 6, 14, 22] },
    ];

    let states: number[][][] = [];
    for (const t of keyTemplates) {
      const newKey = this.buildKey(t.template, t.indices, this.stateToHex(state));
      states.push(this.textToMatrix(BigInt('0x' + newKey)));
    }

    for (let i = 1; i < 10; i++) {
      state = this.subBytes(sBox, states[0], states[1]);
      state = this.shiftRows(sBox, state, states[2]);
      state = this.mixColumns(sBox, state, states[3]);
      state = this.addRoundKeys(state, mkeySchedule.slice(4 * i, 4 * (i + 1)), i => sBox[i]);
      if (i !== 9) {
        states = [];
        for (const t of keyTemplates) {
          const newKey = this.buildKey(t.template, t.indices, this.stateToHex(state));
          states.push(this.textToMatrix(BigInt('0x' + newKey)));
        }
      }
    }

    const finalIndices = [0, 10, 20, 30, 8, 18, 28, 6, 16, 26, 4, 14, 24, 2, 12, 22];
    let newKey = '';
    for (const i of finalIndices) {
      const byte = parseInt(this.stateToHex(state).substr(i, 2), 16);
      newKey += dict5[byte];
    }

    state = this.textToMatrix(BigInt('0x' + newKey));
    state = this.addRoundKeys(state, mkeySchedule.slice(40, 44), i => roundConstants[i]);
    return state;
  }

  generateRoundKeys(keyString: string): string[] {
    const bytesData = LAESUtils.hexToBytes(keyString);
    const keyBytes = bytesData.slice(4).map((byte, idx) => byte ^ bytesData[(idx + 4) % 3]);
    const keyHex = LAESUtils.bytesToHex(keyBytes);
    const roundKeys: string[] = [];
    for (let i = 0; i < keyHex.length; i += 32) {
      roundKeys.push(keyHex.substr(i, 32));
    }
    return roundKeys;
  }

  transformIv(data: string | number[], arr: number[]): string {
    let byteData;
    if (typeof data === 'string') {
      byteData = new TextEncoder().encode(data);
    } else {
      byteData = new Uint8Array(data);
    }

    return this.transform(Array.from(byteData), arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  aesEncrypt(roundKeys: string[], inputHex: string, ivHex: string): string {
    const inputNum = BigInt('0x' + inputHex);
    const ivNum = BigInt('0x' + ivHex);
    const inputWithIv = inputNum ^ ivNum;
    const mkeySchedule: number[][] = [];
    for (const roundKey of roundKeys) {
      const bytesData = LAESUtils.hexToBytes(roundKey);
      for (let i = 0; i < bytesData.length; i += 4) {
        mkeySchedule.push(bytesData.slice(i, i + 4));
      }
    }

    const cipherState = this.encrypt(inputWithIv, mkeySchedule);
    const cipherText = this.stateToHex(cipherState);
    this.logDebug(`Encrypted: ${cipherText}`);
    return cipherText;
  }

  createEncryptor(key: string, iv: any, isBinaryOutput = false) {
    const conf = this.encryptConf;
    const ivHex = this.transformIv(iv, conf.iv_arr);
    const roundKeys = this.generateRoundKeys(key);

    return (inputData: string) => {
      const bytesData = LAESUtils.padData(
        this.transform(
          Array.from(new TextEncoder().encode(inputData)),
          conf.input_arr
        )
      );

      const inputHex = LAESUtils.bytesToHex(bytesData);
      const blocks: string[] = [];
      for (let i = 0; i < inputHex.length; i += 32) {
        blocks.push(inputHex.substr(i, 32));
      }

      const signatures: string[] = [];
      let currentIv = ivHex;
      for (const block of blocks) {
        const signature = this.aesEncrypt(roundKeys, block, currentIv);
        signatures.push(signature);
        currentIv = signature;
      }

      const finalBytes = LAESUtils.hexToBytes(signatures.join(''));
      const transformed = this.transform(finalBytes, conf.out_arr);

      if (isBinaryOutput) {
        return String.fromCharCode(...transformed);
      } else {
        // 使用 window.btoa 或自定义 base64 实现，因为 RN 没 Buffer
        return btoa(String.fromCharCode(...transformed));
      }
    };
  }
}