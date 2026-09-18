import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';

// O `gasclaw` é um arquivo bash de 43 KB e NENHUM teste de vitest o executava: a suíte inteira olhava o TS,
// e a conta pessoal (Gmail) — a forma da URL do web app, o tipo de conta, o sistema operacional — mora só
// aqui. Um erro de quoting ou um `case` que não casa não aparece em nenhum outro teste deste repositório.
//
// Para chamar as funções sem disparar um comando, o arquivo é cortado ANTES do despacho final
// (`case "$CMD" in`) e o pedaço de cima é carregado com `source`. Nada é simulado: é o arquivo de verdade,
// com o `set -euo pipefail` dele. O corte é verificado abaixo — se o despacho mudar de forma, o teste falha
// em vez de passar a medir um arquivo vazio.

const FULL = readFileSync('gasclaw', 'utf8');
const LINES = FULL.split('\n');
const DISPATCH = LINES.findIndex((l) => l.startsWith('case "$CMD" in'));
const DEFS = LINES.slice(0, DISPATCH).join('\n');

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function sh(snippet: string, env: Record<string, string> = {}, envFile = ''): string {
  const dir = mkdtempSync(join(tmpdir(), 'gasclaw-cli-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'gasclaw'), DEFS);
  writeFileSync(join(dir, 'gasclaw.env'), envFile);
  return execFileSync('bash', ['-c', `source ./gasclaw; ${snippet}`], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ...env, HOME: dir },
  }).trim();
}

const envOf = (vars: Record<string, string>) =>
  Object.entries(vars)
    .map(([k, v]) => `${k}=${v}\n`)
    .join('');

describe('gasclaw (bash): o corte do arquivo é válido', () => {
  test('o despacho final existe e sobra código de verdade acima dele', () => {
    expect(DISPATCH).toBeGreaterThan(100);
    expect(DEFS).toContain('account_kind()');
    expect(DEFS).toContain('exec_url()');
  });
});

describe('tipo de conta: conta pessoal (Gmail) × Google Workspace', () => {
  test('o valor gravado em ACCOUNT_KIND manda', () => {
    expect(sh('account_kind', {}, envOf({ ACCOUNT: 'a@acme.com', ACCOUNT_KIND: 'personal' }))).toBe('personal');
    expect(sh('account_kind', {}, envOf({ ACCOUNT: 'a@gmail.com', ACCOUNT_KIND: 'workspace' }))).toBe('workspace');
  });

  test('sem ACCOUNT_KIND, deduz do e-mail', () => {
    expect(sh('account_kind', {}, envOf({ ACCOUNT: 'ana@gmail.com' }))).toBe('personal');
    expect(sh('account_kind', {}, envOf({ ACCOUNT: 'ana@googlemail.com' }))).toBe('personal');
    expect(sh('account_kind', {}, envOf({ ACCOUNT: 'ana@acme.com' }))).toBe('workspace');
  });

  test('sem conta nenhuma, o tipo é desconhecido — e NÃO "workspace"', () => {
    // Importa para o menu: "account not detected yet" em vez de afirmar um tipo que ninguém conferiu.
    expect(sh('account_kind', {}, '')).toBe('unknown');
  });

  // O gcloud devolve o e-mail como o Google guardou. Se vier com maiúscula, a dedução e a GRAVAÇÃO têm de
  // concordar: gravar `workspace` para um Gmail é o pior caso — o ACCOUNT_KIND passa a mandar (teste acima)
  // e toda chamada remota vai para a URL `/a/macros/gmail.com/`, que não existe.
  test('maiúscula no e-mail não muda o tipo da conta', () => {
    for (const email of ['Ana@Gmail.com', 'ANA@GMAIL.COM', 'Ana@GoogleMail.com']) {
      expect(sh('account_kind', {}, envOf({ ACCOUNT: email })), email).toBe('personal');
      expect(sh(`kind_of_email '${email}'`), email).toBe('personal');
    }
    expect(sh("kind_of_email 'Ana@Acme.com'")).toBe('workspace');
    expect(sh("kind_of_email ''")).toBe('unknown');
  });

  test('is_personal acompanha account_kind', () => {
    expect(sh('is_personal && echo yes || echo no', {}, envOf({ ACCOUNT: 'a@gmail.com' }))).toBe('yes');
    expect(sh('is_personal && echo yes || echo no', {}, envOf({ ACCOUNT: 'a@acme.com' }))).toBe('no');
    expect(sh('is_personal && echo yes || echo no', {}, '')).toBe('no');
  });
});

describe('URL do web app: as duas formas', () => {
  // O bloqueador que impedia o gasclaw de rodar fora de Workspace: `/a/macros/<dominio>/` só existe em
  // Workspace, e com DOMAIN=gmail.com a URL apontava para um endereço inexistente.
  test('conta pessoal não leva o domínio no caminho', () => {
    const env = envOf({ ACCOUNT: 'a@gmail.com', DOMAIN: 'gmail.com' });
    expect(sh('exec_url AKfyABC', {}, env)).toBe('https://script.google.com/macros/s/AKfyABC/exec');
  });

  test('Workspace leva o domínio no caminho', () => {
    const env = envOf({ ACCOUNT: 'a@acme.com', DOMAIN: 'acme.com' });
    expect(sh('exec_url AKfyABC', {}, env)).toBe('https://script.google.com/a/macros/acme.com/s/AKfyABC/exec');
  });

  // A P10 mede o editor pela implantação @HEAD (`/dev`) e montava esse endereço na mão, com `/a/macros/`
  // fixo: a POC recusava conta pessoal mesmo depois de o resto da CLI passar a suportá-la.
  test('dev_url (implantação @HEAD) segue as mesmas duas formas', () => {
    expect(sh('dev_url AKfyABC', {}, envOf({ ACCOUNT: 'a@gmail.com', DOMAIN: 'gmail.com' }))).toBe(
      'https://script.google.com/macros/s/AKfyABC/dev',
    );
    expect(sh('dev_url AKfyABC', {}, envOf({ ACCOUNT: 'a@acme.com', DOMAIN: 'acme.com' }))).toBe(
      'https://script.google.com/a/macros/acme.com/s/AKfyABC/dev',
    );
  });

  test('nenhuma POC monta a URL do web app na mão', () => {
    // Guarda de regressão: o prefixo `/a/macros/` só pode existir dentro do `script_url`.
    const offenders = readFileSync('poc/p10-editor/pc.sh', 'utf8')
      .split('\n')
      .filter((l) => l.includes('script.google.com/a/macros'));
    expect(offenders).toEqual([]);
  });

  test('url() usa a implantação do ambiente corrente', () => {
    expect(sh('url', {}, envOf({ ACCOUNT: 'a@gmail.com', DEPLOY_ID_DEV: 'AKfyDEV' }))).toBe(
      'https://script.google.com/macros/s/AKfyDEV/exec',
    );
  });

  test('sibling_url: vazio quando o outro ambiente não tem implantação', () => {
    expect(sh('sibling_url', {}, envOf({ ACCOUNT: 'a@gmail.com', DEPLOY_ID_DEV: 'AKfyDEV' }))).toBe('');
  });

  test('sibling_url respeita a forma da URL da conta pessoal', () => {
    const env = envOf({ ACCOUNT: 'a@gmail.com', DOMAIN: 'gmail.com', DEPLOY_ID_DEV: 'D', DEPLOY_ID_PROD: 'P' });
    expect(sh('sibling_url', {}, env)).toBe('https://script.google.com/macros/s/P/exec');
  });
});

describe('portabilidade: macOS, Linux, WSL e Windows', () => {
  test('os_kind traduz o que o uname devolve', () => {
    const k = (v: string) => sh('os_kind', { GASCLAW_OS: v });
    expect(k('Darwin')).toBe('mac');
    expect(k('Linux')).toBe('linux');
    expect(k('MINGW64_NT-10.0')).toBe('windows');
    expect(k('MSYS_NT-10.0')).toBe('windows');
    expect(k('CYGWIN_NT-10.0')).toBe('windows');
    expect(k('FreeBSD')).toBe('unknown');
  });

  // `install_hint` vai para dentro de um `die "... $(install_hint ...)"`. Um sistema sem ramo devolvia
  // string vazia e a mensagem terminava no meio; aqui ela precisa dizer algo em qualquer sistema.
  test('install_hint diz alguma coisa em todo sistema, e nomeia a ferramenta', () => {
    for (const os of ['Darwin', 'Linux', 'MINGW64_NT-10.0', 'FreeBSD']) {
      const hint = sh("install_hint 'Node.js' 'nodejs' 'OpenJS.NodeJS.LTS'", { GASCLAW_OS: os });
      expect(hint.length, os).toBeGreaterThan(10);
      expect(hint, os).toContain('Node.js');
    }
  });

  // open_url não pode DERRUBAR o comando: num servidor sem navegador o setup tem de seguir.
  test('open_url nunca falha, nem sem navegador nem sem argumento', () => {
    expect(sh("open_url '' ; echo rc=$?", { GASCLAW_OS: 'FreeBSD' })).toContain('rc=0');
    expect(sh("open_url 'https://example.com' >/dev/null 2>&1; echo rc=$?", { GASCLAW_OS: 'FreeBSD' })).toContain('rc=0');
  });
});
