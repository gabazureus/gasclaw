// ./gasclaw eval [cenário...|--all] → roda evals/*.md no web app do dev (action=eval) e sai ≠ 0 se algum falhar.
// Uso direto: node scripts/eval.mjs <url do web app> [cenário...|--all] [--model <id>]
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';

const [url, ...rest] = process.argv.slice(2);
const die = (m) => (console.error(`✗ ${m}`), process.exit(2));
if (!url?.startsWith('https://')) die('uso: ./gasclaw eval [cenário...|--all] [--model <id>]');
const mi = rest.indexOf('--model');
const model = mi >= 0 ? rest[mi + 1] : '';
if (mi >= 0 && !/^[\w./:-]+$/.test(model ?? '')) die('--model inválido');
const args = mi >= 0 ? rest.filter((_, i) => i !== mi && i !== mi + 1) : rest;
const all = readdirSync('evals').filter((f) => f.endsWith('.md') && f !== 'README.md').map((f) => f.slice(0, -3)).sort();
const names = args.includes('--all') ? all : args;
if (!names.length) die(`diga o cenário ou --all. Cenários: ${all.join(', ')}`);
for (const n of names) if (!/^[a-z0-9-]+$/.test(n) || !existsSync(`evals/${n}.md`)) die(`cenário desconhecido: ${n} (existem: ${all.join(', ')})`);
// o cenário vai no corpo do POST (M1); o teto de 2 KB fica para os cenários continuarem curtos e legíveis.
const MAX_MD = 2048;
for (const n of names) if (statSync(`evals/${n}.md`).size > MAX_MD) die(`evals/${n}.md passa de ${MAX_MD} bytes: encurte o cenário`);

let token = '';
try {
  token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
} catch {
  die('login do gcloud expirado: rode `gcloud auth login --enable-gdrive-access` e tente de novo');
}
const secret = process.env.CLI_SECRET ?? '';
if (!/^[0-9a-f]{64}$/.test(secret)) die('sem CLI_SECRET no .env.local: rode ./gasclaw up (ele gera e registra o segredo)');
let failed = 0;
for (const n of names) {
  // M1: eval é ação com efeito → POST. Token e segredo vão pelo stdin (--config -): nunca em `ps`, na URL ou no erro.
  const params = ['-fsSL', '--config', '-', '--data-urlencode', 'action=eval', '--data-urlencode', `md@evals/${n}.md`];
  if (model) params.push('--data-urlencode', `model=${model}`);
  let r;
  try {
    const config = `header = "Authorization: Bearer ${token}"\ndata-urlencode = "secret=${secret}"\n`;
    const body = execFileSync('curl', [...params, url], { input: config, encoding: 'utf8', maxBuffer: 10 << 20, stdio: ['pipe', 'pipe', 'pipe'] });
    try {
      r = JSON.parse(body);
    } catch {
      r = { ok: false, error: `resposta não é JSON: ${body.slice(0, 200)}` };
    }
  } catch (err) {
    r = { ok: false, error: `curl saiu com ${err.status}: ${String(err.stderr ?? '').trim().slice(0, 200)}` };
  }
  if (!r.ok || !r.pass) failed++;
  if (!r.ok) {
    console.log(`\x1b[31m✗ ${n}\x1b[0m erro: ${r.error}`);
    continue;
  }
  console.log(`${r.pass ? '\x1b[32m✓' : '\x1b[31m✗'} ${n}\x1b[0m · ${r.ms} ms`);
  for (const c of r.checks) console.log(`   ${c.pass ? '✓' : '✗'} ${c.check}`);
  if (r.judge) console.log(`   ${r.judge.pass ? '✓' : '~'} juiz (soft): ${r.judge.reason}`);
  for (const t of r.replies) console.log(`   resposta: ${t.replace(/\s+/g, ' ').slice(0, 160)}`);
}
console.log(failed ? `\x1b[31m${failed} de ${names.length} falharam\x1b[0m` : `\x1b[32m${names.length} de ${names.length} passaram\x1b[0m`);
process.exit(failed ? 1 : 0);
