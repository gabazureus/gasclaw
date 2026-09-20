// A geração do CÓDIGO do sucessor: o que o Opus escreve, e o que nós recusamos a publicar.
//
// Este é o único lugar do projeto onde um modelo escreve algo que vai RODAR. A ADR-002 diz que nada
// vindo da pasta é executado; aqui nada vindo do MODELO é publicado sem passar por estas regras. A
// diferença entre os dois casos é que a pasta é compartilhável e o modelo não — mas a consequência de
// errar é a mesma, e por isso o crivo é igualmente fechado.
import { describe, expect, test } from 'vitest';
import { CHILD_FORBIDDEN_SCOPES, checkSuccessorSource, extractSource, narrowScopes, OPUS_MODEL, successorManifest, successorMessages } from '../src/codegen';
import { familyOf, judgeIsIndependent } from '../src/dream';

describe('o gerador é o Opus, e isso é uma exceção declarada', () => {
  // D4 manda usar modelo gratuito em tudo. Escrever código é o caso em que um modelo fraco produz
  // algo PLAUSÍVEL e quebrado — e o resultado não é uma resposta ruim na tela, é um projeto implantado.
  test('o modelo do gerador é um Opus fixado, nunca roteamento automático', () => {
    expect(OPUS_MODEL).toBe('anthropic/claude-opus-5');
    expect(familyOf(OPUS_MODEL)).toBe('anthropic');
  });

  // Se o Opus gera, um juiz Anthropic decidiria em parte por parentesco (arXiv:2410.21819).
  test('um juiz da mesma família é recusado pelo critério que já existe', () => {
    expect(judgeIsIndependent(OPUS_MODEL, 'anthropic/claude-sonnet-5').ok).toBe(false);
    expect(judgeIsIndependent(OPUS_MODEL, 'google/gemini-2.0-flash-exp:free').ok).toBe(true);
  });
});

describe('extractSource: o que veio do modelo vira código, ou não vira nada', () => {
  test('tira a cerca e a etiqueta de linguagem', () => {
    expect(extractSource('```javascript\nfunction doGet() {}\n```')).toBe('function doGet() {}');
  });

  test('texto sem cerca passa inteiro', () => {
    expect(extractSource('function doGet() {}')).toBe('function doGet() {}');
  });

  // Preâmbulo antes da cerca é o modo de falha comum ('Here is the code:'). Ele não pode virar código.
  test('preâmbulo antes da cerca é descartado, e só o bloco fica', () => {
    expect(extractSource('Here is the code:\n\n```js\nfunction doGet() {}\n```\n\nHope it helps!')).toBe('function doGet() {}');
  });

  test('vazio devolve null, nunca string vazia', () => {
    expect(extractSource('   ')).toBeNull();
    expect(extractSource('```\n\n```')).toBeNull();
  });
});

describe('checkSuccessorSource: o crivo do que pode ser publicado', () => {
  const bom = 'function doGet() { return ContentService.createTextOutput("ok"); }';

  test('código com ponto de entrada passa', () => {
    expect(checkSuccessorSource(bom).ok).toBe(true);
  });

  // P31: A APTIDÃO É MEDIDA POR `doGet`. Um filho com `main` ou `run` roda — mas ninguém consegue
  // chamá-lo pela URL para medir, então o delta dele seria `null` para sempre e ele nunca poderia ser
  // selecionado. Um sucessor que não pode ser medido não pode evoluir: recusar antes de publicar é
  // dizer isso onde ainda custa barato, e não depois de pagar o Opus e implantar.
  test('sem `doGet` não passa: um filho que não pode ser MEDIDO não pode ser selecionado', () => {
    for (const s of ['function main() { return 1; }', 'function run() { return 1; }', 'function doPost(e) { return 1; }']) {
      const v = checkSuccessorSource(s);
      expect(v.ok).toBe(false);
      expect(v.reason).toMatch(/doGet/);
    }
  });

  test('sem ponto de entrada não passa: um filho que não roda é só custo', () => {
    const v = checkSuccessorSource('var x = 1;');
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/entry point/);
  });

  // A ADR-002 proíbe executar o que vem da pasta. Um filho com `eval` reabre exatamente esse caminho,
  // um nível abaixo, onde ninguém está olhando.
  test.each([
    ['eval("1+1")', /eval/],
    ['new Function("return 1")', /Function/],
    ['const f = Function("return 1")', /Function/],
  ])('recusa %s', (trecho, esperado) => {
    const v = checkSuccessorSource(`${bom}\n${trecho}`);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(esperado);
  });

  // O token do motor é a credencial mais forte da casa: com ele se escreve em QUALQUER projeto do dono.
  test('recusa código que pede o token OAuth', () => {
    const v = checkSuccessorSource(`${bom}\nvar t = ScriptApp.getOAuthToken();`);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/OAuth token/);
  });

  // Um filho que alcança a API do Apps Script cria netos, e a profundidade deixa de ter fim.
  test('recusa código que chama a API do Apps Script', () => {
    const v = checkSuccessorSource(`${bom}\nUrlFetchApp.fetch("https://script.googleapis.com/v1/projects");`);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/Apps Script API/);
  });

  // Uma chave no fonte vaza junto com o projeto se ele for compartilhado (a mesma razão do family.ts).
  test('recusa uma chave do OpenRouter embutida no fonte', () => {
    const v = checkSuccessorSource(`${bom}\nvar k = "sk-or-v1-${'a'.repeat(40)}";`);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/API key/);
  });

  // A REGRA QUE A OPÇÃO 4 DA ADR-040 EXIGIU. O filho é `automation`: nunca recebe chave. Um sucessor
  // que chamasse um provedor de modelo seria implantado e falharia em execução, sem chave e sem
  // motivo visível em tela nenhuma. Recusar no crivo é dizer a verdade onde ela ainda é barata.
  for (const host of ['openrouter.ai', 'api.openai.com', 'api.anthropic.com', 'generativelanguage.googleapis.com']) {
    test(`recusa fonte que chama ${host}: o filho não tem modelo e nunca terá chave`, () => {
      const v = checkSuccessorSource(`${bom}\nUrlFetchApp.fetch('https://${host}/v1/chat');`);
      expect(v.ok).toBe(false);
      expect(v.reason).toMatch(/model provider/);
    });
  }

  test('recusa uma chave da Anthropic embutida no fonte, como já recusava a do OpenRouter', () => {
    const v = checkSuccessorSource(`${bom}\nvar k = "sk-ant-${'a'.repeat(40)}";`);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/API key/);
  });

  test('recusa fonte grande demais para caber numa revisão humana', () => {
    const v = checkSuccessorSource(`${bom}\n${'// x\n'.repeat(4000)}`);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/too long/);
  });

  test('vazio é recusa, e com motivo', () => {
    expect(checkSuccessorSource('').ok).toBe(false);
    expect(checkSuccessorSource(null as never).ok).toBe(false);
  });
});

describe('narrowScopes: o sucessor nunca nasce com mais do que o antecessor', () => {
  const pai = ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/script.projects'];

  test('subconjunto do pai passa, e sai sem repetição', () => {
    const v = narrowScopes(['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.events'], pai);
    expect(v.ok).toBe(true);
    expect(v.scopes).toEqual(['https://www.googleapis.com/auth/calendar.events']);
  });

  test('escopo que o pai não tem é recusa, não corte silencioso', () => {
    const v = narrowScopes(['https://www.googleapis.com/auth/drive'], pai);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/does not hold/);
  });

  // Mesmo que o pai TENHA: herdar `script.projects` daria ao filho a chave da casa toda.
  test.each(CHILD_FORBIDDEN_SCOPES)('recusa %s mesmo com o pai tendo', (proibido) => {
    const v = narrowScopes([proibido], [...pai, proibido]);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/never inherited/);
  });

  test('lista vazia é recusa: um filho sem escopo não faz nada, e nascer inútil é defeito', () => {
    expect(narrowScopes([], pai).ok).toBe(false);
  });

  // Igualar ao pai não é "mais estreito", é o mesmo — e o desenho promete estreitar.
  test('pedir TUDO que o pai tem é recusado: sucessão estreita, não iguala', () => {
    const semProibidos = pai.filter((s) => !(CHILD_FORBIDDEN_SCOPES as readonly string[]).includes(s));
    const v = narrowScopes(semProibidos, semProibidos);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/succession narrows/);
  });
});

describe('successorManifest: o que é publicado, e o que fica de fora', () => {
  const escopos = ['https://www.googleapis.com/auth/calendar.events'];

  test('manifesto mínimo: V8, os escopos pedidos e nada além', () => {
    const m = JSON.parse(successorManifest(escopos, 'America/Sao_Paulo'));
    expect(m.runtimeVersion).toBe('V8');
    expect(m.oauthScopes).toEqual(escopos);
    expect(m.timeZone).toBe('America/Sao_Paulo');
  });

  // `MYSELF` é o que faz o filho não ficar aberto ao mundo; `USER_DEPLOYING` é o que faz ele rodar
  // como o dono, e não como quem chamou. Trocar qualquer um dos dois abre o filho.
  test('o web app é só do dono e roda como ele', () => {
    const m = JSON.parse(successorManifest(escopos, 'America/Sao_Paulo'));
    expect(m.webapp).toEqual({ executeAs: 'USER_DEPLOYING', access: 'MYSELF' });
  });
});

describe('successorMessages: o pedido diz o que é proibido, não só o que é desejado', () => {
  const ms = successorMessages('function doGet() {}', '7 runs failed touching the calendar', ['https://www.googleapis.com/auth/calendar.events']);

  test('manda o código vigente e o material real', () => {
    expect(ms[1].content).toContain('function doGet() {}');
    expect(ms[1].content).toContain('7 runs failed touching the calendar');
  });

  // O crivo recusa depois; dizer ANTES é o que faz o Opus não gastar uma geração inteira para ser
  // reprovado por uma regra que ninguém contou a ele.
  test('o sistema enumera as proibições que o crivo aplica', () => {
    const sys = ms[0].content;
    expect(sys).toMatch(/eval/);
    expect(sys).toMatch(/OAuth token/);
    // Sem esta linha o Opus escreveria um filho que chama um modelo, e a geração inteira morreria no
    // crivo — o caso exato que este `describe` existe para evitar.
    expect(sys).toMatch(/no language model and no API key/i);
    expect(sys).toMatch(/must NOT call any model provider/i);
  });

  // P31 — O CONTRATO DE APTIDÃO, dito ao gerador ANTES de ele escrever. O filho recebe uma entrada e
  // devolve a saída; o motor julga. O pedido NÃO pode convidar o filho a se autoavaliar — se o texto
  // mencionasse `score` ou `ok` como algo que o filho devolve, estaria ensinando a trapaça.
  test('o pedido descreve o contrato: `input` entra, `{ output }` sai', () => {
    const sys = ms[0].content;
    expect(sys).toMatch(/e\.parameter\.input/);
    expect(sys).toMatch(/\{\s*output/);
  });

  test('o pedido diz que o filho NÃO se julga — e não sugere campo nenhum para isso', () => {
    const sys = ms[0].content;
    expect(sys).toMatch(/does not grade itself|never grades itself|not grade/i);
    expect(sys).not.toMatch(/\bscore\b/);
    expect(sys).toMatch(/Apps Script API/);
    expect(sys).toMatch(/code only/i);
  });

  test('os escopos concedidos vão no pedido: o filho não pode pedir o que não tem', () => {
    expect(ms[1].content).toContain('calendar.events');
  });
});
