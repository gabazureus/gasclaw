// F7, Fase 2 — o NÚCLEO PURO do agente sucessor: o pedido ao Opus, o patch virando projeto, e a coroa.
//
// Três decisões, e cada uma tem teste porque cada uma, errada, custa caro:
// - `prepareSuccessor` junta parse + aplicação + crivo de guardas, e recusa mexer no MANIFESTO (os
//   escopos são os do pai, decisão 2 da ADR-043) e na SEMENTE (é ela que faz o sucessor nascer parado).
// - `crownVerdict` é o portão antes do clique do dono: sem avaliação, avaliação incompleta, avaliado que
//   se julgou, ou nota PIOR que a do titular → não coroa.
// - `patchMessages` leva o código INTEIRO e as guardas proibidas ao Opus — o que ele não recebe, ele
//   não pode respeitar.
import { describe, expect, test } from 'vitest';
import { crownVerdict, patchMessages, prepareSuccessor } from '../src/succession';

const motor = `function a() { assertOwner(); return lastSeen; }\nfunction b() { mayWriteProject(x, y); }\n`;
const arquivos = [
  { name: '_motor', source: motor },
  { name: 'appsscript', source: '{"oauthScopes":["a","b"]}' },
  { name: 'successor_seed', source: 'var GASCLAW_SEED = {};' },
  { name: 'settings', source: '<p>ok</p>' },
];
const patch = (changes: unknown[], explanation = 'fixes the midnight job') => JSON.stringify({ explanation, changes });

describe('prepareSuccessor: o patch vira o código do sucessor, ou é recusado com motivo', () => {
  test('um patch válido no motor devolve os arquivos trocados, a explicação e as trocas', () => {
    const r = prepareSuccessor(arquivos, patch([{ file: '_motor', find: 'return lastSeen;', replace: 'return lastSeen - 1;' }]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.files.find((f) => f.name === '_motor')?.source).toContain('return lastSeen - 1;');
    expect(r.files.find((f) => f.name === 'settings')?.source).toBe('<p>ok</p>');
    expect(r.explanation).toBe('fixes the midnight job');
    expect(r.changes).toHaveLength(1);
  });

  test('mexer no MANIFESTO é recusado: os escopos do sucessor são os do pai', () => {
    const r = prepareSuccessor(arquivos, patch([{ file: 'appsscript', find: '"b"', replace: '"b","c"' }]));
    expect(r).toEqual({ ok: false, reason: expect.stringContaining('manifest') });
  });

  test('mexer na SEMENTE é recusado: é ela que faz o sucessor nascer parado', () => {
    const r = prepareSuccessor(arquivos, patch([{ file: 'successor_seed', find: '{}', replace: '{"x":1}' }]));
    expect(r).toEqual({ ok: false, reason: expect.stringContaining('seed') });
  });

  test('um patch que enfraquece uma guarda é recusado, dizendo qual', () => {
    const r = prepareSuccessor(arquivos, patch([{ file: '_motor', find: 'assertOwner(); ', replace: '' }]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain('assertOwner()');
  });

  test('uma troca que não muda nada é recusada: não melhora coisa alguma', () => {
    const r = prepareSuccessor(arquivos, patch([{ file: '_motor', find: 'return lastSeen;', replace: 'return lastSeen;' }]));
    expect(r).toEqual({ ok: false, reason: expect.stringContaining('changes nothing') });
  });

  test('a recusa do parse passa adiante', () => {
    expect(prepareSuccessor(arquivos, 'no json here')).toEqual({ ok: false, reason: expect.stringContaining('JSON') });
  });

  test('a recusa da aplicação passa adiante (trecho que não existe)', () => {
    const r = prepareSuccessor(arquivos, patch([{ file: '_motor', find: 'nope()', replace: 'x' }]));
    expect(r).toEqual({ ok: false, reason: expect.stringContaining('0 times') });
  });
});

describe('crownVerdict: o portão ANTES do clique do dono', () => {
  const ev = (successorPasses: number, incumbentPasses: number, k: number, extra: object = {}) => ({ successorPasses, incumbentPasses, k, complete: true, verdictLeaked: false, ...extra });

  test('sem avaliação, não coroa', () => {
    expect(crownVerdict(null)).toEqual({ ok: false, reason: expect.stringContaining('evaluate') });
  });
  test('avaliação com k = 0 não coroa', () => {
    expect(crownVerdict(ev(0, 0, 0)).ok).toBe(false);
  });
  test('avaliação incompleta não coroa: um cenário sem resposta não é um cenário aprovado', () => {
    expect(crownVerdict(ev(5, 5, 6, { complete: false }))).toEqual({ ok: false, reason: expect.stringContaining('incomplete') });
  });
  test('o avaliado que se julgou não coroa', () => {
    expect(crownVerdict(ev(6, 5, 6, { verdictLeaked: true }))).toEqual({ ok: false, reason: expect.stringContaining('judge') });
  });
  test('nota PIOR que a do titular não coroa', () => {
    expect(crownVerdict(ev(4, 5, 6))).toEqual({ ok: false, reason: expect.stringContaining('worse') });
  });
  // A P34 mostrou por quê: a bateria não toca o que um patch de código conserta (o defeito da
  // meia-noite não é exercitado por cenário nenhum). Exigir VITÓRIA faria todo sucessor por patch
  // empatar e nunca ser coroado. O empate libera o CLIQUE — a decisão continua sendo do dono.
  test('empate libera o clique do dono, e diz que é empate', () => {
    expect(crownVerdict(ev(5, 5, 6))).toEqual({ ok: true, standing: 'ties' });
  });
  test('vitória medida por beatsIncumbent é dita como vitória', () => {
    expect(crownVerdict(ev(30, 10, 36))).toEqual({ ok: true, standing: 'wins' });
  });
  test('mais acertos sem significância é empate, não vitória', () => {
    expect(crownVerdict(ev(6, 5, 6))).toEqual({ ok: true, standing: 'ties' });
  });
});

describe('patchMessages: o que o Opus recebe', () => {
  const m = patchMessages(arquivos, '');
  test('o código inteiro vai, arquivo por arquivo', () => {
    for (const f of arquivos) expect(m[1].content).toContain(`=== FILE: ${f.name} ===\n${f.source}`);
  });
  test('as guardas que ele não pode tocar vão no pedido', () => {
    for (const g of ['assertOwner', 'NEVER_AUTO', 'mayWriteProject', 'appsscript', 'successor_seed']) expect(m[0].content).toContain(g);
  });
  test('o objetivo do dono vai quando existe, e não vai quando não existe', () => {
    expect(patchMessages(arquivos, 'make the midnight job fire')[1].content).toContain('make the midnight job fire');
    expect(m[1].content).not.toContain("The owner's goal");
  });
});
