// Entrega da chave ao filho e teto familiar.
//
// O desenho parte de uma decisão do usuário (filho usa a mesma chave do pai) e de um problema que
// ela NÃO resolve: o segredo continua no fonte do filho. A unicidade da entrega é o que fecha isso.
import { describe, expect, test } from 'vitest';
import {
  afterDelivery,
  armDelivery,
  capAction,
  childrenSpendUpperBound,
  deliverySpan,
  FAMILY_CAP_USD,
  FAMILY_LAG_MS,
  FAMILY_NOTE,
  mayDeliverKey,
  rearmDelivery,
} from '../src/family';

describe('entrega da chave: uma vez, autenticada, rastreada', () => {
  const d = armDelivery('filho1');

  test('entrega ao filho certo, com o segredo certo, com a janela armada', () => {
    expect(mayDeliverKey(d, 'filho1', true).ok).toBe(true);
  });

  test('segredo errado não entrega — é o que prova que o pai criou este filho', () => {
    expect(mayDeliverKey(d, 'filho1', false).ok).toBe(false);
  });

  test('outro filho não entrega, mesmo com segredo válido do dele', () => {
    expect(mayDeliverKey(d, 'filho2', true).ok).toBe(false);
  });

  test('sem estado de entrega, recusa: filho que este agente não criou', () => {
    expect(mayDeliverKey(null, 'filho1', true).ok).toBe(false);
  });

  test('SEGUNDA entrega é recusada — e é isto que faz um segredo vazado não valer nada', () => {
    const depois = afterDelivery(d, 1000);
    const v = mayDeliverKey(depois, 'filho1', true);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('re-arm');
  });

  test('rearmar devolve a janela, e é ato do dono; a CONTAGEM não zera', () => {
    const depois = afterDelivery(d, 1000);
    const rearmado = rearmDelivery(depois);
    expect(mayDeliverKey(rearmado, 'filho1', true).ok).toBe(true);
    expect(rearmado.deliveries).toBe(1); // entrega repetida é sinal, não rotina
    expect(afterDelivery(rearmado, 2000).deliveries).toBe(2);
  });

  test('a entrega deixa rastro nomeado no trace', () => {
    expect(deliverySpan('filho1')).toBe('key_delivery:filho1');
  });
});

describe('teto familiar: o offset de -79% usado a favor', () => {
  test('consumo dos filhos = família menos pai, e nunca negativo', () => {
    expect(childrenSpendUpperBound(0.067, 0.013)).toBeCloseTo(0.054, 3);
    expect(childrenSpendUpperBound(0.01, 0.05)).toBe(0); // trace à frente do relatório: 0, não negativo
  });

  test('leitura inválida devolve null, e null NÃO pune por suspeita', () => {
    expect(childrenSpendUpperBound(Number.NaN, 0.01)).toBe(null);
    expect(capAction(null)).toBe('ok');
  });

  test('a ressalva diz que é LIMITE SUPERIOR e declara a defasagem', () => {
    expect(FAMILY_NOTE).toContain('Upper bound');
    expect(FAMILY_NOTE).toContain('PER KEY');
    expect(FAMILY_NOTE).toContain('10 minutes');
    expect(FAMILY_LAG_MS).toBe(600_000);
  });

  test('a ressalva está em inglês (ADR-033)', () => {
    expect(FAMILY_NOTE).not.toMatch(/[áâãéêíóôõúç]/i);
  });
});

describe('ao estourar: a reação é reversível e a menos destrutiva que resolve', () => {
  test('abaixo de 80% do teto, segue normal', () => {
    expect(capAction(1.0)).toBe('ok');
  });

  test('a partir de 80%, para de criar filhos ANTES de congelar', () => {
    expect(capAction(FAMILY_CAP_USD * 0.8)).toBe('stop-creating');
  });

  test('no teto, congela capacidades — e os agentes continuam atendendo', () => {
    expect(capAction(FAMILY_CAP_USD)).toBe('freeze');
    expect(capAction(FAMILY_CAP_USD * 3)).toBe('freeze');
  });

  test('NENHUMA faixa corta a chave: cortar pararia o pai também', () => {
    for (const v of [0, 4, 5, 50]) expect(capAction(v)).not.toBe('revoke-key');
  });
});
