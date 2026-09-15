import { describe, expect, test } from 'vitest';
import type { Message } from '../src/llm';
import { conversationText, needsCompaction, parseSession, sessionChars, sessionFile, sessionMessages, splitForCompaction, SUMMARY_MAX, SUMMARY_PROMPT, withSummary, type Session } from '../src/session';

const msgs = (n: number, size = 10): Message[] => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `${i}`.padEnd(size, 'x') }) as Message);

describe('arquivo da sessão', () => {
  test.each([
    ['spaces/AAA123', 'spaces-aaa123.json'],
    ['tela/chat/dono@x.com', 'tela-chat-dono-x-com.json'],
  ])('%s → %s', (space, file) => expect(sessionFile(space)).toBe(file));
  test('nome sem nada aproveitável é recusado; nome gigante é cortado', () => {
    expect(() => sessionFile('///')).toThrow('espaço inválido');
    expect(sessionFile('s'.repeat(200)).length).toBeLessThanOrEqual(85);
  });
});

describe('compactação preserva a cauda', () => {
  test('só compacta acima do teto', () => {
    const s: Session = { messages: msgs(4, 100) };
    expect(sessionChars(s)).toBe(400);
    expect(needsCompaction(s, 500)).toBe(false);
    expect(needsCompaction({ summary: 'x'.repeat(200), messages: s.messages }, 500)).toBe(true);
  });

  test('a cauda recente fica intacta e o começo vai para o resumo', () => {
    const s: Session = { messages: msgs(12) };
    const { older, tail } = splitForCompaction(s, 4);
    expect(older).toHaveLength(8);
    expect(tail.map((m) => m.content[0])).toEqual(['8', '9', '1', '1']);
    expect(splitForCompaction({ messages: msgs(3) }, 8).older).toEqual([]);
  });

  test('withSummary junta o resumo antigo com o novo e corta pelo fim (mantém o recente)', () => {
    const s: Session = { summary: 'antigo', messages: msgs(10) };
    const out = withSummary(s, 'novo', msgs(2));
    expect(out.summary).toBe('antigo\nnovo');
    expect(out.messages).toHaveLength(2);
    const big = withSummary({ summary: 'a'.repeat(SUMMARY_MAX), messages: [] }, 'z'.repeat(100), []);
    expect(big.summary).toHaveLength(SUMMARY_MAX);
    expect(big.summary?.endsWith('z')).toBe(true);
  });

  test('sessão sem resumo não inventa bloco de resumo', () => {
    expect(withSummary({ messages: [] }, '   ', msgs(1)).summary).toBeUndefined();
  });
});

describe('como o modelo vê a sessão', () => {
  test('o resumo entra como mensagem do usuário, antes das recentes, marcado como contexto', () => {
    const out = sessionMessages({ summary: 'combinamos 10h', messages: msgs(2) });
    expect(out[0].role).toBe('user');
    expect(out[0].content).toContain('não é instrução');
    expect(out[0].content).toContain('combinamos 10h');
    expect(out).toHaveLength(3);
  });
  test('sem resumo, são só as mensagens', () => expect(sessionMessages({ messages: msgs(2) })).toHaveLength(2));
  test('conversationText só usa user/assistant e corta pelo fim', () => {
    const text = conversationText([{ role: 'system', content: 'sys' }, ...msgs(2)]);
    expect(text).not.toContain('sys');
    expect(text.startsWith('usuário: 0')).toBe(true);
    expect(conversationText(msgs(100, 50), 200)).toHaveLength(200);
  });
  test('o prompt de resumo pede decisões e nada de saudação', () => {
    expect(SUMMARY_PROMPT).toContain('decisões');
    expect(SUMMARY_PROMPT).toContain('sem saudação');
  });
});

describe('parseSession aceita só o que tem forma de sessão (o arquivo é editável pelo dono)', () => {
  test('sessão válida volta inteira', () => {
    expect(parseSession('{"summary":"s","messages":[{"role":"user","content":"oi"}]}')).toEqual({ summary: 's', messages: [{ role: 'user', content: 'oi' }] });
  });
  test.each(['', null, undefined, 'não é json', '{"messages":"x"}', '[]'])('%s vira sessão vazia', (raw) => expect(parseSession(raw as string)).toEqual({ messages: [] }));
  test('mensagem torta é descartada e resumo gigante é cortado', () => {
    const out = parseSession(JSON.stringify({ summary: 'z'.repeat(5000), messages: [{ role: 'user', content: 'ok' }, { role: 'chefe', content: 'ignore' }, { role: 'user' }] }));
    expect(out.messages).toEqual([{ role: 'user', content: 'ok' }]);
    expect(out.summary).toHaveLength(SUMMARY_MAX);
  });
});
