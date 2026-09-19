// A (auditoria 2026-09-18): qual caminho o `onMessage` escolhe, e por quê.
//
// O build de prod remove o escopo IAM e não embute `CHAT_SA_EMAIL_PROD` (build.mjs:34, gasclaw.env). Mas o
// caminho assíncrono usava `createAsChatApp` sem nenhuma guarda: publicar em prod deixaria TODA mensagem no
// "thinking…" para sempre. A escolha agora é por CAPACIDADE — no dia em que a prod tiver a identidade, ela
// migra sozinha, sem tocar em código.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas, type GasEnv } from './gasEnv';
import { RUN_PREFIX } from '../src/run';

const evento = (texto: string) => ({
  type: 'MESSAGE',
  message: { name: 'spaces/AAA/messages/ev1', text: texto, argumentText: texto },
  user: { email: 'dono@x.com' },
  space: { name: 'spaces/AAA', type: 'DM', singleUserBotDm: true },
});

const enfileirados = (env: GasEnv) => Object.keys(env.props).filter((k) => k.startsWith(RUN_PREFIX));

describe('onMessage: escolha do caminho por capacidade', () => {
  let env: GasEnv;
  beforeEach(() => {
    env = stubGas();
  });
  afterEach(() => vi.unstubAllGlobals());

  test('COM identidade do app: aceita rápido, enfileira o run e publica no espaço', async () => {
    env.llm = [{ content: 'nao deveria ser chamado agora' }];
    const { onMessage } = await import('../src/main');
    const out = onMessage(evento('o que tenho na agenda?') as never);

    expect(enfileirados(env)).toHaveLength(1); // o worker é quem vai responder
    expect(env.fetched('openrouter.ai')).toHaveLength(0); // nada de LLM dentro dos 30 s do evento
    expect(env.fetched('chat.googleapis.com')).toHaveLength(1); // "thinking…" publicado no espaço
    expect(out).toEqual({});
  });

  test('SEM identidade do app: responde síncrono e a resposta CHEGA ao usuário', async () => {
    vi.stubGlobal('__CHAT_SA_EMAIL__', ''); // é assim que o build de prod sai hoje
    env.llm = [{ content: 'voce tem 3 reunioes' }];
    const { onMessage } = await import('../src/main');
    const out = onMessage(evento('o que tenho na agenda?') as never) as { text?: string };

    expect(out.text).toBe('voce tem 3 reunioes'); // sem entrega posterior, é o único caminho que chega
    expect(env.fetched('openrouter.ai')).toHaveLength(1);
    expect(enfileirados(env)).toHaveLength(0); // nada de run órfão que nunca seria entregue
    expect(env.fetched('chat.googleapis.com')).toHaveLength(0); // nem tenta usar o app que não existe
  });

  test('a escolha do caminho síncrono fica observável no trace', async () => {
    vi.stubGlobal('__CHAT_SA_EMAIL__', '');
    env.llm = [{ content: 'ok' }];
    const { onMessage } = await import('../src/main');
    onMessage(evento('oi') as never);

    const runs = Object.entries(env.cache).filter(([k]) => k.startsWith('run:')).map(([, v]) => v);
    expect(runs.join(' ')).toContain('entrada_sincrona');
  });
});
