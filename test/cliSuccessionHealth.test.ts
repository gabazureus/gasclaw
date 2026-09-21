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
