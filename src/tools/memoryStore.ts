// Borda da memória: MEMORY.md (curada) e memory/AAAA-MM-DD.md (notas do dia) na pasta do agente. Escopo drive, sem escopo novo.
import { fetchTexts, listFolder } from '../drive';
import { DOC_MIME, type FileEntry, type Source } from '../workspace';
import { dayFile, recallText, type Recall } from './memory';

const isGoogle = (e: FileEntry) => e.mime.startsWith('application/vnd.google-apps.');
const MEMORY_DIR = 'memory';

/** Doc "MEMORY"/"MEMORY.md" > arquivo MEMORY.md (mesma precedência dos papéis). */
export function memorySource(entries: FileEntry[]): Source | null {
  const doc = entries.find((e) => e.mime === DOC_MIME && (e.name === 'MEMORY' || e.name === 'MEMORY.md'));
  if (doc) return { entry: doc, kind: 'doc' };
  const md = entries.find((e) => !isGoogle(e) && e.name === 'MEMORY.md');
  return md ? { entry: md, kind: 'md' } : null;
}

/** Data (AAAA-MM-DD) de hoje e de ontem no fuso do gasclaw. */
export function days(tz: string, now = new Date()): { today: string; yesterday: string } {
  const fmt = (d: Date) => Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  return { today: fmt(now), yesterday: fmt(new Date(now.getTime() - 86_400_000)) };
}

export type MemoryIO = {
  read: () => string; // MEMORY.md (curada)
  write: (text: string) => void;
  day: (date: string) => string; // nota de um dia
  saveDay: (date: string, text: string) => void;
  today: () => string; // data de hoje no fuso do gasclaw
  recall: () => string; // curada + hoje + ontem, dentro do teto
};

export function memoryIO(folderId: string, tz = Session.getScriptTimeZone()): MemoryIO {
  let src: Source | null | undefined;
  const source = () => (src === undefined ? (src = memorySource(listFolder(folderId))) : src);
  const dir = () => {
    const folder = DriveApp.getFolderById(folderId);
    const it = folder.getFoldersByName(MEMORY_DIR);
    return it.hasNext() ? it.next() : folder.createFolder(MEMORY_DIR);
  };
  const dayIO = {
    read: (date: string) => {
      const it = dir().getFilesByName(dayFile(date));
      return it.hasNext() ? it.next().getBlob().getDataAsString('UTF-8') : '';
    },
    write: (date: string, text: string) => {
      const folder = dir();
      const it = folder.getFilesByName(dayFile(date));
      if (it.hasNext()) it.next().setContent(text);
      else folder.createFile(dayFile(date), text, 'text/markdown');
    },
  };
  const read = () => {
    const s = source();
    return s ? (fetchTexts({ m: s }).m ?? '') : '';
  };
  return {
    read,
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
      // minimal: escrever num Google Doc precisa de POC (upload com conversão não medido); até lá, recusa com motivo claro.
      throw new Error('MEMORY é um Google Doc: a escrita pelo agente ainda não é suportada (use MEMORY.md)');
    },
    day: dayIO.read,
    saveDay: dayIO.write,
    today: () => days(tz).today,
    recall: () => {
      const { today, yesterday } = days(tz);
      const r: Recall = { curated: read(), today: dayIO.read(today), yesterday: dayIO.read(yesterday) };
      return recallText(r);
    },
  };
}
