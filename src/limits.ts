// Painel de limites (ADR-016), núcleo puro: junta leituras informadas (Google/OpenRouter) e medidas (gasclaw)
// em itens com barra verde/amarela/vermelha, reset e selo da fonte. A borda que lê cada fonte fica em observe.ts.

export type Level = 'verde' | 'amarelo' | 'vermelho' | 'sem limite';
export type Source = 'google' | 'openrouter' | 'gasclaw';
export type Status = 'ok' | 'pendente' | 'erro';
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
  if (total === null || used === null || total <= 0) return 'sem limite';
  const r = used / total;
  return r < 0.7 ? 'verde' : r < 0.9 ? 'amarelo' : 'vermelho';
}

export const nextUtcMidnight = (now: number) => {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
};

const GOOGLE_DAY = '24 h (cota diária do Google)';
const PENDING = /autoriza|scope|escopo|permission|insufficient|401|403/i;

function item(id: string, label: string, unit: string, source: Source, r: Read<unknown>, used: number | null, total: number | null, reset: string | null, note?: string): LimitItem {
  const status: Status = r.ok ? 'ok' : PENDING.test(r.error) ? 'pendente' : 'erro';
  const ok = status === 'ok';
  return { id, label, used: ok ? used : null, total, unit, level: ok ? level(used, total) : 'sem limite', reset, source, status, ...(ok ? (note ? { note } : {}) : { note: (r as { error: string }).error }) };
}

const OK: Read<null> = { ok: true, value: null };

export function buildLimits(i: LimitsInput): LimitItem[] {
  const m = i.measured;
  const orReset = new Date(nextUtcMidnight(i.now)).toISOString();
  const freeTier = i.key.ok ? i.key.value.is_free_tier : false;
  const q = QUOTAS[i.account ?? 'workspace'];
  return [
    item('freeDay', 'OpenRouter: requisições :free hoje', 'req', 'gasclaw', i.key, m.freeToday, freeTier ? 50 : 1000, orReset, 'limite: 50/dia sem créditos, 1000/dia com US$ 10+'),
    item('freeMin', 'OpenRouter: requisições :free por minuto (pico na última hora)', 'req/min', 'gasclaw', OK, m.freePerMinuteMax, 20, null),
    item('orDaily', 'OpenRouter: gasto hoje (dia UTC)', 'US$', 'openrouter', i.key, i.key.ok ? i.key.value.usage_daily : null, null, orReset, `medido pelo gasclaw: US$ ${m.costToday}${i.key.ok && i.key.value.limit !== null ? ` · limite de crédito da chave (total, não diário): US$ ${i.key.value.limit}` : ''}`), // o limit da chave é total: não serve de barra para o dia
    item('drive', 'Drive: armazenamento', 'bytes', 'google', i.drive, i.drive.ok ? i.drive.value.usage : null, i.drive.ok ? i.drive.value.limit : null, null),
    item('urlfetch', 'Apps Script: chamadas UrlFetch hoje (estimado)', 'chamadas', 'gasclaw', OK, m.urlFetchToday, q.urlFetch, GOOGLE_DAY),
    item('runtime', 'Apps Script: maior execução hoje', 'ms', 'gasclaw', OK, m.longestMs, 360_000, null, 'limite: 6 min por execução'),
    item('props', 'Apps Script: Script Properties', 'bytes', 'gasclaw', OK, m.propsBytes, 500_000, null, 'limite: 500 KB no total, 9 KB por valor'),
    item('processes', 'Apps Script: tempo de gatilhos hoje', 'ms', 'google', i.processes, i.processes.ok ? i.processes.value.triggerMsToday : null, q.triggerMs, GOOGLE_DAY),
    item('mail', 'Apps Script: destinatários de e-mail hoje', 'destinatários', 'google', i.mail, i.mail.ok ? Math.max(0, q.mail - i.mail.value) : null, q.mail, GOOGLE_DAY),
    item('triggers', 'Apps Script: gatilhos do projeto', 'gatilhos', 'google', i.triggers, i.triggers.ok ? i.triggers.value : null, 20, null),
    item('monitoring', 'Google Cloud: requisições às APIs hoje (Monitoring)', 'req', 'google', i.monitoring, i.monitoring.ok ? i.monitoring.value.requests : null, null, null),
  ];
}
