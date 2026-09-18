import { readFileSync } from 'node:fs';
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

function violations(): string[] {
  const [helpStart, helpEnd] = helpHeredocRange();
  const found: string[] = [];
  LINES.forEach((line, i) => {
    const n = i + 1;
    const inHelp = n > helpStart && n <= helpEnd;
    // Acento vale para a linha inteira (sem o comentário): os `node -e '…'` de limits/usage/tools são uma
    // string de várias linhas, e a leitura por aspas não enxerga o miolo deles. Palavra sem acento continua
    // valendo só dentro de aspas, para não acusar identificador.
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
