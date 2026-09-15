import { describe, expect, test } from 'vitest';
import { P18_TARGET_MS, p18Verdict } from '../poc/p18-sessoes/harness';

const sample = (cacheMs: number, driveMs: number) => ({ cacheMs, driveMs });

describe('P18: custo da sessão no Drive por turno (alvo ≤ 300 ms)', () => {
  test('diferença pequena passa, na média e no p95', () => {
    const r = p18Verdict([sample(40, 180), sample(50, 200), sample(45, 190)]);
    expect(r).toMatchObject({ poc: 'P18', pass: true, turns: 3, targetMs: P18_TARGET_MS });
    expect(r.avgDeltaMs).toBe(145);
    expect(r.p95DeltaMs).toBe(150);
  });

  test('um único turno lento em 20 NÃO reprova: com 20 amostras, o p95 é a 19ª (1 em 20 = 5% é o próprio limite)', () => {
    const rapidos = Array.from({ length: 19 }, () => sample(40, 100));
    const r = p18Verdict([...rapidos, sample(40, 900)]);
    expect(r.p95DeltaMs).toBe(60);
    expect(r.pass).toBe(true);
  });

  test('dois turnos lentos em 20 reprovam pelo p95, mesmo com média dentro do alvo', () => {
    const rapidos = Array.from({ length: 18 }, () => sample(40, 100));
    const r = p18Verdict([...rapidos, sample(40, 900), sample(40, 900)]);
    expect(r.avgDeltaMs).toBeLessThanOrEqual(P18_TARGET_MS);
    expect(r.p95DeltaMs).toBe(860);
    expect(r.pass).toBe(false);
  });

  test('média acima do alvo reprova', () => {
    expect(p18Verdict([sample(50, 500), sample(50, 480)]).pass).toBe(false);
  });

  test('Drive mais rápido que o cache não vira crédito (diferença nunca é negativa)', () => {
    const r = p18Verdict([sample(300, 100), sample(300, 120)]);
    expect(r.avgDeltaMs).toBe(0);
    expect(r.pass).toBe(true);
  });

  test('sem amostra não passa (não existe medição vazia aprovada)', () => {
    expect(p18Verdict([])).toMatchObject({ pass: false, turns: 0, avgDeltaMs: 0, p95DeltaMs: 0 });
  });
});
