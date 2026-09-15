import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, expect, test } from 'vitest';

const GLOBALS = ['doGet', 'onMessage', 'onCardClick', 'onAddToSpace', 'onRemoveFromSpace', 'settingsState', 'saveKey', 'addAgent', 'createAgent', 'removeAgent', 'makeDefault', 'testAgent', 'setRuntimeEnabled', 'pocUrlFetchTimeout', 'chatSend', 'chatClick', 'drainRuns', 'limitsPanel'];

// O teste nunca escreve em dist/: o deploy publica o dist/ e um npm test paralelo não pode trocá-lo antes do push.
const OUT = mkdtempSync(join(tmpdir(), 'gasclaw-build-'));
const distBefore = existsSync('dist/_motor.js') ? statSync('dist/_motor.js').mtimeMs : null;

beforeAll(() => {
  execSync('node build.mjs', { stdio: 'pipe', env: { ...process.env, OUT_DIR: OUT } });
});

test('build gera um único motor _motor.js com stubs globais para triggers do Chat, web app e tela', () => {
  const code = readFileSync(join(OUT, '_motor.js'), 'utf8');
  expect(code.split('\n')[0]).toMatch(/^\/\/ gasclaw · MOTOR · NÃO EDITE/);
  expect(code).toContain('var gasclaw');
  for (const n of GLOBALS) expect(code).toContain(`function ${n}(...a) { return gasclaw.${n}(...a); }`);
  expect(readFileSync(join(OUT, 'settings.html'), 'utf8')).toContain('google.script.run');
  expect(readFileSync(join(OUT, 'appsscript.json'), 'utf8')).toContain('"chat"');
});

test('saída tem só o motor, as telas e o manifesto (sem sobras como Code.js)', () => {
  expect(readdirSync(OUT).sort()).toEqual(['_motor.js', 'appsscript.json', 'chat.html', 'settings.html']);
  expect(existsSync(join(OUT, 'Code.js'))).toBe(false);
});

test('o teste do build não toca o dist/ que o deploy publica', () => {
  expect(existsSync('dist/_motor.js') ? statSync('dist/_motor.js').mtimeMs : null).toBe(distBefore);
});
