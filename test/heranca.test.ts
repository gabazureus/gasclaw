// P30 — D1: a linhagem não encadeia.
//
// O defeito: `succeedNow` passa `incumbentSource: agente.system` — o PROMPT do agente — em TODA
// geração. O comentário ao lado do código diz "na primeira geração: não existe fonte anterior até o
// primeiro sucessor nascer", e a segunda metade nunca foi escrita. Consequência: a geração 2 não
// recebe o código da 1. Cada filho é um sorteio novo do mesmo ponto de partida, o que é REPLICAÇÃO
// COM VARIÂNCIA, não evolução — e nada na tela dizia isso.
//
// `heirOf` é a escolha de QUEM herdar, pura e sem I/O. Ler o fonte é da casca (ADR-002: vem da API
// do Apps Script, nunca do Drive).
import { describe, expect, test } from 'vitest';
import { heirOf, type LineageEntry } from '../src/agentCaps';

const e = (o: Partial<LineageEntry>): LineageEntry => ({ at: 0, kind: 'codegen', parent: 'pai', child: 'filho', generation: 1, delta: null, costUsd: 0, summary: '', ...o });

describe('heirOf: de quem a próxima geração herda', () => {
  test('sem linhagem nenhuma, não há de quem herdar — e null é a resposta honesta', () => {
    expect(heirOf([], 'pai')).toBeNull();
  });

  test('um filho: herda dele', () => {
    expect(heirOf([e({ child: 'c1', at: 10 })], 'pai')).toBe('c1');
  });

  // RECÊNCIA, e não aptidão. Encadear pelo MELHOR exigiria o filho ter rodado, e rodar exige o clique
  // do dono (P24). Por recência a corrente anda sozinha; a seleção por aptidão é outro passo (P31/F4).
  test('vários filhos: herda do MAIS RECENTE, não do primeiro', () => {
    const l = [e({ child: 'c1', at: 10 }), e({ child: 'c3', at: 30 }), e({ child: 'c2', at: 20 })];
    expect(heirOf(l, 'pai')).toBe('c3');
  });

  test('filho de OUTRO pai não é herança desta linhagem', () => {
    expect(heirOf([e({ child: 'alheio', parent: 'outro', at: 99 })], 'pai')).toBeNull();
  });

  // `creation` e `succession` não são geração de código: herdar de uma criação seria herdar de um
  // agente que nunca teve fonte. Só `codegen` escreve código.
  test('só `codegen` deixa fonte para herdar', () => {
    const l = [e({ child: 'novo', kind: 'creation', at: 50 }), e({ child: 'c1', kind: 'codegen', at: 10 })];
    expect(heirOf(l, 'pai')).toBe('c1');
  });

  test('entrada sem filho nomeado é descartada, não vira herança vazia', () => {
    expect(heirOf([e({ child: '', at: 90 }), e({ child: 'c1', at: 10 })], 'pai')).toBe('c1');
  });

  test('carimbo ilegível não ganha de um carimbo válido', () => {
    const l = [e({ child: 'quebrado', at: Number.NaN }), e({ child: 'c1', at: 10 })];
    expect(heirOf(l, 'pai')).toBe('c1');
  });
});
