import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, expect, test } from 'vitest';
import { baseEnv } from './cliEnv';

const GLOBALS = ['doGet', 'onMessage', 'onCardClick', 'onAddToSpace', 'onRemoveFromSpace', 'settingsState', 'saveKey', 'addAgent', 'createAgent', 'removeAgent', 'makeDefault', 'testAgent', 'setRuntimeEnabled', 'pocUrlFetchTimeout', 'chatSend', 'chatClick', 'drainRuns', 'limitsPanel', 'panelsState'];

// O teste nunca escreve em dist/: o deploy publica o dist/ e um npm test paralelo não pode trocá-lo antes do push.
const OUT = mkdtempSync(join(tmpdir(), 'gasclaw-build-'));
const distBefore = existsSync('dist/_motor.js') ? statSync('dist/_motor.js').mtimeMs : null;

beforeAll(() => {
  execSync('node build.mjs', { stdio: 'pipe', env: { ...baseEnv(), OUT_DIR: OUT } });
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
  expect(readdirSync(OUT).sort()).toEqual(['_motor.js', 'appsscript.json', 'chat.html', 'hub.html', 'settings.html']);
  expect(existsSync(join(OUT, 'Code.js'))).toBe(false);
});

// P21: o painel sabe em que ambiente está e onde fica o irmão porque o build embute os dois — sem chamada em runtime.
test('o build embute o ambiente e a URL do painel irmão', () => {
  const out = mkdtempSync(join(tmpdir(), 'gasclaw-build-env-'));
  const sibling = 'https://script.google.com/a/macros/x.com/s/IRMAO/exec';
  execSync('node build.mjs', { stdio: 'pipe', env: { ...baseEnv(), OUT_DIR: out, GASCLAW_ENV: 'dev', SIBLING_URL: sibling } });
  const code = readFileSync(join(out, '_motor.js'), 'utf8');
  expect(code).toContain(sibling);
  // o ambiente precisa vir da substituição do build, não de uma string qualquer que já exista no bundle:
  // um build sem GASCLAW_ENV tem que gerar um motor diferente deste.
  const neutro = mkdtempSync(join(tmpdir(), 'gasclaw-build-sem-env-'));
  execSync('node build.mjs', { stdio: 'pipe', env: { ...baseEnv(), OUT_DIR: neutro, GASCLAW_ENV: '', SIBLING_URL: '' } });
  const semEnv = readFileSync(join(neutro, '_motor.js'), 'utf8');
  expect(semEnv).not.toContain(sibling);
  expect(semEnv).not.toBe(code);
});

test('o teste do build não toca o dist/ que o deploy publica', () => {
  expect(existsSync('dist/_motor.js') ? statSync('dist/_motor.js').mtimeMs : null).toBe(distBefore);
});
