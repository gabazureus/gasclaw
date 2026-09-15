// Evals do Workspace (E6): tudo que um eval cria na conta do dono é apagado no fim (nunca pelo agente, só pelo runner).
import { enc, gcall, type GReq, type Google } from './google';

const ID = /^[a-zA-Z0-9_-]{5,1024}$/;
type Ev = { name: string; status: string; result: string };

/** Pedido que desfaz o efeito de uma tool, a partir do resultado dela ({"id": ...}). */
export function cleanupRequest(name: string, result: string): GReq | null {
  let id: unknown;
  try {
    id = (JSON.parse(result) as { id?: unknown }).id;
  } catch {
    return null;
  }
  if (typeof id !== 'string' || !ID.test(id)) return null;
  if (name === 'calendar.create') return { method: 'delete', url: `https://www.googleapis.com/calendar/v3/calendars/primary/events/${enc(id)}?sendUpdates=none` };
  if (name === 'gmail.draft') return { method: 'delete', url: `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${enc(id)}` };
  if (name === 'tasks.create') return { method: 'delete', url: `https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${enc(id)}` };
  if (name === 'docs.create') return { method: 'patch', url: `https://www.googleapis.com/drive/v3/files/${enc(id)}`, body: { trashed: true } }; // lixeira, não apaga de vez
  return null; // gmail.send não tem desfazer: evals nunca enviam para terceiros
}

/** removed = apagado agora; missing = já não existia (404/410); failed = não deu para apagar. */
export function runCleanup(events: Ev[], g: Google): { removed: number; missing: number; failed: string[] } {
  const out = { removed: 0, missing: 0, failed: [] as string[] };
  for (const e of events) {
    if (e.status !== 'ok' && e.status !== 'approved') continue;
    const req = cleanupRequest(e.name, e.result);
    if (!req) continue;
    try {
      const res = g(req);
      if (res.code === 404 || res.code === 410) out.missing++;
      else {
        gcall(() => res, req, `limpar ${e.name}`);
        out.removed++;
      }
    } catch (err) {
      out.failed.push(`${e.name} ${JSON.parse(e.result).id}: ${(err as Error).message}`);
    }
  }
  return out;
}
