// Borda do ciclo de sonho: estado em `.gasclaw/dreams/<cycleId>.json` na pasta do agente, e a trava
// `DREAMLOCK:<folderId>` nas Script Properties servindo também de ponteiro. Escopo `drive`, nenhum novo.
//
// POR QUE O CICLO **NÃO** É UM `DurableRun`, embora os dois atravessem execuções:
//
//   Um `DurableRun` é uma CONVERSA que faz checkpoint entre passos — o `Snapshot` dele é
//   `messages`, e a retomada continua de onde o diálogo parou. Um ciclo de sonho é um LOTE de
//   avaliações INDEPENDENTES: 312 execuções que não conversam entre si e cuja ordem só importa
//   para economizar (portão antes da qualidade). Enfiar o ciclo no `DurableRun` seria reusar um
//   mecanismo cuja FORMA não bate — o `snapshot` ficaria vazio, o `pending` nunca se usaria, e a
//   fila `R:` passaria a ter dois tipos de coisa com regras diferentes de lease e tentativa.
//
//   O que se reusa de verdade é o PADRÃO, não a estrutura: arquivo no Drive como fonte da verdade,
//   chave curta nas Properties, avanço por tique, e "passo feito nunca repete".
import { nextStep, recordResult, stepKey, type DreamPlan, type DreamStep, type Tally } from './dreamCycle';
import { dreamLockKey } from './agentCaps';

const DIR = '.gasclaw';
const SUB = 'dreams';

export type DreamStatus = 'running' | 'done' | 'failed';

export type DreamState = {
  cycleId: string;
  folderId: string;
  /** Quem está sendo desafiado. O titular roda os MESMOS cenários, senão não há com que comparar. */
  incumbent: string;
  plan: DreamPlan;
  tally: Tally;
  /** Chaves de passo já executadas. É o que torna a retomada segura depois de uma execução morrer. */
  done: string[];
  status: DreamStatus;
  startedAt: number;
  updatedAt: number;
  error?: string;
};

export const dreamFile = (cycleId: string): string => {
  const safe = String(cycleId).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  if (!safe) throw new Error('invalid cycleId');
  return `${safe}.json`;
};

export function newCycle(i: { cycleId: string; folderId: string; incumbent: string; plan: DreamPlan; now: number }): DreamState {
  return { cycleId: i.cycleId, folderId: i.folderId, incumbent: i.incumbent, plan: i.plan, tally: {}, done: [], status: 'running', startedAt: i.now, updatedAt: i.now };
}

/**
 * Lê o estado gravado. Arquivo corrompido ou com forma errada devolve `null` — fail-closed, como
 * `parseRun` e `parseAccess`: melhor "não há ciclo" do que um ciclo meio lido cujo `done` perdeu
 * metade das chaves e refaz 150 execuções.
 */
export function parseDream(raw: string | null | undefined): DreamState | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<DreamState>;
    if (typeof o.cycleId !== 'string' || !o.cycleId || typeof o.folderId !== 'string' || !o.folderId) return null;
    if (!o.plan || !Array.isArray(o.plan.steps) || typeof o.plan.k !== 'number') return null;
    const status: DreamStatus = ['running', 'done', 'failed'].includes(String(o.status)) ? (o.status as DreamStatus) : 'running';
    return {
      cycleId: o.cycleId,
      folderId: o.folderId,
      incumbent: String(o.incumbent ?? ''),
      plan: o.plan as DreamPlan,
      tally: o.tally && typeof o.tally === 'object' ? (o.tally as Tally) : {},
      done: Array.isArray(o.done) ? o.done.filter((d): d is string => typeof d === 'string') : [],
      status,
      startedAt: Number(o.startedAt) || 0,
      updatedAt: Number(o.updatedAt) || 0,
      ...(typeof o.error === 'string' ? { error: o.error } : {}),
    };
  } catch {
    return null;
  }
}

/** Um passo concluído: soma no placar, marca como feito, e fecha o ciclo quando não sobra passo. */
export function afterStep(s: DreamState, step: DreamStep, passed: boolean, now: number): DreamState {
  const tally = recordResult(s.tally, step, passed);
  const done = s.done.includes(stepKey(step)) ? s.done : [...s.done, stepKey(step)];
  const acabou = nextStep(s.plan, new Set(done), tally) === null;
  return { ...s, tally, done, status: acabou ? 'done' : s.status, updatedAt: now };
}

/**
 * Falha honesta: o ciclo para e REGISTRA. Nunca some em silêncio — um sonho que morre calado
 * faria o dono achar que ele ainda está rodando, e o `DREAMLOCK:` ficaria preso para sempre.
 */
export const failCycle = (s: DreamState, reason: string, now: number): DreamState => ({ ...s, status: 'failed', error: reason, updatedAt: now });

export type DreamIO = {
  load: (folderId: string, cycleId: string) => DreamState | null;
  save: (s: DreamState) => void;
  active: (folderId: string) => string | null;
  setActive: (folderId: string, cycleId: string | null) => void;
};

/** Pasta `.gasclaw/dreams` dentro da pasta do agente, criada sozinha — mesmo padrão de runs/sessions. */
function folder(folderId: string): GoogleAppsScript.Drive.Folder {
  let dir = DriveApp.getFolderById(folderId);
  for (const part of [DIR, SUB]) {
    const it = dir.getFoldersByName(part);
    dir = it.hasNext() ? it.next() : dir.createFolder(part);
  }
  return dir;
}

export function dreamIO(): DreamIO {
  const props = () => PropertiesService.getScriptProperties();
  return {
    load: (folderId, cycleId) => {
      const it = folder(folderId).getFilesByName(dreamFile(cycleId));
      return it.hasNext() ? parseDream(it.next().getBlob().getDataAsString()) : null;
    },
    save: (s) => {
      const dir = folder(s.folderId);
      const name = dreamFile(s.cycleId);
      const raw = JSON.stringify(s);
      const it = dir.getFilesByName(name);
      if (it.hasNext()) it.next().setContent(raw);
      else dir.createFile(name, raw);
    },
    // A trava É o ponteiro: um ciclo por agente (decisão já tomada), então não há fila a manter.
    active: (folderId) => props().getProperty(dreamLockKey(folderId)),
    setActive: (folderId, cycleId) => (cycleId ? props().setProperty(dreamLockKey(folderId), cycleId) : props().deleteProperty(dreamLockKey(folderId))),
  };
}
