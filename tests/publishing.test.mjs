import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deserializePublishingHtml,
  serializePinText,
  serializePublishingMarkdown,
} from '../features/publishing/serializer.ts';

test('serializes the supported publishing Markdown blocks', () => {
  assert.equal(
    serializePublishingMarkdown(
      '# 标题\n\n普通 **粗体** 和 [链接](https://example.com)\n\n- 一\n- 二',
    ),
    '<h2>标题</h2><p>普通 <strong>粗体</strong> 和 <a href="https://example.com/">链接</a></p><ul><li>一</li><li>二</li></ul>',
  );
});

test('serializes uploaded images as Zhihu content images', () => {
  assert.equal(
    serializePublishingMarkdown(
      '图片如下：\n\n![封面](https://pic1.zhimg.com/example.png "1200x800")',
    ),
    '<p>图片如下：</p><p><img src="https://pic1.zhimg.com/example.png" alt="封面" data-caption="封面" data-size="normal" data-rawwidth="1200" data-rawheight="800" data-original-src="https://pic1.zhimg.com/example.png" /></p>',
  );
});

test('preserves uploaded image watermark metadata', () => {
  assert.equal(
    serializePublishingMarkdown(
      '![图](https://pic.example/rendered.jpg "1216x5384")',
      [
        {
          imageId: 'image-id',
          src: 'https://pic.example/rendered.jpg',
          originalSrc: 'https://pic.example/original.jpg',
          watermark: 'watermark',
          watermarkSrc: 'https://pic.example/watermarked.jpg',
          width: 1216,
          height: 5384,
        },
      ],
    ),
    '<p><img src="https://pic.example/rendered.jpg" alt="图" data-caption="图" data-size="normal" data-rawwidth="1216" data-rawheight="5384" data-watermark="watermark" data-watermark-src="https://pic.example/watermarked.jpg" data-private-watermark-src="" data-original-src="https://pic.example/original.jpg" /></p>',
  );
});

test('escapes HTML and rejects unsafe links', () => {
  assert.equal(
    serializePublishingMarkdown(
      '<script>alert(1)</script> [点我](javascript:unsafe)',
    ),
    '<p>&lt;script&gt;alert(1)&lt;/script&gt; 点我</p>',
  );
});

test('serializes fenced code without interpreting markup', () => {
  assert.equal(
    serializePublishingMarkdown('```ts\nconst value = "<safe>";\n```'),
    '<pre lang="ts">const value = &quot;&lt;safe&gt;&quot;;</pre>',
  );
});

test('serializes pin text without treating it as rich Markdown', () => {
  assert.equal(
    serializePinText('第一行 **不是粗体**\n\n<script>'),
    '<p>第一行 **不是粗体**</p><p><br></p><p>&lt;script&gt;</p>',
  );
});

test('deserializes editable answer HTML into the publishing Markdown subset', () => {
  assert.equal(
    deserializePublishingHtml(
      '<p>普通 <strong>粗体</strong> 和 <a href="https://example.com">链接</a></p><ul><li>一</li><li>二</li></ul>',
    ),
    '普通 **粗体** 和 [链接](https://example.com/)\n- 一\n- 二',
  );
});
