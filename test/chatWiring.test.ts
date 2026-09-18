// Fiação real do gatilho (`drainRuns`), não o mock: prompt que sai, URL que sobe e custo que entra no teto.
//
// Estes três defeitos passaram por 871 testes verdes porque cada teste olhava o seu próprio mock:
//   1. a URL do Chat levava `messageReplyOption` sem thread → 400 em 100% das entregas;
//   2. a P2 tirou a mensagem normal do `handleChat` e o caminho assíncrono ficou sem CHAT_FORMAT_RULES;
//   3. o resumo da sessão chamava o modelo fora do `llm_call` → custo invisível e fora do teto do run.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas, type GasEnv } from './gasEnv';
import { newRun, queueKey, pointerOf, parseRun, type DurableRun } from '../src/run';
import { newChatDelivery } from '../src/chatDelivery';
import { runFile, runIO } from '../src/runStore';
import { sessionFile } from '../src/session';

const FOLDER = 'f1';
const SESSION = `${FOLDER}:spaces/AAA`;
const REQ = '00000001-1111-4222-8333-444444444444';

/** Põe um run pronto para o pump pela BORDA real: estado no Drive, ponteiro na fila e autoridade assinada. */
function queue(env: GasEnv, r: DurableRun) {
  runIO().enqueue(r, 1000);
}

/** Edita o JSON do run na pasta compartilhada, como faria quem tem acesso de editor a ela. */
function tamperDrive(env: GasEnv, runId: string, mudanca: (r: DurableRun) => DurableRun) {
  const atual = parseRun(env.drive.get(`${FOLDER}/.gasclaw/runs/${runFile(runId)}`))!;
  env.drive.set(`${FOLDER}/.gasclaw/runs/${runFile(runId)}`, JSON.stringify(mudanca(atual)));
}

const chatRun = (over: Partial<DurableRun> = {}): DurableRun => ({
  ...newRun({ runId: 'r-chat', session: SESSION, folderId: FOLDER, user: 'dono@x.com', text: 'oi', now: 1000, ownerDm: true, delivery: newChatDelivery('spaces/AAA', undefined, REQ, 1000, 0) }),
  ...over,
});

/** O que o gasclaw mandou ao OpenRouter, já desempacotado. */
const prompts = (env: GasEnv) =>
  env.fetched('openrouter.ai').map((c) => JSON.parse(String(c.init.payload)) as { messages: { role: string; content: string }[] });

describe('fiação do gatilho: o que realmente sobe para os sistemas externos', () => {
  let env: GasEnv;
  beforeEach(() => {
    env = stubGas();
  });
  afterEach(() => vi.unstubAllGlobals());

  test('resposta do Chat leva as regras de formatação no system prompt', async () => {
    queue(env, chatRun());
    env.llm = [{ content: 'pronto' }];
    const { drainRuns } = await import('../src/main');
    drainRuns();

    const system = prompts(env)[0]?.messages.find((m) => m.role === 'system')?.content ?? '';
    expect(system).toContain('## Formato da resposta no Google Chat');
  });

  test('run da tela (sem entrega) NÃO leva as regras do Chat', async () => {
    queue(env, { ...chatRun({ runId: 'r-tela' }), delivery: undefined });
    env.llm = [{ content: 'pronto' }];
    const { drainRuns } = await import('../src/main');
    drainRuns();

    const system = prompts(env)[0]?.messages.find((m) => m.role === 'system')?.content ?? '';
    expect(system).not.toContain('## Formato da resposta no Google Chat');
  });

  test('a URL da Chat API não leva messageReplyOption quando não há thread (regressão do 400 da v83)', async () => {
    queue(env, chatRun());
    env.llm = [{ content: 'pronto' }];
    const { drainRuns } = await import('../src/main');
    drainRuns();

    const [post] = env.fetched('chat.googleapis.com');
    expect(post?.url).toBe(`https://chat.googleapis.com/v1/spaces/AAA/messages?requestId=${REQ}`);
    expect(post.url).not.toContain('messageReplyOption');
  });

  test('a entrega sai e o run deixa a fila', async () => {
    queue(env, chatRun());
    env.llm = [{ content: 'pronto' }];
    const { drainRuns } = await import('../src/main');
    drainRuns();

    const saved = parseRun(env.drive.get(`${FOLDER}/.gasclaw/runs/${runFile('r-chat')}`));
    expect([saved?.status, saved?.delivery?.status, saved?.delivery?.messageName]).toEqual(['done', 'sent', 'spaces/AAA/messages/msg1']);
    expect(env.props[queueKey('r-chat')]).toBeUndefined();
  });

  // Auditoria 2026-09-18: uma unica mensagem que pedia aprovacao travava a fila INTEIRA — o run `waiting`
  // ficava para sempre como o mais antigo reivindicavel e nenhuma outra pergunta era atendida.
  test('run que para para pedir aprovação sai da fila e não afoga a mensagem seguinte', async () => {
    const esperando: DurableRun = {
      ...chatRun({ runId: 'r-waiting' }),
      status: 'waiting',
      pending: { kind: 'approval', name: 'gmail.draft', callId: 'c1', key: 'r-waiting:0:c1', args: {} } as never,
      snapshot: { messages: [{ role: 'user', content: 'mande o email' }], step: 0, queue: [] } as never,
    };
    queue(env, esperando);
    // chegou depois, mas so e atendida se o run `waiting` liberar a fila
    const seguinte = { ...chatRun({ runId: 'r-normal', text: 'que horas sao?' }), session: `${FOLDER}:spaces/BBB` };
    runIO().enqueue(seguinte, 5000);
    env.llm = [{ content: 'sao tres horas' }];

    const { drainRuns } = await import('../src/main');
    drainRuns();

    expect(parseRun(env.drive.get(`${FOLDER}/.gasclaw/runs/${runFile('r-normal')}`))?.status).toBe('done');
    expect(env.props[queueKey('r-waiting')]).toBeUndefined(); // esperar o usuário não é trabalho do pump
  });

  // Reproduz o incidente da v83 no gatilho real: com o Chat devolvendo 400, a entrega girava para sempre
  // (20 POSTs por tique, ~28.800/dia). Agora esgota MAX_ATTEMPTS, para — e a resposta continua no painel.
  test('entrega recusada pelo Chat para de tentar e não descarta a resposta', async () => {
    env.chatCode = 400;
    queue(env, chatRun());
    env.llm = [{ content: 'aqui está sua agenda' }];
    const { drainRuns } = await import('../src/main');
    for (let i = 0; i < 4; i++) drainRuns();
    const postsDepoisDeParar = env.fetched('chat.googleapis.com').length;
    drainRuns();

    expect(env.fetched('chat.googleapis.com').length).toBe(postsDepoisDeParar); // nao insiste mais
    expect(env.props[queueKey('r-chat')]).toBeUndefined();
    const saved = parseRun(env.drive.get(`${FOLDER}/.gasclaw/runs/${runFile('r-chat')}`));
    expect(saved?.answer).toBe('aqui está sua agenda'); // a resposta do usuário sobreviveu
    expect([saved?.status, saved?.delivery?.status]).toEqual(['done', 'failed']);
  });

  // Fatia 1 da Opcao 2 (auditoria 2026-09-18). A pasta do agente e compartilhavel: quem tem edicao nela
  // trocava `delivery.space` no JSON do run e a resposta do DONO era publicada no espaco do atacante.
  // Exfiltracao direta, sem depender de clique. Agora o destino e autoridade e mora no ponteiro.
  test('ataque: trocar delivery.space no arquivo do run NÃO exfiltra a resposta', async () => {
    const r = chatRun();
    queue(env, r); // autoridade gravada com o espaço legítimo, vindo do evento autenticado
    // ...e só então o atacante edita o arquivo na pasta compartilhada
    tamperDrive(env, r.runId, (a) => ({ ...a, delivery: { ...a.delivery!, space: 'spaces/ATACANTE' } }));
    env.llm = [{ content: 'o saldo da conta é 42' }];

    const { drainRuns } = await import('../src/main');
    drainRuns();
    drainRuns();

    const urls = env.fetched('chat.googleapis.com').map((c) => c.url).join(' ');
    expect(urls).not.toContain('ATACANTE'); // nada foi publicado no espaço do atacante
    expect(env.fetched('chat.googleapis.com')).toHaveLength(0); // nem tentou
    const saved = parseRun(env.drive.get(`${FOLDER}/.gasclaw/runs/${runFile(r.runId)}`));
    expect(saved?.delivery?.status).toBe('failed'); // recusa definitiva
    expect(saved?.error).toMatch(/destino/i); // e o motivo é honesto
    expect(saved?.answer).toBe('o saldo da conta é 42'); // a resposta continua acessível no painel
    expect(env.props[queueKey(r.runId)]).toBeUndefined();
  });

  test('o resumo da sessão entra no teto do run: as duas chamadas ao modelo são cobradas', async () => {
    // sessão acima de SESSION_MAX_CHARS força a compactação logo depois da resposta
    const long = Array.from({ length: 12 }, (_, n) => ({ role: n % 2 ? 'assistant' : 'user', content: 'x'.repeat(1200) }));
    env.drive.set(`${FOLDER}/.gasclaw/sessions/${sessionFile(SESSION)}`, JSON.stringify({ messages: long }));
    queue(env, chatRun());
    env.llm = [{ content: 'pronto', cost: 0.01 }, { content: 'resumo da conversa', cost: 0.01 }];
    const { drainRuns } = await import('../src/main');
    drainRuns();

    expect(env.fetched('openrouter.ai')).toHaveLength(2); // turno + resumo
    const saved = parseRun(env.drive.get(`${FOLDER}/.gasclaw/runs/${runFile('r-chat')}`));
    expect(saved?.budget.usedUsd).toBeCloseTo(0.02, 6); // o resumo não pode sair de graça
  });
});

