// F8 · G — o `e1-memoria` reprovava nos DOIS motores, e a causa não era a memória.
//
// Rodado no dev: as duas respostas voltavam vazias — `finish_reason: length, content: null`. O agente usa
// um modelo que RACIOCINA, e o turno mandava `max_tokens: 1000` sem reservar nada para a resposta: o
// pensamento gastava tudo antes da primeira palavra. É a lição da P32 (o Opus) no turno comum. Os outros
// cenários passavam por serem curtos; o que envolve ferramenta + memória pensa mais e estourava.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas, type GasEnv } from './gasEnv';

let env: GasEnv;
beforeEach(() => {
  vi.resetModules();
  env = stubGas();
  env.props['STATUS:f1'] = 'active';
});
afterEach(() => vi.unstubAllGlobals());

describe('o turno do agente reserva espaço para a resposta', () => {
  test('o Test do painel (mesmo caminho do Chat) manda reasoning.max_tokens ABAIXO do max_tokens', async () => {
    const m = await import('../src/main');
    m.testAgent('f1', 'oi');
    const chamada = env.fetched('openrouter.ai/api/v1/chat')[0];
    const corpo = JSON.parse(String(chamada?.init.payload)) as { max_tokens: number; reasoning?: { max_tokens: number } };
    expect(corpo.reasoning?.max_tokens).toBeGreaterThan(0);
    expect(corpo.reasoning!.max_tokens).toBeLessThan(corpo.max_tokens);
  });

  // Trava no fonte: todo turno de agente (Chat, Test, persona, eval, caixa de areia) passa a reserva. Um
  // ponto novo que esquecesse voltaria a devolver resposta vazia num modelo que raciocina.
  test('nenhuma chamada de turno com teto de conversa fica sem a reserva', () => {
    const fonte = readFileSync('src/main.ts', 'utf8');
    const turnos = [...fonte.matchAll(/complete\([^;\n]*(?:CHAT_MAX_TOKENS|, 1000,)[^;\n]*\)/g)].map((x) => x[0]);
    expect(turnos.length).toBeGreaterThanOrEqual(5);
    for (const t of turnos) expect(t).toContain('TURN_REASONING');
  });
});
