// D3 — o registro de filhos não cabia o que `MAX_CHILDREN` promete.
//
// MEDIDO na P29 (dev v132): `serializeChildren` estoura o teto de 8 KB de UMA Script Property em
// **17 filhos** com `reason` curto e em **11** com `reason` no máximo (300 chars, que é o que um
// sucessor real carrega). `MAX_CHILDREN = 40` era promessa inalcançável, e a corrida de 15 da F6
// não cabia. A sonda descobriu isso por US$ 0, criando projetos de string fixa.
//
// Pior que o número: a exceção sobe DEPOIS de o projeto já ter sido criado e implantado. Em
// `succeedNow` isso significa Opus pago, filho no Google, e nada na tela — um órfão caro.
//
// O conserto não mexe no número: parte o valor em pedaços. O limite do Apps Script é 9 KB POR VALOR
// e 500 KB no TOTAL, então o gargalo era o formato, não a plataforma.
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { childrenWrites, chunkChildren, CHILDREN_CHUNKS, MAX_CHILDREN, PROP, propOfChunk, readChildrenFrom, serializeChildren, unchunkChildren, type Child } from '../src/children';

const filho = (n: number, reasonLen = 300): Child => ({
  scriptId: `1gjEaIm0HeXFNmoM9hsaCf2mMbbmtq_itRliTTFyK_cotlRl-89XrE6${n}`,
  kind: 'automation',
  title: `successor ${n} — 2026-09-20`,
  url: 'https://script.google.com/a/macros/fluencerai.com/s/AKfycbzbjjbdQ06GU1h-iU_sC-_FA7saBBgjGz_9h-egI7_tglM6jeK2upmewg-AYuXlX7y_/exec',
  scopes: ['https://www.googleapis.com/auth/calendar.events'],
  folderId: null,
  parent: '159JZhgu1KAyHlt_IYOqoVUPVWNef6sJv',
  reason: 'x'.repeat(reasonLen),
  at: 1_789_945_902_315,
});

const lista = (n: number, reasonLen = 300) => Array.from({ length: n }, (_, i) => filho(i, reasonLen));

describe('o registro comporta o que MAX_CHILDREN promete', () => {
  // O NÚMERO QUE A P29 MEDIU, virado em teste: 11 era o teto real com `reason` cheio.
  test('quinze filhos com `reason` no máximo cabem — era exatamente isto que faltava', () => {
    const pedacos = chunkChildren(lista(15));
    expect(unchunkChildren(pedacos)).toHaveLength(15);
  });

  test('os quarenta que MAX_CHILDREN promete cabem de verdade', () => {
    expect(unchunkChildren(chunkChildren(lista(MAX_CHILDREN)))).toHaveLength(MAX_CHILDREN);
  });

  test('nenhum pedaço passa do teto de uma Script Property', () => {
    for (const p of chunkChildren(lista(MAX_CHILDREN))) expect(p.length).toBeLessThanOrEqual(8_000);
  });

  test('acima de MAX_CHILDREN continua recusando: o teto de política não foi dissolvido junto', () => {
    expect(() => chunkChildren(lista(MAX_CHILDREN + 1))).toThrow(/too many/i);
  });
});

describe('o formato antigo continua sendo lido: nada de migração', () => {
  // Quem já tem filhos gravados tem UM valor em `CHILDREN`. Se o formato novo não o lesse, a
  // atualização apagaria a lista do painel — e ninguém saberia até abrir a tela.
  test('um valor único gravado pelo formato antigo volta inteiro', () => {
    const antigo = serializeChildren(lista(3, 44));
    expect(unchunkChildren([antigo])).toHaveLength(3);
  });

  test('o primeiro pedaço mora na Property de sempre: dado antigo e novo dividem o mesmo nome', () => {
    expect(propOfChunk(0)).toBe(PROP);
    expect(propOfChunk(1)).toBe(`${PROP}:1`);
  });
});

describe('ler não inventa filho, e o lixo de um pedaço não cega os outros', () => {
  test('pedaço ilegível é descartado e os demais sobrevivem', () => {
    const [p0, ...resto] = chunkChildren(lista(20));
    expect(unchunkChildren([p0, 'não é json', ...resto.slice(1)]).length).toBeGreaterThan(0);
  });

  test('nada gravado é lista vazia, nunca erro', () => {
    expect(unchunkChildren([null, null])).toEqual([]);
  });

  // O BUG QUE ESTE FORMATO CRIA SE NINGUÉM CUIDAR: a lista encolhe, o pedaço 2 não é apagado, e os
  // filhos esquecidos RESSUSCITAM na próxima leitura. `chunkChildren` sempre devolve `CHILDREN_CHUNKS`
  // posições para o chamador poder apagar as sobras — devolver menos seria deixar a armadilha armada.
  test('a escrita sempre diz o que fazer com TODOS os pedaços, inclusive os que sobraram', () => {
    const p = chunkChildren(lista(2, 44));
    expect(p).toHaveLength(CHILDREN_CHUNKS);
    expect(p.slice(1).every((x) => x === '')).toBe(true); // vazio = apague este pedaço
  });
});

// AS DUAS MUTAÇÕES QUE SOBREVIVERAM enquanto ler e gravar viviam na casca de `main.ts`: ler só o
// pedaço 0, e gravar sem apagar as sobras. As duas quebram EM SILÊNCIO — filho some da tela, ou
// filho esquecido ressuscita. Nenhuma tinha teste possível, porque a casca não é chamável daqui.
// A decisão mudou de lugar para o núcleo, e por isso estes dois testes existem.
describe('a decisão de ler e de gravar é pura, e por isso testável', () => {
  const mapa = (list: Child[]) => Object.fromEntries(childrenWrites(list).filter((w) => w.value !== null).map((w) => [w.prop, w.value as string]));

  test('a leitura enxerga TODOS os pedaços, não só o primeiro', () => {
    const m = mapa(lista(20));
    expect(Object.keys(m).length).toBeGreaterThan(1); // 20 filhos com reason cheio não cabem em um
    expect(readChildrenFrom(m)).toHaveLength(20);
  });

  test('a lista que ENCOLHE manda apagar o pedaço que sobrou — senão o esquecido ressuscita', () => {
    const cheio = mapa(lista(20));
    const depois = childrenWrites(lista(2, 44));
    // simula a gravação: aplica o que `childrenWrites` mandou sobre o mapa que já existia
    for (const { prop, value } of depois) { if (value === null) delete cheio[prop]; else cheio[prop] = value; }
    expect(readChildrenFrom(cheio)).toHaveLength(2);
  });

  test('mapa vazio é lista vazia, nunca erro', () => {
    expect(readChildrenFrom({})).toEqual([]);
  });
});

// A FIAÇÃO. O formato partido só vale se TODO acesso passar por ele: um `getProperty('CHILDREN')`
// solto enxergaria apenas o primeiro pedaço, e os filhos do pedaço 2 sumiriam da tela SEM ERRO
// NENHUM — que é a pior forma de quebrar, porque ninguém descobre.
describe('fiação: ninguém lê nem escreve o registro por fora dos pedaços', () => {
  const main = readFileSync('src/main.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  test('nenhum acesso direto à Property `CHILDREN` sobrou em main.ts', () => {
    expect(main).not.toMatch(/(get|set)Property\(['"]CHILDREN['"]\)/);
    expect(main).not.toContain("setProperty('CHILDREN'");
  });

  test('as duas portas existem, e a casca não decide nada: ela delega ao núcleo', () => {
    expect(main).toContain('readChildrenFrom(props.getProperties())');
    expect(main).toContain('childrenWrites(list)');
  });
});
