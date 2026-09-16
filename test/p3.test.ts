import { describe, expect, test } from 'vitest';
import { P3_IDLE_MAX_MS, P3_PUMP_WAKE_MAX_MS, p3Verdict, type P3Input } from '../poc/p3-pump/verdict';

const zero = (workType: P3Input['stepZero']['workType'], delta = 300): P3Input['stepZero'] => ({
  before: { triggerMsToday: 10_000, count: 5 },
  after: { triggerMsToday: 10_000 + delta, count: 6 },
  workType,
});
const completo = (over: Partial<P3Input> = {}): P3Input => ({
  stepZero: zero('WEBAPP'),
  bulk: { before: { triggerMsToday: 10_300, count: 6 }, after: { triggerMsToday: 30_300, count: 56 }, steps: 50, pumps: 50 },
  idleMs: { normal: 120, afterBatch: 380 },
  quota: { projectedMsPerDay: 2_000_000, limitMsPerDay: 21_600_000 },
  ...over,
});

describe('P3: passo zero decide antes de gastar os 50 steps', () => {
  test('trabalho como TIME_DRIVEN aborta na hora, com um único check', () => {
    const r = p3Verdict(completo({ stepZero: zero('TIME_DRIVEN') }));
    expect(r).toMatchObject({ pass: false, aborted: true });
    expect(r.checks).toHaveLength(1);
    expect(r.checks[0].id).toBe('C2');
    expect(r.checks[0].detail).toContain('não existe neste desenho');
  });

  test('tipo não identificado também aborta (não conta como sucesso)', () => {
    expect(p3Verdict(completo({ stepZero: zero('DESCONHECIDO') })).aborted).toBe(true);
  });

  test('despertar caro no passo zero reprova mesmo em execução comum', () => {
    const r = p3Verdict(completo({ stepZero: zero('WEBAPP', P3_PUMP_WAKE_MAX_MS + 1) }));
    expect(r.aborted).toBe(true);
    expect(r.checks[0].pass).toBe(false);
  });

  test('medição completa e dentro dos tetos passa', () => {
    const r = p3Verdict(completo());
    expect(r.pass).toBe(true);
    expect(r.checks.map((c) => c.id)).toEqual(['C2', 'C1', 'C3', 'C4']);
  });
});

describe('P3: os demais critérios', () => {
  test('C1 reprova se o gatilho cresceu além dos despertares (trabalho vazando para o gatilho)', () => {
    const r = p3Verdict(completo({ bulk: { before: { triggerMsToday: 0, count: 0 }, after: { triggerMsToday: 200_000, count: 50 }, steps: 50, pumps: 50 } }));
    expect(r.checks.find((c) => c.id === 'C1')).toMatchObject({ pass: false });
    expect(r.pass).toBe(false);
  });

  test('C3 usa o PIOR caso: rápido no normal e lento depois do lote reprova', () => {
    const r = p3Verdict(completo({ idleMs: { normal: 50, afterBatch: P3_IDLE_MAX_MS + 10 } }));
    const c3 = r.checks.find((c) => c.id === 'C3')!;
    expect(c3.pass).toBe(false);
    expect(c3.detail).toContain('pior caso vale');
  });

  test('C4 reprova quando a projeção passa da cota da conta e mostra a porcentagem', () => {
    const r = p3Verdict(completo({ quota: { projectedMsPerDay: 6_000_000, limitMsPerDay: 5_400_000 } }));
    const c4 = r.checks.find((c) => c.id === 'C4')!;
    expect(c4.pass).toBe(false);
    expect(c4.detail).toContain('111%');
  });

  test('medição incompleta não passa (sem C1, C3 ou C4 não há veredito)', () => {
    const r = p3Verdict({ stepZero: zero('WEBAPP') });
    expect(r.pass).toBe(false);
    expect(r.aborted).toBe(false);
    expect(r.checks.map((c) => c.id)).toEqual(['C2']);
  });
});
