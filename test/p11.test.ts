import { describe, expect, test } from 'vitest';
import { summarizeP11, type P11Obs } from '../poc/p11-free/summary';

const obs = (): P11Obs => ({
  burst: { n: 20, ok: 20, ms: Array.from({ length: 20 }, (_, i) => 3000 + i * 100), erros: [] },
  switch429: { ms: 1200, modelUsed: 'b/medio:free', fallback: [{ model: 'a/grande:free', error: 'OpenRouter 429: rate limit' }] },
  tools: { agentTools: ['now', 'memory.save'], candidatos: [{ id: 'a/grande:free', tools: true }, { id: 'b/medio:free', tools: true }], escolhido: { id: 'a/grande:free', tools: true } },
  quota: { today: 120, perMinute: 3, blocked: false, warn: false },
});

describe('summarizeP11', () => {
  test('tudo dentro dos critérios passa', () => expect(summarizeP11(obs()).pass).toBe(true));

  test('C1: 20 mensagens com sucesso ≥ 95%', () => {
    const s = summarizeP11(obs());
    expect(s.c1).toMatchObject({ pass: true, sucessoPct: 100, n: 20 });
    const uma = obs();
    uma.burst.ok = 19;
    uma.burst.erros = ['OpenRouter 429: rate limit'];
    expect(summarizeP11(uma).c1).toMatchObject({ pass: true, sucessoPct: 95 }); // 95% é o limite, e passa
    const duas = obs();
    duas.burst.ok = 18;
    expect(summarizeP11(duas).c1.pass).toBe(false);
  });

  test('C1 exige as 20 mensagens: rodada curta não vale', () => {
    const curta = obs();
    curta.burst.n = 10;
    curta.burst.ok = 10;
    curta.burst.ms = curta.burst.ms.slice(0, 10);
    expect(summarizeP11(curta).c1.pass).toBe(false);
  });

  test('C2: p95 pelo nearest-rank (⌈0,95·n⌉−1), não o máximo disfarçado', () => {
    // 20 medições de 3000 a 4900: o p95 é a 19ª (4800). A fórmula antiga pegava a 20ª e media o máximo.
    expect(summarizeP11(obs()).c2).toMatchObject({ pass: true, p95Ms: 4800 });
  });
  test('C2: um único turno lento não reprova, mas lentidão sustentada sim', () => {
    // medido na v39: 1 outlier de 35,8 s com mediana de 4,1 s é ruído do provedor, não o rodízio sendo lento
    const outlier = obs();
    outlier.burst.ms = [...Array.from({ length: 19 }, () => 3000), 35_802];
    expect(summarizeP11(outlier).c2).toMatchObject({ pass: true, p95Ms: 3000, maiorMs: 35_802 });
    const lento = obs();
    lento.burst.ms = [...Array.from({ length: 15 }, () => 3000), ...Array.from({ length: 5 }, () => 26_000)];
    expect(summarizeP11(lento).c2).toMatchObject({ pass: false, p95Ms: 26_000 });
  });

  test('C3: troca em 429 abaixo de 2 s e com a tentativa registrada', () => {
    expect(summarizeP11(obs()).c3).toMatchObject({ pass: true, ms: 1200, trocou: true });
    const semTroca = obs();
    semTroca.switch429.fallback = [];
    expect(summarizeP11(semTroca).c3.pass).toBe(false); // respondeu, mas não trocou: o 429 não foi exercitado
    const lenta = obs();
    lenta.switch429.ms = 2500;
    expect(summarizeP11(lenta).c3.pass).toBe(false);
  });

  test('C4: agente com ferramentas nunca recebe modelo sem ferramentas', () => {
    expect(summarizeP11(obs()).c4.pass).toBe(true);
    const furado = obs();
    furado.tools.candidatos = [...furado.tools.candidatos, { id: 'c/sem-tools:free', tools: false }];
    expect(summarizeP11(furado).c4.pass).toBe(false);
    const escolheuErrado = obs();
    escolheuErrado.tools.escolhido = { id: 'c/sem-tools:free', tools: false };
    expect(summarizeP11(escolheuErrado).c4.pass).toBe(false);
  });

  test('C4 sem candidato nenhum reprova: o agente ficaria sem modelo', () => {
    const vazio = obs();
    vazio.tools.candidatos = [];
    expect(summarizeP11(vazio).c4.pass).toBe(false);
  });

  test('C5: a POC roda sozinha e diz se a cota atrapalhou a medição', () => {
    expect(summarizeP11(obs()).c5).toMatchObject({ pass: true, automatica: true });
    const semCota = obs();
    semCota.quota = { today: 1000, perMinute: 0, blocked: true, warn: true };
    const s = summarizeP11(semCota);
    expect(s.c5.pass).toBe(false);
    expect(s.c5.nota).toMatch(/cota/i);
  });
});
