import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));

/** Minimal tool-only loader for the same TypeScript and @/ imports as the app. */
export function createTypeScriptRequire(moduleUrl) {
  const require = createRequire(moduleUrl);
  const ts = require('typescript');
  require.extensions['.ts'] = (module, filename) => {
    const originalRequire = module.require.bind(module);
    module.require = (specifier) =>
      originalRequire(
        specifier.startsWith('@/')
          ? path.join(repositoryRoot, specifier.slice(2))
          : specifier,
      );
    const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    });
    module._compile(outputText, filename);
  };
  return require;
}
