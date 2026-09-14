import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { firstDiff } from '../poc/p10-editor/harness';
import { remoteName, SOUL, summarizeP10, type P10Obs, type ReadObs } from '../poc/p10-editor/summary';

const SHA = { 'agentes/p10/AGENTS.md.html': 'a1', 'agentes/p10/SOUL.md.html': 's1' };
const files = (sha: Record<string, string>, mark: boolean | null = null) =>
  Object.fromEntries(Object.entries(sha).map(([p, s]) => [remoteName(p), { sha: s, bytes: 1, hasMark: p.endsWith('SOUL.md.html') ? mark : null }]));
const project = [
  { name: 'agentes/p10/AGENTS.md', type: 'html', head: null },
  { name: 'agentes/p10/SOUL.md', type: 'html', head: null },
  { name: '_motor', type: 'server_js', head: '// gasclaw · MOTOR · NÃO EDITE: gerado pelo build' },
  { name: 'appsscript', type: 'json', head: '{' },
  { name: 'settings', type: 'html', head: '<!doctype html>' },
];
const read = (o: { html?: Record<string, string>; mark?: { html: boolean; exp: boolean } } = {}): ReadObs => ({
  listed: ['agentes/p10/AGENTS.md', SOUL],
  listMs: 400,
  variants: {
    htmlOutput: { maxMs: 30, files: files(o.html ?? SHA, o.mark ? o.mark.html : null) },
    template: { maxMs: 30, files: files(SHA) },
    driveExport: { maxMs: 500, files: files(SHA, o.mark ? o.mark.exp : null) },
  },
  projectsApi: { status: 403 },
  origem: { AGENTS: 'editor', SOUL: 'editor', IDENTITY: 'doc', USER: 'md' },
  project,
});
const obs = (): P10Obs => ({
  c1: { local: { ...SHA }, pulled: { ...SHA } },
  setup: { idempotent: true },
  read: read(),
  c4: { editS: 4, exec: read({ mark: { html: false, exp: true } }), execVisibleS: 2, head: read({ mark: { html: true, exp: true } }), publishS: 6, afterPublish: read({ mark: { html: true, exp: true } }) },
  c5: { upS: 40, pulledHasMark: true, read: read({ mark: { html: true, exp: true } }) },
});

describe('summarizeP10', () => {
  test('tudo certo passa e mostra que a versão fixa não vê a edição', () => {
    const s = summarizeP10(obs());
    expect(s.pass).toBe(true);
    expect(s.c4.versaoFixaNaoVe).toBe(true);
    expect(s.c3.fidelidade.htmlOutput).toEqual({ fiel: true, maxMs: 30, error: null });
  });
  test('C1 falha se o pull devolver bytes diferentes', () => {
    const o = obs();
    o.c1.pulled['agentes/p10/SOUL.md.html'] = 'outro';
    expect(summarizeP10(o).c1.pass).toBe(false);
  });
  test('C3 aponta a variante infiel sem reprovar se outra for fiel', () => {
    const o = obs();
    o.read = read({ html: { ...SHA, 'agentes/p10/SOUL.md.html': 'escapado' } });
    const s = summarizeP10(o);
    expect(s.c3.fidelidade.htmlOutput.fiel).toBe(false);
    expect(s.c3.pass).toBe(true);
  });
  test('C3 falha se a precedência não for editor, editor, doc, md', () => {
    const o = obs();
    o.read = { ...read(), origem: { AGENTS: 'md', SOUL: 'editor', IDENTITY: 'doc', USER: 'md' } };
    expect(summarizeP10(o).c3.pass).toBe(false);
  });
  test('C5 falha se o up apagar a edição do editor', () => {
    const o = obs();
    o.c5.pulledHasMark = false;
    expect(summarizeP10(o).c5.pass).toBe(false);
  });
  test('C6 falha com mais de um arquivo de código (ex.: sobra do Code)', () => {
    const o = obs();
    o.c5.read = { ...o.c5.read, project: [...project, { name: 'Code', type: 'server_js', head: '' }] };
    expect(summarizeP10(o).c6.pass).toBe(false);
  });
});

test('firstDiff aponta a posição e o trecho da primeira diferença', () => {
  expect(firstDiff('abc', 'abc')).toBeNull();
  expect(firstDiff('a &amp; b', 'a & b')).toEqual({ at: 3, a: 'a &amp; b', b: 'a & b', lenA: 9, lenB: 5 });
});

test('o fixture do SOUL tem os caracteres que provam a fidelidade byte a byte', () => {
  const soul = readFileSync('poc/p10-editor/fixture/agentes/p10/SOUL.md.html', 'utf8');
  for (const s of ['<', '>', '&', '**', '`', '${', '<?=', '<script>', '🦀', '   \n']) expect(soul).toContain(s);
  expect(readFileSync('poc/p10-editor/fixture/agentes/p10/AGENTS.md.html', 'utf8').startsWith('---\n')).toBe(true);
});
