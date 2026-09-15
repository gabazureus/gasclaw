// ./gasclaw eval [cenário...|--all] → roda evals/*.md no web app do dev (action=eval) e sai ≠ 0 se algum falhar.
// Uso direto: node scripts/eval.mjs <url do web app> [cenário...|--all] [--model <id>]
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';

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

const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
let failed = 0;
for (const n of names) {
  const params = ['-fsSL', '-G', '-H', `Authorization: Bearer ${token}`, '--data-urlencode', 'action=eval', '--data-urlencode', `md@evals/${n}.md`];
  if (model) params.push('--data-urlencode', `model=${model}`);
  let r;
  try {
    const body = execFileSync('curl', [...params, url], { encoding: 'utf8', maxBuffer: 10 << 20 });
    r = JSON.parse(body);
  } catch (err) {
    r = { ok: false, error: String(err.message ?? err).slice(0, 300) };
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
