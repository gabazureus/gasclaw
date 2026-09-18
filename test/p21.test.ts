import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, test, vi } from 'vitest';

const EXEC = 'https://script.google.com/a/macros/x.com/s/AKfyTESTE/exec';

/** Stubs mínimos do GAS: o suficiente para doGet servir uma tela e para panelsState responder. */
function stubGas() {
  const props: Record<string, string> = { OWNER: 'dono@x.com', AGENTS: '[]' };
  const store = { getProperty: (k: string) => props[k] ?? null, setProperty: (k: string, v: string) => void (props[k] = v), getProperties: () => ({ ...props }), deleteProperty: (k: string) => void delete props[k] };
  const served: string[] = [];
  vi.stubGlobal('PropertiesService', { getScriptProperties: () => store });
  vi.stubGlobal('CacheService', { getScriptCache: () => ({ get: () => null, put: () => undefined, remove: () => undefined, removeAll: () => undefined, getAll: () => ({}) }) });
  vi.stubGlobal('Session', { getActiveUser: () => ({ getEmail: () => 'dono@x.com' }), getEffectiveUser: () => ({ getEmail: () => 'dono@x.com' }) });
  vi.stubGlobal('ScriptApp', { getService: () => ({ getUrl: () => EXEC }), getScriptId: () => '1AbCdEfTeste', getProjectTriggers: () => { throw new Error('sem autorização'); } });
  vi.stubGlobal('HtmlService', {
    createHtmlOutputFromFile: (name: string) => {
      served.push(name);
      const out = { setTitle: () => out, addMetaTag: () => out };
      return out;
    },
  });
  return served;
}

afterEach(() => vi.unstubAllGlobals());

describe('P21 · hub de painéis (borda)', () => {
  test('doGet?page=hub serve a tela do hub, não o painel', async () => {
    const served = stubGas();
    const { doGet } = await import('../src/main');
    doGet({ parameter: { page: 'hub' } } as never);
    expect(served).toEqual(['hub']);
  });

  test('sem page, continua servindo o painel (nada mudou para quem já usava)', async () => {
    const served = stubGas();
    const { doGet } = await import('../src/main');
    doGet({ parameter: {} } as never);
    expect(served).toEqual(['settings']);
  });

  test('panelsState lista o ambiente atual; sem URL do irmão embutida, lista só ele', async () => {
    stubGas();
    const { panelsState } = await import('../src/main');
    const s = panelsState();
    expect(s.env).toBe('prod'); // fora do build, __ENV__ não existe: na dúvida, o mais perigoso
    expect(s.panels).toEqual([{ env: 'prod', url: EXEC, current: true }]);
  });

  test('settingsState expõe o ambiente para o rótulo do cabeçalho', async () => {
    stubGas();
    const { settingsState } = await import('../src/main');
    expect(settingsState().env).toBe('prod');
  });
});

describe('P21 · telas', () => {
  const settings = () => readFileSync('src/settings.html', 'utf8');
  const hub = () => readFileSync('src/hub.html', 'utf8');

  test('o menu tem os quatro itens combinados e marca o ativo com aria-current', () => {
    const html = settings();
    for (const id of ['nav-home', 'nav-agents', 'nav-observability', 'nav-test']) expect(html).toContain(id);
    expect(html).toContain('aria-current');
  });

  test('o link "Apps Script" saiu da linha do agente e virou link do ambiente', () => {
    const html = settings();
    expect(html).not.toContain("'Abrir Apps Script de '"); // era repetido igual em todo agente
    expect(html).toMatch(/\$\('scriptLink'\)\.href = s\.scriptUrl/);
  });

  test('o menu é nav, não tablist: sem setas próprias, para não competir com as abas da Observabilidade', () => {
    const menu = settings().match(/const PAGES[\s\S]*?\$\('nav-' \+ p\)\.onclick[^\n]*\n/)?.[0] ?? '';
    expect(menu).not.toBe('');
    expect(menu).not.toContain('ArrowRight');
    expect(menu).toContain("setAttribute('aria-current', 'page')");
  });

  test('o rótulo do ambiente é anunciado como tal e distingue prod visualmente', () => {
    const html = settings();
    expect(html).toContain('<span class="sr">environment: </span>');
    expect(html).toMatch(/\.env\.prod \{/);
    expect(html).toMatch(/\$\('envBadge'\)\.className = 'env ' \+ s\.env/);
  });

  test('nenhuma das telas usa href relativo para ?page= (iframe do HtmlService)', () => {
    for (const html of [settings(), hub()]) {
      expect(html).not.toMatch(/href="\?(page|action)=/);
      expect(html).not.toMatch(/href\s*=\s*'\?(page|action)=/);
    }
  });

  test('o hub não interpreta nada como HTML e abre os painéis no topo', () => {
    const html = hub();
    expect(html).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|document\.write/);
    expect(html).toContain("target = '_top'");
    expect(html).toContain('.panelsState()');
  });

  test('todo painel do hub é um link, inclusive o do ambiente atual (o hub é para favoritar)', () => {
    const html = hub();
    // o ramo "atual" só acrescenta o aviso; o link é montado antes, fora do if
    expect(html).toMatch(/a\.href = p\.url;[\s\S]{0,200}if \(p\.current\)/);
    expect(html).not.toContain('Você está no painel de'); // você está no hub, não num painel
  });
});
