// F10 — UM MODELO SÓ, e um juiz que é de FAMÍLIA DIFERENTE (decisão do dono, 2026-09-23).
//
// O dono pediu `gpt-6-luna` para tudo. Duas exceções foram DECIDIDAS por ele, e são estruturais:
// - o JUIZ fica noutra família (`deepseek-v4-flash-0731`): juiz e avaliado no mesmo modelo é auto-elogio.
//   `judgeIsIndependent` existia com teste e ZERO chamadores — a regra não valia em lugar nenhum.
// - quem ESCREVE o sucessor fica num modelo forte (`gpt-5.6-sol`): código plausível e quebrado vira
//   projeto implantado com os escopos do dono.
import { describe, expect, test } from 'vitest';
import { DEFAULT_MODEL } from '../src/workspace';
import { CODEGEN_MODEL } from '../src/codegen';
import { JUDGE_MODEL, judgeFor } from '../src/judgeSet';
import { familyOf, judgeIsIndependent } from '../src/dream';

describe('os modelos fixados da F10', () => {
  test('o padrão do motor é o modelo do dono, fixado — nunca roteamento automático', () => {
    expect(DEFAULT_MODEL).toBe('openai/gpt-6-luna');
    expect(familyOf(DEFAULT_MODEL)).toBe('openai');
  });

  test('quem escreve o sucessor é um modelo FIXADO, e não o do agente', () => {
    expect(CODEGEN_MODEL).toBe('openai/gpt-5.6-sol');
    expect(CODEGEN_MODEL).not.toBe(DEFAULT_MODEL);
  });

  test('o juiz é de outra família que o agente E que o escritor do sucessor', () => {
    expect(JUDGE_MODEL).toBe('deepseek/deepseek-v4-flash-0731');
    expect(judgeIsIndependent(DEFAULT_MODEL, JUDGE_MODEL).ok).toBe(true);
    expect(judgeIsIndependent(CODEGEN_MODEL, JUDGE_MODEL).ok).toBe(true);
  });
});

// A REGRA PASSA A VALER: antes, `judgeIsIndependent` não era chamada em lugar nenhum de produção.
describe('judgeFor: a independência do juiz é APLICADA, não só testada', () => {
  test('gerador de outra família: devolve o juiz fixado', () => {
    expect(judgeFor('openai/gpt-6-luna')).toBe(JUDGE_MODEL);
  });

  test('gerador da MESMA família do juiz: recusa, dizendo por quê', () => {
    expect(() => judgeFor('deepseek/deepseek-v4-pro')).toThrow(/self-preference|independent|judge/i);
  });

  test('gerador com roteamento automático: recusa — a família pode virar a do juiz', () => {
    expect(() => judgeFor('openrouter/auto')).toThrow();
  });
});
