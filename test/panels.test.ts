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
