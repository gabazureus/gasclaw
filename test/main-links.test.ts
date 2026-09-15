import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, test, vi } from 'vitest';

const EXEC = 'https://script.google.com/a/macros/x.com/s/AKfyTESTE/exec';

function stubGas(url: string | null) {
  const props: Record<string, string> = { OWNER: 'dono@x.com', AGENTS: '[{"folderId":"f1","name":"a"}]', OPENROUTER_API_KEY: 'sk-or-teste' };
  const store = { getProperty: (k: string) => props[k] ?? null, setProperty: (k: string, v: string) => void (props[k] = v), getProperties: () => ({ ...props }), deleteProperty: (k: string) => void delete props[k] };
  const cache = { get: () => null, put: () => undefined, remove: () => undefined, removeAll: () => undefined, getAll: () => ({}) };
  vi.stubGlobal('PropertiesService', { getScriptProperties: () => store });
  vi.stubGlobal('CacheService', { getScriptCache: () => cache });
  vi.stubGlobal('Session', { getActiveUser: () => ({ getEmail: () => 'dono@x.com' }), getEffectiveUser: () => ({ getEmail: () => 'dono@x.com' }) });
  vi.stubGlobal('ScriptApp', { getService: () => ({ getUrl: () => url }), getProjectTriggers: () => { throw new Error('sem autorização'); } });
}

afterEach(() => vi.unstubAllGlobals());

describe('link "Conversar com o agente" (bug: href relativo dentro do iframe do HtmlService)', () => {
  test('settingsState devolve a URL absoluta do web app', async () => {
    stubGas(EXEC);
    const { settingsState } = await import('../src/main');
    expect(settingsState().appUrl).toBe(EXEC);
  });
  test('sem implantação, appUrl vem vazio (a tela esconde o link)', async () => {
    stubGas(null);
    const { settingsState } = await import('../src/main');
    expect(settingsState().appUrl).toBe('');
  });
  test('as telas não têm href relativo para ?page= ou ?action=', () => {
    for (const f of ['src/settings.html', 'src/chat.html']) {
      const html = readFileSync(f, 'utf8');
      expect(html).not.toMatch(/href="\?(page|action)=/);
      expect(html).not.toMatch(/href\s*=\s*'\?(page|action)=/);
    }
    expect(readFileSync('src/settings.html', 'utf8')).toContain("$('chatLink').href = s.appUrl + '?page=chat'");
  });
});
