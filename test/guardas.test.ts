// F7, Fase 1 — o CRIVO DE GUARDAS. NÚCLEO PURO.
//
// O crivo das automações recusa `getOAuthToken` e `script.googleapis.com` — e recusaria o PRÓPRIO
// motor, que usa os dois (16× e 8× no bundle). Para um agente sucessor a pergunta é outra: o patch
// ENFRAQUECE alguma guarda? Compara ANTES × DEPOIS e recusa se qualquer guarda diminuir.
//
// As guardas da ADR-043: `assertOwner`, `NEVER_AUTO`, o registro fechado de tools, `mayWriteProject` —
// e as que a F6 acrescentou ao caminho do que age sozinho: `mayAct`, `isRunnable`, e a chave de parada
// `isEnabled()` (o D6 provou que ela sumir deixa `down` sem efeito no que gasta).
import { describe, expect, test } from 'vitest';
import { guardsOf, guardsWeakened } from '../src/guards';

const motor = `
function a() { assertOwner(); return 1; }
function b() { assertOwner(); mayWriteProject(x, y); return 2; }
function mayAct(id) { if (!store.isEnabled()) return no(); if (!isRunnable(s)) return no(); return yes(); }
var NEVER_AUTO = [
  "gmail.send",
  "calendar.update",
  // um comentário do bundle que CITA uma tool entre aspas, "drive.delete", e NÃO é um membro
  "memory.remove",
];
var TOOLS = [
  { name: "gmail.send", description: "Sends an e-mail.", approval: "always" },
  { name: "gmail.read", description: "Reads.", approval: "never" },
  { name: "tasks.create", description: "Creates.", approval: "once" },
];
`;

describe('guardsOf: o que conta como guarda, lido do bundle', () => {
  const g = guardsOf(motor);
  test('conta as chamadas de guarda', () => {
    expect(g.counts.assertOwner).toBe(2);
    expect(g.counts.mayWriteProject).toBe(1);
    expect(g.counts.isEnabled).toBe(1);
    expect(g.counts.isRunnable).toBe(1);
  });
  // O bundle tem comentários DENTRO da lista `NEVER_AUTO`, com aspas. Eles não são membros.
  test('lê os membros de NEVER_AUTO, ignorando os comentários dentro da lista', () => {
    expect(g.neverAuto).toEqual(['calendar.update', 'gmail.send', 'memory.remove']);
  });
  test('lê o registro de tools com o nível de aprovação de cada uma', () => {
    expect(g.tools).toEqual({ 'gmail.read': 'never', 'gmail.send': 'always', 'tasks.create': 'once' });
  });
});

describe('guardsWeakened: o patch enfraquece alguma guarda?', () => {
  const troca = (de: string, para: string) => motor.replace(de, para);

  test('o motor igual não enfraquece nada', () => {
    expect(guardsWeakened(motor, motor)).toEqual([]);
  });

  test('tirar um assertOwner() enfraquece, e diz qual', () => {
    const r = guardsWeakened(motor, troca('function a() { assertOwner(); return 1; }', 'function a() { return 1; }'));
    expect(r.join(' ')).toMatch(/assertOwner/);
  });

  // Acrescentar guarda é fortalecer: o crivo não pode recusar isso.
  test('ACRESCENTAR uma guarda não é enfraquecer', () => {
    expect(guardsWeakened(motor, motor + '\nfunction c() { assertOwner(); }')).toEqual([]);
  });

  test('tirar mayWriteProject enfraquece — é o que impede o motor de reescrever a si mesmo', () => {
    expect(guardsWeakened(motor, troca('mayWriteProject(x, y); ', '')).join(' ')).toMatch(/mayWriteProject/);
  });

  // O D6: sem isto, `./gasclaw down` para o que fala e deixa correr o que paga.
  test('tirar a chave de parada (isEnabled) enfraquece', () => {
    expect(guardsWeakened(motor, troca('if (!store.isEnabled()) return no(); ', '')).join(' ')).toMatch(/isEnabled/);
  });

  test('tirar um membro de NEVER_AUTO enfraquece, e diz qual', () => {
    expect(guardsWeakened(motor, troca('"gmail.send",\n  "calendar.update"', '"calendar.update"')).join(' ')).toMatch(/gmail\.send/);
  });

  test('sumir com a lista NEVER_AUTO inteira enfraquece', () => {
    expect(guardsWeakened(motor, motor.replace(/var NEVER_AUTO = \[[\s\S]*?\];/, '')).join(' ')).toMatch(/NEVER_AUTO/);
  });

  // O REGISTRO É FECHADO: ferramenta nova é poder novo, e poder novo não entra por patch.
  test('uma ferramenta NOVA no registro enfraquece: o registro é fechado', () => {
    const r = guardsWeakened(motor, troca('var TOOLS = [', 'var TOOLS = [\n  { name: "drive.delete", description: "x", approval: "always" },'));
    expect(r.join(' ')).toMatch(/drive\.delete/);
  });

  // Enfraquecer sem apagar: gmail.send de "always" para "never" não remove linha nenhuma.
  test('descer a aprovação de uma tool enfraquece — sem apagar linha nenhuma', () => {
    const r = guardsWeakened(motor, troca('name: "gmail.send", description: "Sends an e-mail.", approval: "always"', 'name: "gmail.send", description: "Sends an e-mail.", approval: "never"'));
    expect(r.join(' ')).toMatch(/gmail\.send/);
  });

  // DECISÃO EXPLÍCITA: tirar uma tool não é enfraquecer a SEGURANÇA — é menos poder. Mas também recusa:
  // um patch pontual que apaga uma capacidade inteira foge do escopo, e o dono precisa ver isso antes.
  test('uma tool que SOME do registro também recusa, e diz qual', () => {
    expect(guardsWeakened(motor, troca('  { name: "gmail.read", description: "Reads.", approval: "never" },\n', '')).join(' ')).toMatch(/gmail\.read disappeared/);
  });

  test('SUBIR a aprovação de uma tool não é enfraquecer', () => {
    expect(guardsWeakened(motor, troca('approval: "never"', 'approval: "always"'))).toEqual([]);
  });
});
