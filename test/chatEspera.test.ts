// O RUN DO CHAT QUE ESPERA O DONO (incidente de 2026-09-21, dev, sucessor v22).
//
// O dono mandou no Chat um pedido que criava tarefas. O run parou em `waiting` pedindo aprovação de
// `tasks.create` — e o Chat ficou no "thinking…" para sempre. A entrega só olhava `done`/`failed`; o cartão
// de aprovação existia (e o clique `durableChatClick` também), mas ninguém o POSTAVA quando o run entrava em
// espera. O mesmo valia para `ask` e para `paused` (teto de custo). Aqui, pela fiação real do gatilho.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas, type GasEnv } from './gasEnv';
import { newRun, parseRun, type DurableRun } from '../src/run';
import { newChatDelivery } from '../src/chatDelivery';
import { runFile, runIO } from '../src/runStore';

const FOLDER = 'f1';
const REQ = '00000001-1111-4222-8333-444444444444';
const base = (runId: string): DurableRun =>
  newRun({ runId, session: `${FOLDER}:spaces/AAA`, folderId: FOLDER, user: 'dono@x.com', text: 'organize minha semana', now: 1000, ownerDm: true, delivery: newChatDelivery('spaces/AAA', undefined, REQ, 1000, 0) });
const snapshot = { messages: [{ role: 'user', content: 'organize minha semana' }], step: 0, queue: [] } as never;
const esperandoAprovacao = (): DurableRun => ({
  ...base('r-aprova'),
  status: 'waiting',
  answer: 'May I use tasks.create? I need your approval.',
  pending: { kind: 'approval', name: 'tasks.create', callId: 'c1', key: 'r-aprova:0:c1', args: { title: 'Verificar alerta' } } as never,
  snapshot,
});
const esperandoResposta = (): DurableRun => ({
  ...base('r-ask'),
  status: 'waiting',
  answer: 'Qual horário prefere?',
  pending: { kind: 'ask', name: 'ask', callId: 'c2', key: 'r-ask:0:c2', args: { question: 'Qual horário prefere?', options: 'terça 10h, quarta 15h' } } as never,
  snapshot,
});
const pausado = (): DurableRun => ({ ...base('r-teto'), status: 'paused', budget: { usedUsd: 0.1, capUsd: 0.1 }, answer: 'Parei em US$ 0,10, no teto de US$ 0,10 desta tarefa. Quer que eu continue?', snapshot });

type Card = { cardId: string; card: { sections: { widgets: ({ buttonList?: { buttons: { text: string; onClick: { action: { parameters: { key: string; value: string }[] } } }[] } })[] }[] } };
const cartoes = (env: GasEnv) =>
  env.fetched('chat.googleapis.com/v1/spaces/AAA/messages').map((c) => (JSON.parse(String(c.init.payload)) as { cardsV2?: Card[] }).cardsV2?.[0]).filter(Boolean) as Card[];
const botoes = (c: Card) => c.card.sections.flatMap((s) => s.widgets.flatMap((w) => w.buttonList?.buttons ?? []));
const params = (b: ReturnType<typeof botoes>[number]) => Object.fromEntries(b.onClick.action.parameters.map((p) => [p.key, p.value]));
const salvo = (env: GasEnv, runId: string) => parseRun(env.drive.get(`${FOLDER}/.gasclaw/runs/${runFile(runId)}`));

describe('o run do Chat que para esperando o dono MANDA o cartão ao Chat', () => {
  let env: GasEnv;
  beforeEach(() => {
    vi.resetModules();
    env = stubGas();
  });
  afterEach(() => vi.unstubAllGlobals());

  test('aprovação: o cartão Approve/Deny vai ao espaço, com a credencial gravada no run', async () => {
    runIO().enqueue(esperandoAprovacao(), 1000);
    const { drainRuns } = await import('../src/main');
    drainRuns();
    const [c] = cartoes(env);
    expect(c?.cardId).toBe('approval');
    const [aprovar] = botoes(c);
    expect(params(aprovar)).toMatchObject({ folderId: FOLDER, runId: 'r-aprova', decision: 'approve' });
    expect(salvo(env, 'r-aprova')?.approval).toBeTruthy();
  });

  test('aprovação com credencial ainda válida: não manda de novo (o cartão já está no Chat)', async () => {
    runIO().enqueue(esperandoAprovacao(), 1000);
    const m = await import('../src/main');
    m.drainRuns();
    runIO().enqueue(salvo(env, 'r-aprova')!, 2000); // o mesmo run volta ao pump
    m.drainRuns();
    expect(cartoes(env)).toHaveLength(1);
  });

  test('ask: a pergunta vai com um botão por opção', async () => {
    runIO().enqueue(esperandoResposta(), 1000);
    const { drainRuns } = await import('../src/main');
    drainRuns();
    const [c] = cartoes(env);
    expect(c?.cardId).toBe('question');
    expect(botoes(c).map((b) => b.text)).toEqual(['terça 10h', 'quarta 15h']);
  });

  test('teto de custo: o aviso vai com o botão Continue', async () => {
    runIO().enqueue(pausado(), 1000);
    const { drainRuns } = await import('../src/main');
    drainRuns();
    const [c] = cartoes(env);
    expect(c?.cardId).toBe('budget');
    expect(params(botoes(c)[0])).toMatchObject({ folderId: FOLDER, runId: 'r-teto', decision: 'continue' });
  });

  test('o mesmo aviso de teto não é mandado duas vezes', async () => {
    runIO().enqueue(pausado(), 1000);
    const m = await import('../src/main');
    m.drainRuns();
    runIO().enqueue(salvo(env, 'r-teto')!, 2000);
    m.drainRuns();
    expect(cartoes(env)).toHaveLength(1);
  });

  test('run da TELA (sem entrega do Chat) em espera: nada vai ao Chat', async () => {
    runIO().enqueue({ ...esperandoAprovacao(), delivery: undefined }, 1000);
    const { drainRuns } = await import('../src/main');
    drainRuns();
    expect(env.fetched('chat.googleapis.com')).toHaveLength(0);
  });
});

describe('o clique em Continue estende o teto — só para o dono do run', () => {
  let env: GasEnv;
  beforeEach(() => {
    vi.resetModules();
    env = stubGas();
  });
  afterEach(() => vi.unstubAllGlobals());
  const clique = (user: string) => ({ type: 'CARD_CLICKED', user: { email: user }, space: { name: 'spaces/AAA' }, common: { parameters: { folderId: FOLDER, runId: 'r-teto', decision: 'continue' } } });

  test('o dono clica: o teto sobe e o run volta a andar', async () => {
    runIO().enqueue(pausado(), 1000);
    env.llm = [{ content: 'terminei' }];
    const m = await import('../src/main');
    m.onCardClick(clique('dono@x.com') as never);
    const r = salvo(env, 'r-teto')!;
    expect(r.status).not.toBe('paused');
    expect(r.budget.capUsd).toBeGreaterThan(0.1);
  });

  test('outra pessoa clica: recusado, o run segue pausado', async () => {
    runIO().enqueue(pausado(), 1000);
    const m = await import('../src/main');
    const out = m.onCardClick(clique('estranho@x.com') as never) as { text?: string };
    expect(out.text).toMatch(/not yours/i);
    expect(salvo(env, 'r-teto')?.status).toBe('paused');
  });
});
