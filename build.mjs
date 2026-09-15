// Bundle IIFE + stubs globais (padrão labnol/apps-script-starter, MIT) para o GAS enxergar as funções.
// Saída: um único arquivo de motor (`_motor.gs` no editor, primeiro da lista) + settings.html + appsscript.json.
import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, appendFileSync, rmSync } from 'node:fs';

const BANNER = '// gasclaw · MOTOR · NÃO EDITE: gerado pelo build e substituído a cada ./gasclaw up. Edite os agentes em agentes/<nome>/<PAPEL>.md ou na pasta do Drive.';

rmSync('dist', { recursive: true, force: true }); // sem sobras (ex.: o antigo Code.js) no push --force
mkdirSync('dist', { recursive: true });
await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'gasclaw',
  target: 'es2020',
  outfile: 'dist/_motor.js',
  banner: { js: BANNER },
  define: { __GCP_NUMBER__: JSON.stringify(process.env.GCP_NUMBER ?? '') }, // Monitoring (ADR-016); vazio fora do deploy
  minify: false,
});
const names = [...readFileSync('src/main.ts', 'utf8').matchAll(/^export function (\w+)/gm)].map((m) => m[1]);
if (names.length === 0) throw new Error('build: nenhum "export function" em src/main.ts');
appendFileSync('dist/_motor.js', '\n' + names.map((n) => `function ${n}(...a) { return gasclaw.${n}(...a); }`).join('\n') + '\n');
copyFileSync('appsscript.json', 'dist/appsscript.json');
copyFileSync('src/settings.html', 'dist/settings.html');
copyFileSync('src/chat.html', 'dist/chat.html'); // tela de conversa (doGet?page=chat)
console.log(`build: dist/_motor.js com ${names.length} funções globais: ${names.join(', ')}`);
