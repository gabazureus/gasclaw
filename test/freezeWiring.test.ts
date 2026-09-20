// O congelamento de emergência e o teto familiar COM EFEITO (itens 4 e 34).
//
// A auditoria de 2026-09-20 derrubou o item 4 junto com os outros cinco: `effectiveCapabilities` e
// `capsEnabled` tinham teste verde e ZERO importadores, e `CAPS_ENABLED` só aparecia num COMENTÁRIO.
// A "chave de emergência" não existia — e uma chave de emergência que ninguém vê se está ligada é
// pior que não ter, porque produz confiança falsa nos dois sentidos.
//
// O item 34 depende dela: `capAction` devolvia `freeze` e ninguém agia.
import { describe, expect, test } from 'vitest';
import { capAction, FAMILY_CAP_USD } from '../src/family';
import { capsEnabled, effectiveCapabilities } from '../src/agentCaps';

describe('o congelamento vence qualquer aprovação individual', () => {
  test('ligado, as capacidades aprovadas valem', () => {
    expect(effectiveCapabilities(['dream', 'succeed'], null)).toEqual(['dream', 'succeed']);
  });

  test('congelado, NENHUMA vale — nem as que o dono aprovou uma a uma', () => {
    expect(effectiveCapabilities(['dream', 'succeed'], 'false')).toEqual([]);
  });

  // Fail-OPEN aqui é deliberado e vale o teste: ausência de chave significa "nunca congelei", não
  // "congelado". Fail-closed deixaria um ambiente novo nascer com tudo desligado e sem explicação.
  test('sem a chave, não está congelado', () => {
    expect(capsEnabled(null)).toBe(true);
    expect(capsEnabled('false')).toBe(false);
  });
});

describe('o teto familiar AGE, não só informa', () => {
  test('as três faixas', () => {
    expect(capAction(0)).toBe('ok');
    expect(capAction(FAMILY_CAP_USD * 0.85)).toBe('stop-creating');
    expect(capAction(FAMILY_CAP_USD)).toBe('freeze');
  });

  // Sem leitura confiável não se pune por suspeita: o número é LIMITE SUPERIOR, e punir sobre um
  // limite superior nulo seria congelar o agente do dono por causa de um dado que não existe.
  test('sem leitura, não age', () => {
    expect(capAction(null)).toBe('ok');
  });

  test('o motor LÊ a ação antes de escrever um sucessor', async () => {
    const main = (await import('node:fs')).readFileSync('src/main.ts', 'utf8');
    expect(main).toContain('capAction(');
    expect(main).toMatch(/stop-creating|freeze/);
  });

  test('as capacidades efetivas passam pelo congelamento no painel', async () => {
    const main = (await import('node:fs')).readFileSync('src/main.ts', 'utf8');
    expect(main).toContain('effectiveCapabilities(');
    expect(main).toContain('CAPS_ENABLED');
  });
});
