// Tarefas (E6): Google Tasks API v1 por REST, escopo tasks, sempre na lista padrão (@default).
import { asData, enc, gcall, type Google, incompleta, ownerGoogle } from './google';
import type { Schema, Tool, ToolCtx } from './registry';

export const TASKS_URL = 'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks';
export const TASK_ID = /^[A-Za-z0-9_-]{5,200}$/;

const api = ownerGoogle; // só o dono (revisão E6)
/** Prazo só com data: a doc do Tasks descarta a hora do `due`. */
function dueDate(v: unknown): string {
  const m = String(v ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  if (!m || !d || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) throw new Error('"due" must be a date like 2030-01-15');
  return `${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`;
}
const schema = (properties: Schema['properties'], required: string[]): Schema => ({ type: 'object', properties, required, additionalProperties: false });

export const TASKS_TOOLS: Tool[] = [
  {
    name: 'tasks.list',
    description: 'Lista as tarefas do dono (lista padrão do Google Tasks). Por padrão só as pendentes.',
    parameters: schema({ showCompleted: { type: 'boolean', description: 'incluir concluídas' } }, []),
    approval: 'never',
    run: (a, ctx) => {
      // No Google Tasks, tarefa marcada como feita na tela fica *hidden*. `showCompleted` sozinho não a traz:
      // a resposta vem 200 e vazia, e "já terminei aquilo?" era respondido com "não". Os dois andam juntos.
      const completas = a.showCompleted === true;
      const cap = 20;
      const r = gcall(api(ctx), { method: 'get', url: `${TASKS_URL}?showCompleted=${completas}&showHidden=${completas}&maxResults=${cap}` }, 'ler as tarefas');
      const items = (r.items ?? []) as Record<string, string>[];
      const lines = items.map((t) => `${t.id} | ${String(t.title ?? '').slice(0, 200)} | ${t.due ? `vence ${t.due.slice(0, 10)}` : 'sem prazo'} | ${t.status === 'completed' ? 'concluída' : 'pendente'}`);
      return asData('tarefas', incompleta(lines, cap, r.nextPageToken));
    },
  },
  {
    name: 'tasks.create',
    description: 'Cria uma tarefa para o dono no Google Tasks. Pede aprovação uma vez por turno.',
    parameters: schema({ title: { type: 'string', description: 'título', maxLength: 1024 }, notes: { type: 'string', description: 'notas (opcional)', maxLength: 8192 }, due: { type: 'string', description: 'prazo, ex.: 2030-01-15 (opcional)', maxLength: 10 } }, ['title']),
    approval: 'once',
    run: (a, ctx) => {
      const title = String(a.title).trim();
      if (!title) throw new Error('"title" vazio');
      const body = { title, ...(a.notes ? { notes: String(a.notes) } : {}), ...(a.due ? { due: dueDate(a.due) } : {}) };
      const google = api(ctx);
      ctx.beforeEffect?.();
      const t = gcall(google, { method: 'post', url: TASKS_URL, body }, 'criar a tarefa');
      return JSON.stringify({ id: t.id, title: t.title });
    },
  },
  {
    name: 'tasks.complete',
    description: 'Marca uma tarefa como concluída (use o id de tasks.list). Pede aprovação uma vez por turno.',
    parameters: schema({ id: { type: 'string', description: 'id da tarefa', maxLength: 200 } }, ['id']),
    approval: 'once',
    run: (a, ctx) => {
      const id = String(a.id);
      if (!TASK_ID.test(id)) throw new Error('invalid task "id"');
      const google = api(ctx);
      ctx.beforeEffect?.();
      const t = gcall(google, { method: 'patch', url: `${TASKS_URL}/${enc(id)}`, body: { status: 'completed' } }, 'concluir a tarefa');
      return JSON.stringify({ id: t.id, status: t.status });
    },
  },
];
