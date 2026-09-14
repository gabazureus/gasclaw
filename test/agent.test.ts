import { expect, test } from 'vitest';
import { reply, trimHistory } from '../src/agent';
import type { Message } from '../src/llm';
import { buildSpec } from '../src/workspace';

const spec = buildSpec('id', 'A', { AGENTS: 'Regras' });

test('trimHistory mantém as últimas N mensagens', () => {
  const h: Message[] = Array.from({ length: 25 }, (_, i) => ({ role: 'user', content: String(i) }));
  const t = trimHistory(h, 20);
  expect(t).toHaveLength(20);
  expect(t[0].content).toBe('5');
});

test('reply envia system + histórico + mensagem e devolve histórico novo', () => {
  let sent: Message[] = [];
  const out = reply(spec, [{ role: 'assistant', content: 'antes' }], 'oi', (m) => {
    sent = m;
    return { text: '  olá  ' };
  });
  expect(sent[0]).toEqual({ role: 'system', content: spec.system });
  expect(sent.slice(1)).toEqual([{ role: 'assistant', content: 'antes' }, { role: 'user', content: 'oi' }]);
  expect(out.text).toBe('olá');
  expect(out.history.slice(-2)).toEqual([{ role: 'user', content: 'oi' }, { role: 'assistant', content: 'olá' }]);
});

test('reply com texto vazio do modelo devolve aviso', () => {
  expect(reply(spec, [], 'oi', () => ({ text: '   ' })).text).toBe('(sem resposta do modelo)');
});
