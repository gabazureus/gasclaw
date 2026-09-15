import { describe, expect, test } from 'vitest';
import { summarizeP15, type P15Obs } from '../poc/p15-limites/summary';

const ids = ['freeDay', 'freeMin', 'orDaily', 'drive', 'urlfetch', 'runtime', 'props', 'processes', 'mail', 'triggers', 'monitoring'];
const obs = (): P15Obs => ({
  read: { freshMs: 2500, cachedMaxMs: 40, trigger: 'aguardando autorização', erros: [], pendentesForaDaReautorizacao: [], itens: ids.map((id) => ({ id, status: 'ok', source: 'google' })) },
  dailyrow: { linhasHoje: 11, skipped: null },
  whose: { efetivo: 'dono@x.com', ativo: 'dono@x.com', dono: 'dono@x.com' },
  cli: { exit: 0, linhas: 11 },
});

describe('summarizeP15', () => {
  test('tudo certo passa', () => expect(summarizeP15(obs()).pass).toBe(true));
  test('C1 falha com fonte em erro, ou pendente fora das que dependem da reautorização', () => {
    const o = obs();
    o.read.erros = ['drive'];
    expect(summarizeP15(o).c1.pass).toBe(false);
    const p = obs();
    p.read.pendentesForaDaReautorizacao = ['drive'];
    expect(summarizeP15(p).c1.pass).toBe(false);
  });
  test('C2 falha com leitura em cache ≥ 1 s', () => {
    const o = obs();
    o.read.cachedMaxMs = 1000;
    expect(summarizeP15(o).c2.pass).toBe(false);
  });
  test('C6: cota do dono quando o web app executa como o dono', () => {
    const o = obs();
    o.whose.efetivo = 'outra@x.com';
    expect(summarizeP15(o).c6.pass).toBe(false);
  });
});
