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

// ACHADO AO VIVO (2026-09-23, dev v181): `./gasclaw eval --all` travou em TODOS os cenários com
// "no independent judge for openrouter/auto". Os evals rodam numa pasta PRÓPRIA (`agentes/eval`),
// semeada antes desta rodada com `model: openrouter/auto` — e sem `--model` era esse valor que valia.
// A pasta do eval é caixa de areia do motor, não escolha do dono: sem modelo pedido, vale o do motor.
describe('o eval sem --model usa o modelo do MOTOR, não o que a pasta de teste diz', () => {
  test('runSpec cai no padrão do motor quando ninguém pediu modelo', async () => {
    const { modelForEval } = await import('../src/evalEntry');
    expect(modelForEval(undefined, 'openrouter/auto')).toBe(DEFAULT_MODEL);
    expect(modelForEval(undefined, 'openai/gpt-6-luna')).toBe(DEFAULT_MODEL);
  });

  test('o que o dono pediu no comando vence o padrão', () => {
    return import('../src/evalEntry').then(({ modelForEval }) => {
      expect(modelForEval('test/model', 'openrouter/auto')).toBe('test/model');
    });
  });
});
