import { describe, expect, test } from 'vitest';
import { panelList } from '../src/panels';

const DEV = 'https://script.google.com/a/macros/x.com/s/DEV/exec';
const PROD = 'https://script.google.com/a/macros/x.com/s/PROD/exec';

describe('panelList: os painéis conhecidos, sem ler nada do outro ambiente', () => {
  test('no dev, lista dev (atual) e prod, sempre nessa ordem', () => {
    expect(panelList('dev', DEV, PROD)).toEqual([
      { env: 'dev', url: DEV, current: true },
      { env: 'prod', url: PROD, current: false },
    ]);
  });

  test('no prod, a ordem não muda: só muda quem está marcado', () => {
    expect(panelList('prod', PROD, DEV)).toEqual([
      { env: 'dev', url: DEV, current: false },
      { env: 'prod', url: PROD, current: true },
    ]);
  });

  test('sem URL do irmão (build sem deploy do outro lado), lista só o atual', () => {
    expect(panelList('dev', DEV, '')).toEqual([{ env: 'dev', url: DEV, current: true }]);
  });

  test('sem URL do próprio ambiente (ainda não publicado), lista só o irmão', () => {
    expect(panelList('dev', '', PROD)).toEqual([{ env: 'prod', url: PROD, current: false }]);
  });

  test('URL que não é painel do Apps Script não vira link (o invariante mora no núcleo)', () => {
    expect(panelList('dev', DEV, 'javascript:alert(1)')).toEqual([{ env: 'dev', url: DEV, current: true }]);
    expect(panelList('dev', DEV, 'https://exemplo.invalido/exec')).toEqual([{ env: 'dev', url: DEV, current: true }]);
  });

  test('ambiente desconhecido conta como prod: na dúvida, avisa o ambiente mais perigoso', () => {
    const atual = 'https://script.google.com/a/macros/x.com/s/ATUAL/exec';
    const irmao = 'https://script.google.com/a/macros/x.com/s/IRMAO/exec';
    expect(panelList('', atual, irmao)).toEqual([
      { env: 'dev', url: irmao, current: false },
      { env: 'prod', url: atual, current: true },
    ]);
  });
});

// Pedido do dono (2026-09-21): "Precisa aparecer em Panels também a lista de todos os agentes".
// O hub lista AMBIENTES (dev/prod) e o MOTOR que serve o agente. A lista de sucessores saiu com a
// sucessão; o invariante do link continua valendo para o que ficou.
import { engineLinks } from '../src/panels';
describe('engineLinks: o motor que serve este agente, e onde você está', () => {
  const PAI = 'https://script.google.com/a/macros/x/s/PAI/exec';

  test('o motor atual, marcado como atual, com o link do painel dele', () => {
    const l = engineLinks({ agent: 'gasclaw-assistente', self: '1b93M1aw9_Nu', selfUrl: PAI });
    expect(l.map((e) => [e.role, e.engine, e.current, e.url])).toEqual([['incumbent', '1b93M1aw', true, PAI]]);
  });

  // O MESMO INVARIANTE DO HUB DE AMBIENTES: só painel do Apps Script vira link.
  test('um endereço fora do script.google.com não vira link', () => {
    const l = engineLinks({ agent: 'a', self: '1w3Pju8v', selfUrl: 'https://evil.example/x' });
    expect(l[0].url).toBeNull();
  });
});
