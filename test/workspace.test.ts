import { describe, expect, test } from 'vitest';
import { buildSpec, canUse, DEFAULT_MODEL, DOC_MIME, extractFolderId, mergeConfig, parseFrontmatter, resolveRoles, SHEET_MIME, signature, type FileEntry } from '../src/workspace';

describe('extractFolderId', () => {
  test('aceita URL do Drive', () => {
    expect(extractFolderId('https://drive.google.com/drive/folders/1AbC_def-GHIjklmnop?usp=sharing')).toBe('1AbC_def-GHIjklmnop');
  });
  test('aceita ID puro', () => {
    expect(extractFolderId('  1AbC_def-GHIjklmnop ')).toBe('1AbC_def-GHIjklmnop');
  });
  test('rejeita lixo', () => {
    expect(extractFolderId('https://example.com')).toBeNull();
  });
});

describe('parseFrontmatter', () => {
  test('lê chaves simples e listas, ignora comentários', () => {
    const { data, body } = parseFrontmatter('---\nmodel: openai/gpt-5-mini  # rápido\nusers: [a@x.com, B@x.com]\n---\n# Regras\nSeja breve.');
    expect(data).toEqual({ model: 'openai/gpt-5-mini', users: ['a@x.com', 'B@x.com'] });
    expect(body).toBe('# Regras\nSeja breve.');
  });
  test('sem frontmatter devolve corpo inteiro', () => {
    expect(parseFrontmatter('# oi')).toEqual({ data: {}, body: '# oi' });
  });
});

describe('buildSpec', () => {
  test('monta prompt com arquivos e marca ausentes', () => {
    const spec = buildSpec('id1', 'Assistente', { AGENTS: '---\nmodel: x/y\n---\nRegras', SOUL: 'Calmo' });
    expect(spec.config.model).toBe('x/y');
    expect(spec.system).toContain('## AGENTS.md\nRegras');
    expect(spec.system).toContain('## SOUL.md\nCalmo');
    expect(spec.system).toContain('## IDENTITY.md\n(missing)');
  });
  test('usa modelo padrão e trunca em 20.000 caracteres por arquivo', () => {
    const spec = buildSpec('id1', 'A', { SOUL: 'x'.repeat(25_000) });
    expect(spec.config.model).toBe(DEFAULT_MODEL);
    expect(spec.system).not.toContain('x'.repeat(20_001));
    expect(spec.system).toContain('x'.repeat(20_000));
  });
  test('regressão: pasta só com .md gera exatamente o prompt da F0', () => {
    const spec = buildSpec('f', 'A', { AGENTS: '---\nusers: [Ana@x.com]\n---\nRegras', SOUL: 'Calmo', IDENTITY: 'gasclaw', USER: 'Gabriel' });
    expect(spec).toEqual({
      folderId: 'f',
      name: 'A',
      config: { model: DEFAULT_MODEL, users: ['ana@x.com'] },
      system: '## AGENTS.md\nRegras\n\n## SOUL.md\nCalmo\n\n## IDENTITY.md\ngasclaw\n\n## USER.md\nGabriel',
    });
  });
  test('linhas da planilha config sobrepõem o frontmatter', () => {
    const spec = buildSpec('f', 'A', { AGENTS: '---\nmodel: x/y\n---\nRegras' }, [['model', 'a/b']]);
    expect(spec.config.model).toBe('a/b');
  });
});

const f = (name: string, mime = 'text/markdown', id = name, modified = 1): FileEntry => ({ id, name, mime, modified });

describe('resolveRoles', () => {
  test('pasta só com .md resolve cada papel como md', () => {
    const r = resolveRoles([f('AGENTS.md'), f('SOUL.md'), f('IDENTITY.md'), f('USER.md', 'text/plain'), f('outro.txt')]);
    expect(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v?.kind]))).toEqual({ AGENTS: 'md', SOUL: 'md', IDENTITY: 'md', USER: 'md' });
  });
  test('Google Doc com o nome do papel (com ou sem .md) vence o .md', () => {
    const r = resolveRoles([f('AGENTS.md', 'text/markdown', 'md1'), f('AGENTS', DOC_MIME, 'doc1'), f('SOUL.md', DOC_MIME, 'doc2'), f('USER.md')]);
    expect(r.AGENTS).toEqual({ entry: f('AGENTS', DOC_MIME, 'doc1'), kind: 'doc' });
    expect(r.SOUL?.kind).toBe('doc');
    expect(r.USER?.kind).toBe('md');
    expect(r.IDENTITY).toBeUndefined();
  });
  test('planilha "config" vira a fonte config; outros tipos Google não contam como .md', () => {
    const r = resolveRoles([f('config', SHEET_MIME, 's1'), f('SOUL.md', 'application/vnd.google-apps.presentation')]);
    expect(r.config).toEqual({ entry: f('config', SHEET_MIME, 's1'), kind: 'sheet' });
    expect(r.SOUL).toBeUndefined();
  });
});

describe('signature', () => {
  test('muda quando um arquivo resolvido muda de data ou de origem', () => {
    const a = signature('p', resolveRoles([f('AGENTS.md'), f('SOUL', DOC_MIME, 'd', 10)]));
    expect(signature('p', resolveRoles([f('AGENTS.md'), f('SOUL', DOC_MIME, 'd', 10)]))).toBe(a);
    expect(signature('p', resolveRoles([f('AGENTS.md'), f('SOUL', DOC_MIME, 'd', 11)]))).not.toBe(a);
    expect(signature('p', resolveRoles([f('AGENTS.md'), f('SOUL.md', 'text/markdown', 'd', 10)]))).not.toBe(a);
  });
  test('ignora arquivos que não são papéis', () => {
    expect(signature('p', resolveRoles([f('AGENTS.md'), f('x.pdf', 'application/pdf', 'z', 99)]))).toBe(signature('p', resolveRoles([f('AGENTS.md')])));
  });
});

describe('mergeConfig', () => {
  test('sem planilha usa o frontmatter', () => {
    expect(mergeConfig({ model: 'x/y', users: ['A@x.com'] })).toEqual({ model: 'x/y', users: ['a@x.com'] });
  });
  test('planilha sobrepõe; users separados por vírgula, ; ou espaço; ignora cabeçalho e chaves desconhecidas', () => {
    const rows = [['chave', 'valor'], ['model', ' a/b '], ['users', 'Ana@x.com, bob@x.com;c@x.com d@x.com'], ['foo', 'bar']];
    expect(mergeConfig({ model: 'x/y', users: ['z@x.com'] }, rows)).toEqual({ model: 'a/b', users: ['ana@x.com', 'bob@x.com', 'c@x.com', 'd@x.com'] });
  });
  test('valor vazio na planilha não apaga o frontmatter', () => {
    expect(mergeConfig({ model: 'x/y' }, [['model', '']])).toEqual({ model: 'x/y', users: [] });
  });
});

describe('canUse', () => {
  const config = { model: 'm', users: ['ana@x.com'] };
  test('dono sempre pode', () => expect(canUse(config, 'Dono@x.com', 'dono@x.com')).toBe(true));
  test('usuário listado pode (case-insensitive)', () => expect(canUse(config, 'ANA@x.com', 'dono@x.com')).toBe(true));
  test('outros não podem', () => expect(canUse(config, 'bob@x.com', 'dono@x.com')).toBe(false));
  test('lista vazia = só o dono', () => expect(canUse({ model: 'm', users: [] }, 'ana@x.com', 'dono@x.com')).toBe(false));
});
