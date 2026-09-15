// Bundle IIFE + stubs globais (padrão labnol/apps-script-starter, MIT) para o GAS enxergar as funções.
// Saída: um único arquivo de motor (`_motor.gs` no editor, primeiro da lista) + settings.html + chat.html + appsscript.json.
// OUT_DIR (padrão dist): os testes geram numa pasta temporária e nunca tocam o dist/ que o deploy vai publicar.
import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, appendFileSync, rmSync } from 'node:fs';

const OUT = process.env.OUT_DIR || 'dist';
const BANNER = '// gasclaw · MOTOR · NÃO EDITE: gerado pelo build e substituído a cada ./gasclaw up. Edite os agentes em agentes/<nome>/<PAPEL>.md ou na pasta do Drive.';

rmSync(OUT, { recursive: true, force: true }); // sem sobras (ex.: o antigo Code.js) no push --force
mkdirSync(OUT, { recursive: true });
await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'gasclaw',
  target: 'es2020',
  outfile: `${OUT}/_motor.js`,
  banner: { js: BANNER },
  define: {
    __GCP_NUMBER__: JSON.stringify(process.env.GCP_NUMBER ?? ''), // Monitoring (ADR-016); vazio fora do deploy
    __DEV__: JSON.stringify(process.env.GASCLAW_DEV === '1'), // POCs só respondem no build do dev (M1)
  },
  minify: false,
});
const names = [...readFileSync('src/main.ts', 'utf8').matchAll(/^export function (\w+)/gm)].map((m) => m[1]);
if (names.length === 0) throw new Error('build: nenhum "export function" em src/main.ts');
appendFileSync(`${OUT}/_motor.js`, '\n' + names.map((n) => `function ${n}(...a) { return gasclaw.${n}(...a); }`).join('\n') + '\n');
copyFileSync('appsscript.json', `${OUT}/appsscript.json`);
copyFileSync('src/settings.html', `${OUT}/settings.html`);
copyFileSync('src/chat.html', `${OUT}/chat.html`); // tela de conversa (doGet?page=chat)
console.log(`build: ${OUT}/_motor.js com ${names.length} funções globais: ${names.join(', ')}`);
