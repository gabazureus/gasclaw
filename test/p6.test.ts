import { expect, test } from 'vitest';
import { checkMarkdown } from '../poc/p6-docs-nativos/harness';

test('C4: reconhece títulos H1–H3, lista com marcadores aninhada e lista numerada', () => {
  const md = '# Alma\n\n## Tom\n\n### Exemplos\n\n* item A\n    * item A.1\n* item B\n\n1. primeiro\n2. segundo\n\nTexto com **negrito**.\n';
  expect(checkMarkdown(md)).toEqual({ h1: true, h2: true, h3: true, bullets: true, nested: true, numbered: true, bold: true, pass: true });
});

test('C4: texto sem estrutura não passa', () => {
  const r = checkMarkdown('Alma\nTom\nitem A\nprimeiro');
  expect(r.pass).toBe(false);
  expect(r.h1).toBe(false);
});
