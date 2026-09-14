// Bundle IIFE + stubs globais (padrão labnol/apps-script-starter, MIT) para o GAS enxergar as funções.
import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'gasclaw',
  target: 'es2020',
  outfile: 'dist/Code.js',
  minify: false,
});
const names = [...readFileSync('src/main.ts', 'utf8').matchAll(/^export function (\w+)/gm)].map((m) => m[1]);
if (names.length === 0) throw new Error('build: nenhum "export function" em src/main.ts');
appendFileSync('dist/Code.js', '\n' + names.map((n) => `function ${n}(...a) { return gasclaw.${n}(...a); }`).join('\n') + '\n');
copyFileSync('appsscript.json', 'dist/appsscript.json');
copyFileSync('src/settings.html', 'dist/settings.html');
console.log(`build: dist/Code.js com ${names.length} funções globais: ${names.join(', ')}`);
