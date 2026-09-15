// Borda das sessões: .gasclaw/sessions/<espaço>.json na pasta do agente (fonte da verdade, sem prazo de validade),
// com o CacheService como camada rápida. Escopo drive, sem escopo novo.
import { parseSession, sessionFile, type Session } from './session';

const CACHE_S = 21_600; // 6 h: só acelera; quando expira, a sessão volta do Drive
const CACHE_MAX = 90_000; // limite do CacheService por chave
const DIR = '.gasclaw';
const SUB = 'sessions';

export type SessionIO = { load: (space: string) => Session; save: (space: string, s: Session) => void };

/** Pasta .gasclaw/sessions dentro da pasta do agente, criada sozinha. */
function sessionsDir(folderId: string): GoogleAppsScript.Drive.Folder {
  const child = (parent: GoogleAppsScript.Drive.Folder, name: string) => {
    const it = parent.getFoldersByName(name);
    return it.hasNext() ? it.next() : parent.createFolder(name);
  };
  return child(child(DriveApp.getFolderById(folderId), DIR), SUB);
}

export function sessionIO(folderId: string, cache = CacheService.getScriptCache()): SessionIO {
  const key = (space: string) => `s:${folderId}:${sessionFile(space)}`;
  return {
    load: (space) => {
      const hit = cache.get(key(space));
      if (hit) return parseSession(hit);
      const it = sessionsDir(folderId).getFilesByName(sessionFile(space));
      const raw = it.hasNext() ? it.next().getBlob().getDataAsString('UTF-8') : '';
      if (raw) cache.put(key(space), raw.slice(0, CACHE_MAX), CACHE_S);
      return parseSession(raw);
    },
    save: (space, s) => {
      const raw = JSON.stringify(s);
      if (raw.length <= CACHE_MAX) cache.put(key(space), raw, CACHE_S);
      const dir = sessionsDir(folderId);
      const it = dir.getFilesByName(sessionFile(space));
      if (it.hasNext()) it.next().setContent(raw);
      else dir.createFile(sessionFile(space), raw, 'application/json');
    },
  };
}
