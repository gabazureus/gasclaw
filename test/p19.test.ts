import { describe, expect, it } from 'vitest';
import { p19Verdict } from '../poc/p19-inflight/verdict';

const base = {
  effectCount: 1,
  inflightName: 'gmail.send',
  doneKeys: [],
  resumedStatus: 'failed' as const,
  stepCalls: 0,
  answer: 'Comecei gmail.send e a execução caiu antes de eu confirmar o resultado. Não vou repetir, para não fazer duas vezes: confira e me diga se refaço.',
};

describe('P19: morte entre efeito e checkpoint', () => {
  it('aprova efeito único, retomada sem repetir e aviso honesto', () => {
    const result = p19Verdict(base);
    expect(result.pass).toBe(true);
    expect(result.checks.map((c) => [c.id, c.pass])).toEqual([
      ['C1', true],
      ['C2', true],
      ['C3', true],
    ]);
  });

  it.each([
    ['efeito não ocorreu', { effectCount: 0 }],
    ['efeito repetiu', { effectCount: 2 }],
    ['marca inflight ausente', { inflightName: undefined }],
    ['done foi gravado apesar da morte', { doneKeys: ['r:0:c1'] }],
    ['passo rodou na retomada', { stepCalls: 1 }],
    ['run não falhou fechado', { resumedStatus: 'queued' as const }],
    ['aviso esconde a incerteza', { answer: 'gmail.send enviado' }],
    ['aviso recusa repetição sem admitir incerteza', { answer: 'gmail.send falhou. Não vou repetir.' }],
  ])('reprova quando %s', (_name, override) => {
    expect(p19Verdict({ ...base, ...override }).pass).toBe(false);
  });
});
