// Drive API v3 via UrlFetch com o token do script (escopo `drive`, já no manifesto). Casca fina, sem regra de negócio.
import { parseProjectExport, type FileEntry, type ProjectFile, type Source } from './workspace';

export const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const auth = () => ({ Authorization: `Bearer ${ScriptApp.getOAuthToken()}` });

/** Corpo multipart/related (metadados JSON + conteúdo) do upload da Drive API. */
export function multipartBody(meta: object, content: string, mime: string, boundary: string): string {
  return (
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: ${mime}; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`
  );
}

export function driveOk(res: GoogleAppsScript.URL_Fetch.HTTPResponse, what: string): string {
  const body = res.getContentText('UTF-8');
  if (res.getResponseCode() !== 200) throw new Error(`Drive ${what} ${res.getResponseCode()}: ${body.slice(0, 200)}`);
  return body;
}

/** Arquivos da pasta numa chamada files.list (294–608 ms medidos no ADR-012). */
export function listFolder(folderId: string): FileEntry[] {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`); // folderId vem do DriveApp ou de extractFolderId
  const fields = encodeURIComponent('files(id,name,mimeType,modifiedTime)');
  const body = driveOk(UrlFetchApp.fetch(`${DRIVE_API}?q=${q}&fields=${fields}&pageSize=1000`, { headers: auth(), muteHttpExceptions: true }), 'files.list');
  const files: { id: string; name: string; mimeType: string; modifiedTime: string }[] = JSON.parse(body).files ?? [];
  return files.map((f) => ({ id: f.id, name: f.name, mime: f.mimeType, modified: Date.parse(f.modifiedTime) }));
}

/** Doc → markdown, planilha → CSV, .md → conteúdo. */
export function downloadUrl(s: Source): string {
  if (s.kind === 'md') return `${DRIVE_API}/${s.entry.id}?alt=media`;
  return `${DRIVE_API}/${s.entry.id}/export?mimeType=${encodeURIComponent(s.kind === 'doc' ? 'text/markdown' : 'text/csv')}`;
}

/** Baixa todas as fontes em paralelo (fetchAll). Lança se alguma falhar. */
export function fetchTexts<K extends string>(sources: Partial<Record<K, Source>>): Partial<Record<K, string>> {
  const keys = Object.keys(sources) as K[];
  if (!keys.length) return {};
  const headers = auth();
  const res = UrlFetchApp.fetchAll(keys.map((k) => ({ url: downloadUrl(sources[k]!), headers, muteHttpExceptions: true })));
  return Object.fromEntries(res.map((r, i) => [keys[i], driveOk(r, `download ${keys[i]}`)])) as Partial<Record<K, string>>;
}

/** Conteúdo do HEAD do projeto Apps Script (texto bruto e fiel; POC P10). */
export function exportProject(scriptId = ScriptApp.getScriptId()): ProjectFile[] {
  const url = `${DRIVE_API}/${scriptId}/export?mimeType=${encodeURIComponent('application/vnd.google-apps.script+json')}`;
  return parseProjectExport(driveOk(UrlFetchApp.fetch(url, { headers: auth(), muteHttpExceptions: true }), 'export do projeto'));
}
