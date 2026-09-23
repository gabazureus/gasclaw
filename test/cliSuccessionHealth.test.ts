// O resumo que `./gasclaw succession health` imprime no fim. Depois da coroa vale o painel do sucessor
// (opção A do dono, F9): o health 10/10 de um coroado com capacidades DIFERENTES do pai não pode dizer que
// ele responde "com as configurações deste motor" — era isso que a CLI imprimia no dev real.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { baseEnv } from './cliEnv';

const LINES = readFileSync('gasclaw', 'utf8').split('\n');
const DEFS = LINES.slice(0, LINES.findIndex((l) => l.startsWith('case "$CMD" in'))).join('\n');
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function health(json: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'gasclaw-health-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'gasclaw'), DEFS);
  writeFileSync(join(dir, 'gasclaw.env'), '');
  return execFileSync('bash', ['-c', `source ./gasclaw; succession_health`], { cwd: dir, encoding: 'utf8', input: JSON.stringify(json), env: { ...baseEnv(), HOME: dir } });
}

const check = (id: string, ok: boolean, detail: string) => ({ id, label: id, ok, detail });

describe('succession health: o resumo do coroado não mente sobre as configurações', () => {
  test('coroado saudável com CAP diferente do pai: não diz que tem as configurações deste motor', () => {
    const out = health({ ok: true, crowned: true, checks: [check('settings', true, 'CAP differ from this engine (this engine has succeed; the successor has dream, initiative, succeed, create): after the crown, the successor\'s panel is the one that counts')] });
    expect(out).toContain('healthy');
    expect(out).not.toContain('settings of this engine');
    expect(out).toContain("its own panel");
  });

  test('antes da coroa, o resumo continua o da coroa', () => {
    expect(health({ ok: true, crowned: false, checks: [check('paused', true, 'paused')] })).toContain('ready: crown it in the panel');
  });
});

// GASCLAW_ENGINE_URL (F9): nenhum teste segurava as travas (auditoria 2026-09-21, mutação). O script inteiro
// roda num diretório descartável; as travas vêm antes de qualquer rede.
const FULL = readFileSync('gasclaw', 'utf8');
function run(args: string[], engineUrl: string): { out: string; code: number } {
  const dir = mkdtempSync(join(tmpdir(), 'gasclaw-engine-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'gasclaw'), FULL);
  writeFileSync(join(dir, 'gasclaw.env'), '');
  try {
    const out = execFileSync('bash', ['./gasclaw', ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...baseEnv(), HOME: dir, GASCLAW_ENGINE_URL: engineUrl } });
    return { out, code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    return { out: `${err.stdout ?? ''}${err.stderr ?? ''}`, code: err.status ?? 1 };
  }
}
function sourced(snippet: string, engineUrl: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'gasclaw-engine-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'gasclaw'), DEFS);
  writeFileSync(join(dir, 'gasclaw.env'), '');
  return execFileSync('bash', ['-c', `source ./gasclaw; ${snippet}`], { cwd: dir, encoding: 'utf8', env: { ...baseEnv(), HOME: dir, GASCLAW_ENGINE_URL: engineUrl } });
}
const OK_URL = 'https://script.google.com/macros/s/AKfyc_1-x/exec';

describe('GASCLAW_ENGINE_URL: as travas da CLI', () => {
  // `ci` faltava na lista (auditoria de 2026-09-23): ele chama `publish`, que IMPRIME a URL do motor
  // APONTADO como se fosse a que acabou de ser publicada — a leitura errada mais cara que a CLI tem.
  test.each(['up', 'down', 'restart', 'ship', 'ci', 'rollback'])('%s recusa enquanto ela aponta para outro motor', (cmd) => {
    const r = run([cmd], OK_URL);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain(`unset GASCLAW_ENGINE_URL first: ${cmd}`);
  });
  test('uma URL que não é web app do Apps Script é recusada (o token do Google iria nela)', () => {
    const r = run(['help'], 'https://evil.example.com/macros/s/x/exec');
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('must be an Apps Script web app URL');
  });
  // `grep -qE '^…$'` casa QUALQUER LINHA: uma URL válida com uma segunda linha colada passava na validação.
  test('URL com quebra de linha embutida é recusada, mesmo com a primeira linha válida', () => {
    const r = run(['help'], `${OK_URL}\nhttps://evil.example.com/x`);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/GASCLAW_ENGINE_URL/);
  });

  test('as formas reais passam: /a/macros/<domínio>/ e /dev', () => {
    expect(run(['help'], 'https://script.google.com/a/macros/example.com/s/AKfyc_1-x/dev').code).toBe(0);
    expect(run(['help'], OK_URL).code).toBe(0);
  });
  test('com ela definida, as chamadas vão para ela', () => {
    expect(sourced('url', OK_URL)).toBe(OK_URL);
  });
  test('poc registra o segredo da CLI no motor apontado antes de chamar', () => {
    expect(sourced('ensure_cli_secret() { echo SECRET-REGISTERED; exit 0; }; cmd_poc p36 status', OK_URL)).toContain('SECRET-REGISTERED');
  });
});
