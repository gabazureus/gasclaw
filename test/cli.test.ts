import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { cliAuthorized, MUTATING, safeEqual, validSecret } from '../src/cli';

const S = 'a'.repeat(64);

describe('segredo da CLI (M1: CSRF)', () => {
  test('safeEqual compara o conteúdo inteiro e recusa tamanhos diferentes', () => {
    expect(safeEqual(S, S)).toBe(true);
    expect(safeEqual(S, `${'a'.repeat(63)}b`)).toBe(false);
    expect(safeEqual(S, 'a'.repeat(63))).toBe(false);
  });
  test('cliAuthorized: sem segredo guardado, sem segredo enviado ou segredo errado = não', () => {
    expect(cliAuthorized(S, S)).toBe(true);
    expect(cliAuthorized(null, S)).toBe(false);
    expect(cliAuthorized(S, undefined)).toBe(false);
    expect(cliAuthorized(S, '')).toBe(false);
    expect(cliAuthorized(S, 'b'.repeat(64))).toBe(false);
  });
  test('validSecret: 64 caracteres hexadecimais (openssl rand -hex 32)', () => {
    expect(validSecret('0123456789abcdef'.repeat(4))).toBe(true);
    expect(validSecret('xyz')).toBe(false);
    expect(validSecret('G'.repeat(64))).toBe(false);
  });
  // Lista fixa de propósito: criar uma ação com efeito tem de quebrar este teste, para ninguém deixá-la acessível por GET.
  test('ações com efeito saem do GET', () => {
    expect([...MUTATING].sort()).toEqual(['capability', 'disable', 'drain', 'enable', 'eval', 'model', 'poc', 'step', 'tools']);
  });

  // O ESPELHO NO SHELL, que NUNCA teve teste. São duas listas porque o shell não lê TypeScript, e o
  // comentário no `gasclaw` já registra o estrago de divergirem: a ação sai por GET e o web app
  // responde 405 — foi o que aconteceu com `tools`. Um comentário pedindo atenção não é uma trava.
  test('a lista do shell é a MESMA do TypeScript', () => {
    const sh = readFileSync('gasclaw', 'utf8').match(/case " ([a-z ]+) " in/)?.[1] ?? '';
    expect(sh.trim().split(/\s+/).sort()).toEqual([...MUTATING].sort());
  });
});
