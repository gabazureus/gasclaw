import { describe, expect, test } from 'vitest';
import { redact } from '../src/trace';

describe('redact: formatos de segredo além de sk-or-, sk-proj-, sk-, ya29. e Bearer', () => {
  test.each([
    ['bearer minúsculo', 'authorization: bearer abc.SECRET-123_xyz'],
    ['Bearer codificado na URL', 'Authorization=Bearer%20SECRETtoken123'],
    ['Basic', 'Authorization: Basic dXNlcjpSECRETxMjM0NQ=='],
    ['sk- depois de sublinhado', 'chave_sk-SECRETabcdefghijklmnop'],
    ['refresh token do Google', 'token 1//0gSECRETabcdefghijklmnopqrstuvwxyz'],
  ])('%s', (_nome, s) => {
    expect(redact(s)).not.toContain('SECRET');
  });

  test('segredo usado como chave de objeto também sai', () => {
    expect(JSON.stringify(redact({ 'sk-or-v1-SECRETabcdef': 1 }))).not.toContain('SECRET');
  });

  test('palavras comuns continuam intactas', () => {
    expect(redact('desk-top, risk-free e basic idea')).toBe('desk-top, risk-free e basic idea');
  });
});
