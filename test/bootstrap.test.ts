import { describe, expect, test } from 'vitest';
import { BOOTSTRAP_FILE, BOOTSTRAP_MAX, bootstrapDone, bootstrapMessage, shouldBootstrap } from '../src/bootstrap';

describe('quando o ritual de estreia roda', () => {
  test('só com arquivo, histórico vazio e DM do dono', () => {
    expect(shouldBootstrap('# Olá', 0, true)).toBe(true);
    expect(shouldBootstrap('# Olá', 2, true)).toBe(false); // conversa já começou
    expect(shouldBootstrap('# Olá', 0, false)).toBe(false); // num espaço, não
    expect(shouldBootstrap(null, 0, true)).toBe(false); // agente sem BOOTSTRAP.md
    expect(shouldBootstrap('   ', 0, true)).toBe(false); // arquivo vazio
  });
});

describe('mensagem do ritual', () => {
  test('entra como conteúdo da pasta, com o texto do arquivo e o que fazer', () => {
    const msg = bootstrapMessage('Pergunte o nome e como a pessoa gosta de ser tratada.');
    expect(msg).toContain(BOOTSTRAP_FILE);
    expect(msg).toContain('Pergunte o nome');
    expect(msg).toContain('memory.save');
    expect(msg).toContain('duas perguntas curtas');
  });
  test('arquivo gigante é cortado', () => {
    expect(bootstrapMessage('x'.repeat(BOOTSTRAP_MAX + 500)).length).toBeLessThan(BOOTSTRAP_MAX + 400);
  });
});

describe('quando o ritual termina', () => {
  test('termina quando o agente gravou na memória; senão fica para a próxima conversa', () => {
    expect(bootstrapDone(['memory.save'])).toBe(true);
    expect(bootstrapDone(['now', 'memory.save'])).toBe(true);
    expect(bootstrapDone([])).toBe(false);
    expect(bootstrapDone(['memory.read'])).toBe(false);
  });
});
