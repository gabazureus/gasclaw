import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('chat.html: resposta do modelo só por textContent, sem innerHTML/eval, sem chave e sem microfone', () => {
  const html = readFileSync('src/chat.html', 'utf8');
  expect(html).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|document\.write/);
  expect(html).not.toMatch(/sk-[A-Za-z0-9]/);
  expect(html).not.toContain('getUserMedia'); // ADR-019: o iframe do HtmlService não delega microphone
  // A tela passou a conversar pelo run durável (ADR-026): pedir, acompanhar e decidir.
  for (const fn of ['runAsk', 'runState', 'runDecide']) expect(html).toContain(`'${fn}'`);
  expect(html).toContain('params.token = r.approvalToken');
  expect(html).toContain("call('runState', id, approvalToken)");
});
