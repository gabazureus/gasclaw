// ./gasclaw eval [cenário...|--all] → roda evals/*.md no web app do dev (action=eval) e sai ≠ 0 se algum falhar.
// Uso direto: node scripts/eval.mjs <url do web app> [cenário...|--all] [--model <id>]
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';

const [url, ...rest] = process.argv.slice(2);
const die = (m) => (console.error(`✗ ${m}`), process.exit(2));
if (!url?.startsWith('https://')) die('uso: ./gasclaw eval [cenário...|--all] [--model <id>]');
const mi = rest.indexOf('--model');
const model = mi >= 0 ? rest[mi + 1] : '';
if (mi >= 0 && !/^[\w./:-]+$/.test(model ?? '')) die('--model inválido');
const args = mi >= 0 ? rest.filter((_, i) => i !== mi && i !== mi + 1) : rest;
const all = readdirSync('evals').filter((f) => f.endsWith('.md') && f !== 'README.md').map((f) => f.slice(0, -3)).sort();
// cenário com `offline: true` roda só no npm test (ferramenta simulada); fica fora do --all e é recusado por nome
const offline = (n) => /^offline:\s*true\s*$/m.test(readFileSync(`evals/${n}.md`, 'utf8'));
const names = args.includes('--all') ? all.filter((n) => !offline(n)) : args;
if (!names.length) die(`diga o cenário ou --all. Cenários: ${all.join(', ')}`);
for (const n of names) if (!/^[a-z0-9-]+$/.test(n) || !existsSync(`evals/${n}.md`)) die(`cenário desconhecido: ${n} (existem: ${all.join(', ')})`);
for (const n of names) if (offline(n)) die(`${n} é offline (ferramenta simulada): roda no npm test, não no dev`);
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
// A resposta vem por 302 para script.googleusercontent.com/…/echo, que exige o token e vale uma vez: o salto é manual,
// com o token, e só para esse host. Mesmo assim o echo às vezes perde a resposta (404), sem relação com a duração
// (ADR-020): cada eval leva um job aleatório; o servidor executa uma vez por job e guarda o resultado, que buscamos por GET.
const W = '\n%{http_code} %{redirect_url}';
const opts = { encoding: 'utf8', maxBuffer: 10 << 20, stdio: ['pipe', 'pipe', 'pipe'] };
const tokenCfg = `header = "Authorization: Bearer ${token}"\n`;
const split = (out) => {
  const i = out.lastIndexOf('\n');
  const [code, loc = ''] = out.slice(i + 1).split(' ');
  return { body: out.slice(0, i), code, loc };
};
const hop = (args, input) => {
  let res = split(execFileSync('curl', args, { ...opts, input }));
  if (res.code === '302') {
    if (!res.loc.startsWith('https://script.googleusercontent.com/')) throw Object.assign(new Error('redirect'), { status: 22, stderr: 'redirecionamento para host inesperado recusado' });
    res = split(execFileSync('curl', ['-sS', '--config', '-', '-o', '-', '-w', W, res.loc], { ...opts, input: tokenCfg }));
  }
  return res;
};
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const readJob = (job) => {
  const base = url.split('?')[0];
  const t0 = Date.now();
  let unknownSince = t0;
  while (Date.now() - t0 < 360_000) {
    sleep(5000);
    let g;
    try {
      g = hop(['-sS', '--config', '-', '-o', '-', '-w', W, `${base}?action=job&id=${job}`], tokenCfg);
    } catch {
      continue;
    }
    if (g.code !== '200') continue;
    let j;
    try {
      j = JSON.parse(g.body);
    } catch {
      continue;
    }
    if (j.status === 'done') return JSON.stringify(j.result);
    if (j.status !== 'unknown') unknownSince = Date.now();
    else if (Date.now() - unknownSince >= 60_000) break;
  }
  throw Object.assign(new Error('job'), { status: 22, stderr: `a resposta se perdeu e o job ${job} ficou sem resultado` });
};

let failed = 0;
for (const n of names) {
  // M1: eval é ação com efeito → POST. Token e segredo vão pelo stdin (--config -): nunca em `ps`, na URL ou no erro.
  const job = randomBytes(8).toString('hex');
  const params = ['-sS', '--config', '-', '-o', '-', '-w', W, '--data-urlencode', 'action=eval', '--data-urlencode', `md@evals/${n}.md`, '--data-urlencode', `job=${job}`];
  if (model) params.push('--data-urlencode', `model=${model}`);
  let r;
  try {
    let body;
    let first;
    try {
      first = hop([...params, url], `${tokenCfg}data-urlencode = "secret=${secret}"\n`);
    } catch (err) {
      if (err.stderr === 'redirecionamento para host inesperado recusado') throw err;
      first = { code: 'erro' };
    }
    if (first.code === '200') body = first.body;
    else {
      console.error(`   a resposta de ${n} se perdeu no Google (HTTP ${first.code}): buscando o resultado do job ${job}`);
      body = readJob(job);
    }
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
  for (const e of r.errors ?? []) console.log(`   erro de tool: ${e}`);
  if (r.cleanup) console.log(`   limpeza: ${r.cleanup.removed} apagado(s)${r.cleanup.missing ? `, ${r.cleanup.missing} já não existia(m)` : ''}${r.cleanup.failed.length ? `; FALHOU: ${r.cleanup.failed.join(' | ')}` : ''}`);
  for (const t of r.replies) console.log(`   resposta: ${t.replace(/\s+/g, ' ').slice(0, 160)}`);
}
console.log(failed ? `\x1b[31m${failed} de ${names.length} falharam\x1b[0m` : `\x1b[32m${names.length} de ${names.length} passaram\x1b[0m`);
process.exit(failed ? 1 : 0);
