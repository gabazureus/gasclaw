// Bundle IIFE + stubs globais (padrão labnol/apps-script-starter, MIT) para o GAS enxergar as funções.
// Saída: um único arquivo de motor (`_motor.gs` no editor, primeiro da lista) + settings.html + chat.html + appsscript.json.
// OUT_DIR (padrão dist): os testes geram numa pasta temporária e nunca tocam o dist/ que o deploy vai publicar.
import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, appendFileSync, rmSync, writeFileSync } from 'node:fs';

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
    __CHAT_SA_EMAIL__: JSON.stringify(process.env.CHAT_SA_EMAIL ?? ''), // P2: identidade do app; nunca e uma chave
    __DEV__: JSON.stringify(process.env.GASCLAW_DEV === '1'), // POCs só respondem no build do dev (M1)
    __ENV__: JSON.stringify(process.env.GASCLAW_ENV ?? ''), // P21: rótulo do ambiente no painel
    __SIBLING_URL__: JSON.stringify(process.env.SIBLING_URL ?? ''), // P21: link para o painel irmão; navegação, nunca leitura do outro ambiente
  },
  minify: false,
});
// O Apps Script só enxerga funções no escopo global, e o bundle é um módulo: cada export do main.ts precisa de
// um invólucro. A lista saía de um regex que só casava `export function` — uma global escrita como
// `export const x = () => …` ficava de fora, o build passava, o deploy passava, e o Apps Script dizia
// "function not found" em produção. Agora as duas formas contam.
// O CONJUNTO-JUIZ ENTRA NO BUNDLE. Sem isto a frase "o juiz vem do build" e aspiracional: os cenarios
// viviam so no PC e o motor, rodando no gatilho, nao enxergaria o proprio juiz. O `holdout` entra tambem
// — ele nao participa da selecao (o plano nao o inclui), mas precisa existir para responder depois se a
// linhagem melhorou.
const evalsDir = 'evals';
const cenarios = readdirSync(evalsDir)
  .filter((f) => f.endsWith('.md'))
  .map((f) => {
    const md = readFileSync(`${evalsDir}/${f}`, 'utf8');
    const m = md.match(/^set:\s*(gate|quality|holdout)\s*$/m);
    return { name: f.replace(/\.md$/, ''), set: m ? m[1] : 'gate', md };
  })
  .sort((a, b) => a.name.localeCompare(b.name));
// Sem `set` declarado o cenario cai em `gate`, que e o conjunto ABSOLUTO: errar para o lado estrito e
// errar para o lado seguro, e um cenario mal marcado reprova em vez de passar despercebido.
{
  const bundle = readFileSync(`${OUT}/_motor.js`, 'utf8');
  // `var` e nao `const`: e assim que o esbuild emite o modulo. O build FALHA se o ponto sumir, em vez de
  // publicar um motor com o juiz vazio — um conjunto-juiz vazio faria todo candidato "passar" em nada.
  const alvo = 'var SCENARIOS = [];';
  if (!bundle.includes(alvo)) throw new Error('build: nao achei o ponto de injecao do conjunto-juiz em _motor.js (o esbuild mudou a forma da declaracao?)');
  if (cenarios.length === 0) throw new Error('build: nenhum cenario em evals/ — o motor nao pode publicar sem juiz');
  writeFileSync(`${OUT}/_motor.js`, bundle.replace(alvo, `const SCENARIOS = ${JSON.stringify(cenarios)};`));
  console.log(`build: ${cenarios.length} cenarios embutidos (${cenarios.filter((c) => c.set === 'gate').length} gate, ${cenarios.filter((c) => c.set === 'quality').length} quality, ${cenarios.filter((c) => c.set === 'holdout').length} holdout)`);
}

const src = readFileSync('src/main.ts', 'utf8');
const names = [
  ...[...src.matchAll(/^export function (\w+)/gm)].map((m) => m[1]),
  ...[...src.matchAll(/^export const (\w+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:<[^>]*>)?\(/gm)].map((m) => m[1]),
];
if (names.length === 0) throw new Error('build: no callable export in src/main.ts');
appendFileSync(`${OUT}/_motor.js`, '\n' + names.map((n) => `function ${n}(...a) { return gasclaw.${n}(...a); }`).join('\n') + '\n');
const manifest = JSON.parse(readFileSync('appsscript.json', 'utf8'));
const iamScope = 'https://www.googleapis.com/auth/iam';
manifest.oauthScopes = (manifest.oauthScopes ?? []).filter((scope) => scope !== iamScope);
if (process.env.GASCLAW_DEV === '1') manifest.oauthScopes.push(iamScope); // P2 existe somente no dev ate a POC aprovar
writeFileSync(`${OUT}/appsscript.json`, JSON.stringify(manifest, null, 2) + '\n');
copyFileSync('src/settings.html', `${OUT}/settings.html`);
copyFileSync('src/chat.html', `${OUT}/chat.html`); // tela de conversa (doGet?page=chat)
copyFileSync('src/hub.html', `${OUT}/hub.html`); // hub de painéis (doGet?page=hub)
console.log(`build: ${OUT}/_motor.js with ${names.length} global functions: ${names.join(', ')}`);
