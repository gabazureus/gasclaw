import { describe, expect, test } from 'vitest';
import {
  agentFolderPath,
  assembleAgent,
  buildSpec,
  driveSources,
  roleTexts,
  canUse,
  DEFAULT_MODEL,
  DOC_MIME,
  EDITOR_MIME,
  editorAgents,
  editorEntries,
  extractFolderId,
  mergeConfig,
  parseFrontmatter,
  parseProjectExport,
  resolveRoles,
  SHEET_MIME,
  signature,
  validAgentName,
  type FileEntry,
  type ProjectFile,
} from '../src/workspace';

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
  test('aceita CRLF e BOM (arquivo salvo no Windows): não perde tools nem users', () => {
    const { data, body } = parseFrontmatter('﻿---\r\ntools: [now]\r\nusers: [a@x.com]\r\n---\r\n# Regras\r\n');
    expect(data).toEqual({ tools: ['now'], users: ['a@x.com'] });
    expect(body).toBe('# Regras\n');
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
    expect(spec).toMatchObject({
      folderId: 'f',
      name: 'A',
      config: { model: DEFAULT_MODEL, suggested: { users: ['ana@x.com'], tools: [] } },
      system: '## AGENTS.md\nRegras\n\n## SOUL.md\nCalmo\n\n## IDENTITY.md\ngasclaw\n\n## USER.md\nGabriel',
      access: { users: [], tools: [] },
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

describe('resolveRoles com o editor do Apps Script (ADR-013)', () => {
  const ed = (name: string) => f(name, EDITOR_MIME, `agentes/a/${name}`);
  test('precedência por papel: editor > Google Doc > .md, com o papel duplicado nos 3 lugares', () => {
    const r = resolveRoles([f('SOUL.md', 'text/markdown', 'md1'), f('SOUL', DOC_MIME, 'doc1'), ed('SOUL.md')]);
    expect(r.SOUL).toEqual({ entry: ed('SOUL.md'), kind: 'editor' });
  });
  test('editor é opcional por papel: AGENTS e SOUL no editor, o resto vem do Drive', () => {
    const r = resolveRoles([ed('AGENTS.md'), ed('SOUL.md'), f('AGENTS.md'), f('SOUL', DOC_MIME), f('IDENTITY', DOC_MIME), f('IDENTITY.md'), f('USER.md')]);
    expect(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v?.kind]))).toEqual({ AGENTS: 'editor', SOUL: 'editor', IDENTITY: 'doc', USER: 'md' });
  });
  test('arquivo do editor não conta como .md do Drive e só vale com o nome <PAPEL>.md', () => {
    const r = resolveRoles([f('SOUL', EDITOR_MIME), f('USER.md', EDITOR_MIME)]);
    expect(r.SOUL).toBeUndefined();
    expect(r.USER?.kind).toBe('editor');
  });
  test('signature muda quando o papel passa do Drive para o editor', () => {
    expect(signature('p', resolveRoles([f('SOUL.md', 'text/markdown', 'x')]))).not.toBe(signature('p', resolveRoles([f('SOUL.md', EDITOR_MIME, 'x')])));
  });
});

describe('arquivos do agente no projeto Apps Script', () => {
  const files: ProjectFile[] = [
    { name: 'agentes/assistente/SOUL.md', type: 'html', source: '# Alma' },
    { name: 'agentes/assistente/AGENTS.md', type: 'html', source: '---\nmodel: x/y\n---\nRegras' },
    { name: 'agentes/outro/USER.md', type: 'html', source: 'u' },
    { name: 'agentes/assistente/SOUL', type: 'html', source: 'sem .md' },
    { name: 'agentes/assistente/notas.md', type: 'html', source: 'não é papel' },
    { name: 'agentes/assistente/sub/SOUL.md', type: 'html', source: 'fundo demais' },
    { name: 'agentes/assistente/IDENTITY.md', type: 'server_js', source: 'var x' },
    { name: '_motor', type: 'server_js', source: '// motor' },
    { name: 'settings', type: 'html', source: '<p>' },
  ];
  test('editorAgents lista os agentes pelo prefixo agentes/<nome>/, sem hardcode', () => {
    expect(editorAgents(files)).toEqual(['assistente', 'outro']);
  });
  test('editorEntries devolve só os papéis <PAPEL>.md em HTML daquele agente', () => {
    expect(editorEntries(files, 'assistente', 7)).toEqual([
      { id: 'agentes/assistente/SOUL.md', name: 'SOUL.md', mime: EDITOR_MIME, modified: 7 },
      { id: 'agentes/assistente/AGENTS.md', name: 'AGENTS.md', mime: EDITOR_MIME, modified: 7 },
    ]);
  });
  test('parseProjectExport lê o JSON do export application/vnd.google-apps.script+json', () => {
    expect(parseProjectExport(JSON.stringify({ files: [{ id: 'u', ...files[0] }] }))).toEqual([files[0]]);
  });
});

describe('loadAgent de produção, núcleo puro (ADR-013)', () => {
  const ed = (name: string, agent = 'a') => f(name, EDITOR_MIME, `agentes/${agent}/${name}`);
  const F0 = { AGENTS: '---\nusers: [Ana@x.com]\n---\nRegras', SOUL: 'Calmo', IDENTITY: 'gasclaw', USER: 'Gabriel' };

  test('regressão: pasta só com .md gera exatamente o prompt da F0', () => {
    const sources = resolveRoles(['AGENTS', 'SOUL', 'IDENTITY', 'USER'].map((r) => f(`${r}.md`)));
    const a = assembleAgent('f', 'A', sources, roleTexts(sources, [], F0));
    expect({ folderId: a.folderId, name: a.name, config: a.config, system: a.system, access: a.access }).toEqual(buildSpec('f', 'A', F0));
    expect(a.system).toBe('## AGENTS.md\nRegras\n\n## SOUL.md\nCalmo\n\n## IDENTITY.md\ngasclaw\n\n## USER.md\nGabriel');
    expect(a.origem).toEqual({ AGENTS: 'md', SOUL: 'md', IDENTITY: 'md', USER: 'md' });
  });

  test('o texto do editor vence o do Drive no prompt; o resto vem do Drive; ausente vira (missing)', () => {
    const files: ProjectFile[] = [{ name: 'agentes/a/SOUL.md', type: 'html', source: '# Alma do editor <b> & ${x}' }];
    const sources = resolveRoles([ed('SOUL.md'), f('SOUL', DOC_MIME, 'doc1'), f('AGENTS.md')]);
    const a = assembleAgent('f', 'a', sources, roleTexts(sources, files, { SOUL: 'alma do Doc', AGENTS: 'Regras do Drive' }));
    expect(a.system).toContain('## SOUL.md\n# Alma do editor <b> & ${x}');
    expect(a.system).not.toContain('alma do Doc');
    expect(a.system).toContain('## AGENTS.md\nRegras do Drive');
    expect(a.system).toContain('## USER.md\n(missing)');
    expect(a.origem).toEqual({ AGENTS: 'md', SOUL: 'editor', IDENTITY: 'missing', USER: 'missing' });
  });

  test('driveSources: só o que precisa ser baixado do Drive (sem os papéis do editor)', () => {
    const sources = resolveRoles([ed('SOUL.md'), f('AGENTS', DOC_MIME), f('USER.md'), f('config', SHEET_MIME, 's1')]);
    expect(Object.keys(driveSources(sources)).sort()).toEqual(['AGENTS', 'USER', 'config']);
  });

  test('planilha config continua sobrepondo o frontmatter', () => {
    const sources = resolveRoles([f('AGENTS.md'), f('config', SHEET_MIME, 's1')]);
    expect(assembleAgent('f', 'A', sources, { AGENTS: '---\nmodel: x/y\n---\nR' }, [['model', 'a/b']]).config.model).toBe('a/b');
  });
});

describe('pasta padrão do agente no Drive', () => {
  test('agentFolderPath = gasclaw/agents/<nome>', () => expect(agentFolderPath('assistente')).toEqual(['gasclaw', 'agents', 'assistente']));
  test('validAgentName aceita minúsculas, dígitos e hífen; recusa barra, espaço e vazio', () => {
    expect(['assistente', 'vendas-2'].map(validAgentName)).toEqual([true, true]);
    expect(['', 'a/b', 'Com Espaço', '-x', 'x'.repeat(41)].map(validAgentName)).toEqual([false, false, false, false, false]);
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

describe('tools e steps no config (Pista Motor)', () => {
  test('frontmatter com tools e steps', () => {
    const { data } = parseFrontmatter('---\ntools: [now, memory]\nsteps: 5\n---\n');
    expect(mergeConfig(data)).toMatchObject({ model: DEFAULT_MODEL, suggested: { users: [], tools: ['now', 'memory'] }, steps: 5 });
  });
  test('sem as chaves: tools vazio e steps indefinido (agente sem tools)', () => {
    const c = mergeConfig({});
    expect(c.suggested.tools).toEqual([]);
    expect(c.steps).toBeUndefined();
  });
  test('steps fora de 1..50 ou não inteiro vira indefinido', () => {
    for (const s of ['0', '99', '2.5', 'x']) expect(mergeConfig({ steps: s }).steps).toBeUndefined();
    expect(mergeConfig({ steps: '50' }).steps).toBe(50);
  });
  test('planilha config com tools separado por vírgula', () => {
    expect(mergeConfig({}, [['tools', 'now, memory']]).suggested.tools).toEqual(['now', 'memory']);
  });
});

describe('mergeConfig', () => {
  test('sem planilha usa o frontmatter', () => {
    expect(mergeConfig({ model: 'x/y', users: ['A@x.com'] })).toMatchObject({ model: 'x/y', suggested: { users: ['a@x.com'], tools: [] } });
  });
  test('planilha sobrepõe; users separados por vírgula, ; ou espaço; ignora cabeçalho e chaves desconhecidas', () => {
    const rows = [['chave', 'valor'], ['model', ' a/b '], ['users', 'Ana@x.com, bob@x.com;c@x.com d@x.com'], ['foo', 'bar']];
    expect(mergeConfig({ model: 'x/y', users: ['z@x.com'] }, rows)).toMatchObject({ model: 'a/b', suggested: { users: ['ana@x.com', 'bob@x.com', 'c@x.com', 'd@x.com'], tools: [] } });
  });
  test('valor vazio na planilha não apaga o frontmatter', () => {
    expect(mergeConfig({ model: 'x/y' }, [['model', '']])).toMatchObject({ model: 'x/y', suggested: { users: [], tools: [] } });
  });
});

describe('canUse', () => {
  const config = { users: ['ana@x.com'], tools: [] }; // acesso efetivo (ADR-021)
  test('dono sempre pode', () => expect(canUse(config, 'Dono@x.com', 'dono@x.com')).toBe(true));
  test('usuário listado pode (case-insensitive)', () => expect(canUse(config, 'ANA@x.com', 'dono@x.com')).toBe(true));
  test('outros não podem', () => expect(canUse(config, 'bob@x.com', 'dono@x.com')).toBe(false));
  test('lista vazia = só o dono', () => expect(canUse({ users: [], tools: [] }, 'ana@x.com', 'dono@x.com')).toBe(false));
});
