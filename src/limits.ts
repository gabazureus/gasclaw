// Painel de limites (ADR-016), núcleo puro: junta leituras informadas (Google/OpenRouter) e medidas (gasclaw)
// em itens com barra verde/amarela/vermelha, reset e selo da fonte. A borda que lê cada fonte fica em observe.ts.

export type Level = 'green' | 'yellow' | 'red' | 'no limit';
export type Source = 'google' | 'openrouter' | 'gasclaw';
export type Status = 'ok' | 'pending' | 'error';
export type Read<T> = { ok: true; value: T } | { ok: false; error: string };
export type LimitItem = { id: string; label: string; used: number | null; total: number | null; unit: string; level: Level; reset: string | null; source: Source; status: Status; note?: string };

export type Account = 'workspace' | 'pessoal';

/** Conta dona do script: gmail.com/googlemail.com = pessoal; qualquer outro domínio (ou desconhecido) = Workspace. */
export const accountKind = (email: string | null | undefined): Account => (/@(gmail|googlemail)\.com$/i.test((email ?? '').trim()) ? 'pessoal' : 'workspace');

/** Cotas diárias do Apps Script que dependem do tipo de conta (guia oficial "Quotas for Google Services"). */
const QUOTAS: Record<Account, { urlFetch: number; mail: number; triggerMs: number }> = {
  workspace: { urlFetch: 100_000, mail: 1500, triggerMs: 21_600_000 },
  pessoal: { urlFetch: 20_000, mail: 100, triggerMs: 5_400_000 },
};

export type LimitsInput = {
  now: number;
  account?: Account; // padrão: workspace
  drive: Read<{ limit: number | null; usage: number }>;
  key: Read<{ limit: number | null; usage: number; usage_daily: number; is_free_tier: boolean }>;
  measured: { freeToday: number; freePerMinuteMax: number; urlFetchToday: number; tokensToday: number; costToday: number; longestMs: number; propsBytes: number };
  processes: Read<{ triggerMsToday: number; count: number }>;
  mail: Read<number>;
  monitoring: Read<{ requests: number }>;
  triggers: Read<number>;
};

export function level(used: number | null, total: number | null): Level {
  if (total === null || used === null || total <= 0) return 'no limit';
  const r = used / total;
  return r < 0.7 ? 'green' : r < 0.9 ? 'yellow' : 'red';
}

export const nextUtcMidnight = (now: number) => {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
};

const GOOGLE_DAY = '24 h (Google daily quota)';
const PENDING = /autoriza|scope|escopo|permission|permiss|insufficient|401|403/i; // "Você não tem permissão… Permissões necessárias" (Apps Script em pt-BR)

const BILLING = /billing/i; // Cloud Monitoring responde 403 "requires billing to be enabled": não é autorização

function item(id: string, label: string, unit: string, source: Source, r: Read<unknown>, used: number | null, total: number | null, reset: string | null, note?: string): LimitItem {
  const err = r.ok ? '' : (r as { error: string }).error;
  const status: Status = r.ok ? 'ok' : BILLING.test(err) ? 'error' : PENDING.test(err) ? 'pending' : 'error';
  const ok = status === 'ok';
  const errNote = BILLING.test(err) ? `needs billing enabled on the Google Cloud project (your call); ${err.slice(0, 120)}` : err;
  return { id, label, used: ok ? used : null, total, unit, level: ok ? level(used, total) : 'no limit', reset, source, status, ...(ok ? (note ? { note } : {}) : { note: errNote }) };
}

const OK: Read<null> = { ok: true, value: null };

export function buildLimits(i: LimitsInput): LimitItem[] {
  const m = i.measured;
  const orReset = new Date(nextUtcMidnight(i.now)).toISOString();
  const freeTier = i.key.ok ? i.key.value.is_free_tier : false;
  const q = QUOTAS[i.account ?? 'workspace'];
  return [
    item('freeDay', 'OpenRouter: :free requests today', 'req', 'gasclaw', i.key, m.freeToday, freeTier ? 50 : 1000, orReset, 'limit: 50/day without credits, 1000/day with US$ 10+'),
    item('freeMin', 'OpenRouter: :free requests per minute (peak in the last hour)', 'req/min', 'gasclaw', OK, m.freePerMinuteMax, 20, null),
    item('orDaily', 'OpenRouter: spend today (UTC day)', 'US$', 'openrouter', i.key, i.key.ok ? i.key.value.usage_daily : null, null, orReset, `measured by gasclaw: US$ ${m.costToday}${i.key.ok && i.key.value.limit !== null ? ` · key credit limit (total, not daily): US$ ${i.key.value.limit}` : ''}`), // o limit da chave é total: não serve de barra para o dia
    item('drive', 'Drive: storage', 'bytes', 'google', i.drive, i.drive.ok ? i.drive.value.usage : null, i.drive.ok ? i.drive.value.limit : null, null),
    item('urlfetch', 'Apps Script: UrlFetch calls today (estimated)', 'calls', 'gasclaw', OK, m.urlFetchToday, q.urlFetch, GOOGLE_DAY),
    item('runtime', 'Apps Script: longest execution today', 'ms', 'gasclaw', OK, m.longestMs, 360_000, null, 'limit: 6 min per execution'),
    item('props', 'Apps Script: Script Properties', 'bytes', 'gasclaw', OK, m.propsBytes, 500_000, null, 'limit: 500 KB in total, 9 KB per value'),
    item('processes', 'Apps Script: trigger time today', 'ms', 'google', i.processes, i.processes.ok ? i.processes.value.triggerMsToday : null, q.triggerMs, GOOGLE_DAY),
    item('mail', 'Apps Script: email recipients today', 'recipients', 'google', i.mail, i.mail.ok ? Math.max(0, q.mail - i.mail.value) : null, q.mail, GOOGLE_DAY),
    item('triggers', 'Apps Script: project triggers', 'triggers', 'google', i.triggers, i.triggers.ok ? i.triggers.value : null, 20, null),
    item('monitoring', 'Google Cloud: API requests today (Monitoring)', 'req', 'google', i.monitoring, i.monitoring.ok ? i.monitoring.value.requests : null, null, null),
  ];
}
