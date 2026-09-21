// F7, Fase 2 — a CASCA do agente sucessor, rodando no Apps Script de mentira.
//
// O núcleo (`succession.ts`) decide; aqui se prova que a casca OBEDECE: que o que sobe para o Google é o
// motor com o patch e a semente parada, que nada sobe quando o patch é recusado, que o dinheiro é contado
// mesmo quando nada sobe, que um sucessor LIGADO não recebe código, e que a coroa para o titular antes e o
// devolve se falhar.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas, type GasEnv } from './gasEnv';

const MOTOR = 'function a() { assertOwner(); return lastSeen; }\nfunction b() { mayWriteProject(x, y); }\n';
const MANIFESTO = '{"oauthScopes":["https://www.googleapis.com/auth/script.projects","https://www.googleapis.com/auth/drive"]}';
const URL_NOVO = 'https://script.google.com/macros/s/NOVO/exec';
const URL_SLOT = 'https://script.google.com/macros/s/SLOT/exec';

let env: GasEnv;
let saude: { enabled: boolean } | 'consent' = { enabled: false };
let coroa: { ok: boolean; error?: string } = { ok: true };
// O que o sucessor diz de si pela porta `readiness`, e o código que a API devolve para ele.
const SELF_OK = { seedParent: 'script1', enabled: false, hasKey: true, authRequired: false, agentReadable: { ok: true, detail: 'read' }, trigger: 'inactive' };
let self: Record<string, unknown> | null = { ...SELF_OK };
let codigoFilho: string = MOTOR.replace('return lastSeen;', 'return lastSeen - 1;');
// Como a resposta da coroa chega ao pai: `null` = o JSON normal; texto = corpo ilegível; 'throw' = erro de rede.
let corpoDaCoroa: string | null | 'throw' = null;

const bom = JSON.stringify({ explanation: 'the midnight job never fired', changes: [{ file: '_motor', find: 'return lastSeen;', replace: 'return lastSeen - 1;' }] });

beforeEach(() => {
  vi.resetModules();
  saude = { enabled: false };
  coroa = { ok: true };
  self = { ...SELF_OK };
  codigoFilho = MOTOR.replace('return lastSeen;', 'return lastSeen - 1;');
  corpoDaCoroa = null;
  env = stubGas();
  env.props['STATUS:f1'] = 'active';
  env.props['CAP:f1'] = JSON.stringify(['succeed']);
  // A semente leva o endereço do pai (`appUrl`), que vem de `ScriptApp.getService()`.
  vi.stubGlobal('ScriptApp', { ...(globalThis as unknown as { ScriptApp: object }).ScriptApp, getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/PAI/exec' }) });
  env.route = (url, init) => {
    // O gasto da família lê `/api/v1/key`; sem esta rota, a genérica do OpenRouter consumiria a fila do modelo.
    if (url.endsWith('/api/v1/key')) return { code: 200, body: JSON.stringify({ data: { usage: 0, limit: null } }) };
    if (url === 'https://script.googleapis.com/v1/projects/script1/content') return { code: 200, body: JSON.stringify({ files: [{ name: '_motor', type: 'SERVER_JS', source: MOTOR }, { name: 'appsscript', type: 'JSON', source: MANIFESTO }] }) };
    if (url === 'https://script.googleapis.com/v1/projects' && init.method === 'post') return { code: 200, body: JSON.stringify({ scriptId: 'NOVO' }) };
    if (url.endsWith('/projects/SLOT/content') && (init.method ?? 'get') === 'get') return { code: 200, body: JSON.stringify({ files: [{ name: '_motor', type: 'SERVER_JS', source: codigoFilho }, { name: 'appsscript', type: 'JSON', source: MANIFESTO }, { name: 'successor_seed', type: 'SERVER_JS', source: 'var GASCLAW_SEED = {};' }] }) };
    if (/\/projects\/(NOVO|SLOT)\/content$/.test(url)) return { code: 200, body: '{}' };
    if (/\/projects\/(NOVO|SLOT)\/versions$/.test(url)) return { code: 200, body: JSON.stringify({ versionNumber: 7 }) };
    if (url.endsWith('/projects/NOVO/deployments') && init.method === 'post') return { code: 200, body: JSON.stringify({ entryPoints: [{ webApp: { url: URL_NOVO } }] }) };
    if (url.endsWith('/projects/SLOT/deployments') && (init.method ?? 'get') === 'get') return { code: 200, body: JSON.stringify({ deployments: [{ deploymentId: 'HEAD' }, { deploymentId: 'WEB', deploymentConfig: { versionNumber: 3 } }] }) };
    if (url.endsWith('/projects/SLOT/deployments/WEB')) return { code: 200, body: '{}' };
    if (url.endsWith('?action=health')) return saude === 'consent' ? { code: 200, body: 'Authorization needed' } : { code: 200, body: JSON.stringify(saude) };
    if ((url === URL_SLOT || url === URL_NOVO) && init.method === 'post') {
      const acao = (init.payload as Record<string, string>).action;
      if (acao === 'readiness') return self ? { code: 200, body: JSON.stringify({ ok: true, self }) } : { code: 200, body: JSON.stringify({ ok: false, error: 'unknown action: readiness' }) };
      // O sucessor AGE antes de responder: ligou é ligou, chegue a resposta ou não.
      if (coroa.ok && self) self = { ...self, enabled: true };
      if (corpoDaCoroa === 'throw') throw new Error('Address unavailable');
      return { code: 200, body: corpoDaCoroa ?? JSON.stringify(coroa) };
    }
    return null;
  };
});
afterEach(() => vi.unstubAllGlobals());

const motor = async () => (await import('../src/main')) as unknown as Record<string, (...a: unknown[]) => Record<string, unknown>>;
const escrito = () => {
  const put = env.calls.find((c) => /\/projects\/(NOVO|SLOT)\/content$/.test(c.url) && c.init.method === 'put');
  return put ? (JSON.parse(String(put.init.payload)) as { files: { name: string; source: string }[] }).files : null;
};
const slotRegistrado = (extra: object = {}) => {
  const rec = { scriptId: 'SLOT', url: URL_SLOT, folderId: 'f1', at: 1, model: 'opus', explanation: 'x', changes: [], costUsd: 1, evaluation: null, crownedAt: null, ...extra };
  env.props['SUCCESSORS'] = JSON.stringify([{ scriptId: 'SLOT', chunks: 1 }]);
  env.props['SUCC:SLOT:0'] = JSON.stringify(rec);
};

describe('writeSuccessor: o patch do Opus vira um AGENTE implantado, parado', () => {
  test('sobe o motor COM o patch, o manifesto do pai intacto e a semente parada — sem segredo nenhum', async () => {
    env.llm.push({ content: bom, cost: 1.3 });
    const r = (await motor()).writeSuccessor('f1', '');
    expect(r).toMatchObject({ ok: true, scriptId: 'NOVO', url: URL_NOVO, reused: false, explanation: 'the midnight job never fired' });
    const files = escrito()!;
    expect(files.find((f) => f.name === '_motor')?.source).toContain('return lastSeen - 1;');
    expect(files.find((f) => f.name === 'appsscript')?.source).toBe(MANIFESTO);
    const semente = files.find((f) => f.name === 'successor_seed')?.source ?? '';
    expect(semente).toContain('"bornDisabled":true');
    expect(semente).toContain('"parent":"script1"');
    expect(semente).not.toContain('sk-or');
  });

  test('o Opus recebe o CÓDIGO do motor, não o prompt do agente', async () => {
    env.llm.push({ content: bom });
    (await motor()).writeSuccessor('f1', 'make the midnight job fire');
    const pedido = String(env.fetched('openrouter.ai/api/v1/chat')[0]?.init.payload ?? '');
    expect(pedido).toContain('=== FILE: _motor ===');
    expect(pedido).toContain('make the midnight job fire');
  });

  test('registra o sucessor com explicação, trocas e custo, e o custo entra no gasto do dia', async () => {
    env.llm.push({ content: bom, cost: 1.3 });
    const m = await motor();
    m.writeSuccessor('f1', '');
    const s = m.successionState() as unknown as { successors: { scriptId: string; explanation: string; changes: unknown[]; costUsd: number; evaluation: unknown }[] };
    expect(s.successors).toHaveLength(1);
    expect(s.successors[0]).toMatchObject({ scriptId: 'NOVO', explanation: 'the midnight job never fired', costUsd: 1.3, evaluation: null });
    const dia = Object.keys(env.props).find((k) => k.startsWith('CODEGEN:'));
    expect(Number(env.props[dia!])).toBeCloseTo(1.3);
  });

  test('patch que enfraquece uma guarda: NADA sobe, e o custo conta mesmo assim', async () => {
    env.llm.push({ content: JSON.stringify({ explanation: 'simpler', changes: [{ file: '_motor', find: 'assertOwner(); ', replace: '' }] }), cost: 1.1 });
    const r = (await motor()).writeSuccessor('f1', '');
    expect(r).toMatchObject({ ok: false, costUsd: 1.1 });
    expect(String(r.reason)).toContain('assertOwner()');
    expect(env.calls.some((c) => c.url === 'https://script.googleapis.com/v1/projects')).toBe(false);
    expect(escrito()).toBeNull();
    const dia = Object.keys(env.props).find((k) => k.startsWith('CODEGEN:'));
    expect(Number(env.props[dia!])).toBeCloseTo(1.1);
  });

  test('resposta cortada (finish_reason: length) não sobe nada', async () => {
    env.llm.push({ content: bom, finish: 'length', cost: 0.9 });
    const r = (await motor()).writeSuccessor('f1', '');
    expect(r).toMatchObject({ ok: false, costUsd: 0.9 });
    expect(String(r.reason)).toContain('length');
    expect(escrito()).toBeNull();
  });

  test('com a capacidade desligada, não chama o Opus', async () => {
    env.props['CAP:f1'] = JSON.stringify([]);
    const r = (await motor()).writeSuccessor('f1', '');
    expect(r.ok).toBe(false);
    expect(env.fetched('openrouter.ai/api/v1/chat')).toHaveLength(0);
  });

  test('com o motor pausado, não chama o Opus', async () => {
    env.props['RUNTIME_ENABLED'] = 'false';
    expect((await motor()).writeSuccessor('f1', '').ok).toBe(false);
    expect(env.fetched('openrouter.ai/api/v1/chat')).toHaveLength(0);
  });
});

describe('o SLOT: a próxima geração reusa o sucessor parado — e nunca um ligado', () => {
  test('sucessor parado e não coroado recebe o código novo no MESMO projeto e endereço', async () => {
    slotRegistrado();
    env.llm.push({ content: bom });
    const r = (await motor()).writeSuccessor('f1', '');
    expect(r).toMatchObject({ ok: true, scriptId: 'SLOT', url: URL_SLOT, reused: true });
    expect(env.calls.some((c) => c.url === 'https://script.googleapis.com/v1/projects')).toBe(false); // nenhum projeto novo
    expect(env.calls.some((c) => c.url.endsWith('/projects/SLOT/deployments/WEB'))).toBe(true);
  });

  test('sucessor LIGADO: recusa ANTES de chamar o Opus — código novo não entra num motor que responde', async () => {
    slotRegistrado();
    saude = { enabled: true };
    const r = (await motor()).writeSuccessor('f1', '');
    expect(r.ok).toBe(false);
    expect(String(r.reason)).toContain('RUNNING');
    expect(env.fetched('openrouter.ai/api/v1/chat')).toHaveLength(0);
    expect(escrito()).toBeNull();
  });

  test('sucessor ainda não autorizado pode receber (ele não roda)', async () => {
    slotRegistrado();
    saude = 'consent';
    env.llm.push({ content: bom });
    expect((await motor()).writeSuccessor('f1', '')).toMatchObject({ ok: true, reused: true });
  });

  test('o sucessor da P33 serve de slot ao agente padrão', async () => {
    env.props['P33_SUCCESSOR'] = JSON.stringify({ scriptId: 'SLOT', url: URL_SLOT, at: 1 });
    env.llm.push({ content: bom });
    expect((await motor()).writeSuccessor('f1', '')).toMatchObject({ ok: true, scriptId: 'SLOT', reused: true });
  });

  // Um registro que apontasse para ESTE projeto faria o motor reescrever a si mesmo — e um patch apagaria
  // o `assertOwner` dele. `mayWriteProject` vale também para o slot.
  test('um slot que aponta para o próprio motor é recusado, e nada é escrito', async () => {
    env.props['SUCCESSORS'] = JSON.stringify([{ scriptId: 'script1', chunks: 1 }]);
    env.props['SUCC:script1:0'] = JSON.stringify({ scriptId: 'script1', url: URL_SLOT, folderId: 'f1', at: 1, model: 'opus', explanation: 'x', changes: [], costUsd: 1, evaluation: null, crownedAt: null });
    env.llm.push({ content: bom });
    const r = (await motor()).writeSuccessor('f1', '');
    expect(r).toMatchObject({ ok: false, costUsd: 0 });
    expect(env.fetched('openrouter.ai/api/v1/chat')).toHaveLength(0); // recusado ANTES de pagar o Opus
    expect(env.calls.some((c) => c.url.endsWith('/projects/script1/content') && c.init.method === 'put')).toBe(false);
  });

  test('coroado não é slot: a geração seguinte cria outro projeto', async () => {
    slotRegistrado({ crownedAt: 5 });
    env.llm.push({ content: bom });
    expect((await motor()).writeSuccessor('f1', '')).toMatchObject({ ok: true, scriptId: 'NOVO', reused: false });
  });
});

describe('crownSuccessor: a coroa — só com o health inteiro; o titular para ANTES, e volta se ela falhar', () => {
  const troca = [{ file: '_motor', find: 'return lastSeen;', replace: 'return lastSeen - 1;' }];
  const avaliado = (sp: number, ip: number) => ({ changes: troca, evaluation: { successorPasses: sp, incumbentPasses: ip, k: 6, complete: true, verdictLeaked: false, at: 2, rows: [] } });
  const coroou = () => env.calls.some((c) => c.url === URL_SLOT && (c.init.payload as Record<string, string>)?.action === 'crown');

  test('sem avaliação, recusa e não toca em nada', async () => {
    slotRegistrado();
    const r = (await motor()).crownSuccessor('SLOT');
    expect(r.ok).toBe(false);
    expect(env.props['RUNTIME_ENABLED']).toBeUndefined();
    expect(coroou()).toBe(false);
  });

  test('nota pior que a do titular: recusa', async () => {
    slotRegistrado(avaliado(4, 5));
    expect((await motor()).crownSuccessor('SLOT').ok).toBe(false);
    expect(env.props['RUNTIME_ENABLED']).toBeUndefined();
  });

  test('empate avaliado e health inteiro: coroa — o titular fica parado e o registro marca a coroa', async () => {
    slotRegistrado(avaliado(5, 5));
    const m = await motor();
    expect(m.crownSuccessor('SLOT')).toMatchObject({ ok: true, standing: 'ties' });
    expect(env.props['RUNTIME_ENABLED']).toBe('false');
    const post = env.calls.find((c) => c.url === URL_SLOT && (c.init.payload as Record<string, string>)?.action === 'crown');
    expect(post?.init.payload).toEqual({ action: 'crown', parent: 'script1' });
    expect((m.successionState() as unknown as { successors: { crownedAt: number | null }[] }).successors[0].crownedAt).not.toBeNull();
  });

  test('coroar DE NOVO quem já foi coroado: recusa, sem pausar o titular nem chamar o sucessor', async () => {
    slotRegistrado({ ...avaliado(5, 5), crownedAt: 9 });
    expect((await motor()).crownSuccessor('SLOT').ok).toBe(false);
    expect(env.props['RUNTIME_ENABLED']).toBeUndefined();
    expect(coroou()).toBe(false);
  });

  // Cada uma é uma forma real de a troca falhar DEPOIS de pausar o motor que funciona.
  test.each([
    ['sem a chave', () => void (self = { ...SELF_OK, hasKey: false })],
    ['sem ler o Drive (GCP não vinculado)', () => void (self = { ...SELF_OK, agentReadable: { ok: false, detail: '403 Drive API disabled' } })],
    ['sucessor antigo, sem a porta do health', () => void (self = null)],
    ['código que não é o pai atual + o patch', () => void (codigoFilho = MOTOR)],
    ['sem o escopo do gatilho', () => void (self = { ...SELF_OK, trigger: 'awaiting authorization' })],
  ])('health reprovado (%s): não coroa, não pausa o titular, não chama a coroa', async (_n, preparar) => {
    slotRegistrado(avaliado(5, 5));
    preparar();
    const r = (await motor()).crownSuccessor('SLOT');
    expect(r.ok).toBe(false);
    expect(String(r.reason)).toContain('not ready');
    expect(env.props['RUNTIME_ENABLED']).toBeUndefined();
    expect(coroou()).toBe(false);
  });

  test('avaliação ANTERIOR à última escrita (rebase): não coroa', async () => {
    slotRegistrado({ ...avaliado(5, 5), at: 50 });
    expect((await motor()).crownSuccessor('SLOT').ok).toBe(false);
    expect(coroou()).toBe(false);
  });

  test('successorHealth devolve as 9 checagens com o motivo de cada uma', async () => {
    slotRegistrado(avaliado(5, 5));
    self = { ...SELF_OK, hasKey: false };
    const h = (await motor()).successorHealth('SLOT') as unknown as { ok: boolean; checks: { id: string; ok: boolean }[] };
    expect(h.ok).toBe(false);
    expect(h.checks).toHaveLength(9);
    expect(h.checks.filter((c) => !c.ok).map((c) => c.id)).toEqual(['key']);
  });

  // O ACHADO AO VIVO: o sucessor ligou, a resposta não chegou legível, e o pai voltou a rodar — dois motores.
  test('resposta ilegível, mas o sucessor LIGOU: a coroa vale — o pai fica parado e registra', async () => {
    slotRegistrado(avaliado(5, 5));
    corpoDaCoroa = '<html>Moved Temporarily</html>';
    const m = await motor();
    expect(m.crownSuccessor('SLOT')).toMatchObject({ ok: true });
    expect(env.props['RUNTIME_ENABLED']).toBe('false');
    expect((m.successionState() as unknown as { successors: { crownedAt: number | null }[] }).successors[0].crownedAt).not.toBeNull();
  });

  test('erro de rede na coroa, mas o sucessor LIGOU: a coroa vale', async () => {
    slotRegistrado(avaliado(5, 5));
    corpoDaCoroa = 'throw';
    expect((await motor()).crownSuccessor('SLOT')).toMatchObject({ ok: true });
    expect(env.props['RUNTIME_ENABLED']).toBe('false');
  });

  test('erro de rede e o sucessor segue PARADO: o pai volta a rodar', async () => {
    slotRegistrado(avaliado(5, 5));
    coroa = { ok: false, error: 'x' };
    corpoDaCoroa = 'throw';
    expect((await motor()).crownSuccessor('SLOT').ok).toBe(false);
    expect(env.props['RUNTIME_ENABLED']).toBe('true');
  });

  test('coroa pela metade (o sucessor já responde, todo o resto passa): o clique CONCLUI — pai parado, registrado', async () => {
    slotRegistrado(avaliado(5, 5));
    self = { ...SELF_OK, enabled: true, trigger: 'active' };
    const m = await motor();
    expect(m.crownSuccessor('SLOT')).toMatchObject({ ok: true });
    expect(env.props['RUNTIME_ENABLED']).toBe('false');
    expect((m.successionState() as unknown as { successors: { crownedAt: number | null }[] }).successors[0].crownedAt).not.toBeNull();
  });

  test('coroa pela metade com OUTRA checagem reprovada: não conclui, e o pai não é tocado', async () => {
    slotRegistrado(avaliado(5, 5));
    self = { ...SELF_OK, enabled: true, hasKey: false };
    expect((await motor()).crownSuccessor('SLOT').ok).toBe(false);
    expect(env.props['RUNTIME_ENABLED']).toBeUndefined();
  });

  test('o sucessor recusa a coroa: o titular VOLTA a rodar', async () => {
    slotRegistrado(avaliado(5, 5));
    coroa = { ok: false, error: 'only the parent named in the seed crowns this successor' };
    const r = (await motor()).crownSuccessor('SLOT');
    expect(r.ok).toBe(false);
    expect(env.props['RUNTIME_ENABLED']).toBe('true');
  });
});

describe('rebaseSuccessor: o mesmo patch sobre o código ATUAL, sem o Opus', () => {
  const troca = [{ file: '_motor', find: 'return lastSeen;', replace: 'return lastSeen - 1;' }];
  test('reimplanta no mesmo projeto, sem chamar o modelo, e a avaliação anterior deixa de valer', async () => {
    slotRegistrado({ changes: troca, evaluation: { successorPasses: 5, incumbentPasses: 5, k: 6, complete: true, verdictLeaked: false, at: 2, rows: [] } });
    const m = await motor();
    expect(m.rebaseSuccessor('SLOT')).toMatchObject({ ok: true, scriptId: 'SLOT' });
    expect(env.fetched('openrouter.ai/api/v1/chat')).toHaveLength(0);
    expect(escrito()!.find((f) => f.name === '_motor')?.source).toContain('return lastSeen - 1;');
    const rec = (m.successionState() as unknown as { successors: { at: number; evaluation: { at: number } }[] }).successors[0];
    expect(rec.at).toBeGreaterThan(rec.evaluation.at);
  });
  test('patch que não cabe mais no motor atual: recusa e não escreve', async () => {
    slotRegistrado({ changes: [{ file: '_motor', find: 'nao existe mais', replace: 'x' }] });
    const r = (await motor()).rebaseSuccessor('SLOT');
    expect(r.ok).toBe(false);
    expect(escrito()).toBeNull();
  });
  test('sucessor ligado: recusa e não escreve', async () => {
    slotRegistrado({ changes: troca });
    saude = { enabled: true };
    expect((await motor()).rebaseSuccessor('SLOT').ok).toBe(false);
    expect(escrito()).toBeNull();
  });
});

describe('no SUCESSOR, a porta `crown`: só do pai da semente, e só com o worker criado', () => {
  let gatilhos: string[] = [];
  const post = async (parent: string, criaGatilho = true) => {
    vi.stubGlobal('GASCLAW_SEED', { bornDisabled: true, parent: 'PAI', agents: [{ name: 'agente-teste', folderId: 'f1' }], at: 1 });
    gatilhos = [];
    vi.stubGlobal('ScriptApp', { ...(globalThis as unknown as { ScriptApp: object }).ScriptApp, getProjectTriggers: () => gatilhos.map((h) => ({ getHandlerFunction: () => h })), newTrigger: (h: string) => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => void (criaGatilho && gatilhos.push(h)) }) }) }) });
    const m = await import('../src/main');
    const out = m.doPost({ parameter: { action: 'crown', parent } } as unknown as GoogleAppsScript.Events.DoPost) as unknown as { getContent: () => string };
    return JSON.parse(out.getContent()) as { ok: boolean };
  };

  test('o pai da semente coroa: o sucessor cria o worker e liga', async () => {
    expect((await post('PAI')).ok).toBe(true);
    expect(gatilhos).toEqual(['drainRuns']);
    expect(env.props['RUNTIME_ENABLED']).toBe('true');
  });

  test('o worker não nasce: recusa, e o sucessor segue parado (o pai volta a rodar)', async () => {
    expect((await post('PAI', false)).ok).toBe(false);
    expect(env.props['RUNTIME_ENABLED']).toBeUndefined();
  });

  test('outro "pai" não coroa, e o sucessor segue parado', async () => {
    expect((await post('OUTRO')).ok).toBe(false);
    expect(env.props['RUNTIME_ENABLED']).toBeUndefined();
  });

  test('um motor que não é sucessor não aceita coroa', async () => {
    const m = await import('../src/main');
    const out = m.doPost({ parameter: { action: 'crown', parent: 'PAI' } } as unknown as GoogleAppsScript.Events.DoPost) as unknown as { getContent: () => string };
    expect(JSON.parse(out.getContent()).ok).toBe(false);
    expect(env.props['RUNTIME_ENABLED']).toBeUndefined();
  });

  test('um estranho não chega à porta', async () => {
    env.activeUser = 'estranho@x.com';
    expect((await post('PAI')).ok).toBe(false);
    expect(env.props['RUNTIME_ENABLED']).toBeUndefined();
  });
});

// Achado depois da primeira coroa real: `./gasclaw up` chama `enable`, e religaria o pai que entregou o
// agente — dois motores de novo, na próxima publicação. Religar o pai é decisão do dono, no painel.
describe('o pai coroado não é religado pela CLI', () => {
  const SEGREDO = 'a'.repeat(64);
  const cli = async (action: string) => {
    env.props['CLI_SECRET'] = SEGREDO;
    const m = await import('../src/main');
    const out = m.doPost({ parameter: { action, secret: SEGREDO } } as unknown as GoogleAppsScript.Events.DoPost) as unknown as { getContent: () => string };
    return JSON.parse(out.getContent()) as { ok: boolean; error?: string };
  };

  test('com um sucessor coroado, enable pela CLI recusa e o pai segue parado', async () => {
    slotRegistrado({ crownedAt: 9 });
    env.props['RUNTIME_ENABLED'] = 'false';
    const r = await cli('enable');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('crowned');
    expect(env.props['RUNTIME_ENABLED']).toBe('false');
  });

  test('sem sucessor coroado, enable liga normalmente', async () => {
    slotRegistrado();
    env.props['RUNTIME_ENABLED'] = 'false';
    expect((await cli('enable')).ok).toBe(true);
    expect(env.props['RUNTIME_ENABLED']).toBe('true');
  });

  test('disable continua valendo com sucessor coroado', async () => {
    slotRegistrado({ crownedAt: 9 });
    env.props['RUNTIME_ENABLED'] = 'true';
    expect((await cli('disable')).ok).toBe(true);
    expect(env.props['RUNTIME_ENABLED']).toBe('false');
  });
});
