// POC P3 (pump barato): coleta no dev. O veredito puro mora em verdict.ts; aqui só se mede.
// Em etapas, porque cada uma precisa esperar o gatilho de 1 min e a execução do GAS tem teto de 6 min.
import { newRun } from '../../src/run';
import { runIO } from '../../src/runStore';
import * as observe from '../../src/observe';
import * as store from '../../src/store';
import { p3Verdict, type P3Input, type ProcessReading, type StepZero } from './verdict';

const PARTIAL = 'poc:p3';
const SIX_HOURS = 21_600;
const WAKE_MS = 80_000; // um ciclo do gatilho de 1 min, com folga

type Partial3 = { stepZero?: StepZero; idleMs?: { normal: number; afterBatch: number }; quota?: { projectedMsPerDay: number; limitMsPerDay: number } };

const read = (): ProcessReading => {
  const by = observe.processesByType();
  return { triggerMsToday: by.TIME_DRIVEN?.ms ?? 0, count: by.TIME_DRIVEN?.n ?? 0 };
};
const webapp = (): { n: number; ms: number } => observe.processesByType().WEBAPP ?? { n: 0, ms: 0 };
const partial = (): Partial3 => JSON.parse(CacheService.getScriptCache().get(PARTIAL) ?? '{}');
const savePartial = (p: Partial3) => CacheService.getScriptCache().put(PARTIAL, JSON.stringify(p), SIX_HOURS);

/**
 * Passo zero: 1 run na fila, 1 ciclo de gatilho, e a pergunta que derruba (ou não) o desenho —
 * o TRABALHO rodou em execução comum (WEBAPP) ou dentro do gatilho (TIME_DRIVEN)?
 * Um passo de fallback do kickPump é legítimo e NÃO reprova: o que reprova é o caminho normal ser TIME_DRIVEN.
 */
function etapaZero(): { poc: 'P3'; step: 'zero'; workType: StepZero['workType']; before: ProcessReading; after: ProcessReading; webappDelta: number; progrediu: boolean } {
  const agent = store.listAgents()[0];
  if (!agent) throw new Error('nenhum agente cadastrado: cadastre um na tela antes de rodar a P3');
  const io = runIO();
  const before = read();
  const wBefore = webapp().n;
  const runId = `p3-${Date.now().toString(36)}`;
  const r = newRun({ runId, session: `${agent.folderId}:poc/p3`, folderId: agent.folderId, user: store.getOwner() ?? '', text: 'responda apenas: ok', now: Date.now() });
  io.enqueue(r, Date.now());
  Utilities.sleep(WAKE_MS); // deixa o gatilho de 1 min acordar e disparar o doPost
  const after = read();
  const depois = io.load(agent.folderId, runId);
  const progrediu = !!depois && depois.updatedAt > r.updatedAt;
  const webappDelta = webapp().n - wBefore; // conta a minha própria execução também: por isso o normal é >= 2
  const triggerMs = after.triggerMsToday - before.triggerMsToday;
  const wakes = Math.max(1, after.count - before.count);
  const workType: StepZero['workType'] = !progrediu ? 'DESCONHECIDO' : triggerMs > wakes * 2000 ? 'TIME_DRIVEN' : 'WEBAPP';
  io.dequeue(runId); // não deixa run de teste na fila
  savePartial({ ...partial(), stepZero: { before, after, workType } });
  return { poc: 'P3', step: 'zero', workType, before, after, webappDelta, progrediu };
}

/** C3: pump com fila vazia, em dois momentos — normal e logo depois de um lote grande do trace (pior caso). */
function etapaVazio(): { poc: 'P3'; step: 'vazio'; normal: number; afterBatch: number } {
  const medir = (): number => {
    const before = read();
    Utilities.sleep(WAKE_MS);
    const after = read();
    const wakes = Math.max(1, after.count - before.count);
    return Math.round((after.triggerMsToday - before.triggerMsToday) / wakes);
  };
  const normal = medir();
  observe.drain(200); // solta a ScriptLock agora mesmo: o próximo despertar é o pior caso
  const afterBatch = medir();
  savePartial({ ...partial(), idleMs: { normal, afterBatch } });
  return { poc: 'P3', step: 'vazio', normal, afterBatch };
}

/** C4: projeção do dia contra a cota da conta, com os números que o painel de limites já conhece. */
function etapaCota(): { poc: 'P3'; step: 'cota'; projectedMsPerDay: number; limitMsPerDay: number } {
  const hoje = read();
  const agora = new Date();
  const fracao = Math.max(0.05, (agora.getUTCHours() * 60 + agora.getUTCMinutes()) / 1440);
  const projectedMsPerDay = Math.round(hoje.triggerMsToday / fracao);
  const limitMsPerDay = (store.getOwner() ?? '').endsWith('@gmail.com') ? 90 * 60_000 : 6 * 3_600_000;
  savePartial({ ...partial(), quota: { projectedMsPerDay, limitMsPerDay } });
  return { poc: 'P3', step: 'cota', projectedMsPerDay, limitMsPerDay };
}

export function pocP3(step?: string) {
  if (step === 'reset') {
    CacheService.getScriptCache().remove(PARTIAL);
    return { poc: 'P3', step, pass: true };
  }
  if (step === 'vazio') return etapaVazio();
  if (step === 'cota') return etapaCota();
  if (step === 'fim') {
    const p = partial();
    if (!p.stepZero) throw new Error('rode `./gasclaw poc p3 zero` antes do fim');
    return p3Verdict(p as P3Input);
  }
  return etapaZero();
}
