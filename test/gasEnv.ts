// Ambiente Apps Script de mentira, completo o bastante para rodar o gatilho real (`drainRuns`) de ponta a ponta.
//
// Existe por causa de um defeito que 871 testes verdes não pegaram: a URL montada para o Google Chat levava
// `messageReplyOption` mesmo sem thread, e o Google devolvia 400 em toda entrega. Os testes mockavam o HTTP e
// nunca olhavam a requisição real. Aqui o mock GUARDA cada requisição, para o teste poder conferir a forma dela.
import { vi } from 'vitest';

export type Captured = { url: string; init: Record<string, unknown> };

export type GasEnv = {
  props: Record<string, string>;
  cache: Record<string, string>;
  /** Toda chamada de UrlFetchApp, na ordem. */
  calls: Captured[];
  /** Conteúdo dos arquivos do Drive, por "<folderId>/<caminho>/<arquivo>". */
  drive: Map<string, string>;
  /** Respostas do OpenRouter, na ordem em que serão servidas. */
  llm: { content: string; cost?: number }[];
  /** Código HTTP que o Google Chat devolve (400 reproduz o incidente da v83). */
  chatCode: number;
  /** Arquivos da pasta do agente vistos pela Drive API (`files.list`). */
  folderFiles: { id: string; name: string; mimeType: string; text: string }[];
  fetched: (part: string) => Captured[];
};

const res = (code: number, body: string) => ({
  getResponseCode: () => code,
  getContentText: () => body,
  getBlob: () => ({ getDataAsString: () => body }),
});

/** Pasta do Drive em memória: subpastas criadas sob demanda, arquivos com setContent. */
function makeDrive(env: GasEnv) {
  const folders = new Map<string, ReturnType<typeof folder>>();
  function folder(id: string, name: string) {
    const prefix = `${id}/`;
    const self = {
      getId: () => id,
      getName: () => name,
      getFoldersByName: (child: string) => {
        const childId = `${id}/${child}`;
        const has = folders.has(childId);
        let taken = false;
        return { hasNext: () => has && !taken, next: () => ((taken = true), folders.get(childId)!) };
      },
      createFolder: (child: string) => {
        const childId = `${id}/${child}`;
        if (!folders.has(childId)) folders.set(childId, folder(childId, child));
        return folders.get(childId)!;
      },
      getFilesByName: (file: string) => {
        const key = prefix + file;
        let taken = false;
        return {
          hasNext: () => env.drive.has(key) && !taken,
          next: () => {
            taken = true;
            return {
              getBlob: () => ({ getDataAsString: () => env.drive.get(key) ?? '' }),
              getName: () => file,
              setContent: (raw: string) => void env.drive.set(key, raw),
            };
          },
        };
      },
      createFile: (file: string, raw: string) => {
        env.drive.set(prefix + file, raw);
        return { getId: () => `${prefix}${file}`, setContent: (r: string) => void env.drive.set(prefix + file, r) };
      },
    };
    return self;
  }
  return {
    getFolderById: (id: string) => {
      if (!folders.has(id)) folders.set(id, folder(id, id === 'f1' ? 'agente-teste' : id));
      return folders.get(id)!;
    },
    getRootFolder: () => {
      if (!folders.has('root')) folders.set('root', folder('root', 'root'));
      return folders.get('root')!;
    },
    getFileById: (id: string) => ({ setContent: (r: string) => void env.drive.set(id, r), getBlob: () => ({ getDataAsString: () => env.drive.get(id) ?? '' }) }),
  };
}

/** Roteia a requisição pela URL e devolve a resposta que aquele sistema externo daria. */
function route(env: GasEnv, url: string): ReturnType<typeof res> {
  if (url.includes('openrouter.ai')) {
    const next = env.llm.shift() ?? { content: 'ok' };
    return res(200, JSON.stringify({
      id: 'gen-1',
      model: 'test/model',
      choices: [{ message: { content: next.content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, cost: next.cost ?? 0.01 },
    }));
  }
  if (url.includes('iamcredentials.googleapis.com')) return res(200, JSON.stringify({ accessToken: 'ya29.fake' }));
  if (url.includes('chat.googleapis.com')) return env.chatCode === 200
    ? res(200, JSON.stringify({ name: 'spaces/AAA/messages/msg1' }))
    : res(env.chatCode, 'INVALID_ARGUMENT');
  // export do projeto Apps Script: indisponível no teste (o loadAgent segue com o Drive, como em produção)
  if (url.includes('application%2Fvnd.google-apps.script')) return res(404, 'sem editor');
  if (url.includes('?alt=media') || url.includes('/export?mimeType=')) {
    const id = /files\/([^/?]+)/.exec(url)?.[1] ?? '';
    return res(200, env.folderFiles.find((f) => f.id === id)?.text ?? '');
  }
  if (url.includes('/drive/v3/files?q=')) return res(200, JSON.stringify({ files: env.folderFiles.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: '2026-01-01T00:00:00Z' })) }));
  return res(200, '{}');
}

export function stubGas(over: Partial<GasEnv> = {}): GasEnv {
  const env: GasEnv = {
    props: { OWNER: 'dono@x.com', AGENTS: '[{"folderId":"f1","name":"agente-teste"}]', OPENROUTER_API_KEY: 'sk-or-teste', 'ACCESS:f1': '{"users":[],"tools":[]}' },
    cache: {},
    calls: [],
    drive: new Map(),
    llm: [],
    chatCode: 200,
    folderFiles: [{ id: 'a1', name: 'AGENTS.md', mimeType: 'text/markdown', text: 'Você é o agente de teste.' }],
    fetched: (part) => env.calls.filter((c) => c.url.includes(part)),
    ...over,
  };

  const propStore = {
    getProperty: (k: string) => env.props[k] ?? null,
    setProperty: (k: string, v: string) => void (env.props[k] = v),
    setProperties: (o: Record<string, string>) => void Object.assign(env.props, o),
    deleteAllProperties: () => void Object.keys(env.props).forEach((k) => delete env.props[k]),
    getProperties: () => ({ ...env.props }),
    deleteProperty: (k: string) => void delete env.props[k],
  };
  const cacheStore = {
    get: (k: string) => env.cache[k] ?? null,
    put: (k: string, v: string) => void (env.cache[k] = v),
    remove: (k: string) => void delete env.cache[k],
    removeAll: (ks: string[]) => ks.forEach((k) => delete env.cache[k]),
    getAll: (ks: string[]) => Object.fromEntries(ks.flatMap((k) => (env.cache[k] ? [[k, env.cache[k]]] : []))),
  };
  const fetch = (url: string, init: Record<string, unknown> = {}) => {
    env.calls.push({ url, init });
    return route(env, url);
  };

  // Constantes embutidas pelo build.mjs; no teste elas precisam existir, senão a entrega morre com ReferenceError.
  vi.stubGlobal('__CHAT_SA_EMAIL__', 'gasclaw-chat@gasclaw-dev.iam.gserviceaccount.com');
  vi.stubGlobal('__DEV__', false);
  vi.stubGlobal('__ENV__', 'teste');
  vi.stubGlobal('__SIBLING_URL__', '');
  vi.stubGlobal('__GCP_NUMBER__', '0');
  vi.stubGlobal('PropertiesService', { getScriptProperties: () => propStore, getUserProperties: () => propStore });
  vi.stubGlobal('CacheService', { getScriptCache: () => cacheStore, getUserCache: () => cacheStore });
  vi.stubGlobal('LockService', { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined, waitLock: () => undefined }) });
  vi.stubGlobal('UrlFetchApp', { fetch, fetchAll: (reqs: { url: string }[]) => reqs.map((r) => fetch(r.url, r as Record<string, unknown>)) });
  vi.stubGlobal('DriveApp', makeDrive(env));
  vi.stubGlobal('ScriptApp', { getOAuthToken: () => 'owner-token', getScriptId: () => 'script1', getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => undefined }) }) }) });
  vi.stubGlobal('Session', {
    getScriptTimeZone: () => 'America/Sao_Paulo',
    getEffectiveUser: () => ({ getEmail: () => 'dono@x.com' }),
    getActiveUser: () => ({ getEmail: () => 'dono@x.com' }),
  });
  let uuid = 0;
  vi.stubGlobal('Utilities', {
    getUuid: () => `0000000${(++uuid).toString(16).padStart(1, '0')}-1111-4222-8333-444444444444`,
    // Formatador suficiente para os padrões que o gasclaw usa (yyyy-MM-dd, yyyyMMdd-HHmmss, XXX, EEEE).
    formatDate: (d: Date, _tz: string, fmt: string) => {
      const p = (n: number, w = 2) => String(n).padStart(w, '0');
      const t = new Date(d);
      const map: Record<string, string> = {
        yyyy: String(t.getUTCFullYear()), MM: p(t.getUTCMonth() + 1), dd: p(t.getUTCDate()),
        HH: p(t.getUTCHours()), mm: p(t.getUTCMinutes()), ss: p(t.getUTCSeconds()),
        XXX: '-03:00', EEEE: ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][t.getUTCDay()],
      };
      return fmt.replace(/yyyy|EEEE|XXX|MM|dd|HH|mm|ss/g, (k) => map[k]);
    },
    parseCsv: (s: string) => s.split('\n').map((l) => l.split(',')),
    // Digest de 32 bytes, deterministico e de tamanho fixo (o real e SHA-256; aqui basta distinguir).
    computeDigest: (_a: unknown, value: string) => {
      const out: number[] = [];
      for (let i = 0; i < 32; i++) {
        let h = 2166136261 ^ (i * 2654435761);
        for (let k = 0; k < String(value).length; k++) h = Math.imul(h ^ String(value).charCodeAt(k), 16777619);
        out.push((h >>> 24) % 256);
      }
      return out;
    },
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
  });
  return env;
}
