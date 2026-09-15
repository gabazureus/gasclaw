import { describe, expect, test } from 'vitest';
import { addEntry, dayFile, ENTRY_MAX_BYTES, flushEntries, FLUSH_PROMPT, RECALL_MAX, recallText } from '../src/tools/memory';
import { findTool, TOOLS, type MemoryCtx, type ToolCtx } from '../src/tools/registry';

function mem(over: Partial<Record<'curated' | '2030-01-15' | '2030-01-14', string>> = {}) {
  const files: Record<string, string> = { curated: over.curated ?? '', '2030-01-15': over['2030-01-15'] ?? '', '2030-01-14': over['2030-01-14'] ?? '' };
  const memory: MemoryCtx = {
    read: () => files.curated,
    write: (t) => void (files.curated = t),
    day: (d) => files[d] ?? '',
    saveDay: (d, t) => void (files[d] = t),
    today: () => '2030-01-15',
    recall: () => recallText({ curated: files.curated, today: files['2030-01-15'], yesterday: files['2030-01-14'] }),
  };
  const ctx: ToolCtx = { now: () => '', ownerDm: true, isOwner: true, memory };
  return { ctx, files };
}
const run = (name: string, args: Record<string, unknown>, ctx: ToolCtx) => findTool(TOOLS, name)!.run(args, ctx);

describe('notas do dia (memory/AAAA-MM-DD.md)', () => {
  test('dayFile só aceita data AAAA-MM-DD', () => {
    expect(dayFile('2030-01-15')).toBe('2030-01-15.md');
    expect(() => dayFile('../MEMORY')).toThrow('data inválida');
  });

  test('memory.save anota no dia de hoje, não na curada', () => {
    const { ctx, files } = mem({ curated: '- prefiro reuniões às 10h\n' });
    expect(run('memory.save', { text: 'trocou o café das 15h por chá' }, ctx)).toBe('fato anotado na memória de 2030-01-15');
    expect(files['2030-01-15']).toBe('- trocou o café das 15h por chá\n');
    expect(files.curated).toBe('- prefiro reuniões às 10h\n');
  });

  test('memory.read devolve curada + hoje + ontem', () => {
    const { ctx } = mem({ curated: '- prefiro 10h\n', '2030-01-15': '- café por chá\n', '2030-01-14': '- viajou para Recife\n' });
    const out = run('memory.read', {}, ctx);
    expect(out).toContain('## MEMORY.md (curada)\n- prefiro 10h');
    expect(out).toContain('## notas de hoje\n- café por chá');
    expect(out).toContain('## notas de ontem\n- viajou para Recife');
  });

  test('memory.remove tira o fato da curada e da nota de hoje', () => {
    const { ctx, files } = mem({ curated: '- gosta de café\n- prefiro 10h\n', '2030-01-15': '- café por chá\n- corrida 7h\n' });
    expect(run('memory.remove', { text: 'café' }, ctx)).toBe('2 fato(s) removido(s)');
    expect(files.curated).toBe('- prefiro 10h\n');
    expect(files['2030-01-15']).toBe('- corrida 7h\n');
  });

  test('entrada acima de 2.048 bytes é recusada e nada é anotado', () => {
    const { ctx, files } = mem();
    expect(() => run('memory.save', { text: 'ç'.repeat(ENTRY_MAX_BYTES / 2 + 1) }, ctx)).toThrow(String(ENTRY_MAX_BYTES));
    expect(files['2030-01-15']).toBe('');
  });

  test('contexto sem notas do dia (ex.: tela sem Drive) ainda salva na curada', () => {
    const files = { curated: '' };
    const ctx: ToolCtx = { now: () => '', ownerDm: true, isOwner: true, memory: { read: () => files.curated, write: (t) => void (files.curated = t) } };
    expect(run('memory.save', { text: 'fato' }, ctx)).toBe('fato salvo na memória');
    expect(files.curated).toBe('- fato\n');
  });
});

describe('recallText: curada + hoje + ontem dentro de 4.000 caracteres', () => {
  test('junta os três blocos na ordem, com títulos', () => {
    expect(recallText({ curated: 'a', today: 'b', yesterday: 'c' })).toBe('## MEMORY.md (curada)\na\n\n## notas de hoje\nb\n\n## notas de ontem\nc');
  });
  test('vazios somem; tudo vazio vira string vazia', () => {
    expect(recallText({ curated: '  ', today: 'b' })).toBe('## notas de hoje\nb');
    expect(recallText({})).toBe('');
  });
  test('corta no teto, priorizando curada e hoje', () => {
    const out = recallText({ curated: 'x'.repeat(3900), today: 'y'.repeat(500), yesterday: 'z'.repeat(500) });
    expect(out.length).toBeLessThanOrEqual(RECALL_MAX);
    expect(out).toContain('…');
    expect(out).toContain('## MEMORY.md (curada)');
    expect(out).not.toContain('z');
  });
  test('addEntry respeita um teto menor quando a nota do dia é o alvo', () => {
    expect(addEntry('- a\n', 'b', 6).ok).toBe(false);
  });
});

describe('flush antes de compactar', () => {
  test('o prompt pede fatos duráveis, um por linha', () => {
    expect(FLUSH_PROMPT).toContain('uma por linha');
    expect(FLUSH_PROMPT).toContain('(nada)');
  });
  test('resposta vira lista limpa, sem marcador, no máximo 5 e sem entrada gigante', () => {
    expect(flushEntries('- prefere chá\n2. corre às 7h\n\nx\n')).toEqual(['prefere chá', 'corre às 7h']);
    expect(flushEntries('(nada)')).toEqual([]);
    expect(flushEntries(Array.from({ length: 9 }, (_, i) => `fato ${i}`).join('\n'))).toHaveLength(5);
    expect(flushEntries(`ç${'ç'.repeat(ENTRY_MAX_BYTES)}`)).toEqual([]);
  });
});
