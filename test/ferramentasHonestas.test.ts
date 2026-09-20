// Ferramentas que devolvem 200 e mentem — a mesma classe do `messageReplyOption` órfão da v83.
//
// O modelo não tem como saber que a resposta está incompleta ou que a busca virou outra coisa: ele recebe uma
// lista plausível e responde com convicção. É pior que um erro, porque um erro o agente conta ao usuário.
//
// Três defeitos, os três verificados contra a API real do Google:
//  1. `qs` descarta valor vazio. Com `query: ''`, o `q` SOME da URL do Gmail e a busca devolve a caixa de
//     entrada inteira — "procure e-mails do fornecedor X" vira "leia meus e-mails".
//  2. `tasks.list` manda `showCompleted` sem `showHidden`. No Google Tasks, tarefa marcada como feita na tela
//     fica *hidden*; sem os dois, "já terminei aquilo?" responde "não" com 200 OK.
//  3. Toda lista trunca em silêncio (agenda 25, tarefas 20, Gmail 10, contatos 10, planilha 200 linhas) e
//     `nextPageToken` não é lido em lugar nenhum. "Some a coluna C" devolve um número plausível e errado.
import { describe, expect, test } from 'vitest';
import { incompleta, qs } from '../src/tools/google';

describe('qs: valor vazio some da URL, e isso muda o sentido da chamada', () => {
  test('o comportamento continua o mesmo (outros parâmetros dependem dele)', () => {
    expect(qs({ a: '', b: 'x' })).toBe('b=x');
  });
});

describe('gmail.search recusa busca vazia em vez de devolver a caixa de entrada', () => {
  test('query vazia ou só espaços é erro, não "tudo"', async () => {
    const { GMAIL_TOOLS } = await import('../src/tools/gmail');
    const search = GMAIL_TOOLS.find((t) => t.name === 'gmail.search')!;
    const ctx = { isOwner: true, google: () => ({ code: 200, body: '{}' }) } as never;
    for (const vazio of ['', '   ', '\n']) {
      expect(() => search.run({ query: vazio }, ctx)).toThrow(/empty|invalid/i);
    }
  });
});

describe('incompleta: a lista para de mentir sobre o próprio tamanho', () => {
  test('sem teto batido e sem página seguinte, não avisa nada', () => {
    expect(incompleta(['a', 'b'], 10)).toBe('a\nb');
  });
  test('quando a API diz que há mais (nextPageToken), avisa', () => {
    expect(incompleta(['a'], 10, 'tok')).toContain('lista incompleta');
  });
  test('quando bate no teto pedido, avisa mesmo sem token', () => {
    expect(incompleta(['a', 'b'], 2)).toContain('lista incompleta');
  });
  test('o aviso diz quantos vieram, para o modelo poder contar a verdade ao usuário', () => {
    expect(incompleta(['a', 'b'], 2)).toContain('2');
  });
  test('lista vazia com teto zero não inventa aviso', () => {
    expect(incompleta([], 25)).toBe('');
  });
});

describe('tasks.list: showCompleted sem showHidden responde o oposto da verdade', () => {
  const chamadas: string[] = [];
  const ctx = () => ({
    isOwner: true, // as ferramentas do Google são só do dono (E6)
    google: (req: { url: string }) => {
      chamadas.push(req.url);
      return { code: 200, body: '{"items":[]}' };
    },
  }) as never;

  test('pedir concluídas manda showHidden junto — senão a tarefa marcada na tela não aparece', async () => {
    const { TASKS_TOOLS } = await import('../src/tools/tasks');
    const list = TASKS_TOOLS.find((t) => t.name === 'tasks.list')!;
    chamadas.length = 0;
    list.run({ showCompleted: true }, ctx());
    expect(chamadas[0]).toContain('showCompleted=true');
    expect(chamadas[0]).toContain('showHidden=true');
  });

  test('sem pedir concluídas, nenhum dos dois é ligado', async () => {
    const { TASKS_TOOLS } = await import('../src/tools/tasks');
    const list = TASKS_TOOLS.find((t) => t.name === 'tasks.list')!;
    chamadas.length = 0;
    list.run({}, ctx());
    expect(chamadas[0]).toContain('showCompleted=false');
    expect(chamadas[0]).toContain('showHidden=false');
  });
});

// Achado 9: a guarda de falha honesta falhava justamente onde mais importa.
describe('failureNotice: sucesso de UMA chamada não apaga a falha de OUTRA na mesma tool', () => {
  const ev = (name: string, argsKey: string, status: 'ok' | 'error', result = '') =>
    ({ name, argsKey, callId: 'c', key: 'k', status, result }) as never;

  test('fan-out de agenda: um período dá certo, outro dá 500 — o usuário precisa saber', async () => {
    const { failureNotice } = await import('../src/agent');
    const aviso = failureNotice([
      ev('calendar.list', 'calendar.list:[["from","2026-01"]]', 'ok', 'reunião A'),
      ev('calendar.list', 'calendar.list:[["from","2026-02"]]', 'error', '{"error":"backend error"}'),
    ]);
    expect(aviso).toContain('calendar'); // antes: null, e o agente respondia a agenda pela metade, com convicção
  });

  test('retry da MESMA chamada que depois deu certo continua sem gerar aviso', async () => {
    const { failureNotice } = await import('../src/agent');
    const mesma = 'calendar.list:[["from","2026-01"]]';
    expect(failureNotice([ev('calendar.list', mesma, 'error', 'timeout'), ev('calendar.list', mesma, 'ok', 'reunião A')])).toBeNull();
  });

  test('tool de efeito que falhou diz que nada foi feito', async () => {
    const { failureNotice } = await import('../src/agent');
    const aviso = failureNotice([ev('gmail.send', 'gmail.send:[["to","ana@x.com"]]', 'error', 'quota')]);
    expect(aviso).toContain('Nada foi feito');
  });
});

// As três que sobraram. O helper `incompleta` já existia — a própria documentação dele cita "contatos 10" e
// "planilha 200 linhas" — mas esses dois chamadores nunca foram ligados nele. `sheets.read` é o pior caso do
// conjunto: numa planilha de 5.000 linhas ele devolve as 200 primeiras sem dizer nada, e "some a coluna C"
// vira um número plausível e errado. Um número errado que parece certo é pior que um erro.
describe('as listas que ainda truncavam em silêncio', () => {
  const ctx = (responder: (r: { url: string }) => { code: number; body: string }) => {
    const reqs: { url: string }[] = [];
    return {
      c: { now: () => '', ownerDm: true, isOwner: true, memory: { read: () => '', write: () => {} }, google: (r: { url: string }) => (reqs.push(r), responder(r)) } as never,
      reqs,
    };
  };

  test('sheets.read avisa quando a planilha tem mais linhas que o teto', async () => {
    const { TOOLS, findTool } = await import('../src/tools/registry');
    const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
    const muitas = Array.from({ length: 250 }, (_, i) => [`linha ${i}`]);
    const { c } = ctx(() => ({ code: 200, body: JSON.stringify({ values: muitas }) }));
    const out = findTool(TOOLS, 'sheets.read')!.run({ id, range: 'Plan1!A1:A250' }, c);
    expect(out).toContain('lista incompleta');
    expect(out).toContain('200'); // quantas vieram de verdade
  });

  test('sheets.read NÃO avisa quando a planilha coube inteira', async () => {
    const { TOOLS, findTool } = await import('../src/tools/registry');
    const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
    const { c } = ctx(() => ({ code: 200, body: JSON.stringify({ values: [['a'], ['b']] }) }));
    expect(findTool(TOOLS, 'sheets.read')!.run({ id, range: 'Plan1!A1:A2' }, c)).not.toContain('lista incompleta');
  });

  test('contacts.find avisa quando bate no teto de 10', async () => {
    const { CONTACTS_TOOLS, resetContactsWarmup } = await import('../src/tools/contacts');
    resetContactsWarmup();
    const pessoas = Array.from({ length: 10 }, (_, i) => ({ person: { names: [{ displayName: `Ana ${i}` }], emailAddresses: [{ value: `ana${i}@acme.com` }] } }));
    const { c } = ctx((r) => ({ code: 200, body: JSON.stringify(r.url.includes('otherContacts') ? { results: [] } : { results: pessoas }) }));
    const out = CONTACTS_TOOLS[0].run({ name: 'Ana' }, c);
    expect(out).toContain('lista incompleta');
  });

  test('drive.search avisa quando bate no teto de 10', async () => {
    const { TOOLS, findTool } = await import('../src/tools/registry');
    const files = Array.from({ length: 10 }, (_, i) => ({ id: `id${i}`, name: `Doc ${i}`, mimeType: 'application/pdf', modifiedTime: '2030-01-15T10:00:00Z', webViewLink: 'https://x' }));
    const { c } = ctx(() => ({ code: 200, body: JSON.stringify({ files }) }));
    expect(findTool(TOOLS, 'drive.search')!.run({ query: 'doc' }, c)).toContain('lista incompleta');
  });
});
