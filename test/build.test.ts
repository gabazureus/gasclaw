import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const GLOBALS = ['doGet', 'onMessage', 'onAddToSpace', 'onRemoveFromSpace', 'settingsState', 'saveKey', 'addAgent', 'removeAgent', 'makeDefault', 'testAgent', 'setRuntimeEnabled', 'pocUrlFetchTimeout'];

test('build gera Code.js com stubs globais para triggers do Chat, web app e tela', () => {
  execSync('node build.mjs', { stdio: 'pipe' });
  const code = readFileSync('dist/Code.js', 'utf8');
  expect(code).toContain('var gasclaw');
  for (const n of GLOBALS) expect(code).toContain(`function ${n}(...a) { return gasclaw.${n}(...a); }`);
  expect(readFileSync('dist/settings.html', 'utf8')).toContain('google.script.run');
  expect(readFileSync('dist/appsscript.json', 'utf8')).toContain('"chat"');
});
