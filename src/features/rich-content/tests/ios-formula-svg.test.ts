import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Exercise the production Swift implementation from the rich-content test
// suite without adding an iOS-only test target. Other platforms still run the
// document/attachment fixture tests and skip this CoreSVG compatibility check.
// macOS developers without the Swift toolchain can run the other tests too.
const hasSwiftCompiler =
  process.platform === 'darwin' &&
  spawnSync('xcrun', ['--find', 'swiftc'], { stdio: 'ignore', timeout: 5_000 })
    .status === 0;
const testOnMac = hasSwiftCompiler ? test : test.skip;

testOnMac(
  'preserves MathJax glyph geometry for paired and self-closing SVG references',
  () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'formula-svg-test-'));
    try {
      const implementation = path.resolve(
        __dirname,
        '../../../../modules/zhihu-rich-text/ios/FormulaSVGCompatibility.swift',
      );
      const source = `<svg xmlns:xlink="http://www.w3.org/1999/xlink" style="vertical-align: -0.838ex" viewBox="0 -1150.1 13173.1 1510.9"><use transform="scale(0.707)" xlink:href="#glyph" x="60" y="10"></use><use xlink:href="#glyph" x="60" y="10" transform="scale(0.5)"/><use data-label="文字 transform='scale(2)'" xlink:href="#glyph"/></svg>`;
      const input = path.join(directory, 'input.svg');
      const harness = path.join(directory, 'main.swift');
      const executable = path.join(directory, 'normalize');
      writeFileSync(input, source);
      writeFileSync(
        harness,
        `import Foundation\nlet input = try String(contentsOfFile: CommandLine.arguments[1], encoding: .utf8)\nprint(normalizeFormulaSVGTransforms(input))\n`,
      );
      execFileSync('xcrun', [
        'swiftc',
        '-module-cache-path',
        path.join(directory, 'cache'),
        implementation,
        harness,
        '-o',
        executable,
      ]);
      const output = execFileSync(executable, [input], { encoding: 'utf8' });

      expect(source).toMatch(/<use transform="scale\(0\.707\)"[^>]*><\/use>/);
      expect(output).toMatch(
        /<g transform="scale\(0\.707\)"><use xlink:href="#[^"]+"[^>]*><\/use><\/g>/,
      );
      expect(output).toContain(
        '<g transform="scale(0.707)"><use xlink:href="#glyph" x="60" y="10"></use></g>',
      );
      expect(output).toContain(
        '<g transform="scale(0.5)"><use xlink:href="#glyph" x="60" y="10"/></g>',
      );
      expect(output).toContain(
        `<use data-label="文字 transform='scale(2)'" xlink:href="#glyph"/>`,
      );
      expect(output.match(/<use\b/g)).toHaveLength(3);
      expect(output).toContain('vertical-align: -0.838ex');
      expect(output).toContain('viewBox="0 -1150.1 13173.1 1510.9"');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
  30_000,
);
