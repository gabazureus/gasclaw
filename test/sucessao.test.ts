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
import { codeMatches, crownReadiness, crownVerdict, patchMessages, prepareSuccessor, readSuccessorsFrom, slotFor, successorWrites, type SuccessorRecord } from '../src/succession';

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

describe('o registro dos sucessores: em pedaços, sem sobras que ressuscitam', () => {
  const rec = (scriptId: string, extra: Partial<SuccessorRecord> = {}): SuccessorRecord => ({ scriptId, url: `https://script.google.com/${scriptId}`, folderId: 'F', at: 1, model: 'opus', explanation: 'x', changes: [], costUsd: 1, evaluation: null, crownedAt: null, ...extra });
  const aplica = (all: Record<string, string | null>, w: { prop: string; value: string | null }[]) => {
    const n = { ...all };
    for (const { prop, value } of w) {
      if (value === null) delete n[prop];
      else n[prop] = value;
    }
    return n;
  };

  test('grava e lê de volta um registro grande, partido em pedaços', () => {
    const grande = rec('A', { changes: [{ file: '_motor', find: 'a', replace: 'b'.repeat(20_000) }] });
    const all = aplica({}, successorWrites({}, grande));
    expect(Object.keys(all).filter((k) => k.startsWith('SUCC:A:')).length).toBe(3);
    expect(readSuccessorsFrom(all)).toEqual([grande]);
  });

  test('regravar menor APAGA os pedaços que sobraram', () => {
    let all = aplica({}, successorWrites({}, rec('A', { changes: [{ file: '_motor', find: 'a', replace: 'b'.repeat(20_000) }] })));
    all = aplica(all, successorWrites(all, rec('A')));
    expect(Object.keys(all).filter((k) => k.startsWith('SUCC:A:'))).toEqual(['SUCC:A:0']);
    expect(readSuccessorsFrom(all)).toEqual([rec('A')]);
  });

  test('regravar o mesmo sucessor substitui, não duplica; outro sucessor fica', () => {
    let all = aplica({}, successorWrites({}, rec('A')));
    all = aplica(all, successorWrites(all, rec('B')));
    all = aplica(all, successorWrites(all, rec('A', { costUsd: 2 })));
    expect(readSuccessorsFrom(all).map((r) => [r.scriptId, r.costUsd])).toEqual([['B', 1], ['A', 2]]);
  });

  test('um registro ilegível é pulado sem cegar os outros', () => {
    let all = aplica({}, successorWrites({}, rec('A')));
    all = aplica(all, successorWrites(all, rec('B')));
    all['SUCC:A:0'] = '{cortado';
    expect(readSuccessorsFrom(all).map((r) => r.scriptId)).toEqual(['B']);
  });

  test('índice ilegível não derruba nada: nenhum sucessor', () => {
    expect(readSuccessorsFrom({ SUCCESSORS: 'lixo' })).toEqual([]);
  });

  test('índice ilegível é RECOMEÇADO na próxima gravação, não herdado', () => {
    const w = successorWrites({ SUCCESSORS: 'lixo' }, rec('A'));
    expect(JSON.parse(w.find((x) => x.prop === 'SUCCESSORS')?.value ?? '')).toEqual([{ scriptId: 'A', chunks: 1 }]);
  });

  // Um pedaço trocado de lugar (ou gravado à mão) não pode fazer a tela mostrar o registro de OUTRO
  // sucessor sob este id — e a coroa agir no projeto errado.
  test('um registro cujo id não é o do índice é pulado', () => {
    const all = { SUCCESSORS: JSON.stringify([{ scriptId: 'A', chunks: 1 }]), 'SUCC:A:0': JSON.stringify(rec('B')) };
    expect(readSuccessorsFrom(all)).toEqual([]);
  });

  test('slotFor: o mais recente parado e não coroado DESTE agente; coroado ou de outro agente não serve', () => {
    const lista = [rec('A', { at: 1 }), rec('B', { at: 3 }), rec('C', { at: 5, crownedAt: 6 }), rec('D', { at: 9, folderId: 'G' })];
    expect(slotFor(lista, 'F')?.scriptId).toBe('B');
    expect(slotFor([rec('C', { crownedAt: 2 })], 'F')).toBeNull();
    expect(slotFor(lista, 'Z')).toBeNull();
  });
});

describe('crownReadiness: o health que libera a coroa — TODAS as checagens', () => {
  const selfOk = { seedParent: 'PAI', enabled: false, hasKey: true, authRequired: false, agentReadable: { ok: true, detail: 'read 4 files' }, trigger: 'inactive' as const };
  const ev = { successorPasses: 5, incumbentPasses: 5, k: 6, complete: true, verdictLeaked: false, at: 20, rows: [] };
  const base = { parentId: 'PAI', authState: 'authorized', self: selfOk, code: { ok: true, reason: 'identical' }, record: { at: 10, evaluation: ev } };
  const falha = (over: object) => crownReadiness({ ...base, ...over }).checks.filter((c) => !c.ok).map((c) => c.id);

  test('tudo certo: libera, com as 9 checagens', () => {
    const r = crownReadiness(base);
    expect(r.ok).toBe(true);
    expect(r.checks.map((c) => c.id)).toEqual(['authorized', 'seed', 'paused', 'key', 'scopes', 'drive', 'worker', 'code', 'evaluation']);
  });
  test('cada falha derruba só a sua checagem, e o todo', () => {
    expect(falha({ authState: 'needs-consent' })).toEqual(['authorized']);
    expect(falha({ self: { ...selfOk, seedParent: 'OUTRO' } })).toEqual(['seed']);
    expect(falha({ self: { ...selfOk, enabled: true } })).toEqual(['paused']);
    expect(falha({ self: { ...selfOk, hasKey: false } })).toEqual(['key']);
    expect(falha({ self: { ...selfOk, authRequired: true } })).toEqual(['scopes']);
    expect(falha({ self: { ...selfOk, agentReadable: { ok: false, detail: '403 Drive API disabled' } } })).toEqual(['drive']);
    expect(falha({ self: { ...selfOk, trigger: 'awaiting authorization' } })).toEqual(['worker']);
    expect(falha({ code: { ok: false, reason: 'changed' } })).toEqual(['code']);
    expect(falha({ code: null })).toEqual(['code']);
    expect(falha({ record: { at: 10, evaluation: { ...ev, successorPasses: 4 } } })).toEqual(['evaluation']);
    expect(crownReadiness({ ...base, authState: 'needs-consent' }).ok).toBe(false);
  });
  test('gatilho ativo passa; inativo passa (a coroa o cria)', () => {
    expect(falha({ self: { ...selfOk, trigger: 'active' } })).toEqual([]);
  });
  test('avaliação ANTERIOR à última escrita não vale: o código avaliado não é o que está lá', () => {
    expect(falha({ record: { at: 30, evaluation: ev } })).toEqual(['evaluation']);
  });
  test('sem resposta do health, todas as checagens do sucessor falham', () => {
    expect(falha({ self: null })).toEqual(['seed', 'paused', 'key', 'scopes', 'drive', 'worker']);
  });
});

describe('codeMatches: o sucessor é o código ATUAL do pai mais o patch', () => {
  const pai = [{ name: '_motor', source: 'function a() { assertOwner(); return 1; }' }, { name: 'appsscript', source: '{"s":1}' }];
  const troca = [{ file: '_motor', find: 'return 1;', replace: 'return 2;' }];
  const filho = [{ name: '_motor', source: 'function a() { assertOwner(); return 2; }' }, { name: 'appsscript', source: '{"s":1}' }, { name: 'successor_seed', source: 'var GASCLAW_SEED = {};' }];
  test('idêntico ao pai + patch: confere', () => {
    expect(codeMatches(pai, filho, troca).ok).toBe(true);
  });
  test('o pai mudou depois da geração: não confere — coroar desfaria a mudança', () => {
    const paiNovo = [{ name: '_motor', source: 'function a() { assertOwner(); return 9; }' }, pai[1]];
    expect(codeMatches(paiNovo, filho, troca)).toEqual({ ok: false, reason: expect.stringContaining('changed since') });
  });
  test('manifesto diferente: não confere', () => {
    expect(codeMatches(pai, [filho[0], { name: 'appsscript', source: '{"s":2}' }, filho[2]], troca)).toEqual({ ok: false, reason: expect.stringContaining('manifest') });
  });
  test('motor adulterado depois da escrita: não confere', () => {
    expect(codeMatches(pai, [{ name: '_motor', source: 'function a() { return 2; }' }, filho[1], filho[2]], troca).ok).toBe(false);
  });
  test('arquivo FALTANDO no sucessor (o manifesto, por exemplo): não confere', () => {
    expect(codeMatches(pai, [filho[0], filho[2]], troca)).toEqual({ ok: false, reason: expect.stringContaining('missing appsscript') });
  });
  test('arquivo a mais, ou sem semente: não confere', () => {
    expect(codeMatches(pai, [...filho, { name: 'extra', source: 'x' }], troca).ok).toBe(false);
    expect(codeMatches(pai, filho.slice(0, 2), troca).ok).toBe(false);
  });
  test('a semente do PAI (quando ele mesmo é sucessor) não entra na conta', () => {
    expect(codeMatches([...pai, { name: 'successor_seed', source: 'var GASCLAW_SEED = {"p":1};' }], filho, troca).ok).toBe(true);
  });
});
