// Borda do run durável: estado em .gasclaw/runs/<runId>.json na pasta do agente (fonte da verdade) e ponteiro
// na fila das Script Properties. Escopos drive + script.scriptapp, nenhum novo.
//
// Por que o estado não mora nas Properties: um Snapshot com a conversa passa fácil dos 9 KB por valor. Por que o
// ponteiro não mora no Drive: a fila é lida a cada minuto pelo pump, e listar pasta a cada minuto é caro e lento.
import { redeemGrant, type GrantResult } from './approval';
import type { Decision } from './agent';
import { authKey, claim, isFinished, nextClaimable, nextExhausted, parseRun, pointerOf, queueKey, runAuthority, splitRunQueue, type DurableRun, type RunAuthority, type RunPointer } from './run';

const CACHE_S = 21_600; // 6 h: só acelera; quando expira, o run volta do Drive
const CACHE_MAX = 90_000;
const DIR = '.gasclaw';
const SUB = 'runs';
const CLAIM_LOCK_MS = 10_000;

const sha256Hex = (value: string): string =>
  Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map((b) => ((b + 256) % 256).toString(16).padStart(2, '0'))
    .join('');

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
  claimNext: (now: number) => { pointer: RunPointer; run: DurableRun; exhausted?: true; tampered?: true } | null;
  /** Reivindica somente o run pedido; se ele estiver ocupado, não cai no próximo da fila. */
  claimById: (runId: string, now: number) => { pointer: RunPointer; run: DurableRun; tampered?: true } | null;
  /** Consome ou renova uma aprovação lendo o Drive sob trava; cache nunca decide autorização. */
  decide: (folderId: string, runId: string, request: ApprovalAttempt, now: number) => GrantResult | { kind: 'rejected'; error: string };
  pointers: () => RunPointer[];
  /** Autoridade deste run (ADR-029): destino da entrega e assinatura do estado que nós gravamos. */
  authority: (runId: string) => RunAuthority | null;
  /** Esquece a autoridade de um run que acabou de vez. Só assim o `A:` não se acumula nas Properties. */
  forget: (runId: string) => void;
};

export type ApprovalAttempt = { tokenHash: string; actor: string; decision: Decision; replacementHash: string };

export function runIO(
  props = PropertiesService.getScriptProperties(),
  cache = CacheService.getScriptCache(),
  lock = LockService.getScriptLock(),
  files: RunFiles = driveFiles(),
  /**
   * Assinatura da autoridade. SHA-256, e não a string canônica inteira, porque ela inclui o `snapshot` com a
   * conversa toda e estouraria os 9 KB por valor das Properties.
   *
   * A colisão não é explorável aqui: o atacante precisaria de um SEGUNDO PREIMAGE — um estado adulterado
   * cuja string canônica bata com um digest que NÓS já fixamos e ele não escolheu. É o oposto do `jobId` da
   * P22, que usa djb2 de 32 bits e por isso é documentado como "NÃO é credencial": lá uma colisão se acha
   * por força bruta em milissegundos; aqui o espaço é 2^256 e não há ataque prático contra SHA-256 completo.
   */
  sign: (value: string) => string = sha256Hex,
): RunIO {
  const load: RunIO['load'] = (folderId, runId) => {
    const hit = cache.get(runCacheKey(folderId, runId));
    if (hit) return parseRun(hit);
    return parseRun(files.read(folderId, runFile(runId)));
  };

  const loadFresh = (folderId: string, runId: string) => parseRun(files.read(folderId, runFile(runId)));

  const persist = (r: DurableRun) => {
    const raw = JSON.stringify(r);
    // Assina TODO estado que nós gravamos, não só o que entra na fila: um run que para para esperar
    // aprovação é persistido por `save` (nunca por `enqueue`) e é justamente ele que fica mais tempo
    // exposto na pasta compartilhada.
    writeAuthority(r);
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

  /**
   * Escrever nas Script Properties pode falhar por espaço (500 KB no total, compartilhados com `Q:`,
   * `USAGE:`, `ACCESS:`…). Quando falha, a operação PARA com recado honesto — nunca cai no arquivo do
   * Drive como plano B, porque isso trocaria silenciosamente a garantia de segurança por conveniência.
   */
  const setProp = (key: string, value: string) => {
    try {
      props.setProperty(key, value);
    } catch (err) {
      throw new Error(`não consegui registrar a tarefa nas Script Properties (provavelmente sem espaço: o limite é 500 KB no total). Abra o painel de limites. Detalhe: ${(err as Error).message}`);
    }
  };

  const readAuthority = (runId: string): RunAuthority | null => {
    const raw = props.getProperty?.(authKey(runId)) ?? props.getProperties()[authKey(runId)] ?? null;
    if (!raw) return null;
    try {
      const a = JSON.parse(raw) as Partial<RunAuthority>;
      return typeof a.auth === 'string' && a.auth
        ? { auth: a.auth, ...(typeof a.space === 'string' ? { space: a.space } : {}), ...(typeof a.thread === 'string' ? { thread: a.thread } : {}) }
        : null;
    } catch {
      return null;
    }
  };

  /**
   * Grava a autoridade do estado que ACABAMOS de persistir. O destino é fixado na primeira gravação e nunca
   * mais rederivado do arquivo — se fosse relido do Drive a cada passo, bastaria ao atacante editar o JSON e
   * esperar a próxima gravação adotar o destino dele, e a guarda se autodestruiria. A assinatura, ao
   * contrário, muda a cada passo legítimo, porque ela descreve o estado que nós mesmos escrevemos.
   */
  const writeAuthority = (r: DurableRun) => {
    const antes = readAuthority(r.runId);
    const destino = antes?.space
      ? { space: antes.space, ...(antes.thread ? { thread: antes.thread } : {}) }
      : r.delivery
        ? { space: r.delivery.space, ...(r.delivery.thread ? { thread: r.delivery.thread } : {}) }
        : {};
    setProp(authKey(r.runId), JSON.stringify({ ...destino, auth: sign(runAuthority(r)) } satisfies RunAuthority));
  };

  /** O arquivo do Drive bate com o que nós gravamos? Divergência é adulteração, não falha transitória. */
  const untampered = (r: DurableRun): boolean => {
    const a = readAuthority(r.runId);
    return !!a && a.auth === sign(runAuthority(r));
  };

  return {
    load,
    save,
    pointers,
    authority: readAuthority,
    forget: (runId) => props.deleteProperty(authKey(runId)),
    decide: (folderId, runId, request, now) => {
      if (!lock.tryLock(CLAIM_LOCK_MS)) return { kind: 'rejected', error: 'aprovação ocupada: clique de novo em alguns segundos' };
      try {
        const run = loadFresh(folderId, runId); // autorização sempre lê a fonte da verdade
        if (!run) return { kind: 'rejected', error: 'não encontrei essa tarefa' };
        // O run esperou FORA da fila — é a janela mais longa que o atacante tem para editar o arquivo na
        // pasta compartilhada. Conferir aqui é o que impede aprovar uma coisa e executar outra.
        if (!untampered(run)) return { kind: 'rejected', error: 'esta tarefa foi alterada fora do gasclaw desde que o pedido foi criado; não vou executá-la' };
        const out = redeemGrant(run, request.tokenHash, request.actor, request.decision, now, request.replacementHash);
        if (out.kind === 'rejected') return out;
        if (out.kind === 'accepted') {
          // A trava impede o pump de enxergar o ponteiro antes de o Drive confirmar o estado consumido.
          setProp(queueKey(runId), JSON.stringify(pointerOf(out.run, now)));
          try {
            persist(out.run); // `persist` já reassina: a decisão aplicada faz parte do estado
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
      setProp(queueKey(r.runId), JSON.stringify(next));
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
      return { pointer: taken, run, ...(untampered(run) ? {} : { tampered: true as const }) };
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
      return { pointer: taken, run, ...(gaveUp ? { exhausted: true as const } : {}), ...(untampered(run) ? {} : { tampered: true as const }) };
    },
  };
}
