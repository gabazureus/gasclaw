// O run que NINGUÉM pediu esbarrando num card.
//
// Este é o único caminho do produto em que conteúdo de terceiro poderia virar ação sem clique, e até
// a auditoria por mutação do ciclo 3 ele não tinha nenhum teste de comportamento: as três guardas
// (`ask` pendurado, `NEVER_AUTO`, reavaliação pós-auto-aprovação) matavam ZERO testes quando mutadas.
// O que existia era `expect(main).toContain('onProactiveBlock(')` — um grep que morre por
// refatoração inocente e sobrevive a comportamento errado.
//
// A regra que estes testes prendem: um run proativo não PERGUNTA. Ou a ferramenta está na lista que
// o dono aprovou, ou ele falha e registra — nunca fica `waiting` esperando um clique que ninguém está
// lá para dar, segurando lease e sumindo do radar.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas, type GasEnv } from './gasEnv';

let env: GasEnv;
const FOLDER = 'f1';

/** Um agente pronto para despertar: capacidade ligada, agenda vencida, ferramentas aprovadas. */
function prontoParaAcordar(auto: string[] = [], tools = ['now', 'ask', 'gmail.send']) {
  env.props['AGENTS'] = JSON.stringify([{ name: 'a', folderId: FOLDER }]);
  env.props[`CAP:${FOLDER}`] = JSON.stringify(['initiative']);
  env.props[`STATUS:${FOLDER}`] = 'active';
  env.props[`ACCESS:${FOLDER}`] = JSON.stringify({ users: [], tools });
  env.props[`SCHED:${FOLDER}`] = JSON.stringify([{ at: 0, prompt: 'bom dia', days: [] }]);
  env.props[`SCHEDSEEN:${FOLDER}`] = '-1';
  if (auto.length) env.props[`AUTOOK:${FOLDER}`] = JSON.stringify(auto);
}

/** O run proativo gravado no Drive, depois do tique. */
const runProativo = () => {
  for (const [k, v] of env.drive) if (k.includes('wake-')) return JSON.parse(v) as { status: string; error?: string };
  return null;
};

beforeEach(() => {
  vi.resetModules();
  env = stubGas();
  env.props['OWNER'] = 'dono@x.com';
});
afterEach(() => vi.unstubAllGlobals());

describe('um run proativo nunca fica pendurado', () => {
  // CONTROLE POSITIVO: sem ele, os testes abaixo ficariam verdes se nenhum run nascesse.
  test('controle positivo: sem pendência, o run termina normalmente', async () => {
    prontoParaAcordar();
    env.llm = [{ content: 'bom dia, tudo certo' }];
    const m = await import('../src/main');
    m.drainRuns();
    m.drainRuns(); // o primeiro tique enfileira; o segundo trabalha
    const r = runProativo();
    expect(r).not.toBeNull();
    expect(r?.status).not.toBe('waiting');
  });

  // DOIS TESTES FORAM REMOVIDOS DAQUI, e a remoção é o registro honesto de uma lacuna.
  //
  // Eu quis provar por comportamento que (a) um run proativo pedindo `ask` FALHA em vez de ficar
  // `waiting`, e (b) uma tool de `NEVER_AUTO` não é auto-aprovada nem estando na lista. As duas
  // guardas existem no motor (`main.ts`, logo depois do `chatTurn`) e as duas matam ZERO testes
  // quando mutadas — a auditoria do ciclo 3 mediu isso.
  //
  // O que eu verifiquei e DESCARTEI como causa, para o próximo ataque não recomeçar do zero:
  //   · as ferramentas chegam ao agente (`allowedTools` devolve now, ask, gmail.send);
  //   · os argumentos estão certos (`ask` exige `question`, não `text` — este era meu erro inicial);
  //   · o run gravado tem `proactive: true` e `ownerDm: false`;
  //   · o stub serve `tool_calls` de verdade (conferido chamando `complete()` direto).
  //
  // Mesmo assim o turno termina `done` com `answer: "ok"` e `done: {}` — ou seja, a ferramenta é
  // RECUSADA antes de virar pendência, e eu não descobri por quê. Deixar um teste que passa sem
  // exercitar a guarda seria a sexta forma de prova falsa desta sessão; prefiro a lacuna declarada.
});
