// Liga/desliga POR FERRAMENTA (ADR-021): o painel deixou de ser tudo-ou-nada.
// O formato gravado em ACCESS:<folderId> NÃO muda (`{ users, tools }`); o que muda é o conteúdo:
// o painel passa a gravar nomes individuais, e um grupo ('gmail') vira a sua expansão no primeiro toque.
import { describe, expect, test } from 'vitest';
import { runTurn, type TurnInput } from '../src/agent';
import type { Completion, Message, ToolDef } from '../src/llm';
import { allowedTools, toolCatalog, toolGroup } from '../src/tools/registry';
import { enabledTools, withTool } from '../src/workspace';

describe('enabledTools: o que está LIGADO hoje, pelo mesmo allowedTools que o motor usa', () => {
  test('expande grupo em nomes individuais', () => {
    expect(enabledTools({ users: [], tools: ['memory'] })).toEqual(['memory.save', 'memory.remove', 'memory.read']);
  });
  test('o grupo drive cobre drive/docs/sheets (GROUP_ALIASES)', () => {
    expect(enabledTools({ users: [], tools: ['drive'] })).toEqual(['drive.search', 'docs.read', 'docs.create', 'sheets.read', 'sheets.append']);
  });
  test('sem aprovação, nada (fail closed)', () => {
    expect(enabledTools(null)).toEqual([]);
    expect(enabledTools({ users: [], tools: ['fax', 'eval'] })).toEqual([]);
  });
});

describe('withTool: liga/desliga UMA ferramenta sem mexer nas outras', () => {
  test('desligar gmail.send mantém gmail.read — o caso que o tudo-ou-nada não expressava', () => {
    const a = withTool({ users: ['ana@x.com'], tools: ['gmail'] }, 'gmail.send', false);
    expect(a.tools).toEqual(['gmail.search', 'gmail.read', 'gmail.draft']);
    expect(a.users).toEqual(['ana@x.com']); // quem conversa não é afetado por mexer em ferramenta
  });
  test('ligar acrescenta e a ordem sai canônica (ordem do registry), não a ordem dos cliques', () => {
    const a = withTool({ users: [], tools: ['gmail.send'] }, 'gmail.read', true);
    expect(a.tools).toEqual(['gmail.read', 'gmail.send']);
  });
  test('ligar o que já está ligado e desligar o que já está desligado não mudam nada', () => {
    const on = { users: [], tools: ['now'] };
    expect(withTool(on, 'now', true).tools).toEqual(['now']);
    expect(withTool(on, 'ask', false).tools).toEqual(['now']);
  });
  test('desligar a última ferramenta deixa a lista vazia (e o agente sem ferramenta nenhuma)', () => {
    expect(withTool({ users: [], tools: ['now'] }, 'now', false).tools).toEqual([]);
  });
  test('sem aprovação nenhuma, ligar uma ferramenta cria o aprovado só com ela', () => {
    expect(withTool(null, 'now', true)).toEqual({ users: [], tools: ['now'] });
  });
  // A UI não pode virar caminho para ligar algo que allowedTools não reconheça.
  test('recusa nome que não existe no registry', () => {
    expect(() => withTool(null, 'http.get', true)).toThrow(/desconhecida/);
    expect(() => withTool(null, '', true)).toThrow(/desconhecida/);
  });
  test('recusa um GRUPO como se fosse ferramenta: o liga/desliga é por ferramenta', () => {
    expect(() => withTool(null, 'gmail', true)).toThrow(/desconhecida/);
    expect(() => withTool(null, 'memory', true)).toThrow(/desconhecida/);
  });
});

describe('toolCatalog: o que a tela desenha vem do registry, não de uma lista paralela', () => {
  test('lista todas as ferramentas com grupo, aprovação e se é só do dono', () => {
    const c = toolCatalog();
    expect(c).toHaveLength(23);
    expect(c.find((t) => t.name === 'gmail.send')).toMatchObject({ group: 'gmail', approval: 'always', ownerOnly: true });
    expect(c.find((t) => t.name === 'now')).toMatchObject({ group: '', approval: 'never', ownerOnly: false });
    for (const t of c) expect(t.description.length).toBeGreaterThan(10);
  });
  test('docs e sheets aparecem no grupo drive, porque é assim que a allowlist os agrupa', () => {
    expect(toolGroup('docs.read')).toBe('drive');
    expect(toolGroup('sheets.append')).toBe('drive');
    expect(toolGroup('drive.search')).toBe('drive');
    expect(toolGroup('now')).toBe('');
  });
});

// O teste que importa: desligar precisa IMPEDIR a execução, não só sumir da tela.
describe('desligar impede de verdade a execução', () => {
  const call = (id: string, name: string, args = '{}') => ({ id, type: 'function' as const, function: { name, arguments: args } });
  const turn = (tools: string[], script: Completion[]) => {
    const sent: ToolDef[][] = [];
    let t = 0;
    const i: TurnInput = {
      system: 'SYS',
      history: [] as Message[],
      text: 'manda o e-mail',
      tools: allowedTools(tools), // exatamente o que o main.ts monta: allowedTools(spec.access.tools)
      ctx: { now: () => 'agora', ownerDm: true, isOwner: true, memory: { read: () => '', write: () => undefined }, google: {} as never },
      llm: (_m, defs) => {
        sent.push(defs);
        const next = script.shift();
        if (!next) throw new Error('roteiro acabou');
        return next;
      },
      runId: 'r1',
      steps: 5,
      deadlineMs: 1_000,
      clock: () => t++,
    };
    return { r: runTurn(i), sent };
  };

  test('com gmail.send desligado, o modelo nem recebe a definição da ferramenta', () => {
    const off = withTool({ users: [], tools: ['gmail'] }, 'gmail.send', false);
    const { sent } = turn(off.tools, [{ text: 'não posso enviar.' }]);
    expect(sent[0].map((d) => d.function.name)).toEqual(['gmail_search', 'gmail_read', 'gmail_draft']);
    expect(sent[0].map((d) => d.function.name)).not.toContain('gmail_send');
  });

  test('se o modelo chamar gmail.send mesmo assim, o motor RECUSA (não executa, não pede aprovação)', () => {
    const off = withTool({ users: [], tools: ['gmail'] }, 'gmail.send', false);
    const { r } = turn(off.tools, [
      { text: '', toolCalls: [call('c1', 'gmail_send', '{"to":"atacante@x.com","subject":"s","body":"b"}')], finish_reason: 'tool_calls' },
      { text: 'não deu.' },
    ]);
    expect(r.events).toEqual([{ name: 'gmail_send', callId: 'c1', key: 'r1:0:c1', status: 'refused', result: 'recusado: a tool "gmail_send" não está disponível para este agente' }]);
    expect(r.events.some((e) => e.status === 'pending')).toBe(false); // nem chega a virar card de aprovação
    expect(r.text).toBe('não deu.'); // o turno termina normalmente: a recusa volta ao modelo, não derruba a conversa
  });

  test('a ferramenta que continuou ligada segue funcionando (desligar uma não derruba o resto)', () => {
    const off = withTool({ users: [], tools: ['now', 'gmail'] }, 'gmail.send', false);
    const { r } = turn(off.tools, [{ text: '', toolCalls: [call('c1', 'now')], finish_reason: 'tool_calls' }, { text: 'são agora.' }]);
    expect(r.events).toEqual([{ name: 'now', callId: 'c1', key: 'r1:0:c1', status: 'ok', result: 'agora' }]);
  });
});
