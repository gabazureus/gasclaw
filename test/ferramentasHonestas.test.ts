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
      expect(() => search.run({ query: vazio }, ctx)).toThrow(/vazia|inválid/i);
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
