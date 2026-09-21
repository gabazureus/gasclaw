// F7 — o patch que o Opus devolve para melhorar o agente. NÚCLEO PURO.
//
// O Opus recebe o código do agente e devolve TROCAS, não o motor inteiro: o agente tem ~563 KB e uma
// execução morre em 6 min (ADR-043, decisão 1). Cada troca é "este trecho exato vira este outro".
//
// A regra central, e por que ela é a regra: cada trecho tem que aparecer EXATAMENTE UMA VEZ no arquivo.
// Zero vezes = o Opus inventou um código que não existe. Duas vezes = a troca é ambígua, e aplicar na
// primeira ocorrência mudaria um lugar que ninguém escolheu. Nos dois casos, recusar é a única saída
// honesta — adivinhar onde aplicar seria escrever num agente um código que ninguém revisou ali.
import { describe, expect, test } from 'vitest';
import { applyPatch, parsePatch, type PatchFile } from '../src/patch';

const arquivos: PatchFile[] = [
  { name: '_motor', source: 'function a() { return 1; }\nfunction b() { return 2; }\n' },
  { name: 'appsscript', source: '{"timeZone":"x"}' },
];
const json = (o: unknown) => JSON.stringify(o);

describe('parsePatch: o que o Opus devolveu vira patch, ou não vira nada', () => {
  test('um patch válido é lido, com a explicação', () => {
    const p = parsePatch(json({ explanation: 'b devolvia 2', changes: [{ file: '_motor', find: 'return 2;', replace: 'return 3;' }] }));
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.explanation).toBe('b devolvia 2');
      expect(p.changes).toHaveLength(1);
    }
  });

  // O modo de falha comum dos modelos: preâmbulo e cerca de markdown em volta do JSON.
  test('JSON dentro de cerca de markdown é lido', () => {
    const p = parsePatch('Here is the patch:\n```json\n' + json({ explanation: 'x', changes: [{ file: '_motor', find: 'a', replace: 'b' }] }) + '\n```');
    expect(p.ok).toBe(true);
  });

  // "O que melhorou" é metade do pedido do dono. Patch sem explicação não é aceito.
  test('sem explicação, recusa — o dono pediu para saber O QUE melhorou', () => {
    const p = parsePatch(json({ explanation: '  ', changes: [{ file: '_motor', find: 'a', replace: 'b' }] }));
    expect(p.ok).toBe(false);
  });

  test('sem nenhuma troca, recusa: um patch vazio não melhora nada', () => {
    expect(parsePatch(json({ explanation: 'x', changes: [] })).ok).toBe(false);
  });

  // UMA troca malformada invalida o patch inteiro: meio patch aplicado é um agente que ninguém pediu.
  test('uma troca incompleta invalida o patch inteiro', () => {
    const p = parsePatch(json({ explanation: 'x', changes: [{ file: '_motor', find: 'a', replace: 'b' }, { file: '_motor', find: 'c' }] }));
    expect(p.ok).toBe(false);
  });

  test('trecho vazio é recusado: ele casaria em todo lugar', () => {
    expect(parsePatch(json({ explanation: 'x', changes: [{ file: '_motor', find: '', replace: 'b' }] })).ok).toBe(false);
  });

  test('lixo não é patch', () => {
    for (const bruto of ['', 'não é json', '[]', json({}), json({ explanation: 'x' })]) expect(parsePatch(bruto).ok).toBe(false);
  });
});

describe('applyPatch: cada trecho casa EXATAMENTE uma vez, senão nada é aplicado', () => {
  test('troca que casa uma vez é aplicada, e o resto do arquivo não muda', () => {
    const r = applyPatch(arquivos, [{ file: '_motor', find: 'return 2;', replace: 'return 3;' }]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.files.find((f) => f.name === '_motor')?.source).toBe('function a() { return 1; }\nfunction b() { return 3; }\n');
      expect(r.files.find((f) => f.name === 'appsscript')?.source).toBe('{"timeZone":"x"}');
    }
  });

  // ZERO: o Opus inventou código que não existe no agente.
  test('trecho que não existe é recusado, e diz qual', () => {
    const r = applyPatch(arquivos, [{ file: '_motor', find: 'return 99;', replace: 'x' }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/0 times/);
  });

  // DUAS: ambíguo. Aplicar na primeira mudaria um lugar que ninguém escolheu.
  test('trecho que aparece duas vezes é recusado: a troca é ambígua', () => {
    const r = applyPatch(arquivos, [{ file: '_motor', find: 'return', replace: 'x' }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/2 times/);
  });

  test('arquivo que não existe é recusado', () => {
    expect(applyPatch(arquivos, [{ file: 'inventado', find: 'a', replace: 'b' }]).ok).toBe(false);
  });

  // Tudo ou nada: se a terceira troca falha, as duas primeiras NÃO ficam aplicadas.
  test('uma troca ruim impede todas: tudo ou nada', () => {
    const r = applyPatch(arquivos, [
      { file: '_motor', find: 'return 1;', replace: 'return 10;' },
      { file: '_motor', find: 'nao-existe', replace: 'x' },
    ]);
    expect(r.ok).toBe(false);
  });

  // A contagem é sobre o arquivo ORIGINAL, não sobre o já trocado: senão a ordem das trocas mudaria o
  // resultado, e uma troca poderia criar o trecho que a seguinte procura.
  test('as trocas são avaliadas contra o original, não em cadeia', () => {
    const r = applyPatch(arquivos, [
      { file: '_motor', find: 'return 1;', replace: 'return 2;' },
      { file: '_motor', find: 'return 2;', replace: 'return 9;' },
    ]);
    // `return 2;` aparece UMA vez no original — em b. A primeira troca não pode criar uma segunda.
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.files.find((f) => f.name === '_motor')?.source).toBe('function a() { return 2; }\nfunction b() { return 9; }\n');
  });

  // M5: com trocas de MESMO tamanho, aplicar do começo ou do fim dá igual — e a mutação sobrevivia.
  // Aqui a primeira troca CRESCE: aplicada antes, ela desloca o índice da segunda, e a segunda cairia
  // no lugar errado. Só aplicar do fim para o começo acerta.
  test('trocas de tamanhos diferentes no mesmo arquivo caem no lugar certo', () => {
    const r = applyPatch(arquivos, [
      { file: '_motor', find: 'return 1;', replace: 'return 1000000;' },
      { file: '_motor', find: 'return 2;', replace: 'return 9;' },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.files.find((f) => f.name === '_motor')?.source).toBe('function a() { return 1000000; }\nfunction b() { return 9; }\n');
  });

  // M6: `aa` em `aaa` aparece DUAS vezes (posições 0 e 1). Contar sem sobreposição diria uma, e a troca
  // ambígua passaria.
  test('trecho que se sobrepõe a si mesmo conta as duas ocorrências e é recusado', () => {
    expect(applyPatch([{ name: 'f', source: 'aaa' }], [{ file: 'f', find: 'aa', replace: 'b' }]).ok).toBe(false);
  });

  // Duas trocas no MESMO trecho do original: a segunda desfaria ou mexeria na primeira. Recusa.
  test('duas trocas sobre o mesmo trecho do original são recusadas', () => {
    const r = applyPatch(arquivos, [
      { file: '_motor', find: 'return 1;', replace: 'return 5;' },
      { file: '_motor', find: 'return 1;', replace: 'return 6;' },
    ]);
    expect(r.ok).toBe(false);
  });
});
