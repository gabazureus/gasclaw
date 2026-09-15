import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('chat.html: resposta do modelo só por textContent, sem innerHTML/eval, sem chave e sem microfone', () => {
  const html = readFileSync('src/chat.html', 'utf8');
  expect(html).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|document\.write/);
  expect(html).not.toMatch(/sk-[A-Za-z0-9]/);
  expect(html).not.toContain('getUserMedia'); // ADR-019: o iframe do HtmlService não delega microphone
  for (const fn of ['chatSend', 'chatClick']) expect(html).toContain(`'${fn}'`);
});
