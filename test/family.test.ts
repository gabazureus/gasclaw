// Teto familiar, e a AUSÊNCIA da entrega de chave.
//
// Este arquivo testava um mecanismo que não existe mais. A P27 mediu que o filho não alcança o motor
// para pedir a chave, e o dono escolheu a opção 4 da ADR-040: filhos são só `automation`, que nunca
// falam com modelo e nunca precisam de credencial. Os testes da entrega foram substituídos pelos
// testes da ausência dela — que são os que importam agora, porque o risco mudou de lado: não é mais
// "a entrega funciona direito", é "a entrega não volta sem ninguém perceber".
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { capAction, childrenSpendUpperBound, FAMILY_CAP_USD, FAMILY_LAG_MS, FAMILY_NOTE } from '../src/family';

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

// A FIAÇÃO do teto familiar, e a PROVA DE AUSÊNCIA do caminho de credencial.
describe('fiação: a chave não sai daqui, e a conta é reusada', () => {
  // SEM COMENTÁRIOS. A prova é sobre o CÓDIGO: os comentários deste projeto explicam justamente o que
  // foi removido e por quê, e citam os nomes. Buscar no arquivo cru daria falso vermelho na
  // documentação da própria remoção — e a tentação seguinte seria apagar a explicação para o teste
  // passar, trocando uma prova por um silêncio.
  const semComentarios = (f: string) =>
    readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  const main = semComentarios('src/main.ts');
  const familia = semComentarios('src/family.ts');

  // O TESTE QUE IMPORTA. Enquanto existia, `childkey` era a única rota do projeto que devolvia a chave
  // do OpenRouter por HTTP — e a janela ficava ARMADA para todo filho criado. Ela não pode voltar por
  // distração: se voltar, é decisão, e uma decisão derruba este teste e obriga a mexer na ADR-040.
  for (const simbolo of ['childkey', 'deliverKeyToChild', 'rearmChildKey', 'mayDeliverKey', 'armDelivery']) {
    test(`\`${simbolo}\` não existe em main.ts — a entrega de credencial foi removida, não desligada`, () => {
      expect(main).not.toContain(simbolo);
    });
  }

  // As duas Properties da entrega podem ser CITADAS — `forgetChild` as apaga, e apagar é o oposto de
  // usar. O que não pode voltar é LER ou ESCREVER: ler é o que autorizava a entrega, escrever é o que
  // armava a janela. Proibir a palavra obrigaria a deixar o resíduo no lugar para o teste passar.
  for (const prop of ['KEYSEC:', 'KEYDEL:']) {
    test(`\`${prop}\` só pode ser APAGADA — nunca lida nem escrita`, () => {
      expect(main).not.toMatch(new RegExp(`(get|set)Property\\(\`${prop}`));
      expect(main).toContain(`deleteProperty(\`${prop}`);
    });
  }

  test('nenhuma rota devolve a chave do OpenRouter', () => {
    expect(main).not.toContain('key: store.getApiKey()');
  });

  test('o núcleo da família não tem mais a metade da entrega', () => {
    for (const simbolo of ['KeyDelivery', 'armDelivery', 'mayDeliverKey', 'rearmDelivery', 'deliverySpan']) {
      expect(familia).not.toContain(`export ${simbolo}`);
      expect(familia).not.toContain(`export function ${simbolo}`);
      expect(familia).not.toContain(`export const ${simbolo}`);
      expect(familia).not.toContain(`export type ${simbolo}`);
    }
  });

  // O teto familiar SOBREVIVE: `agent.create` cria agentes no MESMO projeto, na MESMA chave, então o
  // offset continua medindo o que eles gastam. Remover a entrega não removeu o instrumento.
  test('o gasto da família reusa a conferência que já existe, em vez de recalcular', () => {
    expect(main).toContain('observe.usageView(store.getApiKey()).check');
    expect(main).toContain('childrenSpendUpperBound(c.informed, c.measured)');
  });

  test('a ressalva viaja com o número: é limite superior, não medida', () => {
    expect(main).toContain('note: FAMILY_NOTE');
  });
});
