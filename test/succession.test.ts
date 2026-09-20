// A FIAÇÃO da sucessão (item 17): bastão, mandato e linhagem.
//
// O núcleo já decidia (`canSucceed`, `capsAfterSuccession`, `mayGenerate`); o que faltava era o caminho
// real — e é nele que moram as duas coisas que o núcleo puro não consegue errar sozinho: o mandato que
// não expira e o sucessor que nasce com mais do que o antecessor.
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const main = readFileSync('src/main.ts', 'utf8');
const bloco = main.slice(main.indexOf('// ---------- Sucessão'), main.indexOf('// ---------- Teto familiar'));

describe('o mandato é autorização com escopo e validade, não interruptor', () => {
  // Foi isto que separou "ele vai evoluindo" de "você aprovou uma vez e delegou para sempre".
  test('tem contagem E prazo, e os dois são conferidos', () => {
    expect(bloco).toContain('m.until > Date.now() && m.left > 0');
    expect(bloco).toMatch(/left: m\.mandate\.left - 1/); // encolhe a cada uso
  });

  test('mandato ilegível não vale — autorização não se presume', () => {
    expect(bloco).toContain('return null; // mandato ilegível = sem mandato');
  });

  test('os limites são presos: no máximo 10 sucessões e 30 dias', () => {
    expect(bloco).toContain('Math.min(10,');
    expect(bloco).toContain('Math.min(30,');
  });
});

describe('o bastão não é escada de privilégio', () => {
  // A regra que impede a sucessão de virar acúmulo: o sucessor nunca nasce com mais do que o antecessor.
  // Este teste EXIGIA que o uso errado existisse. `capsAfterSuccession` foi escrita para capacidades
  // DECLARADAS no markdown da pasta (conteúdo de terceiro); o `passBaton` a alimentava com a Property
  // `CAP:<sucessor>`, que é a lista que o DONO aprovou — e a interseção revogava em silêncio o que ele
  // tinha concedido. A propriedade que importa é "a sucessão não CONCEDE", e ela se prova por
  // comportamento em `test/criarAgente.test.ts`, não por grep aqui.
  test('a sucessão não CONCEDE capacidade nenhuma ao sucessor', () => {
    // Não gravar já não concede: o bloco não pode ter escrita em `CAP:<to>` fora do caso do bastão.
    const escritas = [...bloco.matchAll(/setProperty\(`CAP:\$\{toFolderId\}`/g)].length;
    expect(escritas).toBeLessThanOrEqual(2); // só as duas do bloco que tira `create`
  });

  test('o antecessor é arquivado no mesmo ato: a conta não cresce', () => {
    expect(bloco).toContain("props.setProperty(`STATUS:${fromFolderId}`, 'archived')");
  });

  test('e só sucede quem tem a capacidade e não está arquivado', () => {
    expect(bloco).toContain('const v = canSucceed(caps,');
    expect(bloco).toContain('if (!v.ok) throw new Error(v.reason);');
  });
});

describe('a linhagem torna "evoluiu" verificável', () => {
  test('cada entrada carrega geração, pai, filho, tipo do ato e delta', () => {
    for (const campo of ['generation:', 'parent:', 'child:', "kind: 'succession'", 'delta,']) expect(bloco).toContain(campo);
  });

  // Sem resumo a linhagem vira lista de nomes sem parentesco.
  test('e um resumo que diz o que sustenta a frase', () => {
    expect(bloco).toContain('succession with delta ${delta} on the judge set');
    expect(bloco).toContain('succession with no measured delta');
  });

  test('o histórico tem fim declarado, em vez de crescer até estourar a Property', () => {
    expect(bloco).toContain('.slice(-100)');
  });
});

// O intervalo é trava de CUSTO e de DESCONTROLE ao mesmo tempo — o Opus só roda na geração.
test('o carimbo do intervalo é gravado ao passar o bastão', () => {
  expect(bloco).toContain('props.setProperty(genStamp(fromFolderId), String(Date.now()))');
});
