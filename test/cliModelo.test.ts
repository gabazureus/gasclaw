// F10 — trocar o modelo do agente pela CLI, com a MESMA autoridade do painel (o dono, provado pelo
// segredo; ADR-021/022). Sem isto, "um modelo só" dependia de clique — e a regra do projeto é zero
// operação manual depois do setup.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas, type GasEnv } from './gasEnv';

const FOLDER = 'f1';
let env: GasEnv;
beforeEach(() => {
  vi.resetModules();
  env = stubGas();
  env.props['AGENTS'] = JSON.stringify([{ name: 'a', folderId: FOLDER }]);
  env.props['CLI_SECRET'] = 'f'.repeat(64);
});
afterEach(() => vi.unstubAllGlobals());
const post = async (params: Record<string, string>) => {
  const m = await import('../src/main');
  return JSON.parse(String((m.doPost({ parameter: { secret: 'f'.repeat(64), ...params } } as never) as { getContent: () => string }).getContent()));
};

describe('CLI `model`: o dono troca o modelo do agente sem clique', () => {
  test('grava o modelo escolhido, e o painel passa a mostrá-lo', async () => {
    const r = await post({ action: 'model', folder: FOLDER, model: 'test/model' });
    expect(r).toMatchObject({ folderId: FOLDER });
    expect(env.props[`MODEL:${FOLDER}`]).toBe('test/model');
  });

  test('modelo que não existe na lista do OpenRouter é recusado, e nada é gravado', async () => {
    const r = await post({ action: 'model', folder: FOLDER, model: 'nao/existe' });
    expect(r.ok).toBe(false);
    expect(String(r.error)).toMatch(/OpenRouter/i);
    expect(env.props[`MODEL:${FOLDER}`]).toBeUndefined();
  });

  test('sem o segredo da CLI, não troca nada', async () => {
    const m = await import('../src/main');
    const out = JSON.parse(String((m.doPost({ parameter: { action: 'model', folder: FOLDER, model: 'test/model' } } as never) as { getContent: () => string }).getContent()));
    expect(out.ok).toBe(false);
    expect(env.props[`MODEL:${FOLDER}`]).toBeUndefined();
  });
});
