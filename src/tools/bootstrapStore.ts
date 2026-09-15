// Borda do ritual de estreia: lê BOOTSTRAP.md da pasta do agente e, no fim, consome o arquivo.
// "Consumir" = mover para .gasclaw/BOOTSTRAP.done.md (nunca apagar de vez: é conteúdo do dono).
import { BOOTSTRAP_FILE } from '../bootstrap';

const DONE_DIR = '.gasclaw';
const DONE_FILE = 'BOOTSTRAP.done.md';

export type BootstrapIO = { read: () => string | null; consume: () => void };

export function bootstrapIO(folderId: string): BootstrapIO {
  const file = () => {
    const it = DriveApp.getFolderById(folderId).getFilesByName(BOOTSTRAP_FILE);
    return it.hasNext() ? it.next() : null;
  };
  return {
    read: () => file()?.getBlob().getDataAsString('UTF-8') ?? null,
    consume: () => {
      const f = file();
      if (!f) return;
      const folder = DriveApp.getFolderById(folderId);
      const it = folder.getFoldersByName(DONE_DIR);
      const dir = it.hasNext() ? it.next() : folder.createFolder(DONE_DIR);
      dir.createFile(DONE_FILE, f.getBlob().getDataAsString('UTF-8'), 'text/markdown');
      f.setTrashed(true); // vai para a lixeira do dono, não some de vez
    },
  };
}
