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
    expect(sys).toMatch(/Apps Script API/);
    expect(sys).toMatch(/code only/i);
  });

  test('os escopos concedidos vão no pedido: o filho não pode pedir o que não tem', () => {
    expect(ms[1].content).toContain('calendar.events');
  });
});
