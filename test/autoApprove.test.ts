// Auto-aprovação por LISTA DE NOMES — o que sobrou de uma linguagem de política reprovada em revisão.
//
// Dois revisores independentes convergiram de lados opostos: uma regra com predicado restringe SÓ o
// argumento que nomeia (prende `id`, deixa 20.000 caracteres de `rows` livres), e a forma `<arg> <= N`
// não tinha nenhuma ferramenta aplicável no registro inteiro. A síntese: uma lista, porque não existe
// regra que prenda um campo e liberte os outros quando não há regra.
import { describe, expect, test } from 'vitest';
import { AUTO_NOTE, cleanAutoList, mayAutoApprove, NEVER_AUTO, noReplySpan, onProactiveBlock } from '../src/autoApprove';

const CONHECIDAS = ['now', 'calendar.list', 'calendar.create', 'gmail.send', 'memory.remove', 'calendar.update'];

describe('o que nunca se auto-aprova', () => {
  // O critério é irreversibilidade PARA TERCEIROS: nenhuma delas se desfaz com um clique, e a pessoa
  // do outro lado nem sabe que existe um agente.
  test('as proibidas são recusadas mesmo estando na lista aprovada', () => {
    for (const t of NEVER_AUTO) {
      expect(mayAutoApprove(t, [t], true).auto).toBe(false);
      expect(mayAutoApprove(t, [t], true).reason).toMatch(/cannot be undone/);
    }
  });

  // A lista CRESCEU na revisão de segurança de 2026-09-20, e a asserção é exaustiva de propósito:
  // acrescentar uma tool irreversível e esquecer de proibi-la aqui tem de quebrar um teste, não
  // passar despercebido. `agent.message` entrou porque fechava o único caminho em que conteúdo de
  // terceiro virava ação sem nenhum clique. (`agent.create` estava aqui pelo mesmo critério e saiu
  // junto com a ferramenta: proibir a auto-aprovação de algo que não existe não protege nada.)
  test('e a lista é exatamente estas seis', () => {
    expect([...NEVER_AUTO].sort()).toEqual(['agent.message', 'calendar.create', 'calendar.update', 'gmail.send', 'memory.remove', 'sheets.append']);
  });
});

describe('fail-closed em toda dúvida', () => {
  test('fora da lista aprovada, não', () => {
    expect(mayAutoApprove('calendar.create', ['now'], true).auto).toBe(false);
  });

  // Auto-aprovação existe para o run que NINGUÉM está olhando. Com o dono do outro lado, perguntar é barato.
  test('num run que o dono pediu, pergunta em vez de assumir', () => {
    expect(mayAutoApprove('calendar.create', ['calendar.create'], false).auto).toBe(false);
    expect(mayAutoApprove('calendar.create', ['calendar.create'], false).reason).toMatch(/owner asked/);
  });

  test('nome vazio não vira permissão', () => {
    expect(mayAutoApprove('  ', ['now'], true).auto).toBe(false);
  });

  test('o caso bom passa: proativo, na lista, e não proibida', () => {
    expect(mayAutoApprove('calendar.list', ['calendar.list'], true)).toEqual({ auto: true, reason: '' });
  });

  // O NÍVEL da tool vence a lista. `always` existe para dizer "esta não se aprova em lote"; deixar a
  // lista desfazer essa declaração daria ao dono um jeito de revogar a própria proteção sem ler que é
  // isso que está fazendo.
  test('uma tool `always` não se auto-aprova nem estando na lista', () => {
    const v = mayAutoApprove('qualquer.coisa', ['qualquer.coisa'], true, 'always');
    expect(v.auto).toBe(false);
    expect(v.reason).toMatch(/every time/);
  });

  test('uma tool `once` na lista continua passando', () => {
    expect(mayAutoApprove('tasks.create', ['tasks.create'], true, 'once').auto).toBe(true);
  });
});

describe('a lista é limpa ao ser gravada, e diz o que caiu', () => {
  // Aceitar um nome proibido e ignorá-lo depois daria ao dono a impressão de ter aprovado o que não
  // aprovou — a mesma razão pela qual parseCapabilities invalida a lista inteira em vez de aceitar meia.
  test('nome proibido e nome inexistente saem, e são RELATADOS', () => {
    const r = cleanAutoList(['now', 'gmail.send', 'inventada', 'calendar.list'], CONHECIDAS);
    expect(r.list).toEqual(['now', 'calendar.list']);
    expect(r.dropped).toEqual(['gmail.send', 'inventada']);
  });

  test('repetição não duplica', () => {
    expect(cleanAutoList(['now', 'now'], CONHECIDAS).list).toEqual(['now']);
  });

  test('entrada que não é lista vira lista vazia, sem lançar', () => {
    for (const ruim of [null, undefined, 'now', 42, {}]) expect(cleanAutoList(ruim, CONHECIDAS).list).toEqual([]);
  });
});

// Quem aprova `calendar.create` pode achar que aprovou mexer na agenda — e mexer é `calendar.update`.
test('o aviso diz o que a lista NÃO cobre, não só o que ela é', () => {
  expect(AUTO_NOTE).toMatch(/never on this list/i);
  expect(AUTO_NOTE).toMatch(/Only for runs nobody asked for/i);
});

// D7: a falha honesta. A revisão escreveu que é ISTO que destrava um run não supervisionado — uma linha
// na casca, não uma linguagem de política.
describe('um run que ninguém pediu não tem direito de perguntar', () => {
  test('esbarrando em aprovação, o run proativo FALHA e diz por quê', () => {
    const r = onProactiveBlock('calendar.create', true);
    expect(r.status).toBe('failed');
    expect(r.status === 'failed' && r.reason).toMatch(/nobody asked for this run/);
  });

  // Ficar `waiting` seria pior que falhar: para quem olha o painel, um run esperando um clique que
  // nunca vem é indistinguível de um run que ainda está trabalhando.
  test('o run que o dono pediu continua parando no card, como sempre', () => {
    expect(onProactiveBlock('calendar.create', false)).toEqual({ status: 'continue' });
  });
});

describe('silêncio é resposta, e precisa aparecer', () => {
  // "Acordou, olhou e não tinha nada" contra "o gatilho não rodou": a primeira é o comportamento certo,
  // a segunda é defeito, e de fora elas parecem iguais.
  test('o span do silêncio carrega o motivo', () => {
    expect(noReplySpan('nothing due today')).toEqual({ name: 'no_reply', why: 'nothing due today' });
  });

  test('sem motivo, ele inventa um legível em vez de vazio', () => {
    expect(noReplySpan('').why).toBe('nothing to say');
  });
});
