// A fiação da sucessão por CÓDIGO: do pedido ao Opus até o filho implantado.
//
// O que se testa aqui não é se o Opus escreve bem — isso não é testável com mock. É a ORDEM das
// recusas e o que acontece quando cada passo falha. Duas propriedades valem o arquivo inteiro:
// nenhuma recusa barata acontece DEPOIS de pagar o Opus, e nada é implantado sem passar no crivo.
import { describe, expect, test, vi } from 'vitest';
import { generateSuccessor, type SuccessorDeps, type SuccessorResult } from '../src/successor';

/** Afirma a recusa e devolve o motivo — `r.reason` só existe no ramo que falhou. */
const porque = (r: SuccessorResult): string => {
  expect(r.ok).toBe(false);
  return r.ok ? '' : r.reason;
};

const BOM = 'function doGet() { return ContentService.createTextOutput("ok"); }';
const PAI = ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/drive'];

const pedido = {
  folderId: 'f1',
  incumbentSource: 'function doGet() {}',
  material: '7 runs failed touching the calendar',
  requestedScopes: ['https://www.googleapis.com/auth/calendar.events'],
  title: 'successor of a',
  timeZone: 'America/Sao_Paulo',
};

// A API do Apps Script respondendo bem: cria, escreve, versiona e implanta.
const apiOk = () =>
  vi.fn((url: string, _method?: string, _payload?: unknown) => {
    if (/\/versions$/.test(url)) return { code: 200, full: '{"versionNumber":7}' }; // 7, e não 1: o número é LIDO de volta
    if (/\/deployments$/.test(url)) return { code: 200, full: JSON.stringify({ deploymentId: 'd1', entryPoints: [{ webApp: { url: 'https://script.google.com/macros/s/child/exec' } }] }) };
    if (/\/content$/.test(url)) return { code: 200, full: '{"files":[]}' };
    return { code: 200, full: '{"scriptId":"child-1"}' };
  });

const deps = (o: Partial<SuccessorDeps> = {}): SuccessorDeps => ({
  complete: () => ({ text: '```js\n' + BOM + '\n```', costUsd: 0.2 }),
  parentScopes: () => PAI,
  own: () => 'engine-1',
  api: apiOk(),
  spentToday: () => 0,
  addSpent: () => {},
  now: () => 1_700_000_000_000,
  ...o,
});

describe('as recusas baratas vêm ANTES de pagar o Opus', () => {
  test('estourando o teto diário, o modelo nem é chamado', () => {
    const complete = vi.fn(() => ({ text: BOM, costUsd: 0.2 }));
    const r = generateSuccessor(pedido, deps({ complete, spentToday: () => 3.0 }));
    expect(porque(r)).toMatch(/daily cap/);
    expect(complete).not.toHaveBeenCalled();
  });

  test('escopo que o pai não tem para o pedido antes da chamada', () => {
    const complete = vi.fn(() => ({ text: BOM, costUsd: 0.2 }));
    const r = generateSuccessor({ ...pedido, requestedScopes: ['https://www.googleapis.com/auth/spreadsheets'] }, deps({ complete }));
    expect(porque(r)).toMatch(/does not hold/);
    expect(complete).not.toHaveBeenCalled();
  });

  // A guarda que separa o filho do motor: se nem sabemos qual projeto nos executa, não se escreve nada.
  test('sem saber o próprio scriptId, recusa antes de tudo', () => {
    const complete = vi.fn(() => ({ text: BOM, costUsd: 0.2 }));
    const r = generateSuccessor(pedido, deps({ complete, own: () => '' }));
    expect(r.ok).toBe(false);
    expect(complete).not.toHaveBeenCalled();
  });
});

describe('o custo é contado mesmo quando o resultado é jogado fora', () => {
  // O dinheiro saiu. Não contabilizar uma geração reprovada faria o teto diário ser furado pelo
  // caminho mais provável de todos: o das tentativas que não deram certo.
  test('código reprovado no crivo ainda soma no gasto do dia', () => {
    const addSpent = vi.fn();
    const r = generateSuccessor(pedido, deps({ complete: () => ({ text: 'function doGet() { eval("1") }', costUsd: 0.31 }), addSpent }));
    expect(porque(r)).toMatch(/eval/);
    expect(addSpent).toHaveBeenCalledWith(0.31);
  });

  test('geração bem-sucedida também soma', () => {
    const addSpent = vi.fn();
    const r = generateSuccessor(pedido, deps({ addSpent }));
    expect(r.ok).toBe(true);
    expect(addSpent).toHaveBeenCalledWith(0.2);
  });
});

describe('nada é publicado sem passar no crivo', () => {
  test('código reprovado não chega a criar projeto nenhum', () => {
    const api = apiOk();
    const r = generateSuccessor(pedido, deps({ api, complete: () => ({ text: 'var x = 1;', costUsd: 0.1 }) }));
    expect(r.ok).toBe(false);
    expect(api).not.toHaveBeenCalled();
  });

  test('modelo que não devolve código nenhum é recusa com motivo, não exceção', () => {
    const r = generateSuccessor(pedido, deps({ complete: () => ({ text: '   ', costUsd: 0.05 }) }));
    expect(porque(r)).toMatch(/no code/);
  });
});

// O `generateSuccessor` roda DENTRO de cada teste, e não no corpo do describe: o corpo do describe
// executa na coleção, e o registro de chamadas do mock é limpo antes do primeiro teste rodar — o que
// fazia `api.mock.calls` chegar vazio e um teste correto falhar por motivo nenhum.
describe('o caminho feliz publica um filho com o que foi pedido, e só isso', () => {
  test('devolve o filho como SUBAGENT com a URL da implantação', () => {
    const r = generateSuccessor(pedido, deps());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.child.scriptId).toBe('child-1');
    expect(r.child.kind).toBe('subagent');
    expect(r.child.url).toBe('https://script.google.com/macros/s/child/exec');
    expect(r.child.parent).toBe('f1');
  });

  test('o filho declara APENAS o escopo pedido, não os do pai', () => {
    const api = apiOk();
    const r = generateSuccessor(pedido, deps({ api }));
    if (!r.ok) return;
    expect(r.child.scopes).toEqual(['https://www.googleapis.com/auth/calendar.events']);
    const escrita = api.mock.calls.find((c) => /\/content$/.test(c[0] as string) && (c[1] as string) === 'put');
    const manifesto = JSON.parse(((escrita?.[2] as { files: { name: string; source: string }[] }).files.find((f) => f.name === 'appsscript') as { source: string }).source);
    expect(manifesto.oauthScopes).toEqual(['https://www.googleapis.com/auth/calendar.events']);
    expect(manifesto.webapp.access).toBe('MYSELF');
  });

  // Afirmar 'implantado' é afirmar que o dono PODE autorizar. Sem URL ele não tem onde clicar.
  test('a URL é obrigatória: implantação sem ponto de entrada é falha, não sucesso pela metade', () => {
    const semUrl = generateSuccessor(
      pedido,
      deps({
        api: vi.fn((url: string, _m?: string, _p?: unknown) => (/\/deployments$/.test(url) ? { code: 200, full: '{"deploymentId":"d1"}' } : /\/versions$/.test(url) ? { code: 200, full: '{"versionNumber":7}' } : { code: 200, full: '{"scriptId":"child-1"}' })),
      }),
    );
    expect(porque(semUrl)).toMatch(/web app URL/);
  });

  test('o filho nasce PRECISANDO de consentimento: a P24 mediu que ele não executa antes disso', () => {
    const r = generateSuccessor(pedido, deps());
    if (!r.ok) return;
    expect(r.needsConsent).toBe(true);
  });
});

describe('a API falhando é recusa com o código, nunca sucesso presumido', () => {
  test.each([
    ['criação', (u: string) => !/\/(content|versions|deployments)$/.test(u)],
    ['escrita', (u: string) => /\/content$/.test(u)],
    ['implantação', (u: string) => /\/deployments$/.test(u)],
  ])('%s recusada devolve o código HTTP', (_nome, falha) => {
    const r2 = generateSuccessor(
      pedido,
      deps({ api: vi.fn((url: string, _m?: string, _p?: unknown) => (falha(url) ? { code: 403, full: 'nope' } : { code: 200, full: '{"scriptId":"child-1","versionNumber":7,"deploymentId":"d1","entryPoints":[{"webApp":{"url":"https://x/exec"}}]}' })) }),
    );
    expect(porque(r2)).toMatch(/403/);
  });
});
