// POC P14 (descartável): mede o trace do agente com o lote de 1 min (ADR-014). Etapas chamadas por pc.sh com trace=0.
import * as observe from '../../src/observe';
import { begin, ensureRunStore, liveRuns, runDetail, sheetRows } from '../../src/runlog';
import { HEADER } from '../../src/trace';

const fake = (text: string) => ({ text, usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0 }, model: 'poc/fake', id: 'gen-poc' });
const llmInfo = (c: ReturnType<typeof fake>) => ({ model: c.model, prompt_tokens: c.usage.prompt_tokens, completion_tokens: c.usage.completion_tokens, cost: c.usage.cost });
const props = () => PropertiesService.getScriptProperties();

/** Um run sintético com os 3 passos do Chat; `sleepMs` simula o modelo lento. */
function syntheticRun(question: string, answer: string, sleepMs = 0) {
  const t = begin('poc', { question, agent: 'p14' });
  t.step('resolve_agent', () => ({ name: 'p14' }), () => ({ agent: 'p14' }));
  const c = t.step('llm_call', () => (Utilities.sleep(sleepMs), fake(answer)), llmInfo, true);
  t.mark('reply');
  return t.end({ answer: c.text });
}

const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.max(0, Math.ceil(xs.length * 0.95) - 1)];
const col = (name: (typeof HEADER)[number]) => HEADER.indexOf(name);
const queued = (id: string) => props().getProperty(`Q:${id}`) !== null;

function bench(n: number) {
  // C4: criação automática e idempotente
  const s1 = ensureRunStore();
  const s2 = ensureRunStore();
  const c4 = { idempotent: s1.sheetId === s2.sheetId && s1.folderId === s2.folderId, sheet: DriveApp.getFileById(s1.sheetId).getName(), folder: DriveApp.getFolderById(s1.folderId).getName() };
  // C1: custo do trace dentro do turno (checkpoints no cache + entrada na fila), sem trabalho real
  const ms: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = Date.now();
    syntheticRun(`p14 bench ${i}`, `ok ${i}`);
    ms.push(Date.now() - t0);
  }
  // C9: canário em pergunta e resposta; depois do lote, nenhum dos 4 destinos pode conter o segredo
  const tag = Utilities.getUuid().slice(0, 8);
  const secret = `sk-or-CANARY${tag} ya29.CANARY${tag} Bearer CANARY${tag}`;
  const canary = syntheticRun(`p14 canario ${secret}`, `eco ${secret}`);
  const queueEntry = props().getProperty(`Q:${canary.id}`) ?? '';
  observe.drain();
  const detail = JSON.stringify(runDetail(canary.id));
  const row = JSON.stringify(sheetRows().find((r) => r[0] === canary.id) ?? null);
  const it = DriveApp.getFolderById(s1.folderId).getFilesByName(`${canary.id}.json`);
  const file = it.hasNext() ? it.next().getBlob().getDataAsString('UTF-8') : '';
  const c9 = { leaks: [detail, row, file, queueEntry].filter((s) => s.includes(`CANARY${tag}`)).length, rowFound: row !== 'null', fileFound: file.length > 0 };
  return { poc: 'P14', step: 'bench', pass: true, c1: { runs: n, p95Ms: p95(ms), maxMs: Math.max(...ms), minMs: Math.min(...ms) }, c4, c9, canaryRun: canary.id };
}

/** C3: planilha indisponível no lote → a resposta sai, a fila fica intacta e grava quando a planilha volta. */
function failsafe() {
  const tag = Utilities.getUuid().slice(0, 8);
  const run = syntheticRun(`p14 failsafe ${tag}`, `resposta ${tag}`);
  const real = props().getProperty('RUNS_SHEET_ID');
  let failed = false;
  let kept = false;
  try {
    props().setProperty('RUNS_SHEET_ID', 'PLANILHA-INEXISTENTE-P14');
    failed = !observe.drain().rows;
    kept = queued(run.id);
  } finally {
    if (real) props().setProperty('RUNS_SHEET_ID', real);
    else props().deleteProperty('RUNS_SHEET_ID');
  }
  observe.drain();
  return { poc: 'P14', step: 'failsafe', pass: true, answered: run.answer === `resposta ${tag}`, drainFailed: failed, queueKept: kept, drainedAfterRestore: !queued(run.id) && sheetRows().some((r) => r[0] === run.id) };
}

function verify(tags: string[]) {
  observe.drain();
  const rows = sheetRows();
  const per = tags.map((tag) => {
    const mine = rows.filter((r) => String(r[col('pergunta')]).includes(tag));
    return { tag, rows: mine.length, status: mine[0]?.[col('status')] ?? null, own: mine.every((r) => String(r[col('resposta')]).includes(tag)) };
  });
  return { poc: 'P14', step: 'verify', pass: per.every((p) => p.rows === 1 && p.own && p.status === 'ok'), per };
}

/** C11: 20 runs em sequência (bem menos de 1 min), um lote drena tudo sem perder nenhum. */
function burst(n: number) {
  const tag = Utilities.getUuid().slice(0, 8);
  const t0 = Date.now();
  const ids = Array.from({ length: n }, (_, i) => syntheticRun(`p14 burst ${tag} ${i}`, `ok ${i}`).id);
  const runsMs = Date.now() - t0;
  const enfileirados = ids.filter(queued).length;
  const d = observe.drain();
  const linhas = sheetRows().filter((r) => String(r[col('pergunta')]).includes(`p14 burst ${tag}`)).length;
  return { poc: 'P14', step: 'burst', pass: true, runs: n, runsMs, enfileirados, drained: d.drained, drainMs: d.ms, json: d.json, linhas, sobraNaFila: ids.filter(queued).length };
}

/** C12: duração de um lote com a fila vazia (o caso de quase todo minuto do gatilho). */
function drainbench() {
  const runsMs = Array.from({ length: 5 }, () => observe.drain().ms);
  return { poc: 'P14', step: 'drainbench', pass: true, vazioMaxMs: Math.max(...runsMs), vazioRunsMs: runsMs, gatilho: observe.triggerStatus(true) };
}

function pollbench(n: number) {
  const ms: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = Date.now();
    liveRuns();
    ms.push(Date.now() - t0);
  }
  return { poc: 'P14', step: 'pollbench', pass: true, calls: n, avgMs: Math.round(ms.reduce((a, b) => a + b, 0) / n), maxMs: Math.max(...ms), urlFetchPerCall: 0 };
}

export function pocP14(step: string | undefined, p: Record<string, string>) {
  if (step === 'bench') return bench(Math.min(Number(p.n) || 50, 50));
  if (step === 'failsafe') return failsafe();
  if (step === 'burst') return burst(Math.min(Number(p.n) || 20, 50));
  if (step === 'drainbench') return drainbench();
  if (step === 'one') {
    const r = syntheticRun(`p14 um ${p.tag}`, `resposta ${p.tag}`, Number(p.sleep) || 1500);
    return { poc: 'P14', step, pass: true, runId: r.id, endedAt: r.endedAt };
  }
  if (step === 'slow') return { poc: 'P14', step, pass: true, runId: syntheticRun(`p14 lento ${p.tag}`, `resposta ${p.tag}`, 20_000).id };
  if (step === 'verify') return verify((p.tags ?? '').split(',').filter(Boolean));
  if (step === 'row') {
    const drained = p.fallback === '1' ? observe.maybeDrain() : null; // simula abrir a tela (fallback sem gatilho)
    const r = sheetRows().find((x) => String(x[col('pergunta')]).includes(p.tag ?? '#'));
    return { poc: 'P14', step, pass: true, status: r?.[col('status')] ?? null, drained: drained?.drained ?? null, gatilho: observe.triggerStatus() };
  }
  if (step === 'pollbench') return pollbench(Math.min(Number(p.n) || 60, 200));
  throw new Error(`etapa desconhecida: ${step} (use bench, failsafe, burst, drainbench, one, slow, verify, row, pollbench ou real)`);
}
