import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeZhihuHtmlForEnriched } from '../normalization/normalizeZhihuHtml.ts';

test('lowers common Zhihu markup to one canonical enriched HTML document', () => {
  const result = normalizeZhihuHtmlForEnriched(`
    <div class="RichContent-inner">
      <p>第一段 <strong>粗体</strong> 和 <em>斜体</em>。</p>
      <p>第二段 <mark>知识点</mark>。</p>
      <pre>const answer = 42;</pre>
    </div>
  `);

  assert.equal(
    result.html,
    '<html><p>第一段 <b>粗体</b> 和 <i>斜体</i>。</p><p>第二段 <u>知识点</u>。</p><codeblock>const answer = 42;</codeblock></html>',
  );
  assert.deepEqual(result.diagnostics, []);
});

test('drops formatting whitespace around blocks but preserves inline spaces', () => {
  const result = normalizeZhihuHtmlForEnriched(`
    <section>
      <h4>小标题</h4>
      <p><b>保留</b> <i>行内空格</i></p>
      <ul>
        <li>第一项</li>
        <li>第二项</li>
      </ul>
    </section>
  `);

  assert.equal(
    result.html,
    '<html><h4>小标题</h4><p><b>保留</b> <i>行内空格</i></p><ul><li>第一项</li><li>第二项</li></ul></html>',
  );
});

test('keeps eeimg=1 inline and records eeimg=2 as a block fallback', () => {
  const result = normalizeZhihuHtmlForEnriched(
    '<p>文字<img eeimg="1" data-actualsrc="//www.zhihu.com/equation?tex=x" data-rawwidth="60" data-rawheight="24">后续</p>' +
      '<img eeimg="2" src="https://www.zhihu.com/equation?tex=y" width="600" height="240">',
    { maxImageWidth: 300 },
  );

  assert.match(
    result.html,
    /文字<img src="https:\/\/www\.zhihu\.com\/equation\?tex=x" width="60" height="24">后续/,
  );
  assert.match(result.html, /width="300" height="120"/);
  assert.equal(result.inlineImageCount, 1);
  assert.equal(result.blockImageCount, 1);
  assert.deepEqual(result.diagnostics, [
    { kind: 'block-image', source: 'img' },
  ]);
});

test('uses the existing renderer formula size fallback when dimensions are absent', () => {
  const result = normalizeZhihuHtmlForEnriched(
    '<p><img eeimg="1" src="https://www.zhihu.com/equation?tex=Ax" alt="Ax"></p>' +
      '<img eeimg="2" src="https://www.zhihu.com/equation?tex=matrix" alt="matrix">',
    { maxImageWidth: 300 },
  );

  assert.match(result.html, /tex=Ax" width="40" height="22"/);
  assert.match(result.html, /tex=matrix" width="300" height="60"/);
});

test('strips executable markup and rejects dangerous URLs', () => {
  const result = normalizeZhihuHtmlForEnriched(
    '<p><a href="javascript:alert(1)">危险链接</a>' +
      '<img src="data:text/html,boom" alt="危险图"></p>' +
      '<script>stealCookies()</script><iframe src="https://example.com"></iframe>',
  );

  assert.doesNotMatch(result.html, /javascript:|data:text|stealCookies/);
  assert.match(result.html, /危险链接/);
  assert.match(result.html, /\[图片：危险图\]/);
  assert.match(result.html, /\[嵌入内容\]/);
  assert.deepEqual(
    result.diagnostics.map(({ kind }) => kind),
    ['unsafe-url', 'unsafe-url', 'embedded-media', 'embedded-media'],
  );
});

test('preserves a visible title for editor-only link cards', () => {
  const result = normalizeZhihuHtmlForEnriched(
    '<a data-draft-type="link-card" data-draft-title="一个问题" href="/question/42"></a>',
  );

  assert.equal(
    result.html,
    '<html><a href="https://www.zhihu.com/question/42">一个问题</a></html>',
  );
});

test('unwraps unsupported text tags while reporting the fallback', () => {
  const result = normalizeZhihuHtmlForEnriched(
    '<p>before <ruby>漢<rt>kan</rt></ruby> after</p>',
  );

  assert.equal(result.html, '<html><p>before 漢kan after</p></html>');
  assert.deepEqual(result.diagnostics, [
    { kind: 'unsupported-tag', source: 'rt' },
    { kind: 'unsupported-tag', source: 'ruby' },
  ]);
});
