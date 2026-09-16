// Borda do run durável: estado em .gasclaw/runs/<runId>.json na pasta do agente (fonte da verdade) e ponteiro
// na fila das Script Properties. Escopos drive + script.scriptapp, nenhum novo.
//
// Por que o estado não mora nas Properties: um Snapshot com a conversa passa fácil dos 9 KB por valor. Por que o
// ponteiro não mora no Drive: a fila é lida a cada minuto pelo pump, e listar pasta a cada minuto é caro e lento.
import { redeemGrant, type GrantResult } from './approval';
import type { Decision } from './agent';
import { claim, nextClaimable, nextExhausted, parseRun, pointerOf, queueKey, splitRunQueue, type DurableRun, type RunPointer } from './run';

const CACHE_S = 21_600; // 6 h: só acelera; quando expira, o run volta do Drive
const CACHE_MAX = 90_000;
const DIR = '.gasclaw';
const SUB = 'runs';
const CLAIM_LOCK_MS = 10_000;

/** Nome de arquivo seguro para um runId (que vem do Chat e pode ter barra, ponto e espaço). */
export function runFile(runId: string): string {
  const safe = String(runId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  if (!safe) throw new Error('runId inválido');
  return `${safe}.json`;
}

export const runCacheKey = (folderId: string, runId: string) => `r:${folderId}:${runFile(runId)}`;

function runsDir(folderId: string): GoogleAppsScript.Drive.Folder {
  const child = (parent: GoogleAppsScript.Drive.Folder, name: string) => {
    const it = parent.getFoldersByName(name);
    return it.hasNext() ? it.next() : parent.createFolder(name);
  };
  return child(child(DriveApp.getFolderById(folderId), DIR), SUB);
}

/**
 * Porta de arquivos do run. O Drive é a única parte que não dá para testar fora do Apps Script, então ele fica
 * atrás desta porta e todo o resto (fila, lease, órfão) é testado com um Map.
 */
export type RunFiles = { read: (folderId: string, file: string) => string | null; write: (folderId: string, file: string, raw: string) => void };

export const driveFiles = (): RunFiles => ({
  read: (folderId, file) => {
    const it = runsDir(folderId).getFilesByName(file);
    return it.hasNext() ? it.next().getBlob().getDataAsString('UTF-8') : null;
  },
  write: (folderId, file, raw) => {
    const dir = runsDir(folderId);
    const it = dir.getFilesByName(file);
    if (it.hasNext()) it.next().setContent(raw);
    else dir.createFile(file, raw, 'application/json');
  },
});

export type RunIO = {
  load: (folderId: string, runId: string) => DurableRun | null;
  save: (r: DurableRun) => void;
  /**
   * Grava o estado e põe (ou repõe) o ponteiro na fila, na ordem certa: estado primeiro, ponteiro depois.
   * `progressed` zera as tentativas: elas contam **falhas**, não passos — sem isso um run de 5 passos bem-sucedidos
   * morreria na 4ª volta do pump, que é justamente o caso que o loop durável existe para atender.
   */
  enqueue: (r: DurableRun, now: number, progressed?: boolean) => void;
  /** Tira da fila (terminou, falhou ou foi esperar o usuário); o estado continua no Drive. */
  dequeue: (runId: string) => void;
  /**
   * Reivindica o run mais antigo que dá para pegar. A trava cobre só isto — nunca o corpo do passo.
   * `exhausted` marca a entrega final de um run que gastou as tentativas: não é para trabalhar, é para desistir com recado.
   */
  claimNext: (now: number) => { pointer: RunPointer; run: DurableRun; exhausted?: true } | null;
  /** Reivindica somente o run pedido; se ele estiver ocupado, não cai no próximo da fila. */
  claimById: (runId: string, now: number) => { pointer: RunPointer; run: DurableRun } | null;
  /** Consome ou renova uma aprovação lendo o Drive sob trava; cache nunca decide autorização. */
  decide: (folderId: string, runId: string, request: ApprovalAttempt, now: number) => GrantResult | { kind: 'rejected'; error: string };
  pointers: () => RunPointer[];
};

export type ApprovalAttempt = { tokenHash: string; actor: string; decision: Decision; replacementHash: string };

export function runIO(
  props = PropertiesService.getScriptProperties(),
  cache = CacheService.getScriptCache(),
  lock = LockService.getScriptLock(),
  files: RunFiles = driveFiles(),
): RunIO {
  const load: RunIO['load'] = (folderId, runId) => {
    const hit = cache.get(runCacheKey(folderId, runId));
    if (hit) return parseRun(hit);
    return parseRun(files.read(folderId, runFile(runId)));
  };

  const loadFresh = (folderId: string, runId: string) => parseRun(files.read(folderId, runFile(runId)));

  const persist = (r: DurableRun) => {
    const raw = JSON.stringify(r);
    // O Drive é a fonte da verdade e vai sempre; o cache é só atalho, e um run grande demais simplesmente não o usa.
    files.write(r.folderId, runFile(r.runId), raw);
    try {
      if (raw.length <= CACHE_MAX) cache.put(runCacheKey(r.folderId, r.runId), raw, CACHE_S);
      else cache.remove(runCacheKey(r.folderId, r.runId)); // melhor sem atalho que com atalho velho
    } catch {
      // CacheService nunca decide durabilidade; claims e aprovações leem o Drive diretamente.
    }
  };
  const save: RunIO['save'] = persist;

  const pointers = () => splitRunQueue(props.getProperties());

  return {
    load,
    save,
    pointers,
    decide: (folderId, runId, request, now) => {
      if (!lock.tryLock(CLAIM_LOCK_MS)) return { kind: 'rejected', error: 'aprovação ocupada: clique de novo em alguns segundos' };
      try {
        const run = loadFresh(folderId, runId); // autorização sempre lê a fonte da verdade
        if (!run) return { kind: 'rejected', error: 'não encontrei essa tarefa' };
        const out = redeemGrant(run, request.tokenHash, request.actor, request.decision, now, request.replacementHash);
        if (out.kind === 'rejected') return out;
        if (out.kind === 'accepted') {
          // A trava impede o pump de enxergar o ponteiro antes de o Drive confirmar o estado consumido.
          props.setProperty(queueKey(runId), JSON.stringify(pointerOf(out.run, now)));
          try {
            persist(out.run);
          } catch (err) {
            props.deleteProperty(queueKey(runId));
            throw err;
          }
        } else {
          persist(out.run);
          props.deleteProperty(queueKey(runId));
        }
        return out;
      } finally {
        lock.releaseLock();
      }
    },
    enqueue: (r, now, progressed) => {
      save(r); // o estado precisa existir antes do ponteiro: um pump que chegue no meio não pode achar endereço vazio
      const prev = splitRunQueue(props.getProperties()).find((p) => p.runId === r.runId);
      const next: RunPointer = { ...pointerOf(r, prev?.at ?? now), attempts: progressed ? 0 : (prev?.attempts ?? 0) };
      props.setProperty(queueKey(r.runId), JSON.stringify(next));
    },
    dequeue: (runId) => props.deleteProperty(queueKey(runId)),
    claimById: (runId, now) => {
      if (!lock.tryLock(CLAIM_LOCK_MS)) return null;
      let taken: RunPointer | null = null;
      try {
        const p = splitRunQueue(props.getProperties()).find((candidate) => candidate.runId === runId);
        if (!p) return null;
        const c = claim(p, now);
        if (!c.ok) return null;
        props.setProperty(queueKey(runId), JSON.stringify(c.pointer));
        taken = c.pointer;
      } finally {
        lock.releaseLock();
      }
      const run = loadFresh(taken.folderId, taken.runId);
      if (!run) {
        props.deleteProperty(queueKey(taken.runId));
        return null;
      }
      return { pointer: taken, run };
    },
    claimNext: (now) => {
      if (!lock.tryLock(CLAIM_LOCK_MS)) return null; // outro pump está reivindicando: este sai, o próximo minuto tenta
      let taken: RunPointer;
      let gaveUp = false;
      try {
        const queue = splitRunQueue(props.getProperties());
        const p = nextClaimable(queue, now);
        if (p) {
          const c = claim(p, now);
          if (!c.ok) return null; // corrida: alguém pegou entre a leitura e agora
          props.setProperty(queueKey(p.runId), JSON.stringify(c.pointer));
          taken = c.pointer;
        } else {
          // Ninguém para trabalhar; se sobrou quem esgotou as tentativas, sai da fila agora e vira falha honesta abaixo.
          const e = nextExhausted(queue, now);
          if (!e) return null;
          props.deleteProperty(queueKey(e.runId));
          taken = e;
          gaveUp = true;
        }
      } finally {
        lock.releaseLock();
      }
      // Fora da trava de propósito: ler o Drive pode levar segundos, e segurar a ScriptLock aqui travaria o lote do trace.
      const run = loadFresh(taken.folderId, taken.runId);
      if (!run) {
        props.deleteProperty(queueKey(taken.runId)); // ponteiro órfão (estado apagado à mão): a fila se limpa sozinha
        return null;
      }
      return { pointer: taken, run, ...(gaveUp ? { exhausted: true as const } : {}) };
    },
  };
}
