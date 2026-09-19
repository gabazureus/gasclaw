// Campos declarados pelo agente (mutação → painel).
//
// O ataque que este arquivo existe para impedir: conteúdo da pasta COMPARTILHÁVEL virando interface
// no painel do DONO. Seria mais elegante que qualquer coisa que a revisão adversarial achou, porque
// não pede permissão nenhuma — só pede que alguém desenhe a tela a partir de texto.
import { describe, expect, test } from 'vitest';
import { FIELD_TYPES, MAX_FIELDS, mergeAcrossGenerations, originLabel, parseField, parseSchema, RESERVED, validateValues, type ConfigField } from '../src/agentConfig';

const campo = (o: Record<string, unknown>) => parseField({ name: 'tom', type: 'text', label: 'Tom de voz', ...o });

describe('conjunto FECHADO de tipos: a tela não renderiza o que não conhece', () => {
  test('são exatamente quatro', () => {
    expect([...FIELD_TYPES]).toEqual(['text', 'number', 'boolean', 'choice']);
  });

  test('tipo desconhecido é RECUSADO, e a recusa diz o motivo (campo que some em silêncio parece defeito)', () => {
    const r = campo({ type: 'html' });
    expect(r.field).toBe(null);
    expect(r.error).toContain('unknown field type');
  });

  test('nada de objeto, lista ou nulo no lugar de um campo', () => {
    for (const lixo of [null, undefined, 'texto', 42, []]) expect(parseField(lixo).field).toBe(null);
  });
});

describe('RESERVA DE NAMESPACE: um campo nunca escreve poder', () => {
  test.each([...RESERVED])('o nome reservado "%s" é recusado', (nome) => {
    const r = campo({ name: nome });
    expect(r.field).toBe(null);
    expect(r.error).toContain('reserved name');
  });

  test('tentativas de colidir por maiúscula ou espaço também caem', () => {
    for (const n of ['CAP', ' ACCESS ', 'Owner', 'MODEL']) expect(campo({ name: n }).field).toBe(null);
  });

  test('travessia de caminho e pontuação não viram nome de campo', () => {
    for (const n of ['../outro', 'a.b', 'a/b', '', '1abc', 'a'.repeat(41)]) expect(campo({ name: n }).field).toBe(null);
  });

  test('um nome comum passa', () => {
    expect(campo({ name: 'tom_de_voz' }).field?.name).toBe('tom_de_voz');
  });
});

describe('rótulo e escolhas: limites que impedem a pasta de encher a tela do dono', () => {
  test('rótulo vazio ou gigante é recusado', () => {
    expect(campo({ label: '' }).field).toBe(null);
    expect(campo({ label: 'x'.repeat(81) }).field).toBe(null);
  });

  test('escolha precisa de 2 a 20 opções', () => {
    expect(parseField({ name: 'estilo', type: 'choice', label: 'Estilo', choices: ['curto'] }).field).toBe(null);
    expect(parseField({ name: 'estilo', type: 'choice', label: 'Estilo', choices: Array(21).fill('x') }).field).toBe(null);
    expect(parseField({ name: 'estilo', type: 'choice', label: 'Estilo', choices: ['curto', 'longo'] }).field?.choices).toEqual(['curto', 'longo']);
  });

  test('teto de campos, e o excedente vira erro visível em vez de sumir', () => {
    const muitos = Array.from({ length: MAX_FIELDS + 3 }, (_, i) => ({ name: `campo${i}`, type: 'text', label: `C${i}` }));
    const r = parseSchema(muitos);
    expect(r.fields).toHaveLength(MAX_FIELDS);
    expect(r.errors.join(' ')).toContain('too many fields');
  });
});

describe('um campo ruim NÃO derruba os outros — ao contrário da capacidade', () => {
  test('campo inválido vira erro e os válidos sobrevivem', () => {
    const r = parseSchema([
      { name: 'tom', type: 'text', label: 'Tom' },
      { name: 'cap', type: 'text', label: 'Tentando roubar' },
      { name: 'linhas', type: 'number', label: 'Linhas' },
    ]);
    expect(r.fields.map((f) => f.name)).toEqual(['tom', 'linhas']);
    expect(r.errors[0]).toContain('reserved name');
  });

  test('campo repetido não sobrescreve o primeiro em silêncio', () => {
    const r = parseSchema([
      { name: 'tom', type: 'text', label: 'Primeiro' },
      { name: 'tom', type: 'number', label: 'Segundo' },
    ]);
    expect(r.fields).toHaveLength(1);
    expect(r.fields[0].label).toBe('Primeiro');
    expect(r.errors.join(' ')).toContain('duplicate');
  });
});

describe('validação NO SERVIDOR: o cliente não é fonte da verdade', () => {
  const fields: ConfigField[] = [
    { name: 'tom', type: 'text', label: 'Tom' },
    { name: 'linhas', type: 'number', label: 'Linhas' },
    { name: 'ativo', type: 'boolean', label: 'Ativo' },
    { name: 'estilo', type: 'choice', label: 'Estilo', choices: ['curto', 'longo'] },
  ];

  test('campo fora do esquema NUNCA é gravado, mesmo que o cliente mande', () => {
    const r = validateValues(fields, { tom: 'seco', 'CAP:f1': '["create"]' });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.clean)).toEqual(['tom']);
    expect(r.errors.join(' ')).toContain('unknown field');
  });

  test('escolha fora da lista é recusada', () => {
    expect(validateValues(fields, { estilo: 'inventado' }).ok).toBe(false);
    expect(validateValues(fields, { estilo: 'curto' }).clean.estilo).toBe('curto');
  });

  test('número que não é número é recusado; booleano é coagido de forma previsível', () => {
    expect(validateValues(fields, { linhas: 'muitas' }).ok).toBe(false);
    expect(validateValues(fields, { ativo: 'true' }).clean.ativo).toBe(true);
    expect(validateValues(fields, { ativo: 'qualquer coisa' }).clean.ativo).toBe(false);
  });

  test('texto gigante é recusado, e configuração gigante também', () => {
    expect(validateValues(fields, { tom: 'x'.repeat(501) }).ok).toBe(false);
    expect(validateValues(fields, { tom: 'x'.repeat(499) }).ok).toBe(true);
  });
});

describe('mutação: campo que some numa sucessão vira ÓRFÃO, nunca lixo apagado', () => {
  const geracaoNova: ConfigField[] = [{ name: 'tom', type: 'text', label: 'Tom' }];

  test('o que a geração nova declara fica ativo; o resto é preservado como órfão', () => {
    const r = mergeAcrossGenerations(geracaoNova, { tom: 'seco', linhas: 3 });
    expect(r.active).toEqual({ tom: 'seco' });
    expect(r.orphans).toEqual({ linhas: 3 }); // o valor é do DONO: o agente não apaga escolha humana ao mutar
  });

  test('reverter o bastão devolve a geração antiga COM a configuração dela', () => {
    const antiga: ConfigField[] = [{ name: 'linhas', type: 'number', label: 'Linhas' }];
    const guardado = { tom: 'seco', linhas: 3 };
    expect(mergeAcrossGenerations(geracaoNova, guardado).orphans).toEqual({ linhas: 3 });
    expect(mergeAcrossGenerations(antiga, guardado).active).toEqual({ linhas: 3 }); // voltou inteiro
  });
});

describe('procedência na tela, como o ADR-035 fez com os papéis', () => {
  test('cada origem tem rótulo, e o do editor diz que é confiável', () => {
    expect(originLabel('editor')).toContain('trusted');
    expect(originLabel('folder')).toContain('shared Drive folder');
    expect(originLabel('inherited')).toContain('previous generation');
  });
});
