import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('build gera Code.js com stub global para cada export de main.ts', () => {
  execSync('node build.mjs', { stdio: 'pipe' });
  const code = readFileSync('dist/Code.js', 'utf8');
  expect(code).toContain('var gasclaw');
  expect(code).toMatch(/function doGet\(\.\.\.a\) \{ return gasclaw\.doGet\(\.\.\.a\); \}/);
  expect(readFileSync('dist/appsscript.json', 'utf8')).toContain('"chat"');
});
