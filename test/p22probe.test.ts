import { describe, expect, it } from 'vitest';
import { dueAgenda, evaluateAgenda, localMinute, syntheticAgenda } from '../poc/p22-proatividade/probe';

const TZ = -180;

describe('agenda sintética da P22', () => {
  // Uma sonda que medisse com compromissos vencendo mediria outra coisa. Vale a qualquer hora do dia.
  it.each([0, 1, 60, 719, 720, 1_379, 1_380, 1_439])('não vence nada com o relógio local em %i min', (minute) => {
    const now = Date.UTC(2026, 8, 17) - TZ * 60_000 + minute * 60_000;
    expect(localMinute(now, TZ)).toBe(minute);
    const r = evaluateAgenda(syntheticAgenda(20, now, TZ), {}, now, TZ);
    expect(r.jobs).toBe(20);
    expect(r.errors).toBe(0);
    expect(r.due).toBe(0);
  });

  it('gera compromissos distintos, não vinte cópias do mesmo', () => {
    const now = Date.UTC(2026, 8, 17, 12);
    const r = evaluateAgenda(syntheticAgenda(20, now, TZ), {}, now, TZ);
    expect(r.jobs).toBe(20);
  });

  it('a agenda da sonda de despertar vence de imediato', () => {
    const now = Date.UTC(2026, 8, 17, 12);
    const r = evaluateAgenda(dueAgenda(), {}, now, TZ);
    expect(r.due).toBe(1);
  });

  it('agenda vazia não custa nada e não vence nada', () => {
    const now = Date.UTC(2026, 8, 17, 12);
    expect(evaluateAgenda('', {}, now, TZ)).toMatchObject({ jobs: 0, due: 0, errors: 0 });
  });
});
