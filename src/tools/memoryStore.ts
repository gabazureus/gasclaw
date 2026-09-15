// Borda da memória: MEMORY.md na pasta do agente (Google Doc ou .md, ADR-012). Sem escopo novo (drive).
import { DRIVE_API, driveOk, fetchTexts, listFolder } from '../drive';
import { DOC_MIME, type FileEntry, type Source } from '../workspace';

const isGoogle = (e: FileEntry) => e.mime.startsWith('application/vnd.google-apps.');

/** Doc "MEMORY"/"MEMORY.md" > arquivo MEMORY.md (mesma precedência dos papéis). */
export function memorySource(entries: FileEntry[]): Source | null {
  const doc = entries.find((e) => e.mime === DOC_MIME && (e.name === 'MEMORY' || e.name === 'MEMORY.md'));
  if (doc) return { entry: doc, kind: 'doc' };
  const md = entries.find((e) => !isGoogle(e) && e.name === 'MEMORY.md');
  return md ? { entry: md, kind: 'md' } : null;
}

export function memoryIO(folderId: string): { read: () => string; write: (text: string) => void } {
  let src: Source | null | undefined;
  const source = () => (src === undefined ? (src = memorySource(listFolder(folderId))) : src);
  return {
    read: () => {
      const s = source();
      return s ? (fetchTexts({ m: s }).m ?? '') : '';
    },
    write: (text) => {
      const s = source();
      if (!s) {
        src = { entry: { id: DriveApp.getFolderById(folderId).createFile('MEMORY.md', text, 'text/markdown').getId(), name: 'MEMORY.md', mime: 'text/markdown', modified: Date.now() }, kind: 'md' };
        return;
      }
      if (s.kind === 'md') {
        DriveApp.getFileById(s.entry.id).setContent(text);
        return;
      }
      // minimal: Doc atualizado por upload de markdown (Drive v3 files.update com conversão); não medido no dev, a E1 mede com .md.
      const url = `${DRIVE_API.replace('/drive/v3', '/upload/drive/v3')}/${s.entry.id}?uploadType=media`;
      driveOk(UrlFetchApp.fetch(url, { method: 'patch', contentType: 'text/markdown', payload: text, headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` }, muteHttpExceptions: true }), 'update MEMORY');
    },
  };
}
