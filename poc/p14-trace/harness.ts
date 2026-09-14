// POC P14 (descartável): mede o trace do agente no runtime. Etapas chamadas por pc.sh com trace=0.
import { begin, ensureRunStore, liveRuns, runDetail, sheetRows } from '../../src/runlog';
import { HEADER } from '../../src/trace';

const fake = (text: string) => ({ text, usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0 }, model: 'poc/fake', id: 'gen-poc' });
const llmInfo = (c: ReturnType<typeof fake>) => ({ model: c.model, prompt_tokens: c.usage.prompt_tokens, completion_tokens: c.usage.completion_tokens, cost: c.usage.cost });

/** Um run sintético com os 3 passos do Chat; `sleepMs` simula o modelo lento. */
function syntheticRun(question: string, answer: string, sleepMs = 0, sheetId?: string) {
  const t = begin('poc', { question, agent: 'p14' }, { sheetId });
  t.step('resolve_agent', () => ({ name: 'p14' }), () => ({ agent: 'p14' }));
  const c = t.step('llm_call', () => (Utilities.sleep(sleepMs), fake(answer)), llmInfo, true);
  t.mark('reply');
  return t.end({ answer: c.text });
}

const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.max(0, Math.ceil(xs.length * 0.95) - 1)];
const col = (name: (typeof HEADER)[number]) => HEADER.indexOf(name);

function bench(n: number) {
  // C4: criação automática e idempotente
  const s1 = ensureRunStore();
  const s2 = ensureRunStore();
  const c4 = { idempotent: s1.sheetId === s2.sheetId && s1.folderId === s2.folderId, sheet: DriveApp.getFileById(s1.sheetId).getName(), folder: DriveApp.getFolderById(s1.folderId).getName() };
  // C1: custo do trace (checkpoint + flush) sem trabalho real
  const ms: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = Date.now();
    syntheticRun(`p14 bench ${i}`, `ok ${i}`);
    ms.push(Date.now() - t0);
  }
  // C3: planilha inexistente não derruba a resposta
  let c3: { answered: boolean; threw: string | null; status?: string };
  try {
    const r = syntheticRun('p14 falha de gravação', 'resposta mesmo sem planilha', 0, 'PLANILHA-INEXISTENTE');
    c3 = { answered: r.answer === 'resposta mesmo sem planilha', threw: null, status: r.status };
  } catch (err) {
    c3 = { answered: false, threw: (err as Error).message };
  }
  // C9: canário em pergunta e resposta; nenhum dos 3 destinos pode conter o segredo
  const tag = Utilities.getUuid().slice(0, 8);
  const secret = `sk-or-CANARY${tag} ya29.CANARY${tag} Bearer CANARY${tag}`;
  const canary = syntheticRun(`p14 canario ${secret}`, `eco ${secret}`);
  Utilities.sleep(1500);
  const detail = JSON.stringify(runDetail(canary.id));
  const row = JSON.stringify(sheetRows().find((r) => r[0] === canary.id) ?? null);
  const it = DriveApp.getFolderById(s1.folderId).getFilesByName(`${canary.id}.json`);
  const file = it.hasNext() ? it.next().getBlob().getDataAsString('UTF-8') : '';
  const c9 = { leaks: [detail, row, file].filter((s) => s.includes(`CANARY${tag}`)).length, rowFound: row !== 'null', fileFound: file.length > 0 };
  return { poc: 'P14', step: 'bench', pass: true, c1: { runs: n, p95Ms: p95(ms), maxMs: Math.max(...ms), minMs: Math.min(...ms) }, c3, c4, c9, canaryRun: canary.id };
}

function verify(tags: string[]) {
  const rows = sheetRows();
  const per = tags.map((tag) => {
    const mine = rows.filter((r) => String(r[col('pergunta')]).includes(tag));
    return { tag, rows: mine.length, status: mine[0]?.[col('status')] ?? null, own: mine.every((r) => String(r[col('resposta')]).includes(tag)) };
  });
  return { poc: 'P14', step: 'verify', pass: per.every((p) => p.rows === 1 && p.own && p.status === 'ok'), per };
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

/** Custo de cada primitiva da borda (5×, máximo), para achar o gargalo do C1 antes de mexer. */
function profile() {
  const time = (fn: () => unknown) => {
    const xs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      fn();
      xs.push(Date.now() - t0);
    }
    return { maxMs: Math.max(...xs), runsMs: xs };
  };
  const c = CacheService.getScriptCache();
  const big = JSON.stringify({ spans: Array.from({ length: 5 }, (_, i) => ({ name: `s${i}`, data: 'x'.repeat(200) })) });
  const auth = { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` };
  const { sheetId } = ensureRunStore();
  const sheets = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values`;
  let range = '';
  return {
    poc: 'P14',
    step: 'profile',
    pass: true,
    propsGet: time(() => PropertiesService.getScriptProperties().getProperty('RUNS_SHEET_ID')),
    ensureRunStore: time(() => ensureRunStore()),
    cachePut: time(() => c.put('p14:profile', big, 60)),
    cacheGet: time(() => c.get('p14:profile')),
    lock: time(() => {
      const l = LockService.getScriptLock();
      l.tryLock(3000);
      l.releaseLock();
    }),
    sheetAppend: time(() => {
      const r = UrlFetchApp.fetch(`${sheets}/A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ values: [['p14-profile']] }), headers: auth, muteHttpExceptions: true });
      range = JSON.parse(r.getContentText()).updates?.updatedRange ?? '';
    }),
    sheetUpdate: time(() => UrlFetchApp.fetch(`${sheets}/${encodeURIComponent(range)}?valueInputOption=RAW`, { method: 'put', contentType: 'application/json', payload: JSON.stringify({ values: [['p14-profile-upd']] }), headers: auth, muteHttpExceptions: true })),
    newRunId: time(() => Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyyMMdd-HHmmss') + Utilities.getUuid().slice(0, 4)),
    jsonUpload: time(() => {
      const b = `p14${Date.now()}`;
      const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: 'p14-profile.json', parents: [ensureRunStore().folderId] })}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${big}\r\n--${b}--`;
      UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'post', contentType: `multipart/related; boundary=${b}`, payload: body, headers: auth, muteHttpExceptions: true });
    }),
    driveCreateFile: time(() => DriveApp.getFolderById(ensureRunStore().folderId).createFile('p14-profile-dap.json', big, 'application/json')),
    fullRun: time(() => syntheticRun('p14 profile', 'ok')),
  };
}

export function pocP14(step: string | undefined, p: Record<string, string>) {
  if (step === 'profile') return profile();
  if (step === 'bench') return bench(Math.min(Number(p.n) || 50, 50));
  if (step === 'one') return { poc: 'P14', step, pass: true, runId: syntheticRun(`p14 simultaneo ${p.tag}`, `resposta ${p.tag}`, 1500).id };
  if (step === 'slow') return { poc: 'P14', step, pass: true, runId: syntheticRun(`p14 lento ${p.tag}`, `resposta ${p.tag}`, 20_000).id };
  if (step === 'verify') return verify((p.tags ?? '').split(',').filter(Boolean));
  if (step === 'row') {
    const r = sheetRows().find((x) => String(x[col('pergunta')]).includes(p.tag ?? '#'));
    return { poc: 'P14', step, pass: true, status: r?.[col('status')] ?? null, startedAt: r?.[col('início')] ?? null };
  }
  if (step === 'pollbench') return pollbench(Math.min(Number(p.n) || 60, 200));
  throw new Error(`etapa desconhecida: ${step} (use bench, one, slow, verify, row, pollbench ou real)`);
}
