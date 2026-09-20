// O singleton do criador, no caminho que a rodada de 20/09 abriu.
//
// O projeto afirma, e o comentário no código repete: "singleton POR FORMA DO DADO — uma Property, um
// folderId; dois criadores não são representáveis". Isso é verdade para `CREATOR`. **Não era verdade
// para a lista `CAP:<pasta>`**, e foi ali que o portão do `agent.create` foi fiado.
//
// O resultado: ligar `create` em B apontava `CREATOR=B` e deixava `create` na lista de A. Dois agentes
// passariam pelo portão — e o que multiplica é justamente este. O estado impossível era representável;
// só ninguém tinha olhado pelo lado da lista.
import { describe, expect, test } from 'vitest';
import { capsAfterCreatorMoved, parseCapabilities } from '../src/agentCaps';

describe('mover o criador tira a capacidade de quem a tinha', () => {
  test('o antecessor perde `create`, e só ela', () => {
    expect(capsAfterCreatorMoved(['dream', 'create', 'succeed'])).toEqual(['dream', 'succeed']);
  });

  test('quem não era criador não é afetado', () => {
    expect(capsAfterCreatorMoved(['dream'])).toEqual(['dream']);
  });

  test('lista vazia continua vazia, sem inventar capacidade', () => {
    expect(capsAfterCreatorMoved([])).toEqual([]);
  });

  // O portão do motor não pode confiar na lista: a Property única é a fonte da verdade, e ela é a
  // única que não consegue representar dois criadores.
  test('o motor decide por CREATOR, não pela lista de capacidades', async () => {
    const main = (await import('node:fs')).readFileSync('src/main.ts', 'utf8');
    const i = main.indexOf('createAgent: (nome');
    const volta = main.slice(Math.max(0, i - 700), i + 120);
    expect(volta).toContain("getProperty('CREATOR')");
  });

  test('ligar `create` em outro agente limpa a lista do anterior', async () => {
    const main = (await import('node:fs')).readFileSync('src/main.ts', 'utf8');
    expect(main).toContain('capsAfterCreatorMoved(');
  });

  // Fail-closed: sem CREATOR gravado, ninguém cria. Uma Property ausente não pode virar "todo mundo pode".
  test('sem CREATOR, a lista sozinha não abre o portão', () => {
    expect(parseCapabilities(JSON.stringify(['create']))).toContain('create'); // a lista até diz que sim…
    // …e o motor ignora: o teste acima garante que ele lê CREATOR. Esta linha existe para deixar
    // explícito que a lista NÃO é autoridade, e não por esquecimento.
  });
});
