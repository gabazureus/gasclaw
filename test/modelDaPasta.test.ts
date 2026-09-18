import { describe, expect, test } from 'vitest';
import { folderModel, type ModelInfo } from '../src/models';
import { DEFAULT_MODEL } from '../src/workspace';

// O `model` escrito na PASTA nunca passava por `validateChoice`. Só o painel (`setAgentModel`) e a CLI
// (`eval`) validavam — e a pasta é justamente a superfície COMPARTILHÁVEL. Quem tivesse acesso de edição
// podia apontar o agente para o modelo mais caro do OpenRouter, ou para um que não aceita ferramentas
// (e aí as tools falhavam sem explicação), sem passar por nenhuma tela do dono.
//
// A decisão é pura: "o que a pasta pediu" + "a lista do OpenRouter (ou a falta dela)" -> modelo efetivo.
// Fica aqui, fora da borda, para poder ser testada sem rede e sem Apps Script.

const m = (id: string, tools: boolean, free = false): ModelInfo => ({ id, ctx: 8000, inM: 1, outM: 2, tools, free });
const LISTA = [m('caro/gpt-9', true), m('sem-tools/modelo', false), m('gratis/modelo:free', true, true)];

describe('modelo pedido pela pasta', () => {
  test('pasta sem modelo, ou pedindo o padrão, usa o padrão', () => {
    expect(folderModel('', LISTA, [])).toEqual({ model: DEFAULT_MODEL, source: 'pasta' });
    expect(folderModel(DEFAULT_MODEL, LISTA, [])).toEqual({ model: DEFAULT_MODEL, source: 'pasta' });
  });

  test('modelo que existe e serve ao agente é respeitado', () => {
    expect(folderModel('caro/gpt-9', LISTA, ['gmail.send'])).toEqual({ model: 'caro/gpt-9', source: 'pasta' });
  });

  test('modelo inexistente cai no padrão, e a razão diz qual era', () => {
    const r = folderModel('inventado/modelo', LISTA, []);
    expect(r.model).toBe(DEFAULT_MODEL);
    expect(r.source).toBe('padrao');
    expect(r.reason).toContain('inventado/modelo');
  });

  test('modelo sem suporte a ferramentas, num agente COM ferramentas aprovadas, cai no padrão', () => {
    const r = folderModel('sem-tools/modelo', LISTA, ['calendar.create']);
    expect(r.model).toBe(DEFAULT_MODEL);
    expect(r.source).toBe('padrao');
    expect(r.reason).toMatch(/ferramenta/i);
  });

  test('o mesmo modelo passa se o agente não tem ferramenta aprovada nenhuma', () => {
    // Coerente com o painel: sem tools aprovadas, suporte a tools não é requisito.
    expect(folderModel('sem-tools/modelo', LISTA, [])).toEqual({ model: 'sem-tools/modelo', source: 'pasta' });
  });

  test('`free` continua sendo o rodízio do ADR-025, não um id', () => {
    expect(folderModel('free', LISTA, [])).toEqual({ model: 'free', source: 'pasta' });
  });

  // A restrição do gate: falha passageira ao ler a lista NÃO pode derrubar o turno e NÃO pode deixar o
  // modelo da pasta passar. Degradar para o padrão conhecido é o seguro nos dois eixos, custo e
  // disponibilidade — o contrário seria confiar exatamente quando não dá para conferir.
  test('sem a lista do OpenRouter, cai no padrão em vez de confiar na pasta', () => {
    const r = folderModel('caro/gpt-9', null, []);
    expect(r.model).toBe(DEFAULT_MODEL);
    expect(r.source).toBe('padrao');
    expect(r.reason).toMatch(/lista/i);
  });

  test('sem a lista, um pedido que já era o padrão não vira "padrao" à toa', () => {
    // Não há nada a recusar: o trace não deve acusar uma troca que não houve.
    expect(folderModel(DEFAULT_MODEL, null, [])).toEqual({ model: DEFAULT_MODEL, source: 'pasta' });
  });
});

// A terceira exigência do gate: a razão tem de aparecer no trace. Quem for depurar "por que meu agente
// mudou de modelo?" precisa achar a resposta sem ler código — `modelSource: padrao` sem causa seria um
// fato sem explicação.
describe('o trace conta por que o modelo mudou', () => {
  test('o span resolve_agent leva a fonte e o motivo', async () => {
    const { agentInfo } = await import('../src/traced');
    const spec = {
      name: 'agente-teste',
      config: { model: DEFAULT_MODEL },
      origem: { AGENTS: 'md' },
      modelSource: 'padrao',
      modelReason: 'Modelo inventado/x não encontrado na lista do OpenRouter.',
    } as never;
    const info = agentInfo('f1')(spec) as Record<string, unknown>;
    expect(info.modelSource).toBe('padrao');
    expect(info.modelReason).toContain('inventado/x');
  });

  test('sem motivo, o campo não aparece (nada de razão vazia no trace)', async () => {
    const { agentInfo } = await import('../src/traced');
    const spec = { name: 'a', config: { model: DEFAULT_MODEL }, origem: {}, modelSource: 'pasta' } as never;
    expect('modelReason' in (agentInfo('f1')(spec) as object)).toBe(false);
  });
});
