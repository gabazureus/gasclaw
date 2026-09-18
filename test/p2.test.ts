import { describe, expect, test } from 'vitest';
import { p2Verdict, type P2Measurement } from '../poc/p2-chat-async/verdict';

const good = (over: Partial<P2Measurement> = {}): P2Measurement => ({
  eventAt: 1_000,
  sentAt: 121_000,
  space: 'spaces/AAA',
  messageName: 'spaces/AAA/messages/M1',
  retryName: 'spaces/AAA/messages/M1',
  requestIdStable: true,
  confirmedCards: 1,
  expectedCard: true,
  markdownRendered: true,
  mentionNeutralized: true,
  inlineText: 'pensando...',
  inlineMs: 1_200,
  policyExact: true,
  userManagedKeys: 0,
  secretLeaks: 0,
  ...over,
});

describe('veredito P2', () => {
  // Auditoria 2026-09-18: C6a/C6b conferiam que `messages.get` devolve o texto que a propria POC postou —
  // passariam igual com o Chat ignorando `markupSyntax` e o usuario vendo os asteriscos. Criterio que nao
  // pode reprovar e pior que criterio nenhum, entao agora eles seguram o veredito e pedem olho humano.
  test('mesmo com tudo bom, nao passa sozinho: C6a/C6b exigem confirmacao visual', () => {
    const out = p2Verdict(good());
    expect(out.pass).toBe(false);
    expect(out.precisaOlhoHumano).toEqual(['C6a-markdown', 'C6b-mention']);
    expect(out.checks.filter((c) => c.pass)).toHaveLength(9); // todo o resto do instrumento fecha
    expect(out.checks).toHaveLength(11);
  });

  test('o veredito diz em voz alta que C6a/C6b nao sao prova', () => {
    const detalhes = p2Verdict(good()).checks.filter((c) => c.id.startsWith('C6a') || c.id.startsWith('C6b'));
    for (const c of detalhes) expect(c.detail).toContain('NAO PROVA');
  });

  test('os criterios que o instrumento MEDE de verdade continuam fechando', () => {
    const medidos = p2Verdict(good()).checks.filter((c) => !c.id.startsWith('C6a') && !c.id.startsWith('C6b'));
    expect(medidos.every((c) => c.pass)).toBe(true);
  });

  test.each([
    ['cedo', { sentAt: 120_999 }],
    ['tarde', { sentAt: 181_001 }],
    ['duplicado', { retryName: 'spaces/AAA/messages/M2' }],
    ['sem card', { confirmedCards: 0 }],
    ['card errado', { expectedCard: false }],
    ['sem resposta imediata', { inlineText: '' }],
    ['resposta imediata lenta', { inlineMs: 30_001 }],
    ['policy larga', { policyExact: false }],
    ['com chave', { userManagedKeys: 1 }],
    ['vazamento', { secretLeaks: 1 }],
  ])('falha quando %s', (_name, over) => expect(p2Verdict(good(over))).toMatchObject({ pass: false }));
});
