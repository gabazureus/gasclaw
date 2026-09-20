// Os consertos da BORDA, provados por comportamento (ciclo 2 da revisão, 2026-09-20).
//
// Este arquivo existe por um motivo constrangedor: eu declarei três consertos como feitos DUAS VEZES
// e eles não estavam no código. `git checkout src/main.ts`, usado para desfazer uma mutação de teste,
// levou junto os consertos ainda não commitados — e a mensagem do commit descrevia trabalho ausente.
//
// Nenhum teste morria, porque os três eram exatamente as invariantes que ninguém provava: o núcleo
// (`mayAutoApprove` com `level`, `untampered` no `RunIO`) estava certo e testado, e a BORDA não o
// chamava. É o padrão que os três ciclos acharam em quatro formas diferentes. Estes testes fecham a
// porta: se a borda parar de chamar, alguém fica vermelho.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas, type GasEnv } from './gasEnv';

let env: GasEnv;

beforeEach(() => {
  vi.resetModules();
  env = stubGas();
  env.props['OWNER'] = 'dono@x.com';
});
afterEach(() => vi.unstubAllGlobals());

describe('o agente ARQUIVADO não é mais com quem o dono conversa', () => {
  const comArquivado = () => {
    env.props['AGENTS'] = JSON.stringify([
      { name: 'velho', folderId: 'fv' },
      { name: 'novo', folderId: 'fn' },
    ]);
    env.props['STATUS:fv'] = 'archived';
    env.props['STATUS:fn'] = 'active';
  };

  // `chatDeps()` alimenta o Chat síncrono, o assíncrono e a tela. Era ali que o furo morava, e os
  // testes dos três caminhos injetam o próprio `defaultAgent` — então nenhum deles via o de produção.
  test('o `chatDeps` de PRODUÇÃO pula o arquivado', async () => {
    comArquivado();
    const m = await import('../src/main');
    const escolhido = m.__test_chatDeps().defaultAgent();
    expect(escolhido?.folderId).toBe('fn');
  });

  test('com TODOS arquivados, devolve null em vez de ressuscitar um', async () => {
    comArquivado();
    env.props['STATUS:fn'] = 'archived';
    const m = await import('../src/main');
    expect(m.__test_chatDeps().defaultAgent()).toBeNull();
  });
});
