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

// Pedido do dono (2026-09-21): "Precisa aparecer em Panels também a lista de todos os agentes,
// inclusive com sucessores". O hub listava AMBIENTES (dev/prod); com a F7 ele precisa listar também
// os MOTORES que servem o agente — o titular e os sucessores —, com o caminho de um para o outro.
import { engineLinks } from '../src/panels';
describe('engineLinks: os motores que servem este agente, e onde você está', () => {
  const PAI = 'https://script.google.com/a/macros/x/s/PAI/exec';
  const FILHO = 'https://script.google.com/a/macros/x/s/FILHO/exec';

  test('no TITULAR: ele primeiro, marcado como atual, e os sucessores depois', () => {
    const l = engineLinks({ agent: 'gasclaw-assistente', self: '1b93M1aw9_Nu', selfUrl: PAI, parent: null, parentUrl: null, successors: [{ scriptId: '1w3Pju8vyj9y', url: FILHO }] });
    expect(l.map((e) => [e.role, e.engine, e.current])).toEqual([['incumbent', '1b93M1aw', true], ['successor', '1w3Pju8v', false]]);
  });

  test('no SUCESSOR: o pai primeiro, com o link dele, e o sucessor marcado como atual', () => {
    const l = engineLinks({ agent: 'gasclaw-assistente', self: '1w3Pju8vyj9y', selfUrl: FILHO, parent: '1b93M1aw9_Nu', parentUrl: PAI, successors: [] });
    expect(l.map((e) => [e.role, e.engine, e.current, e.url])).toEqual([['incumbent', '1b93M1aw', false, PAI], ['successor', '1w3Pju8v', true, FILHO]]);
  });

  // O MESMO INVARIANTE DO HUB DE AMBIENTES: só painel do Apps Script vira link.
  test('um endereço fora do script.google.com não vira link', () => {
    const l = engineLinks({ agent: 'a', self: '1w3Pju8v', selfUrl: FILHO, parent: '1b93M1aw', parentUrl: 'https://evil.example/x', successors: [] });
    expect(l.find((e) => e.role === 'incumbent')?.url).toBeNull();
  });

  test('sem sucessor e sem pai, só ele mesmo', () => {
    expect(engineLinks({ agent: 'a', self: '1b93M1aw', selfUrl: PAI, parent: null, parentUrl: null, successors: [] })).toHaveLength(1);
  });
});
