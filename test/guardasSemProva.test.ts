// As guardas que a AUDITORIA POR MUTAÇÃO do ciclo 3 mostrou desprotegidas.
//
// Cinco guardas de segurança tinham ZERO testes mortos quando mutadas: `untampered` no
// `screenApproval`, `claimable` no `claimById`, o `throw` do `ask` pendurado, a reavaliação
// pós-auto-aprovação, e a ordem das escritas do `passBaton`. Três delas eram "protegidas" por greps
// em `test/succession.test.ts` e `test/schedule.test.ts` — cegos a comportamento por construção.
//
// A pior era a primeira: eu a chamei de "o buraco mais grave dos três ciclos" no próprio comentário,
// e ela era completamente desprotegida. O lado do `runStore.decide` ESTÁ coberto (3 testes morrem);
// era só o sítio da TELA que ninguém exercitava — exatamente o oráculo de assinatura.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas, type GasEnv } from './gasEnv';
import { newRun, runAuthority, type DurableRun } from '../src/run';
import { runFile } from '../src/runStore';

let env: GasEnv;
const FOLDER = 'fa';

beforeEach(() => {
  vi.resetModules();
  env = stubGas();
  env.props['OWNER'] = 'dono@x.com';
  env.props['AGENTS'] = JSON.stringify([{ name: 'alpha', folderId: FOLDER }]);
  env.props[`STATUS:${FOLDER}`] = 'active';
});
afterEach(() => vi.unstubAllGlobals());

describe('a tela não re-assina um run ADULTERADO', () => {
  /** Um run parado esperando aprovação — a janela mais longa que o atacante tem. */
  const esperando = (): DurableRun => ({
    ...newRun({ runId: 'r1', session: `${FOLDER}:tela`, folderId: FOLDER, user: 'dono@x.com', text: 'oi', now: 1000, ownerDm: true }),
    status: 'waiting',
    pending: { kind: 'approval', name: 'gmail.send', callId: 'c1', key: 'k1', args: { to: 'certo@x.com' } },
    snapshot: { messages: [], step: 0, queue: [] },
  });

  /** A credencial do card: o painel só a emite depois de conferir a integridade. */
  const temCredencial = () => {
    const bruto = env.drive.get(`${FOLDER}/.gasclaw/runs/${runFile('r1')}`);
    return !!bruto && !!(JSON.parse(bruto) as { approval?: unknown }).approval;
  };

  // CONTROLE POSITIVO: sem ele, o teste do ataque ficaria verde com a emissão quebrada para todos.
  test('controle positivo: um run ÍNTEGRO recebe a credencial ao abrir o painel', async () => {
    const { runIO } = await import('../src/runStore');
    runIO().enqueue(esperando(), 1000);
    const m = await import('../src/main');
    expect(temCredencial()).toBe(false); // ainda não
    m.runState('r1');
    expect(temCredencial()).toBe(true); // o painel emitiu
  });

  // O ATAQUE: editar o arquivo do run na pasta COMPARTILHÁVEL e depois só abrir o painel. Se a tela
  // re-assinar, o `decide` conferirá a assinatura do atacante e deixará passar.
  test('run editado na pasta NÃO ganha assinatura nova ao abrir o painel', async () => {
    const { runIO } = await import('../src/runStore');
    const r = esperando();
    runIO().enqueue(r, 1000);
    const antes = env.props[`A:r1`];

    // Quem tem acesso de edição ao Drive troca o destinatário.
    const caminho = `${FOLDER}/.gasclaw/runs/${runFile('r1')}`;
    const adulterado = JSON.parse(env.drive.get(caminho)!);
    adulterado.pending.args.to = 'atacante@x.com';
    env.drive.set(caminho, JSON.stringify(adulterado));

    // O CACHE É LIMPO, como as POCs P4 e P20 fazem. Sem isso o teste mediria a cópia boa em memória
    // e não o arquivo do atacante — a janela real do ataque é justamente depois do cache expirar,
    // que é quando o run parado esperando aprovação volta a ser lido do Drive.
    for (const k of Object.keys(env.cache)) delete env.cache[k];

    const m = await import('../src/main');
    m.runState('r1'); // o dono apenas ABRE o painel — nem clica

    // Nem a assinatura vira a do atacante, nem a credencial é emitida sobre o estado dele.
    expect(env.props['A:r1']).toBe(antes);
    expect(temCredencial()).toBe(false);
  });
});

// `claimById` — a outra metade do `claimable`, e a que tem uma invariante A MAIS.
//
// A auditoria por mutação do ciclo 3 mediu: neutralizar a guarda em `claimNext` mata 1 teste;
// neutralizar em `claimById` mata ZERO. E `claimById` faz algo que `claimNext` também faz e ninguém
// provava: apagar a AUTORIDADE junto com o ponteiro. Um run que nunca mais vai rodar não pode deixar
// credencial viva — o card dele continuaria resgatável pela janela inteira (ADR-038 §F).
describe('claimById não reivindica run de agente arquivado', () => {
  const comRun = async (status: string) => {
    env.props['AGENTS'] = JSON.stringify([{ name: 'alpha', folderId: FOLDER }]);
    env.props[`STATUS:${FOLDER}`] = status;
    const { newRun } = await import('../src/run');
    const { runIO } = await import('../src/runStore');
    const io = runIO();
    io.enqueue(newRun({ runId: 'rx', session: `${FOLDER}:x`, folderId: FOLDER, user: 'dono@x.com', text: 'oi', now: 1000 }), 1000);
    return io;
  };

  // CONTROLE POSITIVO: sem ele, o teste seguinte passaria com `claimById` devolvendo null sempre.
  test('controle positivo: agente ATIVO tem o run reivindicado por id', async () => {
    const io = await comRun('active');
    expect(io.claimById('rx', 9_999_999)?.run.runId).toBe('rx');
  });

  test('agente arquivado: recusa, e a fila não fica girando', async () => {
    const io = await comRun('archived');
    expect(io.claimById('rx', 9_999_999)).toBeNull();
    expect(Object.keys(env.props).filter((k) => k.includes('rx') && k.startsWith('Q:'))).toEqual([]);
  });

  // A invariante que só o `claimById` tinha e que ninguém asseria.
  test('a CREDENCIAL do card morre junto com o run', async () => {
    const { authKey } = await import('../src/run');
    const io = await comRun('archived');
    expect(env.props[authKey('rx')]).toBeDefined(); // o enqueue a criou
    io.claimById('rx', 9_999_999);
    expect(env.props[authKey('rx')]).toBeUndefined(); // e o descarte a levou
  });
});
