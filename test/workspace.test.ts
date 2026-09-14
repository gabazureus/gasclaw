import { describe, expect, test } from 'vitest';
import { buildSpec, canUse, DEFAULT_MODEL, extractFolderId, parseFrontmatter } from '../src/workspace';

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
    const spec = buildSpec('id1', 'Assistente', { 'AGENTS.md': '---\nmodel: x/y\n---\nRegras', 'SOUL.md': 'Calmo' });
    expect(spec.config.model).toBe('x/y');
    expect(spec.system).toContain('## AGENTS.md\nRegras');
    expect(spec.system).toContain('## SOUL.md\nCalmo');
    expect(spec.system).toContain('## IDENTITY.md\n(missing)');
  });
  test('usa modelo padrão e trunca em 20.000 caracteres por arquivo', () => {
    const spec = buildSpec('id1', 'A', { 'SOUL.md': 'x'.repeat(25_000) });
    expect(spec.config.model).toBe(DEFAULT_MODEL);
    expect(spec.system).not.toContain('x'.repeat(20_001));
    expect(spec.system).toContain('x'.repeat(20_000));
  });
});

describe('canUse', () => {
  const config = { model: 'm', users: ['ana@x.com'] };
  test('dono sempre pode', () => expect(canUse(config, 'Dono@x.com', 'dono@x.com')).toBe(true));
  test('usuário listado pode (case-insensitive)', () => expect(canUse(config, 'ANA@x.com', 'dono@x.com')).toBe(true));
  test('outros não podem', () => expect(canUse(config, 'bob@x.com', 'dono@x.com')).toBe(false));
  test('lista vazia = só o dono', () => expect(canUse({ model: 'm', users: [] }, 'ana@x.com', 'dono@x.com')).toBe(false));
});
