import {
  getSafeFeedbackMessage,
  MAX_BUSINESS_MESSAGE_LENGTH,
  SafeFeedbackError,
  sanitizeBusinessFeedback,
} from '../src/utils/safeFeedback';
import {
  describeZhihuError,
  getZhihuErrorCode,
  getZhihuErrorMessage,
  getZhihuErrorStatus,
} from '../src/utils/zhihuError';

const failedResponse = (message: unknown, status = 400) => ({
  response: { status, data: { error: { message } } },
});

test('retains short Chinese business guidance and bounded technical/numeric terms', () => {
  expect(
    getZhihuErrorMessage(failedResponse('内容不能少于 10 字，请补充后重试')),
  ).toBe('内容不能少于 10 字，请补充后重试');
  expect(
    sanitizeBusinessFeedback('图片不能超过 20 MB，请选择 JPG 或 PNG'),
  ).toBe('图片不能超过 20 MB，请选择 JPG 或 PNG');
  expect(
    getZhihuErrorMessage({
      response: { data: { message: '操作过于频繁，请稍后重试' } },
    }),
  ).toBe('操作过于频繁，请稍后重试');
});

test.each([
  '请求失败 https://example.invalid/signin?z_c0=synthetic-secret',
  '请求失败 example.invalid',
  '请求失败 file:///private/synthetic-auth.json',
  '请求失败 Cookie synthetic-secret',
  '请求失败 ｚ＿ｃ０ synthetic-secret',
  '请求失败 X-ZSE-96 synthetic-signature',
  '请求失败 bearer synthetic-secret',
  '请求失败 {"输入":"合成正文"}',
  '请求失败 [合成正文]',
  `请求失败 ${'a'.repeat(32)}`,
  '请求失败 12345678901234567890',
  '请求失败 1234 1234 1234 1234',
  '验证码 1234 已失效',
  '请求失败 abc123',
  '请求失败 合成\u202e正文',
  '请求失败 <原始正文>',
])(
  'rejects echoed diagnostics or unlabelled identifiers before display: %s',
  (message) => {
    expect(sanitizeBusinessFeedback(message)).toBeNull();
    expect(getZhihuErrorMessage(failedResponse(message))).toBe(
      '请求参数无效，请检查后重试',
    );
  },
);

test('validates the entire server message before truncating it', () => {
  const prose = '请稍后重试。'.repeat(30);
  const safe = sanitizeBusinessFeedback(prose);
  expect(safe?.endsWith('…')).toBe(true);
  expect(Array.from(safe ?? '')).toHaveLength(MAX_BUSINESS_MESSAGE_LENGTH);
  expect(
    sanitizeBusinessFeedback(`${prose} Cookie synthetic-secret`),
  ).toBeNull();
});

test.each([
  new Error(
    'Cookie=z_c0=synthetic-secret; failed native file:///private/auth.json',
  ),
  new Error('纯中文原始输入片段也不作为未知本地异常直接展示'),
  {
    message: '错误输入合成正文',
    request: { _response: 'synthetic transport detail' },
  },
  'synthetic raw exception',
])('unknown local/native exception messages use fixed feedback', (error) => {
  expect(getZhihuErrorMessage(error)).toBe('操作失败，请稍后重试');
});

test.each([
  [
    { code: 'ECONNABORTED', message: 'synthetic-private' },
    '请求超时，请检查网络后重试',
  ],
  [{ code: 'ERR_CANCELED', message: 'synthetic-private' }, '操作已取消'],
  [{ __CANCEL__: true, message: 'synthetic-private' }, '操作已取消'],
  [{ name: 'AbortError', message: 'synthetic-private' }, '操作已取消'],
  [
    {
      code: 'ERR_NETWORK',
      request: { _response: 'Network is unreachable: synthetic host' },
    },
    '当前设备似乎已离线，请检查网络',
  ],
  [
    {
      code: 'ERR_NETWORK',
      request: { _response: 'Unable to resolve host synthetic.invalid' },
    },
    '域名解析失败，请检查 DNS 或代理设置',
  ],
  [
    {
      code: 'ERR_NETWORK',
      message: 'Certificate rejected for synthetic.invalid',
    },
    '安全连接建立失败，请检查代理或证书设置',
  ],
  [{ code: 'ERR_NETWORK' }, '网络连接失败，请检查网络后重试'],
])('preserves safe transport and cancellation categories', (error, message) => {
  expect(getZhihuErrorMessage(error)).toBe(message);
});

test('application-owned error codes retain useful feedback without trusting mutable text', () => {
  const error = new SafeFeedbackError('image-expired');
  error.message = 'Cookie synthetic-secret';
  expect(getSafeFeedbackMessage(error)).toBe('图片上传凭证已过期，请重新上传');
  expect(getZhihuErrorMessage(error)).toBe('图片上传凭证已过期，请重新上传');
  expect(
    getSafeFeedbackMessage({ code: 'image-expired', message: error.message }),
  ).toBeNull();
});

test.each([NaN, Infinity, -1, 0, 600, 403.5, '403'])(
  'ignores malformed HTTP status %s',
  (status) => {
    expect(getZhihuErrorStatus({ response: { status } })).toBeUndefined();
  },
);

test('names Zhihu risk control instead of a generic permission error', () => {
  // The real message ends in a trace ID; this one is synthetic.
  const riskControl = {
    response: {
      status: 403,
      data: {
        error: {
          code: 40362,
          message: `您当前请求存在异常，暂时限制本次访问。${'0'.repeat(32)}`,
        },
      },
    },
  };
  expect(getZhihuErrorCode(riskControl)).toBe(40362);
  expect(getZhihuErrorMessage(riskControl)).toBe(
    '知乎暂时限制了本次访问，请稍后重试',
  );
  expect(describeZhihuError(riskControl)).toBe(
    '知乎暂时限制了本次访问，请稍后重试（HTTP 403 · 错误码 40362）',
  );
});

test('describes a failure by its safe message and whatever identifies it', () => {
  expect(describeZhihuError(undefined)).toBeUndefined();
  expect(describeZhihuError(failedResponse('内容不存在', 404))).toBe(
    '内容不存在（HTTP 404）',
  );
  expect(
    describeZhihuError({
      response: { status: 500, data: { error: { code: 'x' } } },
    }),
  ).toBe('知乎服务暂时不可用，请稍后重试（HTTP 500）');
  expect(describeZhihuError({ code: 'ERR_NETWORK' })).toBe(
    '网络连接失败，请检查网络后重试',
  );
});
