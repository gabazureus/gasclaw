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
import { changesTouchGuards, codeOnly, definitionsOf, guardsOf, guardsWeakened } from '../src/guards';

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

// Revisão de segurança (alta): o crivo contava chamadas no fonte CRU. Três famílias de bypass mantinham
// a contagem igual: (a) a chamada vira texto morto; (b) o CORPO da guarda muda e as chamadas não; (c) a
// guarda nem era contada (cliAuthorized, `parent !== successorOf()`, inheritable).
describe('crivo endurecido: comentário, string, corpo da guarda e guardas não contadas', () => {
  const troca = (de: string, para: string) => motor.replace(de, para);

  test('(a) comentar a chamada com // enfraquece', () => {
    expect(guardsWeakened(motor, troca('function a() { assertOwner();', 'function a() { // assertOwner();\n')).join(' ')).toMatch(/assertOwner/);
  });
  test('(a) comentar a chamada com /* */ enfraquece', () => {
    expect(guardsWeakened(motor, troca('function a() { assertOwner();', 'function a() { /* assertOwner(); */')).join(' ')).toMatch(/assertOwner/);
  });
  test('(a) mover a chamada para dentro de uma string enfraquece', () => {
    expect(guardsWeakened(motor, troca('function a() { assertOwner();', 'function a() { var s = "assertOwner();";')).join(' ')).toMatch(/assertOwner/);
  });

  const pai = `
function assertOwner() {
  var me = Session.getEffectiveUser().getEmail();
  if (me !== owner()) throw new Error("not the owner");
  return me;
}
function a() { assertOwner(); return lastSeen; }
var cliAuthorized = (stored, given) => !!stored && !!given && safeEqual(stored, given);
function crownFromParent(parent) {
  if (parent !== successorOf()) {
    return { ok: false };
  }
  return doCrown();
}
function inheritable(props8) {
  var entries = {};
  for (var k in props8) if (k.indexOf("SECRET") < 0) entries[k] = props8[k];
  return entries;
}
function planCycle(x) { return x + 1; }
function ownerEmail() {
  return saved || Session.getEffectiveUser().getEmail();
}
var can = (caps, cap) => caps.indexOf(cap) >= 0;
`;
  const arquivos = [{ name: '_motor', source: pai }];
  const toca = (find: string, replace: string) => changesTouchGuards(arquivos, [{ file: '_motor', find, replace }]);

  test('(a) `if (false) assertOwner();` — a troca cita a guarda, e isso basta para recusar', () => {
    expect(toca('function a() { assertOwner();', 'function a() { if (false) assertOwner();').join(' ')).toMatch(/assertOwner/);
  });
  test('(b) mexer no CORPO de assertOwner (throw vira console.log) recusa, sem citar o nome', () => {
    expect(toca('throw new Error("not the owner")', 'console.log("not the owner")').join(' ')).toMatch(/assertOwner/);
  });
  test('(c) mexer em cliAuthorized recusa', () => {
    expect(toca('!!stored && !!given && ', '').join(' ')).toMatch(/cliAuthorized/);
  });
  test('(c) tirar o `parent !== successorOf()` de crownFromParent recusa', () => {
    expect(toca('  if (parent !== successorOf()) {\n    return { ok: false };\n  }\n', '').join(' ')).toMatch(/crownFromParent|successorOf/);
  });
  test('(c) mexer no filtro de inheritable recusa, sem citar o nome', () => {
    expect(toca('if (k.indexOf("SECRET") < 0) ', '').join(' ')).toMatch(/inheritable/);
  });
  // REVISÃO FINAL F9: as guardas dependem de outras funções. Trocar o corpo de `ownerEmail` faz `assertOwner`
  // comparar quem chama com ele mesmo; redefinir `can` desliga a capacidade dentro de `mayAct`.
  test('(d) mexer no corpo de ownerEmail — de quem assertOwner depende — recusa', () => {
    expect(toca('return saved || Session.getEffectiveUser().getEmail();', 'return Session.getActiveUser().getEmail();').join(' ')).toMatch(/ownerEmail/);
  });
  test('(d) redefinir `can` num lugar novo recusa', () => {
    expect(toca('function planCycle(x) { return x + 1; }', 'function planCycle(x) { return x + 1; }\nvar can = () => true;').join(' ')).toMatch(/can/);
  });
  test('(d) a PALAVRA "can" num comentário não é a função: o patch benigno passa', () => {
    expect(toca('function planCycle(x) { return x + 1; }', 'function planCycle(x) { return x + 2; } // this can overflow')).toEqual([]);
  });
  test('um patch benigno, fora de qualquer guarda, passa', () => {
    expect(toca('function planCycle(x) { return x + 1; }', 'function planCycle(x) { return x + 2; }')).toEqual([]);
    expect(toca('return lastSeen;', 'return lastSeen - 1;')).toEqual([]);
  });
});

// Achado no bundle real: `/["']x["']/g` dentro de guardsOf abria uma "string" falsa que engolia 177 mil
// caracteres — a definição de guardsOf cobria um terço do motor, e todo patch ali seria recusado.
describe('codeOnly: regex literal não abre string falsa', () => {
  test('a aspa dentro de um regex não engole o código seguinte', () => {
    const src = 'var r = /["\']x["\']/g; assertOwner(); var d = a / b; mayAct(1); var s = "q";';
    const c = codeOnly(src);
    expect(c).toHaveLength(src.length);
    expect(c).toContain('assertOwner();');
    expect(c).toContain('mayAct(1);');
    expect(c).not.toContain('"q"');
  });
  test('a definição de uma protegida com regex dentro termina onde ela termina', () => {
    const src = 'function guardsOf(s) { return /["\']a["\']/.test(s); }\nfunction planCycle() { return 1; }';
    expect(definitionsOf(src)).toEqual([{ name: 'guardsOf', from: 0, to: src.indexOf('\n') }]);
  });
});

// Auditoria 2026-09-21 (mutação): quatro regras do crivo passavam com o conserto removido. Estes testes
// falham se cada uma sumir.
describe('crivo: as regras que nenhum teste segurava', () => {
  const pai = `
function assertOwner2() {
  if (!ok) throw new Error("not the owner");
}
function a() { assertOwner(); return 1; }
function planCycle(x) { return x + 1; }
`;
  const arquivos = [{ name: '_motor', source: pai }];
  const toca = (find: string, replace: string) => changesTouchGuards(arquivos, [{ file: '_motor', find, replace }]);

  test('comentário de bloco em várias linhas esconde a chamada: enfraquece', () => {
    const antes = 'function a() {\n  assertOwner();\n  return 1;\n}';
    const depois = 'function a() {\n  /*\n  assertOwner();\n  */\n  return 1;\n}';
    expect(guardsWeakened(antes, depois).join(' ')).toMatch(/assertOwner/);
  });
  test('o `find` que cita a guarda recusa, mesmo com o `replace` limpo e fora de qualquer definição', () => {
    expect(toca('function a() { assertOwner();', 'function a() {').join(' ')).toMatch(/assertOwner/);
  });
  test('o nome renomeado pelo esbuild (`assertOwner2`) também é guarda: mexer no corpo recusa', () => {
    expect(toca('if (!ok) throw new Error("not the owner");', 'console.log("x");').join(' ')).toMatch(/assertOwner/);
  });
  test('citar `successorOf2()` no `replace` recusa', () => {
    expect(toca('function planCycle(x) { return x + 1; }', 'function planCycle(x) { return successorOf2() ? x : x + 1; }').join(' ')).toMatch(/successorOf/);
  });

  // A lista inteira, por nome: tirar qualquer um deles da lista protegida deixa o corpo dele editável por patch.
  test.each([
    'assertOwner', 'mayAct', 'mayWriteProject', 'isRunnable', 'isEnabled', 'enabledWith', 'cliAuthorized', 'validSecret', 'safeEqual',
    'crownFromParent', 'inheritFromParent', 'evalRunForParent', 'inheritable', 'successorOf',
    'guardsOf', 'guardsWeakened', 'changesTouchGuards', 'codeOnly', 'opensRegex', 'definitionsOf',
    'ownerEmail', 'isDev', 'can', 'effectiveCapabilities', 'parseCapabilities', 'capsEnabled', 'parseStatus', 'claimable',
    'familySpendQuiet', 'budgetNow', 'capAction', 'forgetAgentProps', 'mayAutoApprove', 'onProactiveBlock', 'cleanAutoList',
  ])('mexer no corpo de %s recusa', (nome) => {
    const src = `function ${nome}(x) {\n  return x + 1;\n}\nfunction other() { return 0; }`;
    expect(changesTouchGuards([{ name: '_motor', source: src }], [{ file: '_motor', find: 'return x + 1;', replace: 'return x;' }]).join(' ')).toContain(`guard ${nome}`);
  });
});
