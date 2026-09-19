// Borda do ciclo: estado no Drive, trava/ponteiro nas Properties, retomada segura.
//
// A pergunta que estes testes respondem é a mesma que o run durável já respondeu para a conversa:
// a execução morre no meio — o ciclo retoma de onde parou, sem refazer o que já rodou?
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas } from './gasEnv';
import { planCycle, stepKey, nextStep } from '../src/dreamCycle';
import { afterStep, dreamFile, dreamIO, failCycle, newCycle, parseDream } from '../src/dreamStore';

const plano = () => planCycle({ cycleId: 'c1', candidates: ['a', 'b'], gate: ['g1'], quality: ['q1'], k: 3 });
const novo = (now = 1000) => newCycle({ cycleId: 'c1', folderId: 'f1', incumbent: 'titular', plan: plano(), now });

describe('nome de arquivo: o cycleId não escapa da pasta', () => {
  test('normaliza e corta', () => {
    expect(dreamFile('C1 Ciclo/../fuga')).toBe('c1-ciclo-fuga.json');
  });

  test('id que vira vazio é recusado em vez de gravar em lugar nenhum', () => {
    expect(() => dreamFile('///')).toThrow();
  });
});

describe('leitura fail-closed: meio lido é pior que não lido', () => {
  test('ida e volta preserva o ciclo', () => {
    const s = novo();
    expect(parseDream(JSON.stringify(s))?.cycleId).toBe('c1');
  });

  test('lixo, plano ausente ou k que não é número devolvem null', () => {
    for (const ruim of ['', '{nao json', '{}', '{"cycleId":"c","folderId":"f"}', '{"cycleId":"c","folderId":"f","plan":{"steps":[]}}']) {
      expect(parseDream(ruim)).toBe(null);
    }
  });

  test('`done` com item não-string é filtrado, não aceito', () => {
    const s = { ...novo(), done: ['ok', 42, null] };
    expect(parseDream(JSON.stringify(s))?.done).toEqual(['ok']);
  });

  test('status desconhecido volta como running, não como done', () => {
    const s = { ...novo(), status: 'inventado' };
    expect(parseDream(JSON.stringify(s))?.status).toBe('running'); // done seria dar o ciclo por encerrado sem ter rodado
  });
});

describe('avanço: passo feito nunca repete, e o ciclo fecha sozinho', () => {
  test('um passo soma no placar e entra em `done`', () => {
    const s = afterStep(novo(), { kind: 'gate', candidate: 'a', scenario: 'g1', rep: 0 }, true, 2000);
    expect(s.done).toEqual(['gate:a:g1:0']);
    expect(s.tally['gate:a:g1']).toEqual({ passes: 1, runs: 1 });
    expect(s.updatedAt).toBe(2000);
  });

  test('o mesmo passo duas vezes não duplica a chave de `done`', () => {
    const step = { kind: 'gate' as const, candidate: 'a', scenario: 'g1', rep: 0 };
    const s = afterStep(afterStep(novo(), step, true, 2000), step, true, 3000);
    expect(s.done).toEqual(['gate:a:g1:0']);
  });

  test('quando não sobra passo, o ciclo vira `done` sozinho', () => {
    let s = novo();
    let step = nextStep(s.plan, new Set(s.done), s.tally);
    let voltas = 0;
    while (step && voltas < 100) {
      s = afterStep(s, step, true, 5000);
      step = nextStep(s.plan, new Set(s.done), s.tally);
      voltas++;
    }
    expect(s.status).toBe('done');
    expect(voltas).toBe(s.plan.steps.length); // 2 de portão + 2 candidatos × 1 cenário × 3 reps
  });

  test('quem morre no portão não consome os passos de qualidade dele', () => {
    let s = novo();
    s = afterStep(s, { kind: 'gate', candidate: 'a', scenario: 'g1', rep: 0 }, false, 2000);
    let step = nextStep(s.plan, new Set(s.done), s.tally);
    const executados: string[] = [];
    let voltas = 0;
    while (step && voltas < 100) {
      executados.push(stepKey(step));
      s = afterStep(s, step, true, 5000);
      step = nextStep(s.plan, new Set(s.done), s.tally);
      voltas++;
    }
    expect(executados.some((k) => k.includes(':a:'))).toBe(false); // nenhum passo de 'a' depois da morte
    expect(s.status).toBe('done');
  });

  test('falha honesta registra o motivo em vez de sumir', () => {
    const s = failCycle(novo(), 'free quota exhausted', 9000);
    expect(s.status).toBe('failed');
    expect(s.error).toContain('free quota');
  });
});

describe('persistência no Drive e a trava que também é ponteiro', () => {
  beforeEach(() => vi.restoreAllMocks());

  test('grava, relê e sobrescreve sem duplicar arquivo', () => {
    const env = stubGas();
    const io = dreamIO();
    io.save(novo());
    expect(io.load('f1', 'c1')?.cycleId).toBe('c1');
    io.save(afterStep(novo(), { kind: 'gate', candidate: 'a', scenario: 'g1', rep: 0 }, true, 2000));
    expect(io.load('f1', 'c1')?.done).toEqual(['gate:a:g1:0']);
    expect([...env.drive.keys()].filter((k) => k.endsWith('c1.json'))).toHaveLength(1);
  });

  test('ciclo inexistente devolve null em vez de explodir', () => {
    stubGas();
    expect(dreamIO().load('f1', 'nao-existe')).toBe(null);
  });

  test('a trava aponta o ciclo ativo, e soltar a trava limpa a chave', () => {
    const env = stubGas();
    const io = dreamIO();
    expect(io.active('f1')).toBe(null);
    io.setActive('f1', 'c1');
    expect(io.active('f1')).toBe('c1');
    expect(env.props['DREAMLOCK:f1']).toBe('c1');
    io.setActive('f1', null);
    expect(io.active('f1')).toBe(null);
    expect(env.props['DREAMLOCK:f1']).toBeUndefined();
  });

  test('a retomada lê do Drive: o estado sobrevive à morte da execução', () => {
    stubGas();
    const io = dreamIO();
    let s = novo();
    s = afterStep(s, { kind: 'gate', candidate: 'a', scenario: 'g1', rep: 0 }, true, 2000);
    s = afterStep(s, { kind: 'gate', candidate: 'b', scenario: 'g1', rep: 0 }, true, 2100);
    io.save(s);
    // …a execução morre aqui. Outra assume e relê:
    const voltou = io.load('f1', 'c1')!;
    expect(voltou.done).toHaveLength(2);
    expect(nextStep(voltou.plan, new Set(voltou.done), voltou.tally)?.kind).toBe('quality'); // continua, não recomeça
  });
});
