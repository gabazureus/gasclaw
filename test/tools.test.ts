import { describe, expect, test } from 'vitest';
import { addEntry, ENTRY_MAX_BYTES, memoryMessage, RECALL_MAX, removeEntry, utf8Bytes } from '../src/tools/memory';
import { allowedTools, findTool, TOOLS, toDefs, validateArgs, type ToolCtx } from '../src/tools/registry';

function ctx(over: Partial<ToolCtx> = {}): ToolCtx & { mem: { text: string } } {
  const mem = { text: '' };
  return { mem, now: () => '2026-09-15T10:00:00-03:00 (terça-feira)', ownerDm: true, memory: { read: () => mem.text, write: (t) => void (mem.text = t) }, ...over };
}

describe('registry', () => {
  test('lista fechada: allowlist por nome exato ou grupo (memory → memory.*)', () => {
    expect(allowedTools(['now']).map((t) => t.name)).toEqual(['now']);
    expect(allowedTools(['memory']).map((t) => t.name)).toEqual(['memory.save', 'memory.remove', 'memory.read']);
    expect(allowedTools(['http', 'eval', 'mem'])).toEqual([]);
    expect(allowedTools([])).toEqual([]);
  });
  test('toda tool tem descrição, schema de objeto e approval válido', () => {
    for (const t of TOOLS) {
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.parameters.type).toBe('object');
      expect(['never', 'once', 'always']).toContain(t.approval);
    }
  });
  test('toDefs troca "." por "_" (nome de função do OpenRouter) e findTool acha pelos dois nomes', () => {
    const tools = allowedTools(['now', 'memory']);
    expect(toDefs(tools).map((d) => d.function.name)).toEqual(['now', 'memory_save', 'memory_remove', 'memory_read']);
    expect(findTool(tools, 'memory_save')?.name).toBe('memory.save');
    expect(findTool(tools, 'memory.save')?.name).toBe('memory.save');
    expect(findTool(tools, 'gmail_send')).toBeUndefined();
  });
});

describe('validateArgs', () => {
  const schema = { type: 'object' as const, properties: { text: { type: 'string' as const, maxLength: 5 }, n: { type: 'integer' as const } }, required: ['text'], additionalProperties: false as const };
  test('aceita args válidos', () => expect(validateArgs(schema, '{"text":"oi","n":2}')).toEqual({ ok: true, args: { text: 'oi', n: 2 } }));
  test('vazio vira {}', () => expect(validateArgs({ type: 'object', properties: {} }, '')).toEqual({ ok: true, args: {} }));
  test.each([
    ['{nao json', 'JSON'],
    ['[1]', 'objeto'],
    ['{}', 'text'],
    ['{"text":1}', 'text'],
    ['{"text":"123456"}', 'text'],
    ['{"text":"a","n":1.5}', 'n'],
    ['{"text":"a","x":1}', 'x'],
  ])('recusa %s', (raw, word) => {
    const r = validateArgs(schema, raw);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain(word);
  });
});

describe('memória (limites do Eve)', () => {
  test('utf8Bytes conta bytes, não caracteres', () => {
    expect(utf8Bytes('a')).toBe(1);
    expect(utf8Bytes('é')).toBe(2);
    expect(utf8Bytes('🦀')).toBe(4);
  });
  test('addEntry acrescenta um item "- texto" e ignora duplicado', () => {
    const a = addEntry('', 'prefiro reuniões às 10h');
    expect(a).toEqual({ ok: true, text: '- prefiro reuniões às 10h\n' });
    expect(addEntry(a.ok ? a.text : '', 'prefiro reuniões às 10h')).toEqual({ ok: true, text: '- prefiro reuniões às 10h\n' });
  });
  test('addEntry recusa entrada acima de 2.048 bytes, vazia ou multilinha achatada', () => {
    expect(addEntry('', 'é'.repeat(ENTRY_MAX_BYTES / 2 + 1)).ok).toBe(false);
    expect(addEntry('', '   ').ok).toBe(false);
    expect(addEntry('', 'a\nb')).toEqual({ ok: true, text: '- a b\n' });
  });
  test('addEntry recusa quando a memória passaria do teto de recall (4.000 caracteres)', () => {
    const full = `- ${'x'.repeat(RECALL_MAX - 10)}\n`;
    const r = addEntry(full, 'mais um fato longo');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain('cheia');
  });
  test('removeEntry remove itens que contêm o trecho', () => {
    expect(removeEntry('- a 10h\n- b\n', '10h')).toEqual({ text: '- b\n', removed: 1 });
    expect(removeEntry('- b\n', 'zz')).toEqual({ text: '- b\n', removed: 0 });
  });
  test('memoryMessage: mensagem de usuário com no máximo 4.000 caracteres; vazia → null', () => {
    expect(memoryMessage('  ')).toBeNull();
    const m = memoryMessage('- '.padEnd(9000, 'y'));
    expect(m?.role).toBe('user');
    expect(m!.content.length).toBeLessThanOrEqual(RECALL_MAX + 200);
  });
});

describe('tools', () => {
  const run = (name: string, args: Record<string, unknown>, c = ctx()) => findTool(TOOLS, name)!.run(args, c);
  test('now devolve data e hora do contexto', () => expect(run('now', {})).toContain('2026-09-15T10:00'));
  test('memory.save / read / remove sobre MEMORY.md', () => {
    const c = ctx();
    expect(run('memory.save', { text: 'prefiro reuniões às 10h' }, c)).toContain('salvo');
    expect(c.mem.text).toBe('- prefiro reuniões às 10h\n');
    expect(run('memory.read', {}, c)).toContain('10h');
    expect(run('memory.remove', { text: '10h' }, c)).toContain('1');
    expect(c.mem.text).toBe('');
  });
  test('memory.* fora da DM do dono lança (vira erro de tool no loop)', () => {
    expect(() => run('memory.read', {}, ctx({ ownerDm: false }))).toThrow('DM do dono');
  });
  test('memory.save acima do teto lança com o motivo', () => {
    expect(() => run('memory.save', { text: 'x'.repeat(3000) + 'é'.repeat(600) })).toThrow('2048');
  });
});
