import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const GLOBALS = ['doGet', 'onMessage', 'onCardClick', 'onAddToSpace', 'onRemoveFromSpace', 'settingsState', 'saveKey', 'addAgent', 'createAgent', 'removeAgent', 'makeDefault', 'testAgent', 'setRuntimeEnabled', 'pocUrlFetchTimeout'];

test('build gera um único motor _motor.js com stubs globais para triggers do Chat, web app e tela', () => {
  execSync('node build.mjs', { stdio: 'pipe' });
  const code = readFileSync('dist/_motor.js', 'utf8');
  expect(code.split('\n')[0]).toMatch(/^\/\/ gasclaw · MOTOR · NÃO EDITE/);
  expect(code).toContain('var gasclaw');
  for (const n of GLOBALS) expect(code).toContain(`function ${n}(...a) { return gasclaw.${n}(...a); }`);
  expect(readFileSync('dist/settings.html', 'utf8')).toContain('google.script.run');
  expect(readFileSync('dist/appsscript.json', 'utf8')).toContain('"chat"');
});

test('dist tem só o motor, a tela e o manifesto (sem sobras como Code.js)', () => {
  execSync('node build.mjs', { stdio: 'pipe' });
  expect(readdirSync('dist').sort()).toEqual(['_motor.js', 'appsscript.json', 'settings.html']);
  expect(existsSync('dist/Code.js')).toBe(false);
});
