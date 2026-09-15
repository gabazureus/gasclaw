import { describe, expect, test } from 'vitest';
import { summarizeP16, type P16Obs } from '../poc/p16-custo/summary';

const obs = (): P16Obs => ({
  check: { measured: 0.1, informed: 0.101, diffPct: -1, error: null },
  speed: { maxMs: 300 },
  sum: { utc: { igual: true }, sp: { igual: true } },
  setmodel: { picked: 'openai/gpt-4o-mini', runModel: 'openai/gpt-4o-mini-2024-07-18', seconds: 6, usouOEscolhido: true },
  refuse: { semTools: { id: 'x:free', erro: 'não aceita ferramentas' }, comTools: { id: 'y', erro: null } },
  prune: { horasAntigas: 0, diasAntigos: 0, dobrouEmDia: true, sumiu91d: true },
  keycalls: { antes: 0, depois: 1 },
});

describe('summarizeP16', () => {
  test('tudo dentro dos critérios passa', () => expect(summarizeP16(obs()).pass).toBe(true));
  test('C1 falha acima de ±2% ou sem leitura do OpenRouter', () => {
    const o = obs();
    o.check.diffPct = 2.5;
    expect(summarizeP16(o).c1.pass).toBe(false);
    o.check.diffPct = null;
    expect(summarizeP16(o).c1.pass).toBe(false);
  });
  test('C4 falha se o run não usou o modelo escolhido ou demorou mais de 30 s', () => {
    const o = obs();
    o.setmodel.seconds = 31;
    expect(summarizeP16(o).c4.pass).toBe(false);
  });
  test('C5 falha se aceitar modelo sem tools', () => {
    const o = obs();
    o.refuse.semTools.erro = null;
    expect(summarizeP16(o).c5.pass).toBe(false);
  });
  test('C7 falha com mais de 3 chamadas reais ao /key em 30 min', () => {
    const o = obs();
    o.keycalls.depois = 4;
    expect(summarizeP16(o).c7.pass).toBe(false);
  });
});
