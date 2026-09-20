// Agenda (E6): Google Calendar API v3 por REST, escopos calendar.events e calendar.events.freebusy (ADR-015).
import { asData, enc, gcall, type Google, incompleta, localDateTime, ownerGoogle, parseEmails as emails, qs } from './google';
import type { Schema, Tool, ToolCtx } from './registry';

const CAL = 'https://www.googleapis.com/calendar/v3';
const MAX_DAYS = 62;
const HAS_ZONE = /(Z|[+-]\d{2}:\d{2})$/;

const api = ownerGoogle; // só o dono (revisão E6)
/** Instante absoluto (RFC 3339 com fuso) para timeMin/timeMax. minimal: offset fixo do fuso do gasclaw (sem horário de verão). */
const instant = (v: unknown, field: string, ctx: ToolCtx) => {
  const dt = localDateTime(String(v), field);
  return HAS_ZONE.test(dt) ? dt : `${dt}${ctx.offset ?? 'Z'}`;
};
/** Horário de evento: sem fuso explícito usa o fuso do gasclaw (a API resolve o horário de verão). */
const when = (v: unknown, field: string, ctx: ToolCtx) => {
  const dt = localDateTime(String(v), field);
  return HAS_ZONE.test(dt) ? { dateTime: dt } : { dateTime: dt, timeZone: ctx.timeZone ?? 'America/Sao_Paulo' };
};
function period(from: unknown, to: unknown, ctx: ToolCtx) {
  const timeMin = instant(from, 'from', ctx);
  const timeMax = instant(to, 'to', ctx);
  const ms = Date.parse(timeMax) - Date.parse(timeMin);
  if (!(ms > 0)) throw new Error('"to" must be after "from"');
  if (ms > MAX_DAYS * 86_400_000) throw new Error(`a range of at most ${MAX_DAYS} days`);
  return { timeMin, timeMax };
}
const checkOrder = (start: { dateTime: string }, end: { dateTime: string }, ctx: ToolCtx) => {
  const abs = (d: { dateTime: string }) => Date.parse(HAS_ZONE.test(d.dateTime) ? d.dateTime : `${d.dateTime}${ctx.offset ?? 'Z'}`);
  if (!(abs(end) > abs(start))) throw new Error('"end" must be after "start"');
};
const meetRequest = () => ({ createRequest: { requestId: `gasclaw-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } });
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- evento da API
const created = (ev: any) => JSON.stringify({ id: ev.id, link: ev.htmlLink ?? null, meet: ev.hangoutLink ?? null });
const WRITE = `${CAL}/calendars/primary/events`;
const WRITE_QS = 'conferenceDataVersion=1&sendUpdates=none'; // minimal: não envia convite por e-mail aos convidados

const str = (description: string, maxLength = 200) => ({ type: 'string' as const, description, maxLength });
const dt = (d: string) => str(`${d}, e.g. 2030-01-15T10:00 (gasclaw time zone) or with an explicit zone`, 40);
const schema = (properties: Schema['properties'], required: string[]): Schema => ({ type: 'object', properties, required, additionalProperties: false });

export const CALENDAR_TOOLS: Tool[] = [
  {
    name: 'calendar.list',
    description: "Lists the owner's calendar events in a range (up to 62 days). Use it before answering anything about their schedule.",
    parameters: schema({ from: dt('start of the range'), to: dt('end of the range'), query: str('text to filter by (optional)', 100) }, ['from', 'to']),
    approval: 'never',
    run: (a, ctx) => {
      const { timeMin, timeMax } = period(a.from, a.to, ctx);
      const cap = 25;
      const url = `${CAL}/calendars/primary/events?${qs({ timeMin, timeMax, singleEvents: true, orderBy: 'startTime', maxResults: cap, q: a.query as string | undefined })}`;
      const r = gcall(api(ctx), { method: 'get', url }, 'ler a agenda');
      const items = (r.items ?? []) as Record<string, any>[];
      const lines = items.map((e) =>
        [
          `${e.id} | ${e.start?.dateTime ?? e.start?.date ?? '?'} → ${e.end?.dateTime ?? e.end?.date ?? '?'} | ${String(e.summary ?? '(sem título)').slice(0, 200)}`,
          e.location ? `local: ${String(e.location).slice(0, 120)}` : '',
          e.hangoutLink ? `meet: ${e.hangoutLink}` : '',
        ]
          .filter(Boolean)
          .join(' | '),
      );
      return asData('agenda', incompleta(lines, cap, r.nextPageToken));
    },
  },
  {
    name: 'calendar.create',
    description: "Creates an event on the owner's calendar, with a Google Meet link by default. Asks for approval. Does not e-mail invitations.",
    parameters: schema(
      { title: str('title'), start: dt('start'), end: dt('fim'), description: str('descrição (opcional)', 2000), attendees: str('e-mails dos convidados separados por vírgula (opcional)', 1000), meet: { type: 'boolean', description: 'criar link do Meet (padrão: sim)' } },
      ['title', 'start', 'end'],
    ),
    approval: 'always',
    run: (a, ctx) => {
      const title = String(a.title).trim();
      if (!title) throw new Error('"title" vazio');
      const start = when(a.start, 'start', ctx);
      const end = when(a.end, 'end', ctx);
      checkOrder(start, end, ctx);
      const guests = emails(a.attendees);
      const body = {
        summary: title,
        ...(a.description ? { description: String(a.description) } : {}),
        start,
        end,
        ...(guests.length ? { attendees: guests.map((email) => ({ email })) } : {}),
        ...(a.meet === false ? {} : { conferenceData: meetRequest() }),
      };
      const google = api(ctx);
      ctx.beforeEffect?.();
      return created(gcall(google, { method: 'post', url: `${WRITE}?${WRITE_QS}`, body }, 'criar o evento'));
    },
  },
  {
    name: 'calendar.update',
    description: "Changes an existing event on the owner's calendar (use the id from calendar.list). Asks for approval.",
    parameters: schema({ id: str('id do evento', 1024), title: str('new title'), start: dt('new start'), end: dt('novo fim'), description: str('new description', 2000), meet: { type: 'boolean', description: 'adicionar link do Meet' } }, ['id']),
    approval: 'always',
    run: (a, ctx) => {
      const id = String(a.id);
      if (!/^[a-zA-Z0-9_]{5,1024}$/.test(id)) throw new Error('invalid event "id"');
      const body = {
        ...(a.title !== undefined ? { summary: String(a.title) } : {}),
        ...(a.description !== undefined ? { description: String(a.description) } : {}),
        ...(a.start !== undefined ? { start: when(a.start, 'start', ctx) } : {}),
        ...(a.end !== undefined ? { end: when(a.end, 'end', ctx) } : {}),
        ...(a.meet === true ? { conferenceData: meetRequest() } : {}),
      };
      if (!Object.keys(body).length) throw new Error('nothing to change');
      if (body.start && body.end) checkOrder(body.start, body.end, ctx);
      const google = api(ctx);
      ctx.beforeEffect?.();
      return created(gcall(google, { method: 'patch', url: `${WRITE}/${enc(id)}?${WRITE_QS}`, body }, 'alterar o evento'));
    },
  },
  {
    name: 'calendar.freebusy',
    description: 'Shows when people (by e-mail) are busy in a range, to find a free slot.',
    parameters: schema({ emails: str('comma-separated e-mails (up to 20)', 1000), from: dt('start'), to: dt('fim') }, ['emails', 'from', 'to']),
    approval: 'never',
    run: (a, ctx) => {
      const list = emails(a.emails);
      if (!list.length) throw new Error('informe ao menos um e-mail');
      const { timeMin, timeMax } = period(a.from, a.to, ctx);
      const body = { timeMin, timeMax, timeZone: ctx.timeZone ?? 'America/Sao_Paulo', items: list.map((id) => ({ id })) };
      const cals = (gcall(api(ctx), { method: 'post', url: `${CAL}/freeBusy`, body }, 'consultar a disponibilidade').calendars ?? {}) as Record<string, any>;
      const lines = list.map((e) => {
        const c = cals[e] ?? {};
        if (c.errors?.length) return `${e}: no access (${c.errors.map((x: { reason?: string }) => x.reason).join(', ')})`;
        const busy = (c.busy ?? []) as { start: string; end: string }[];
        return busy.length ? `${e}: ocupado ${busy.map((b) => `${b.start} → ${b.end}`).join('; ')}` : `${e}: free in this range`;
      });
      return asData('disponibilidade', lines.join('\n'));
    },
  },
];
