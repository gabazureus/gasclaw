// Borda das personas: `subagents/<nome>.md` na pasta do agente (ADR-039).
//
// Persona é TEXTO (ADR-002): nada daqui executa. O markdown declara papel e ferramentas DESEJADAS;
// quem decide o que ela recebe é a interseção em `subagentTools`, contra o registro E contra o que o
// dono aprovou para o pai. A pasta pede; o painel concede. Nunca o contrário.
import { SUBAGENT_NAME } from '../subagent';

const DIR = 'subagents';
const CACHE_S = 30; // a mesma validade da leitura do agente (ADR-012): editar a persona aparece em até 30 s

export type PersonaIO = { body: (name: string) => string | null };

export function personaIO(folderId: string, cache = CacheService.getScriptCache()): PersonaIO {
  return {
    body: (name) => {
      const n = String(name ?? '').toLowerCase();
      if (!SUBAGENT_NAME.test(n)) return null; // nome inválido não vira caminho de arquivo
      const key = `pa:${folderId}:${n}`;
      const hit = cache.get(key);
      // String vazia no cache marca "procurei e não existe" — sem isso, uma persona inexistente
      // faria uma varredura do Drive a cada passo do turno, que é o caminho mais caro possível.
      if (hit !== null) return hit === '' ? null : hit;
      const it = DriveApp.getFolderById(folderId).getFoldersByName(DIR);
      const md = it.hasNext() ? (() => {
        const f = it.next().getFilesByName(`${n}.md`);
        return f.hasNext() ? f.next().getBlob().getDataAsString('UTF-8') : null;
      })() : null;
      cache.put(key, md ?? '', CACHE_S);
      return md;
    },
  };
}
