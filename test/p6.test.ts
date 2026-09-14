import { describe, expect, test } from 'vitest';
import { checkMarkdown, multipartBody, SOUL_MD, summarizeP6, type RunLike } from '../poc/p6-docs-nativos/harness';

describe('checkMarkdown (C4)', () => {
  test('reconhece títulos H1–H3, lista com marcadores aninhada e lista numerada', () => {
    const md = '# Alma\n\n## Tom\n\n### Exemplos\n\n* item A\n    * item A.1\n* item B\n\n1. primeiro\n2. segundo\n\nTexto com **negrito**.\n';
    expect(checkMarkdown(md)).toEqual({ h1: true, h2: true, h3: true, bullets: true, nested: true, numbered: true, bold: true, pass: true });
  });
  test('texto sem estrutura não passa', () => {
    const r = checkMarkdown('Alma\nTom\nitem A\nprimeiro');
    expect(r.pass).toBe(false);
    expect(r.h1).toBe(false);
  });
  test('o fixture do SOUL tem toda a estrutura que o C4 exige', () => expect(checkMarkdown(SOUL_MD).pass).toBe(true));
});

test('multipartBody monta metadados + conteúdo no formato multipart/related da Drive API', () => {
  const body = multipartBody({ name: 'SOUL', parents: ['p1'] }, '# Alma', 'text/markdown', 'b1');
  expect(body).toBe(
    '--b1\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{"name":"SOUL","parents":["p1"]}\r\n' +
      '--b1\r\nContent-Type: text/markdown; charset=UTF-8\r\n\r\n# Alma\r\n--b1--',
  );
});

describe('summarizeP6', () => {
  const run = (over: Partial<RunLike> = {}): RunLike => ({
    c1: { pass: true, maxMs: 1200, runsMs: [1200] },
    c2: { decision: 'V2', V1: { maxMs: 300, pass: false }, V2: { maxMs: 150, pass: true }, ttl30MaxMs: 20 },
    c3: { previous: 'none' },
    c4: { pass: true },
    c5: { origem: { AGENTS: 'doc', SOUL: 'doc', IDENTITY: 'doc', USER: 'doc' }, mixed: false },
    config: { model: 'openrouter/auto', users: ['a@x.com'], source: 'planilha config' },
    ...over,
  });
  const edited = run({ c3: { previous: 'miss', textChanged: true, invalidated: true } });
  const misto = run({ c5: { origem: { AGENTS: 'doc', SOUL: 'doc', IDENTITY: 'md', USER: 'md' }, mixed: true } });
  const ms = { setupMs: 5000, totalMs: 60_000 };

  test('passa quando C1–C5 passam; C3 vem do run 2 e C5 do misto', () => {
    const s = summarizeP6(run(), edited, misto, ms);
    expect(s.pass).toBe(true);
    expect([s.c1.pass, s.c2.pass, s.c3.pass, s.c4.pass, s.c5.pass]).toEqual([true, true, true, true, true]);
    expect(s.c2.decision).toBe('V2');
    expect(s.config).toEqual({ model: 'openrouter/auto', source: 'planilha config' });
  });
  test('sem variante abaixo de 200 ms, C2 passa pela validade de 30 s se o cache responde rápido', () => {
    const slow = run({ c2: { decision: 'TTL30', V1: { maxMs: 400, pass: false }, V2: { maxMs: 250, pass: false }, ttl30MaxMs: 30 } });
    expect(summarizeP6(slow, edited, misto, ms).c2.pass).toBe(true);
  });
  test('falha se a edição não invalidou o cache (C3)', () => {
    const s = summarizeP6(run(), run({ c3: { previous: 'hit', textChanged: true, invalidated: false } }), misto, ms);
    expect(s.c3.pass).toBe(false);
    expect(s.pass).toBe(false);
  });
  test('falha se o misto não resolveu cada papel na origem esperada (C5)', () => {
    expect(summarizeP6(run(), edited, run(), ms).c5.pass).toBe(false);
  });
});
