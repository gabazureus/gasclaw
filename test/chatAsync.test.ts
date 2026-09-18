import { describe, expect, test, vi } from 'vitest';
import { acceptChatMessage, type ChatAsyncDeps } from '../src/chatAsync';
import type { DurableRun } from '../src/run';

const NOW = 1_700_000_000_000;
const UUID = '123e4567-e89b-42d3-a456-426614174000';

function deps(over: Partial<ChatAsyncDeps> = {}) {
  const runs = new Map<string, DurableRun>();
  const enqueue = vi.fn((run: DurableRun) => void runs.set(run.runId, run));
  const d: ChatAsyncDeps = {
    enabled: () => true,
    owner: () => 'dono@x.com',
    apiKey: () => 'configurada',
    defaultAgent: () => ({ folderId: 'f1', name: 'Assistente' }),
    load: () => ({ name: 'Assistente', folderId: 'f1', system: '', config: { model: 'modelo', suggested: { users: [], tools: [] } }, access: { users: ['dono@x.com'], tools: [] } }),
    loadRun: (_folderId, runId) => runs.get(runId) ?? null,
    enqueue,
    clock: () => NOW,
    uuid: () => UUID,
    ...over,
  };
  return { d, runs, enqueue };
}

const message = (text = 'o que tenho na agenda?') => ({
  type: 'MESSAGE',
  message: { name: 'spaces/AAA/messages/M1', text, thread: { name: 'spaces/AAA/threads/T1' } },
  user: { email: 'dono@x.com' },
  space: { name: 'spaces/AAA', type: 'DM' },
});

describe('entrada assincrona do Google Chat', () => {
  test('persiste e enfileira antes de responder, sem chamar o modelo', () => {
    const { d, enqueue } = deps();

    const out = acceptChatMessage(message(), d);

    expect(out).toEqual({ text: 'pensando...', markupSyntax: 'MARKUP_SYNTAX_MARKDOWN' });
    expect(enqueue).toHaveBeenCalledOnce();
    expect(enqueue.mock.calls[0][0]).toMatchObject({
      runId: 'spaces/AAA/messages/M1',
      session: 'f1:spaces/AAA',
      folderId: 'f1',
      user: 'dono@x.com',
      ownerDm: true,
      text: 'o que tenho na agenda?',
      status: 'queued',
      delivery: {
        // sem `thread`: a resposta entra no fluxo do espaco, mesmo a pergunta tendo vindo de uma thread
        space: 'spaces/AAA',
        requestId: UUID,
        notBefore: NOW,
        status: 'pending',
      },
    });
  });

  test('retry do mesmo evento nao substitui o run nem a requestId', () => {
    const { d, enqueue } = deps();
    acceptChatMessage(message(), d);
    acceptChatMessage(message(), d);
    expect(enqueue).toHaveBeenCalledOnce();
  });

  test('nega antes de enfileirar quando o usuario nao tem acesso', () => {
    const { d, enqueue } = deps({
      load: () => ({ name: 'Assistente', folderId: 'f1', system: '', config: { model: 'modelo', suggested: { users: [], tools: [] } }, access: { users: ['outra@x.com'], tools: [] } }),
    });
    const out = acceptChatMessage({ ...message(), user: { email: 'ana@x.com' } }, d);
    expect(out.text).toContain('não tem acesso');
    expect(enqueue).not.toHaveBeenCalled();
  });

  test('mensagem vazia nao cria run', () => {
    const { d, enqueue } = deps();
    expect(acceptChatMessage(message('   '), d).text).toContain('Mande um texto');
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe('"pensando..." vai para o fluxo do espaco, nao para a thread da pergunta', () => {
  test('publica pela Chat API no espaco e nao responde nada de forma sincrona', () => {
    const postToSpace = vi.fn(() => true);
    const { d } = deps({ postToSpace });
    const out = acceptChatMessage(message() as never, d);

    expect(postToSpace).toHaveBeenCalledWith('spaces/AAA', 'pensando...', UUID);
    expect(out).toEqual({}); // resposta sincrona vazia: o Chat nao cria nada dentro da thread
  });

  test('se a publicacao falhar, cai no "pensando..." sincrono em vez de deixar sem resposta', () => {
    const { d } = deps({ postToSpace: () => false });
    expect(acceptChatMessage(message() as never, d).text).toBe('pensando...');
  });

  test('excecao na publicacao tambem cai no fallback', () => {
    const { d } = deps({ postToSpace: () => { throw new Error('sem escopo'); } });
    expect(acceptChatMessage(message() as never, d).text).toBe('pensando...');
  });

  test('sem postToSpace (canal que nao suporta) continua respondendo sincrono', () => {
    const { d } = deps();
    expect(acceptChatMessage(message() as never, d).text).toBe('pensando...');
  });

  test('o run e enfileirado e a entrega final nao carrega thread', () => {
    const { d, enqueue } = deps({ postToSpace: () => true });
    acceptChatMessage(message() as never, d);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0].delivery?.thread).toBeUndefined();
  });
});
