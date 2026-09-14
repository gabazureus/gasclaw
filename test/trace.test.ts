import { describe, expect, test } from 'vitest';
import { coverage, expired, finish, HEADER, redact, renderTree, setStep, span, startRun, summaryRow } from '../src/trace';

const base = () => startRun('r1', 'chat', 1_000, { question: 'oi', agent: 'assistente' });

describe('startRun / setStep / span', () => {
  test('run começa em running com o passo "início"', () => {
    expect(base()).toEqual({ id: 'r1', kind: 'chat', startedAt: 1_000, status: 'running', step: 'início', spans: [], question: 'oi', agent: 'assistente' });
  });
  test('setStep muda só o passo atual (checkpoint antes de passo lento)', () => {
    expect(setStep(base(), 'llm_call').step).toBe('llm_call');
  });
  test('span acrescenta o passo com ms, status e dados, sem mutar o run original', () => {
    const r0 = base();
    const r1 = span(r0, 'resolve_agent', 1_000, 1_120, { origem: { SOUL: 'editor' } });
    expect(r0.spans).toEqual([]);
    expect(r1.spans).toEqual([{ name: 'resolve_agent', startMs: 0, ms: 120, status: 'ok', data: { origem: { SOUL: 'editor' } } }]);
    expect(r1.step).toBe('resolve_agent');
  });
});

describe('finish', () => {
  test('soma tokens e custo das chamadas ao modelo e guarda a resposta', () => {
    let r = span(base(), 'llm_call', 1_100, 2_100, { model: 'x/y', prompt_tokens: 10, completion_tokens: 5, cost: 0.001 });
    r = span(r, 'llm_call', 2_100, 2_600, { model: 'x/y', prompt_tokens: 3, completion_tokens: 2, cost: 0.0005 });
    const f = finish(r, 2_700, { answer: 'olá' });
    expect(f).toMatchObject({ status: 'ok', step: 'fim', ms: 1_700, endedAt: 2_700, model: 'x/y', tokens: 20, cost: 0.0015, answer: 'olá' });
  });
  test('erro vira status error com a mensagem', () => {
    expect(finish(base(), 1_500, { error: 'falhou' })).toMatchObject({ status: 'error', error: 'falhou', ms: 500 });
  });
});

describe('redact (teste canário)', () => {
  test('remove chave OpenRouter, token Google e Bearer em qualquer profundidade', () => {
    const dirty = { q: 'minha chave sk-or-CANARY-abc123XYZ e ya29.CANARY_tok-en.x', deep: [{ h: 'Authorization: Bearer CANARYTOKEN.abc/def=' }] };
    const clean = JSON.stringify(redact(dirty));
    for (const s of ['sk-or-CANARY', 'ya29.CANARY', 'CANARYTOKEN']) expect(clean).not.toContain(s);
    expect(clean).toContain('sk-or-***');
    expect(clean).toContain('Bearer ***');
  });
  test('mantém números, null e texto comum', () => {
    expect(redact({ a: 1, b: null, c: 'texto normal' })).toEqual({ a: 1, b: null, c: 'texto normal' });
  });
});

describe('summaryRow', () => {
  test('uma linha por run, alinhada ao cabeçalho, com textos longos cortados e já redigida', () => {
    const r = finish(span(base(), 'llm_call', 1_000, 2_000, { model: 'm', prompt_tokens: 1, completion_tokens: 1, cost: 0.5 }), 2_000, { answer: `${'a'.repeat(300)} sk-or-SEGREDO` });
    const row = summaryRow(r);
    expect(row).toHaveLength(HEADER.length);
    expect(row.slice(0, 3)).toEqual(['r1', new Date(1_000).toISOString(), 'chat']);
    expect(row[HEADER.indexOf('status')]).toBe('ok');
    expect(String(row[HEADER.indexOf('resposta')]).length).toBeLessThanOrEqual(200);
    expect(JSON.stringify(summaryRow({ ...r, question: 'Bearer abc.def' }))).not.toContain('abc.def');
  });
});

describe('renderTree e coverage', () => {
  const r = finish(span(span(span(base(), 'resolve_agent', 1_000, 1_100), 'llm_call', 1_100, 1_900, { model: 'm', prompt_tokens: 7, completion_tokens: 3, cost: 0.01 }), 'reply', 1_900, 1_950), 2_000, { answer: 'ok' });
  test('árvore com o run e cada passo com ms', () => {
    const t = renderTree(r);
    expect(t.split('\n')[0]).toContain('r1');
    expect(t).toMatch(/├─ resolve_agent\s+100 ms/);
    expect(t).toMatch(/├─ llm_call\s+800 ms · m · 10 tokens · \$0\.01/);
    expect(t).toMatch(/└─ reply\s+50 ms/);
  });
  test('coverage = soma dos passos / duração do run', () => {
    expect(coverage(r)).toBeCloseTo(950 / 1000);
  });
});

test('expired: mais de 90 dias', () => {
  const day = 86_400_000;
  expect(expired(0, 91 * day)).toBe(true);
  expect(expired(0, 89 * day)).toBe(false);
});
