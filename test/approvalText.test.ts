import { describe, expect, test } from 'vitest';
import { approvalText, runTurn } from '../src/agent';
import { allowedTools, type ToolCtx } from '../src/tools/registry';

describe('card de aprovação mostra tudo que importa (revisão E6, blockers 1 e 7)', () => {
  test('cc depois de 500 chars de corpo aparece inteiro; o corpo é cortado com (+N chars)', () => {
    const body = 'x'.repeat(500);
    const t = approvalText('gmail.send', { to: 'dono@x.com', subject: 'Oi', body, cc: 'atacante@example.com' });
    expect(t).toContain('cc: atacante@example.com');
    expect(t).toContain('to: dono@x.com');
    expect(t).toContain(`body: ${'x'.repeat(300)}… (+200 chars)`);
    expect(t).not.toContain('x'.repeat(301));
  });

  test('attendees em linha própria e por inteiro, mesmo longos', () => {
    const attendees = Array.from({ length: 20 }, (_, i) => `pessoa${i}@exemplo.com`).join(', ');
    const lines = approvalText('calendar.create', { title: 'Café', start: '2030-01-15T10:00', end: '2030-01-15T10:30', description: 'd'.repeat(400), attendees }).split('\n');
    expect(lines).toContain(`attendees: ${attendees}`);
    expect(lines[0]).toBe('Posso usar calendar.create? Preciso da sua aprovação.');
  });

  test('ids, range e títulos longos nunca são cortados', () => {
    const id = `1${'a'.repeat(400)}`;
    const t = approvalText('sheets.append', { id, range: `'Minha aba'!A:C`, rows: 'r'.repeat(400) });
    expect(t).toContain(`id: ${id}`);
    expect(t).toContain(`range: 'Minha aba'!A:C`);
    expect(t).toContain(`rows: ${'r'.repeat(400)}`);
  });

  test('quebra de linha no corpo não cria uma linha falsa de campo', () => {
    const t = approvalText('gmail.send', { to: 'dono@x.com', subject: 's', body: 'oi\ncc: dono@x.com' });
    expect(t.split('\n').filter((l) => l.startsWith('cc:'))).toEqual([]);
    expect(t).toContain('body: oi ⏎ cc: dono@x.com');
  });

  test('runTurn usa esse texto no card (sem JSON cortado)', () => {
    const ctx: ToolCtx = { now: () => '', ownerDm: true, isOwner: true, memory: { read: () => '', write: () => {} } };
    const args = JSON.stringify({ to: 'dono@x.com', subject: 's', body: 'b'.repeat(600), cc: 'atacante@example.com' });
    const r = runTurn({ system: 's', history: [], text: 'x', tools: allowedTools(['gmail']), ctx, llm: () => ({ text: '', toolCalls: [{ id: 'c1', type: 'function', function: { name: 'gmail_send', arguments: args } }] }), runId: 'r', steps: 2, deadlineMs: 1e12, clock: () => 0 });
    expect(r.pending?.name).toBe('gmail.send');
    expect(r.text).toContain('cc: atacante@example.com');
  });
});
