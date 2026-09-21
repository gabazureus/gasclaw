// Pedido do dono (2026-09-21): "não consigo diferenciar o que é um agente do outro, preciso que fique
// identificado junto de gasclaw no topo o nome do agente, um id".
//
// Com a F7 existem DOIS motores servindo o MESMO agente — o titular e o sucessor. O nome do agente é
// igual nos dois (`gasclaw-assistente`, porque o sucessor serve o mesmo agente), então o nome SOZINHO
// não diferencia nada. O que diferencia é o MOTOR: o id dele, e se é titular ou sucessor.
import { describe, expect, test } from 'vitest';
import { engineIdentity, shortId } from '../src/identity';

describe('engineIdentity: o topo do painel diz qual motor é este', () => {
  test('titular: nome do agente e o id do motor', () => {
    const i = engineIdentity('1b93M1aw9_NuPxXfsZvifBIlUF', 'gasclaw-assistente', null);
    expect(i.role).toBe('incumbent');
    expect(i.line).toBe('gasclaw-assistente · engine 1b93M1aw');
  });

  // O CASO QUE O DONO NÃO CONSEGUIA DISTINGUIR: mesmo agente, outro motor.
  test('sucessor: diz que é sucessor, o id DELE e de quem ele sucede', () => {
    const i = engineIdentity('1w3Pju8vyj9y1ZgBIZZDDtgRAX', 'gasclaw-assistente', '1b93M1aw9_NuPxXfsZvifBIlUF');
    expect(i.role).toBe('successor');
    expect(i.line).toBe('gasclaw-assistente · successor 1w3Pju8v · of 1b93M1aw');
  });

  test('titular e sucessor do MESMO agente saem com rótulos diferentes', () => {
    const a = engineIdentity('1b93M1aw9_NuPx', 'gasclaw-assistente', null).line;
    const b = engineIdentity('1w3Pju8vyj9y1Z', 'gasclaw-assistente', '1b93M1aw9_NuPx').line;
    expect(a).not.toBe(b);
  });

  test('sem agente, diz isso em vez de ficar em branco', () => {
    expect(engineIdentity('1b93M1aw9_NuPx', null, null).line).toBe('no agent · engine 1b93M1aw');
  });

  test('o id curto são os 8 primeiros caracteres', () => {
    expect(shortId('1w3Pju8vyj9y1ZgBIZZDDtgRAX')).toBe('1w3Pju8v');
    expect(shortId('')).toBe('');
  });
});

// A FIAÇÃO: o servidor manda a identidade, o topo e a aba mostram — e sem virar marcação.
import { readFileSync } from 'node:fs';
describe('fiação: o topo e a aba dizem qual motor é este', () => {
  const main = readFileSync('src/main.ts', 'utf8');
  const tela = readFileSync('src/settings.html', 'utf8');
  test('settingsState manda a identidade do motor', () => expect(main).toMatch(/identity: engineIdentity\(ScriptApp\.getScriptId\(\)/));
  test('o título da aba leva o motor', () => expect(main).toMatch(/const title = \(s: string\) => `\$\{s\} · \$\{panelEnv\(\)\} · \$\{quem\.agent\}/));
  test('o topo mostra a linha de identidade', () => expect(tela).toContain("$('identity').textContent = s.identity.line"));
  // O nome do agente vem de uma Property: innerHTML deixaria um nome virar marcação na tela do dono.
  test('a identidade entra por textContent, nunca innerHTML', () => expect(tela).not.toMatch(/\$\('identity'\)\.innerHTML/));
});
