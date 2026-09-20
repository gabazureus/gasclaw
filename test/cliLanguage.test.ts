import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// A CLI é a vitrine: tudo que aparece na tela de quem só rodou ./gasclaw é em inglês (decisão do gate de
// 18/09; ADR-011 já fazia isso para README/CONTRIBUTING). COMENTÁRIO DE CÓDIGO CONTINUA EM PT-BR — é regra
// do CLAUDE.md. Por isso este teste olha só o que sai para humano: o conteúdo entre aspas das linhas e o
// heredoc do help. Linha que começa com # é pulada inteira; comentário no fim da linha fica fora porque
// só o que está entre aspas é lido.

const LINES = readFileSync('gasclaw', 'utf8').split('\n');

const ACCENTED = /[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/;
// Palavras pt-BR sem acento que não colidem com inglês (nada de "no", "a", "e", "os", e nada de "com",
// que casaria dentro de qualquer "@gmail.com"). Radical + sufixo opcional: a primeira versão tinha
// `ferramentas` e não `ferramenta`, e deixou passar `ok "ferramenta configurada com sucesso"` — português
// inteiro, sem um acento sequer. Buraco de lista é a falha natural deste tipo de detector; o que o mantém
// honesto é o autoteste abaixo, que precisa incluir frase SEM acento e SEM marcador óbvio.
const PT_WORDS = new RegExp(
  '(?:^|[^a-zA-Z])(nao|rode|rodam|roda|veja|abra|abre|falhou|falham|falha|pronto|pronta|conferid[oa]|sem|para|' +
    'que|uso|dia|tela|telas|chave|chaves|passos?|testes|arquivos?|pasta|pastas|cole|copiad[oa]|segredo|gatilho|' +
    'ocupado|esperei|aguardando|instale|crie|criad[oa]|volta|voltou|faltam|consegui|apagar|preservados|pausados|' +
    'ainda|anterior|atual|invalid[oa]|vezes|antes|depois|ferramentas?|limites|custo|planilha|execucoes|' +
    'implantaca?o|implantacoes|versao|versoes|permissoes|funcoes|orfao|entrada|saida|corrigir|mente|precisa|' +
    'tentativa|tentativas|desconhecid[oa]|inesperad[oa]|recusad[oa]|indisponivel|pendente|conta|ambiente|projeto|' +
    'sucesso|configurad[oa]|salvo|salva|erro|usando|seu|sua|seus|suas|este|esta|isso|pelo|pela|quando|' +
    'todos|todas|nov[oa]|mensagem|mensagens|resposta|respostas|primeiro|primeira|segunda|' +
    // Palavras de função e verbos de instrução, que a morfologia não pega porque a terminação é banal
    // (`aguarde`, `instante`). Nenhuma colide com inglês — `ate` ficou DE FORA de propósito: é o passado
    // de "eat". Pelo mesmo motivo não entram `um`/`uma` sozinhos aqui, e sim como palavra inteira.
    'um|uma|nenhum|nenhuma|nada|tudo|aqui|abaixo|acima|desde|onde|agora|voce|sera|serao|foi|foram|sao|' +
    'seja|pode|podem|deve|devem|muito|muita|cada|outro|outra|apenas|talvez|aguarde|aguarda|digite|' +
    'escolha|selecione|copie|informe|instante|codigo|endereco|estado|nuvem|modelo|painel|servidor)' + // sem `agente(s)`: e identificador aqui (o prefixo legado `agentes/` das pastas), nao prosa
    '(?:[^a-zA-Z]|$)',
  'i',
);

// A lista de palavras é uma peneira: ela só pega o português que alguém JÁ escreveu e lembrou de listar.
// Um ataque com 26 frases novas (português inteiro, sem um acento) passou 24. O buraco não é de conteúdo,
// é de método — lista não generaliza. O que generaliza é MORFOLOGIA: gerúndio (`-ando/-endo/-indo`),
// substantivo em `-ção/-ções` sem acento (`-cao/-coes`), `-mente`, `-agem`, `-ncia`, `-ível/-ável` e o
// pretérito em `-iu`. Essas terminações quase não existem em inglês, então pegam palavra que ninguém listou.
// O pretérito (`-ou`, `-eu`, `-iu`: expirou, respondeu, abriu) entra junto. `you` só não vira português
// porque o `(?=.{5,})` exige 5 letras — é essa guarda que torna `-ou` seguro, não a sorte.
// Particípio (`-ado/-ada/-ido/-ida`: concluida, configurado) fecha a última família. Ele é o mais
// arriscado do conjunto — `tornado` e `armada` são inglesas — por isso vem com a lista de exceção abaixo.
const PT_SUFFIX =
  /^(?=.{5,})[a-z]+(?:ando|endo|indo|acao|acoes|coes|mente|agem|agens|ncia|ncias|ivel|avel|ado|ada|ido|ida|ou|eu|iu)$/;
// As poucas palavras inglesas que caem nas terminações acima. Sem isto, `travel` viraria português.
const ENGLISH_OK = new Set([
  'travel', 'unravel', 'commando', 'crescendo', 'innuendo', 'tornado', 'avocado', 'aficionado',
  'bayou', 'caribou', 'manitou', 'milieu', 'adieu', 'thankyou',
  'tornado', 'bravado', 'desperado', 'armada', 'canada', 'florida', 'candida', 'valid', 'rapid',
]);

function hasPortugueseMorphology(text: string): boolean {
  return (text.toLowerCase().match(/[a-z]+/g) ?? []).some((w) => PT_SUFFIX.test(w) && !ENGLISH_OK.has(w));
}

function isPortuguese(text: string): boolean {
  return ACCENTED.test(text) || PT_WORDS.test(text) || hasPortugueseMorphology(text);
}

// Corta o comentário do fim da linha ANTES de olhar as aspas. Sem isto, o `#` dentro de aspas (`${bad# }`)
// cortaria código, e o comentário depois de uma string (`die "..." # nota em pt-BR`) seria lido como saída —
// o teste viraria uma trava contra a regra do CLAUDE.md de manter comentário em pt-BR.
function withoutComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

// Só o que está entre aspas (simples ou duplas) do código, já sem o comentário. Referência de variável
// (`$acct`, `${DEPLOY_ID_$UP}`) é IDENTIFICADOR, não prosa: sai antes da leitura, senão um nome de variável
// mal escolhido derruba o teste por um motivo que não é idioma — foi o que aconteceu com um `$conta`.
function quotedParts(line: string): string[] {
  if (/^\s*#/.test(line)) return [];
  return (withoutComment(line).match(/"[^"]*"|'[^']*'/g) ?? []).map((s) => s.slice(1, -1).replace(/\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*/g, ' '));
}

function helpHeredocRange(): [number, number] {
  const start = LINES.findIndex((l) => l.includes("cat <<'TXT'"));
  if (start < 0) throw new Error('bloco de ajuda não encontrado: o teste de idioma perdeu o alvo');
  const end = LINES.findIndex((l, i) => i > start && l.trim() === 'TXT');
  return [start + 1, end];
}

// Ha um caso legitimo de pt-BR em codigo que NAO e saida nossa: padrao que CASA com texto que o Google
// devolve em portugues (a pagina "Autorizacao necessaria", o erro de permissao lido em limits.ts). Traduzir
// quebraria o casamento. A isencao e por LINHA e carrega o motivo — arquivo inteiro fora da trava e como a
// trava morre: uma excecao vira duas, e ninguem mais olha.
const ISENTA = /(?:#|\/\/)\s*lang-ok:/;

function violations(): string[] {
  const [helpStart, helpEnd] = helpHeredocRange();
  const found: string[] = [];
  LINES.forEach((line, i) => {
    const n = i + 1;
    const inHelp = n > helpStart && n <= helpEnd;
    // Acento vale para a linha inteira (sem o comentário): os `node -e '…'` de limits/usage/tools são uma
    // string de várias linhas, e a leitura por aspas não enxerga o miolo deles. Palavra sem acento continua
    // valendo só dentro de aspas, para não acusar identificador.
    if (ISENTA.test(line)) return; // isenção explícita, com motivo na própria linha
    const stripped = withoutComment(line);
    const texts = inHelp ? [line] : quotedParts(line);
    if (texts.some(isPortuguese) || (!inHelp && ACCENTED.test(stripped))) {
      found.push(`  ${n}: ${line.trim().slice(0, 120)}`);
    }
  });
  return found;
}

describe('idioma da CLI (a vitrine é em inglês; comentário de código continua em pt-BR)', () => {
  test('nenhuma saída para humano do ./gasclaw está em português', () => {
    const found = violations();
    expect(
      found.length === 0
        ? ''
        : `${found.length} linha(s) de saída da CLI ainda em pt-BR (traduza; comentário pode ficar):\n${found.join('\n')}`,
    ).toBe('');
  });

  // O teste acima só vale se ele de fato souber achar português. Se o detector parar de detectar,
  // ele passa a aprovar tudo em silêncio — que é pior que não ter teste.
  test('o detector reconhece português e aprova inglês', () => {
    expect(isPortuguese('versão conferida: idêntica ao build')).toBe(true);
    expect(isPortuguese('nao consegui ler o numero da versao')).toBe(true);
    expect(isPortuguese('published to dev, version 12')).toBe(false);
    expect(isPortuguese('the 1-minute worker is active')).toBe(false);
  });

  // Estas passaram pela PRIMEIRA versão do detector: português inteiro, sem um acento sequer e sem nenhuma
  // das palavras que a lista conhecia. Ficam aqui como caso de regressão — é fácil a lista encolher de novo.
  test('pega português SEM acento, que foi o furo real', () => {
    expect(isPortuguese('ferramenta configurada com sucesso')).toBe(true);
    expect(isPortuguese('agente criado')).toBe(true);
    expect(isPortuguese('nova mensagem salva')).toBe(true);
  });

  // Segundo ataque (18/09), com frases DIFERENTES das de cima: 26 frases, 24 passaram pela lista de
  // palavras. Nenhuma tem acento e nenhuma usa palavra listada — o que as denuncia é a TERMINAÇÃO.
  // Ficam aqui inteiras: é este o corpus que a próxima mexida no detector tem que continuar pegando.
  test('pega português que a lista de palavras deixou passar (morfologia)', () => {
    for (const frase of [
      'o agente respondeu',
      'aguarde um instante',
      'iniciando o servidor',
      'nenhum agente encontrado',
      'aplicando as mudancas',
      'digite o nome do agente',
      'escolha uma opcao',
      'leitura concluida',
      'publicando o codigo',
      'baixando dependencias',
      'verificando se o worker existe',
      'o painel abriu normalmente',
      'reiniciando em cinco segundos',
      'copie o endereco abaixo',
      'selecione um modelo',
      'removendo o bloqueio',
      'a autorizacao expirou',
      'sincronizando com a nuvem',
      'gravando o estado',
      'carregando as definicoes',
      'nenhuma alteracao detectada',
    ]) {
      expect(isPortuguese(frase), `escapou do detector: ${frase}`).toBe(true);
    }
  });

  // O outro lado do mesmo risco: uma lista ampla demais acusa inglês legítimo e a trava vira ruído.
  test('não acusa inglês nem o que parece português mas não é', () => {
    for (const ingles of [
      'gasclaw dev is ready: open the panel',
      'account: owner@gmail.com · domain: example.com',
      'error: the OpenRouter key must start with sk-or-',
      'run ./gasclaw onboard to see the setup map',
      'deployment 87 verified: identical to the build',
      // Inglês que cai nas terminações novas: `travel` casa com `-avel`, `commando` com `-ando`.
      'travel time is not measured here',
      'no agent found on this account',
      'choose a model and press Enter',
      'nothing changed since the last run',
      'waiting for the lock: another deploy is running',
    ]) {
      expect(isPortuguese(ingles), `acusou inglês legítimo: ${ingles}`).toBe(false);
    }
  });

  test('comentário em pt-BR no fim da linha não conta como saída', () => {
    expect(quotedParts('ok "published"  # a versão foi conferida antes')).toEqual(['published']);
  });

  // Nome de variável é identificador, não prosa. Sem isto, chamar uma variável de `$conta` reprovaria o
  // arquivo por "idioma" — e o motivo real seria outro: identificador em pt-BR, que o CLAUDE.md já proíbe.
  test('referência de variável sai antes da leitura', () => {
    expect(quotedParts('[ -z "$bad" ] || die "stale"')).toEqual([' ', 'stale']);
    expect(quotedParts('printf "%s" "${DEPLOY_ID_$UP}"').map((t) => t.trim())).toEqual(['%s', '']);
    expect(isPortuguese(quotedParts('printf "%s" "$conta"')[1] ?? '')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------
// A trava acima lê SÓ o arquivo `gasclaw`. Por isso passou despercebido português em `src/chat.html`, em
// `src/approval.ts` (o card de aprovação inteiro), na saudação do `src/chat.ts` e no `runAsk` do
// `src/main.ts` — tudo texto que chega ao usuário final, numa instalação real, em produção.
//
// Cobrir `src/**` inteiro de uma vez não dá: o `main.ts` ainda tem dezenas de mensagens em pt-BR e o texto
// do trace é pt-BR de propósito. Então a cobertura é uma LISTA EXPLÍCITA, e crescer é acrescentar arquivo
// a ela — o teste diz a verdade sobre o que cobre, em vez de fingir cobrir tudo.
//
// Só o que está entre aspas conta, como no bash: comentário de código continua em pt-BR (CLAUDE.md) e há
// identificador em pt-BR (`nota`, `pessoal`) que não é prosa.
// COBERTURA POR PADRAO, nao por lista. A versao anterior era opt-in: `COBERTOS` listava 8 arquivos e tudo
// que ficava de fora escapava — foi assim que `runStore.ts` e `runner.ts` seguiram publicando o AVISO DE
// VIOLACAO DE INTEGRIDADE em portugues para quem instalou em ingles, que e a pior hora para nao entender.
// Tres varreduras manuais acharam resto tres vezes; o defeito nao era a varredura, era a lista.
//
// Agora todo `src/**/*.ts` e `src/*.html` entra sozinho. Arquivo novo nasce coberto: ninguem precisa
// lembrar de nada. O que sai, sai por EXCECAO explicita, com motivo — por linha (`// lang-ok:`) ou, se um
// arquivo inteiro justificar, aqui embaixo.
/**
 * CATRACA da dívida de idioma: teto de strings em pt-BR por arquivo, e o teto só DESCE.
 *
 * A trava cobre `src/**` por padrão (opt-out), porque a versão opt-in falhou TRÊS vezes: quem escrevia um
 * arquivo novo não lembrava de listá-lo, e o português passava. Só que inverter revelou a dívida real —
 * 209 strings em 39 arquivos, a maioria descrição de ferramenta, que vai para o MODELO e não
 * para a tela.
 *
 * Traduzir tudo de uma vez seria pressa no caminho mais sensível do produto. Então o número aqui é o que
 * cada arquivo tem HOJE, e o teste falha nos dois sentidos: se um arquivo ganhar mais português, e também se
 * ganhar menos sem o número ser atualizado. A segunda metade é o que torna isto uma catraca em vez de uma
 * lista de desculpas — quem traduz é obrigado a baixar o número, e o número nunca sobe sozinho.
 *
 * Arquivo NOVO não entra aqui: ele nasce com teto zero e a trava o cobre desde o primeiro commit.
 */
const DIVIDA: Record<string, number> = {
  'src/agenda.ts': 10,
  'src/agent.ts': 12,
  'src/batch.ts': 2,
  'src/bootstrap.ts': 1,
  'src/chatApi.ts': 6,
  'src/chatDelivery.ts': 5,
  'src/drive.ts': 1,
  'src/eval.ts': 4,
  'src/evalEntry.ts': 5,
  'src/freeModels.ts': 5,
  'src/freeRun.ts': 1,
  'src/limits.ts': 1,
  'src/llm.ts': 1,
  'src/models.ts': 2,
  'src/observe.ts': 6,
  'src/run.ts': 5,
  'src/runStore.ts': 2,
  'src/runlog.ts': 4,
  'src/runner.ts': 2,
  'src/session.ts': 3,
  'src/sessionCompact.ts': 1,
  'src/sessionQueue.ts': 1,
  'src/sessionQueueStore.ts': 2,
  'src/skills.ts': 3,
  'src/tools/calendar.ts': 6,
  'src/tools/contacts.ts': 3,
  'src/tools/driveTools.ts': 13,
  'src/tools/gmail.ts': 11,
  'src/tools/google.ts': 10,
  'src/tools/memory.ts': 3,
  'src/tools/memoryFlush.ts': 1,
  'src/tools/memoryStore.ts': 2,
  'src/tools/registry.ts': 24,
  'src/tools/tasks.ts': 5,
  'src/trace.ts': 2,
  'src/usage.ts': 1,
  'src/voice.ts': 3,
  'src/webchat.ts': 1,
  'src/workspace.ts': 1,
};

function listarSrc(dir = 'src'): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const caminho = `${dir}/${e.name}`;
    if (e.isDirectory()) return listarSrc(caminho);
    return /\.(ts|html)$/.test(e.name) ? [caminho] : [];
  });
}

const COBERTOS = listarSrc().sort(); // tudo em src/: o teto por arquivo vive em DIVIDA, não numa lista de isentos

// Nome próprio mantém o acento: "São Paulo" é o fuso do painel, não português traduzível.
const NOMES_PROPRIOS = /São Paulo/;

function stringsDe(arquivo: string): { n: number; texto: string }[] {
  const out: { n: number; texto: string }[] = [];
  readFileSync(arquivo, 'utf8')
    .split('\n')
    .forEach((linha, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(linha)) return;
      if (ISENTA.test(linha)) return; // mesma isenção explícita do bash, com o motivo na linha
      const semComentario = withoutComment(linha);
      for (const bruto of semComentario.match(/"[^"]*"|'[^']*'|`[^`]*`/g) ?? []) {
        const texto = bruto.slice(1, -1).replace(/\$\{[^}]*\}/g, ' ').replace(NOMES_PROPRIOS, ' ');
        // Só PROSA conta. Uma string de uma palavra é identificador, não frase: o literal de união
        // `'tela' | 'pasta'`, a chave `entrada_sincrona`, o caminho `../poc/p15-limites/harness`. Exigir
        // duas palavras separa os dois casos sem lista de exceção — e o preço, deixar passar uma saída de
        // uma palavra só, é pequeno perto de acusar todo identificador em pt-BR do arquivo.
        // Prosa tem ESPAÇO. `entrada_sincrona` e `../poc/p15-limites/harness` não têm — são identificador
        // e caminho de import, não frase.
        if (/\s/.test(texto.trim()) && (texto.trim().match(/[A-Za-zÀ-ÿ]{2,}/g) ?? []).length >= 2) out.push({ n: i + 1, texto });
      }
    });
  return out;
}

describe('idioma fora do gasclaw: o que chega ao usuário no produto', () => {
  test.each(COBERTOS)('%s respeita o teto de português da catraca', (arquivo) => {
    const found = stringsDe(arquivo)
      .filter(({ texto }) => isPortuguese(texto))
      .map(({ n, texto }) => `  ${n}: ${texto.slice(0, 100)}`);
    const teto = DIVIDA[arquivo] ?? 0;
    if (found.length > teto) {
      // Subiu: ou é string nova em pt-BR, ou o detector melhorou e achou o que já estava lá. Nos dois casos,
      // traduza — aumentar o teto só é aceitável com a razão escrita no commit.
      expect(`${arquivo}: ${found.length} string(s) em pt-BR, teto é ${teto}:\n${found.join('\n')}`).toBe('');
    }
    if (found.length < teto) {
      // Desceu: alguém traduziu e não baixou o número. É o que impede a catraca de virar lista de desculpas.
      expect(`${arquivo}: agora tem ${found.length}, o teto ainda diz ${teto}. Baixe o número em DIVIDA.`).toBe('');
    }
  });

  // A catraca só vale enquanto o total não subir. Este número é a dívida inteira, num lugar só, para ninguém
  // precisar somar 39 linhas para saber se estamos melhorando ou piorando.
  test('a dívida total de idioma não aumenta', () => {
    const total = COBERTOS.reduce((s, f) => s + stringsDe(f).filter(({ texto }) => isPortuguese(texto)).length, 0);
    const tetoTotal = Object.values(DIVIDA).reduce((s, n) => s + n, 0);
    expect(total <= tetoTotal ? '' : `dívida subiu: ${total} contra teto ${tetoTotal}`).toBe('');
  });

  // Sem isto, alguém "conserta" a trava esvaziando a lista e ela passa a aprovar tudo em silêncio.
  test('a lista de cobertura não encolhe sem alguém perceber', () => {
    expect(COBERTOS).toContain('src/approval.ts');
    expect(COBERTOS).toContain('src/chat.ts');
    expect(COBERTOS).toContain('src/main.ts');
    expect(COBERTOS).toContain('src/approvalStore.ts');
    expect(COBERTOS.length).toBeGreaterThanOrEqual(8);
    for (const f of COBERTOS) expect(readFileSync(f, 'utf8').length, `${f} sumiu`).toBeGreaterThan(100);
  });

  // O detector precisa achar português NESTE formato também (template literal, atributo de HTML).
  test('o detector funciona no formato destes arquivos', () => {
    expect(isPortuguese('Esta ação precisa de aprovação')).toBe(true);
    expect(isPortuguese('O gasclaw está pausado pelo administrador')).toBe(true);
    expect(isPortuguese('This action needs your approval')).toBe(false);
    expect(isPortuguese('gasclaw is paused by the administrator')).toBe(false);
  });
});

// O NONO defeito de instrumento da semana, achado ao rodar um eval offline.
//
// O runner usa exit 2 para duas coisas incompatíveis: "recusei e te expliquei o motivo" (cenário
// offline, que só roda no npm test) e "quebrei". A trap de ERR do CLI não distinguia, então ela
// imprimia "stopped unexpectedly … please report this" logo ABAIXO de uma recusa perfeitamente
// explicada — mandando a pessoa abrir um bug por um comportamento correto.
//
// Corromper a medição por via psicológica é o pior tipo: ninguém confere o que já acredita estar
// quebrado. É o mesmo defeito que as POCs tiveram, e por isso o conserto é o mesmo precedente.
describe('recusa explicada não vira crash (o mesmo conserto das POCs)', () => {
  const cli = () => readFileSync('gasclaw', 'utf8');

  test('`cmd_eval` cala o trap ANTES da chamada que pode sair != 0', () => {
    const corpo = cli().slice(cli().indexOf('cmd_eval()'), cli().indexOf('cmd_eval()') + 1400);
    expect(corpo).toContain('trap - ERR');
    // `set +e` sozinho NÃO basta — medido neste bash, o trap dispara mesmo com ele desligado.
    expect(corpo.indexOf('trap - ERR')).toBeLessThan(corpo.indexOf('node scripts/eval.mjs'));
  });

  test('o código de saída é PRESERVADO: a recusa continua falhando o CI', () => {
    const corpo = cli().slice(cli().indexOf('cmd_eval()'), cli().indexOf('cmd_eval()') + 1400);
    expect(corpo).toContain('exit "$code"');
  });
});
