// Os dois bloqueadores que impediam QUALQUER instalação nova de terminar — encontrados num teste real de
// instalação no Windows, mas nenhum deles é específico de Windows: derrubavam macOS e Linux igual.
//
// Este arquivo existe porque os dois passaram por 1070 testes verdes. Nenhum deles era detectável sem
// executar o script numa máquina que ainda não tinha nada.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { baseEnv } from './cliEnv';

const FULL = readFileSync('gasclaw', 'utf8');
const LINES = FULL.split('\n');
const DEFS = LINES.slice(0, LINES.findIndex((l) => l.startsWith('case "$CMD" in'))).join('\n');

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** Roda um trecho com as definições do gasclaw carregadas, num diretório descartável. */
function sh(snippet: string, env: Record<string, string> = {}): { out: string; code: number } {
  const dir = mkdtempSync(join(tmpdir(), 'gasclaw-novo-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'gasclaw'), DEFS);
  writeFileSync(join(dir, 'gasclaw.env'), '');
  mkdirSync(join(dir, 'dist'), { recursive: true });
  try {
    const out = execFileSync('bash', ['-c', `source ./gasclaw; ${snippet}`], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...baseEnv(), ...env, HOME: dir },
    });
    return { out, code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    return { out: `${err.stdout ?? ''}${err.stderr ?? ''}`, code: err.status ?? 1 };
  }
}

// B2: numa instalação nova o script remoto não tem `agentes/`, então `dist/agentes` não existe. O `find`
// saía != 0, o `pipefail` propagava e o `set -e` matava o `./gasclaw up` SEM IMPRIMIR NADA — o log parava
// em "build (right before the push)" e o terminal devolvia o prompt. Indistinguível de "ainda processando".
describe('instalação nova: contar arquivos do editor quando não há nenhum', () => {
  test('a contagem devolve zero em vez de matar o script', () => {
    const r = sh('n=$( { find dist/agentes -type f 2>/dev/null || true; } | wc -l | tr -d " "); echo "n=$n"');
    expect(r.code).toBe(0);
    expect(r.out).toContain('n=0');
  });

  // A forma ANTIGA, para o teste acima não virar tautologia: se esta parar de morrer, a guarda virou inútil.
  test('sem a guarda, a mesma linha mata o script em silêncio (era o defeito)', () => {
    const r = sh('n=$(find dist/agentes -type f 2>/dev/null | wc -l | tr -d " "); echo "n=$n"');
    expect(r.code).not.toBe(0);
    expect(r.out).not.toContain('n=0');
  });
});

// A CLASSE do B2, que é maior que a linha: sob `set -euo pipefail` qualquer comando != 0 fora de um
// `if`/`||` mata o processo. Sem um trap, isso acontece calado.
describe('nenhuma saída pode ser silenciosa', () => {
  test('falha não tratada imprime linha e código', () => {
    const r = sh('false; echo "não deve chegar aqui"');
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/stopped unexpectedly/);
    expect(r.out).not.toContain('não deve chegar aqui');
  });

  test('fala UMA vez, mesmo quando a falha é dentro de $( )', () => {
    const r = sh('n=$( { false; } | wc -l ); echo "$n"');
    expect(r.out.match(/stopped unexpectedly/g) ?? []).toHaveLength(1);
  });

  test('o caminho feliz continua mudo: `||`, `if !` e `|| true` não disparam o aviso', () => {
    const r = sh('false || true; if ! false; then :; fi; grep -q x /dev/null || :; echo pronto');
    expect(r.code).toBe(0);
    expect(r.out).toContain('pronto');
    expect(r.out).not.toMatch(/stopped unexpectedly/);
  });
});

// B1: o `gasclaw` carrega o `gasclaw.env` com `set -a`, então ACCOUNT_KIND vira variável EXPORTADA. Quando
// a suíte roda de dentro do `./gasclaw up`, o estado da máquina vencia o fixture e seis testes falhavam —
// abortando o deploy numa instalação que estava correta.
describe('o ambiente de teste não enxerga o estado da máquina', () => {
  test('ACCOUNT_KIND exportado não vaza para dentro do bash do teste', () => {
    const anterior = process.env.ACCOUNT_KIND;
    process.env.ACCOUNT_KIND = 'workspace';
    try {
      expect(sh('printf "[%s]" "${ACCOUNT_KIND:-vazio}"').out).toContain('[vazio]');
    } finally {
      if (anterior === undefined) delete process.env.ACCOUNT_KIND;
      else process.env.ACCOUNT_KIND = anterior;
    }
  });

  test('o que o próprio teste passa continua valendo (GASCLAW_OS é usado de propósito)', () => {
    expect(sh('printf "%s" "$(os_kind)"', { GASCLAW_OS: 'Linux' }).out).toBe('linux');
  });
});

// Uma POC que REPROVA não é um travamento — e a ferramenta estava dizendo que era.
//
// O resultado válido saía acompanhado de "gasclaw stopped unexpectedly", DUAS vezes. Isso corrompe a
// medição pelo lado psicológico, que é o mais difícil de detectar: quem mede passa a duvidar do próprio
// número em vez de acreditar nele — e o projeto inteiro depende de tratar critério reprovado como
// entrega, não como defeito.
//
// O conserto foi encontrado EXECUTANDO o comando real, não deduzindo: com `set +e` sozinho a mensagem de
// travamento continuou saindo (duas vezes, inclusive), e só sumiu com `trap - ERR` antes do comando que
// falha mais `exit` em vez de `return`. Não afirmo aqui a regra de bash que explica isso — tentei escrever
// esse teste duas vezes e errei a condição nas duas. O que este arquivo prende é a FORMA do conserto no
// artefato real; o comportamento foi conferido rodando `./gasclaw poc p24 key` (reprova) e
// `./gasclaw poc p24 guard` (passa), e só o primeiro imprime o aviso.
describe('POC reprovada não se parece com travamento', () => {
  test('o comando de POC sai com o código do critério e sem mensagem de travamento', () => {
    const fonte = readFileSync('gasclaw', 'utf8');
    const bloco = fonte.slice(fonte.indexOf('cmd_poc()'), fonte.indexOf('jsfield()'));
    expect(bloco).toContain('trap - ERR'); // antes do comando que falha, não depois
    expect(bloco.indexOf('trap - ERR')).toBeLessThan(bloco.indexOf('node -e'));
    expect(bloco).toContain('exit "$code"'); // `return` dispararia o trap no chamador e de novo no `case`
    expect(bloco).toMatch(/MEASUREMENT RESULT, not a crash/);
  });
});
