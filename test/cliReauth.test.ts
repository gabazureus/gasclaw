// Credencial expirada não é falha passageira: repetir não conserta.
//
// Numa publicação real o `clasp` devolveu `invalid_grant` / `invalid_rapt` — o Workspace exige
// reautenticação periódica para escopos sensíveis. O `pull_into` tentou TRÊS vezes, esperou 3 s entre elas,
// e terminou com uma mensagem que não dizia o que fazer. Nove segundos para chegar a lugar nenhum, e a pessoa
// ainda sem saber que o cofre do clasp é SEPARADO do cofre do gcloud: entrar num não renova o outro.
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

/** Roda `pull_into` com um `clasp_` falso que sempre falha com a saída pedida. */
function pull(saidaDoClasp: string): { out: string; code: number; tentativas: number } {
  const dir = mkdtempSync(join(tmpdir(), 'gasclaw-reauth-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'gasclaw'), DEFS);
  writeFileSync(join(dir, 'gasclaw.env'), '');
  const script = `
    source ./gasclaw
    clasp_() { printf '%s\\n' ${JSON.stringify(saidaDoClasp)} >&2; printf 'x' >> tentativas; return 1; }
    pull_into alvo
  `;
  try {
    const out = execFileSync('bash', ['-c', script], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...baseEnv(), HOME: dir } });
    return { out, code: 0, tentativas: contar(dir) };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    return { out: `${err.stdout ?? ''}${err.stderr ?? ''}`, code: err.status ?? 1, tentativas: contar(dir) };
  }
}
const contar = (dir: string) => {
  try {
    return readFileSync(join(dir, 'tentativas'), 'utf8').length;
  } catch {
    return 0;
  }
};

describe('pull do clasp: distinguir rede de credencial', () => {
  test('erro de rede continua tentando três vezes', () => {
    const r = pull('socket hang up');
    expect(r.tentativas).toBe(3);
    expect(r.code).not.toBe(0);
  });

  test('invalid_grant para na PRIMEIRA: repetir não renova credencial', () => {
    const r = pull('{"error":"invalid_grant","error_description":"reauth related error (invalid_rapt)"}');
    expect(r.tentativas).toBe(1);
  });

  test('e diz o comando que resolve, e que o cofre do clasp é outro', () => {
    const r = pull('{"error":"invalid_grant","error_subtype":"invalid_rapt"}');
    expect(r.out).toContain('npx clasp login');
    expect(r.out).toMatch(/separate|gcloud/i); // a confusão é achar que `gcloud auth login` resolve
  });

  test('401 e Unauthorized recebem o mesmo tratamento', () => {
    for (const saida of ['Request failed with status code 401', 'Unauthorized']) {
      expect(pull(saida).tentativas).toBe(1);
    }
  });
});
