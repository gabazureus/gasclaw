// O registro de projetos filhos e, sobretudo, a leitura do estado de autorização.
//
// A P24 mediu, no dev v96, que um filho criado e implantado pela API NÃO executa até o dono consentir:
// a URL dele devolve uma página "Authorization needed" — **com código 200**. Por isso o teste mais
// importante deste arquivo é o que prova que olhar só o código diria "autorizado" justamente para o caso
// que não está autorizado. Dizer ao dono que um filho está liberado quando ele não está é pior do que
// não mostrar nada: ele pararia de procurar o botão.
import { describe, expect, test } from 'vitest';
import { AUTH_LABEL, authState, KIND_LABEL, KIND_WHAT, parseChild, parseChildren, redirectTarget, serializeChildren, withChild, withoutChild, type Child } from '../src/children';

const filho = (o: Partial<Child> = {}): Child => ({
  scriptId: 'abc123',
  kind: 'automation',
  folderId: null,
  title: 'agenda specialist',
  url: 'https://script.google.com/macros/s/x/exec',
  scopes: ['https://www.googleapis.com/auth/calendar.events'],
  parent: 'f1',
  reason: '7 runs failed touching the calendar',
  at: 1_700_000_000_000,
  ...o,
});

describe('authState: nunca afirmar autorizado sem prova', () => {
  // O achado da P24, virado em teste: a tela de consentimento vem com 200.
  test('a página de consentimento do Google tem código 200 e NÃO é autorização', () => {
    const consent = '<html><head><title>Authorization needed</title><style>.auth-body {font-family:';
    expect(authState('https://x/exec', 200, consent)).toBe('needs-consent');
  });

  test('as outras marcas da mesma página também são reconhecidas', () => {
    for (const corpo of ['<div id="auth-required">', 'authorize?enable_granular_consent=true']) {
      expect(authState('https://x/exec', 200, corpo)).toBe('needs-consent');
    }
  });

  test('conteúdo do filho com 200 é autorização', () => {
    expect(authState('https://x/exec', 200, 'p24-ok')).toBe('authorized');
  });

  test('sem URL o filho nem foi implantado — e isso não é "precisa autorizar"', () => {
    expect(authState(null, null, null)).toBe('not-deployed');
  });

  // Fail-closed: o que não foi verificado não vira permissão.
  test('falha de rede, corpo vazio e código inesperado viram `unknown`, nunca `authorized`', () => {
    expect(authState('https://x/exec', null, null)).toBe('unknown');
    expect(authState('https://x/exec', 200, '')).toBe('unknown');
    expect(authState('https://x/exec', 500, 'boom')).toBe('unknown');
    expect(authState('https://x/exec', 302, 'redirect')).toBe('unknown');
  });

  test('todo estado tem texto, e nenhum promete mais do que foi verificado', () => {
    expect(Object.keys(AUTH_LABEL).sort()).toEqual(['authorized', 'needs-consent', 'not-deployed', 'unknown']);
    expect(AUTH_LABEL.unknown).toMatch(/could not check/i);
  });
});

describe('parseChild: só entra o que permite o dono decidir', () => {
  test('sem scriptId não há filho', () => {
    for (const ruim of [null, undefined, 42, {}, { scriptId: '   ' }]) expect(parseChild(ruim)).toBeNull();
  });

  test('os escopos pedidos são preservados — é o que o dono lê antes de consentir', () => {
    expect(parseChild(filho())?.scopes).toEqual(['https://www.googleapis.com/auth/calendar.events']);
  });

  // Um destino http seria rebaixamento silencioso do canal por onde a chave pode trafegar.
  test('URL que não é https vira null em vez de ser usada', () => {
    expect(parseChild({ ...filho(), url: 'http://script.google.com/exec' })?.url).toBeNull();
    expect(parseChild({ ...filho(), url: 'javascript:alert(1)' })?.url).toBeNull();
  });

  test('sem título, o scriptId serve de nome — melhor que uma linha em branco na tela', () => {
    expect(parseChild({ scriptId: 'zzz' })?.title).toBe('zzz');
  });
});

// A distinção que decide se há CREDENCIAL em jogo: automação é só código e nunca fala com modelo, logo
// nunca precisa da chave. Sub-agente tem pasta e conversa, e só ele precisa. Errar o tipo para o lado da
// automação é errar para o lado seguro — por isso o parse é fail-closed nele.
describe('tipo do filho: automação x sub-agente', () => {
  test('o que não se declara sub-agente é automação', () => {
    for (const bruto of [{ scriptId: 'a' }, { scriptId: 'a', kind: 'agent' }, { scriptId: 'a', kind: 42 }]) {
      expect(parseChild(bruto)?.kind).toBe('automation');
    }
  });

  test('automação NÃO tem pasta, mesmo que alguém declare uma', () => {
    expect(parseChild({ scriptId: 'a', kind: 'automation', folderId: 'pasta' })?.folderId).toBeNull();
  });

  // O REBAIXAMENTO, que é o que torna a opção 4 da ADR-040 retroativa. Um filho gravado como
  // `subagent` ANTES da decisão volta da Property como `automation`, e a pasta dele é descartada.
  // Sem isso, o dado antigo continuaria nomeando uma forma que não existe mais — e a tela mostraria
  // um "sub agent" que nenhum código sabe mais tratar.
  test('um `subagent` GRAVADO volta como automação, e a pasta dele é descartada', () => {
    const c = parseChild({ scriptId: 'a', kind: 'subagent', folderId: 'pasta' });
    expect(c?.kind).toBe('automation');
    expect(c?.folderId).toBeNull();
  });

  test('só existe um tipo, e o texto dele diz a coisa que importa: nenhuma chave', () => {
    expect(KIND_WHAT.automation).toMatch(/no API key/i);
    expect(KIND_LABEL.automation).toBe('automation');
    expect(Object.keys(KIND_LABEL)).toEqual(['automation']);
  });
});

describe('parseChildren: um filho corrompido não cega o painel', () => {
  test('entrada inválida é descartada e o resto sobrevive', () => {
    const json = JSON.stringify([filho(), { lixo: true }, filho({ scriptId: 'b' })]);
    expect(parseChildren(json).map((c) => c.scriptId)).toEqual(['abc123', 'b']);
  });

  test('JSON quebrado, nulo e não-lista devolvem lista vazia sem lançar', () => {
    for (const ruim of ['{quebrado', null, '{"a":1}', '42']) expect(parseChildren(ruim as string | null)).toEqual([]);
  });
});

describe('serializeChildren: recusa em vez de estourar a Property', () => {
  test('lista normal serializa e volta igual', () => {
    expect(parseChildren(serializeChildren([filho()]))).toEqual([filho()]);
  });

  // A lição do saveAgents: sem guarda, o estouro lança exceção crua e quebra o painel.
  test('lista grande demais é recusada com o número, não truncada em silêncio', () => {
    const muitos = Array.from({ length: 41 }, (_, i) => filho({ scriptId: `id-${i}` }));
    expect(() => serializeChildren(muitos)).toThrow(/too many child projects: 41/);
  });

  test('conteúdo grande demais é recusado pelo tamanho em caracteres', () => {
    const gordos = Array.from({ length: 30 }, (_, i) => filho({ scriptId: `id-${i}`, reason: 'x'.repeat(300), title: 'y'.repeat(120) }));
    expect(() => serializeChildren(gordos)).toThrow(/does not fit/);
  });
});

describe('withChild e withoutChild', () => {
  test('registrar o mesmo scriptId duas vezes substitui, não duplica', () => {
    const lista = withChild(withChild([], filho()), filho({ title: 'renomeado' }));
    expect(lista).toHaveLength(1);
    expect(lista[0].title).toBe('renomeado');
  });

  test('remover tira só o alvo', () => {
    const lista = withChild(withChild([], filho()), filho({ scriptId: 'b' }));
    expect(withoutChild(lista, 'abc123').map((c) => c.scriptId)).toEqual(['b']);
  });
});

// O defeito que chegou do uso real: a tela disse "Open it" (ou seja, AUTORIZADO) para um filho que ainda
// não estava — e o dono só descobriu porque clicou assim mesmo e caiu na tela de consentimento.
//
// A causa não estava na regra, estava em QUEM FAZIA A PERGUNTA: o painel chamava a URL do filho SEM o
// token do script. Uma chamada anônima a um web app `access: MYSELF` recebe a PÁGINA DE LOGIN — um 200
// com HTML dentro e sem a marca "Authorization needed". O fail-closed foi derrotado por baixo.
describe('página de login não é autorização', () => {
  test('o corpo de um login do Google vira `unknown`, nunca `authorized`', () => {
    const logins = [
      '<html><head><title>Sign in - Google Accounts</title>',
      '<form action="https://accounts.google.com/ServiceLogin">',
      '<div id="identifier_next">',
    ];
    for (const corpo of logins) expect(authState('https://x/exec', 200, corpo)).toBe('unknown');
  });

  // A regra continua valendo para o caso bom: conteúdo do filho de verdade é autorização.
  test('o conteúdo do filho continua sendo lido como autorizado', () => {
    expect(authState('https://x/exec', 200, 'p24-ok')).toBe('authorized');
  });
});

// O REDIRECIONAMENTO DO APPS SCRIPT (P31). Web apps servem a saída do `ContentService` com HTTP 302
// para `script.googleusercontent.com`. `fetchChild` desliga `followRedirects` — e por um bom motivo:
// seguir às cegas levaria o token de 16 escopos para onde o destino mandasse. Mas sem seguir, o motor
// recebe o 302 e não a resposta do filho: todo caso de um filho CORRETO seria julgado falho, e o
// `authState` diria "unknown" para um filho autorizado.
//
// PREVISTO, NÃO MEDIDO: nenhum filho autorizado foi observado neste projeto até aqui. A decisão
// abaixo é escrita para que, se a previsão estiver errada, a falha caia no lado seguro.
describe('redirectTarget: seguir o 302 só para onde o Apps Script entrega, e nunca com o token', () => {
  test('302 para script.googleusercontent.com é seguido', () => {
    expect(redirectTarget(302, 'https://script.googleusercontent.com/macros/echo?user_content_key=abc')).toBe('https://script.googleusercontent.com/macros/echo?user_content_key=abc');
  });

  test('os outros códigos de redirecionamento também', () => {
    for (const c of [301, 303, 307, 308]) expect(redirectTarget(c, 'https://script.googleusercontent.com/x')).not.toBeNull();
  });

  // A razão de `followRedirects: false` existir continua valendo: destino fora do Google é recusado.
  test('302 para qualquer outro host NÃO é seguido — é a exfiltração que a guarda existe para impedir', () => {
    for (const l of ['https://evil.example/steal', 'https://script.googleusercontent.com.evil.example/x', 'http://script.googleusercontent.com/x', 'https://accounts.google.com/ServiceLogin']) {
      expect(redirectTarget(302, l)).toBeNull();
    }
  });

  test('200 não tem destino, e 302 sem Location também não', () => {
    expect(redirectTarget(200, 'https://script.googleusercontent.com/x')).toBeNull();
    expect(redirectTarget(302, null)).toBeNull();
  });
});
