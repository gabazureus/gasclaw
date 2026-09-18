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

// No Windows o Google Cloud CLI instala como `gcloud.cmd`, e o Git Bash não resolve `command -v gcloud`.
// Era a ÚNICA dependência que separava o Git Bash de funcionar: por causa dela o gasclaw morria com
// "gcloud not found" numa máquina onde o gcloud estava instalado, e o menu mentia no passo 1.
//
// Detectar não basta — quem detecta tem de CHAMAR a forma que existe. E há uma armadilha no caminho:
// `command -v` encontra FUNÇÃO do shell, então um wrapper chamado `gcloud` se acharia a si mesmo e
// recorreria para sempre. `type -P` olha só o disco. É esse o motivo de `bin_of` existir.
describe('Windows: executável com sufixo .cmd/.exe', () => {
  function withFakeBin(files: Record<string, string>, snippet: string, env: Record<string, string> = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'gasclaw-bin-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'gasclaw'), DEFS);
    writeFileSync(join(dir, 'gasclaw.env'), '');
    const bin = join(dir, 'bin');
    execFileSync('mkdir', ['-p', bin]);
    for (const [name, body] of Object.entries(files)) {
      writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
    }
    return execFileSync('bash', ['-c', `export PATH="${bin}:$PATH"; source ./gasclaw; ${snippet}`], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, ...env, HOME: dir },
    }).trim();
  }

  test('acha a ferramenta que só existe como .cmd, e diz qual nome chamar', () => {
    expect(withFakeBin({ 'gasclawfake.cmd': 'echo hi' }, 'bin_of gasclawfake')).toBe('gasclawfake.cmd');
    expect(withFakeBin({ 'gasclawfake.cmd': 'echo hi' }, 'have gasclawfake && echo yes || echo no')).toBe('yes');
  });

  test('sem nenhuma das formas, have responde não — e não derruba o script', () => {
    expect(withFakeBin({}, 'have gasclawfake && echo yes || echo no')).toBe('no');
    expect(withFakeBin({}, 'bin_of gasclawfake || echo ausente')).toBe('ausente');
  });

  test('a forma sem sufixo tem precedência (Linux e macOS não mudam de comportamento)', () => {
    expect(withFakeBin({ gasclawfake: 'echo a', 'gasclawfake.cmd': 'echo b' }, 'bin_of gasclawfake')).toBe('gasclawfake');
  });

  // A armadilha: uma FUNÇÃO com o nome da ferramenta não pode contar como ferramenta instalada.
  test('função do shell não passa por ferramenta instalada (senão o wrapper se acharia)', () => {
    expect(withFakeBin({}, 'gasclawfake() { echo eu; }; have gasclawfake && echo yes || echo no')).toBe('no');
  });

  // Esta máquina TEM um gcloud de verdade, e o próprio script põe os caminhos do SDK no PATH — então não dá
  // para provar a ausência dele aqui. O que dá para provar, e é o que importa, é o corpo do wrapper: ele
  // chama o que o `bin_of` mandar, repassa os argumentos e NÃO recorre. Trocar o `bin_of` isola exatamente
  // isso. Se o wrapper usasse `command -v`, acharia a si mesmo e o teste travaria em vez de passar.
  test('o wrapper do gcloud chama o nome que bin_of mandar, e repassa os argumentos', () => {
    const out = withFakeBin(
      { 'gasclawfake.cmd': 'echo "recebeu: $*"' },
      "bin_of() { printf 'gasclawfake.cmd'; }; gcloud auth list --format=json",
    );
    expect(out).toBe('recebeu: auth list --format=json');
  });

  // A mesma pergunta em quatro lugares foi o que fez a lista de ações com efeito do shell divergir do
  // MUTATING do TS e render 405. Aqui ela tem de ter UMA implementação.
  test('nenhum lugar pergunta por gcloud/node com `command -v` cru', () => {
    const offenders = FULL.split('\n')
      .map((l, i) => [i + 1, l] as const)
      .filter(([, l]) => !/^\s*#/.test(l) && /command -v (gcloud|node|brew)\b/.test(l));
    expect(offenders.map(([n, l]) => `${n}: ${l.trim()}`)).toEqual([]);
  });
});

// "Link mais simples, ou imprimir o link quando o agente é criado."
//
// Encurtar não é possível sem trair o projeto: o id do web app tem ~57 caracteres, é gerado pelo Google e
// não é configurável; o goo.gl foi desligado em 2025; Apps Script não aceita domínio próprio; e encurtador
// de terceiro poria um servidor de fora no caminho crítico de alcançar o agente, contra o CLAUDE.md.
//
// Mas a dor não é o link ser longo — é ter de DIGITAR ou MANDAR um link longo. Quem nunca digita não sofre
// com o tamanho. Daí: um endereço direto para a conversa, impresso e copiado na hora em que o agente nasce.
describe('chegar ao agente sem digitar o link', () => {
  test('chat_url é o painel com ?page=chat, nas duas formas de conta', () => {
    expect(sh('chat_url', {}, envOf({ ACCOUNT: 'a@gmail.com', DEPLOY_ID_DEV: 'D' }))).toBe(
      'https://script.google.com/macros/s/D/exec?page=chat',
    );
    expect(sh('chat_url', {}, envOf({ ACCOUNT: 'a@acme.com', DOMAIN: 'acme.com', DEPLOY_ID_DEV: 'D' }))).toBe(
      'https://script.google.com/a/macros/acme.com/s/D/exec?page=chat',
    );
  });

  test('show_link imprime o endereço mesmo quando não há como copiar', () => {
    // Num servidor sem ferramenta de clipboard o setup não pode parar nem esconder o link.
    const out = sh("show_link 'https://exemplo/x' 'talk to your agent'", { GASCLAW_OS: 'FreeBSD' });
    expect(out).toContain('https://exemplo/x');
    expect(out).toContain('talk to your agent');
  });

  test('show_link nunca derruba o comando', () => {
    expect(sh("show_link 'https://exemplo/x' 'oi' >/dev/null 2>&1; echo rc=$?", { GASCLAW_OS: 'FreeBSD' })).toContain('rc=0');
  });

  test('`open` aceita --chat, e o help conta isso', () => {
    expect(FULL).toMatch(/cmd_open\(\)[\s\S]{0,400}--chat/);
    expect(FULL).toContain('./gasclaw open --chat');
  });
});

// O `build.mjs` embute cinco valores no bundle a partir do AMBIENTE (`process.env`). Um `npm run build`
// solto, num shell onde `CHAT_SA_EMAIL` ficou exportado de uma sessão anterior, embute aquele valor —
// medido: ele aparece duas vezes no `_motor.js`. O que impede isso de chegar à produção é o `deploy()`
// EXPORTAR cada um deles explicitamente por ambiente, inclusive vazio: o valor herdado nunca sobrevive.
//
// É uma invariante frágil por natureza (some se alguém apagar uma linha), e o custo de perdê-la é um
// bundle de prod carregando a identidade do dev. Por isso ela é travada aqui, e não só comentada.
describe('o build não herda valor do shell', () => {
  test('o deploy define TODAS as variáveis embutidas no bundle, por ambiente', () => {
    const deploy = FULL.slice(FULL.indexOf('\ndeploy() {'), FULL.indexOf('OUT_DIR=dist npm run build'));
    expect(deploy.length).toBeGreaterThan(100);
    for (const v of ['GCP_NUMBER', 'CHAT_SA_EMAIL', 'GASCLAW_DEV', 'GASCLAW_ENV', 'SIBLING_URL']) {
      expect(deploy, `o deploy não exporta ${v}: o build passaria a herdar o valor do shell`).toMatch(
        new RegExp(`export ${v}=`),
      );
    }
  });

  // Só o que é EMBUTIDO no bundle (bloco `define`) entra nesta conta. O `OUT_DIR` também vem do ambiente,
  // mas é caminho de saída: o deploy o passa na própria linha de comando e ele não vai para dentro do .js.
  test('as embutidas no bundle são exatamente as cinco que o deploy exporta', () => {
    const build = readFileSync('build.mjs', 'utf8');
    const define = build.slice(build.indexOf('define: {'), build.indexOf('minify:'));
    const lidas = [...define.matchAll(/process\.env\.([A-Z_]+)/g)].map((m) => m[1]);
    expect([...new Set(lidas)].sort()).toEqual(['CHAT_SA_EMAIL', 'GASCLAW_DEV', 'GASCLAW_ENV', 'GCP_NUMBER', 'SIBLING_URL']);
  });
});
