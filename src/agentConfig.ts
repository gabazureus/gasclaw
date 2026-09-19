// Campos de configuração declarados pelo agente (mutação → painel). NÚCLEO PURO.
//
// O agente evoluiu e ganhou comportamento que o anterior não tinha; o dono precisa de um campo para
// ajustar isso, em vez de editar markdown. Mas a tela é onde moram os controles de acesso,
// ferramenta e capacidade — então a regra que sustenta o arquivo inteiro é:
//
//   O AGENTE DECLARA DADO. A TELA DESENHA COM RENDERIZADOR FIXO.
//
// Se conteúdo da pasta COMPARTILHÁVEL virasse interface, um editor da pasta desenharia botões no
// painel do dono. Seria um ataque mais elegante que qualquer um que a revisão adversarial achou.
// Por isso: conjunto FECHADO de tipos, tipo desconhecido RECUSADO (não renderizado), e o valor vai
// para a tela por `textContent`, como o renderizador do chat já faz (`chatMarkdown.test.ts`).

export const FIELD_TYPES = ['text', 'number', 'boolean', 'choice'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export type ConfigField = { name: string; type: FieldType; label: string; default?: string | number | boolean; choices?: string[] };

/** Nome de campo: minúsculo, sem ponto, sem barra, sem `..`. O padrão dos nomes de agente e skill. */
export const FIELD_NAME = /^[a-z][a-z0-9_]{0,39}$/;

/**
 * Nomes que um campo declarado NUNCA pode usar — e a lista é de **reserva de namespace**, não de
 * bom gosto. Cada um destes tem dono e caminho próprios (painel, `ACCESS:`, `CAP:`, `CREATOR`), e
 * deixar um campo declarado pela pasta escrever em qualquer um seria devolver à pasta exatamente o
 * poder que o ADR-021 tirou dela.
 */
export const RESERVED = ['cap', 'access', 'owner', 'model', 'steps', 'creator', 'http_allow', 'budget', 'interval', 'agents', 'chief', 'lastgen', 'status', 'policy'] as const;

export type FieldParse = { field: ConfigField | null; error: string };

/**
 * Lê UM campo declarado. Recusa por inteiro em vez de consertar: um campo meio aceito dá ao dono a
 * impressão de que ele configurou uma coisa quando configurou outra.
 *
 * A recusa **carrega o motivo**, porque ela vai para a tela: um campo que some em silêncio faz o
 * dono achar que o produto está quebrado.
 */
export function parseField(raw: unknown): FieldParse {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { field: null, error: 'field must be an object' };
  const o = raw as Record<string, unknown>;
  const name = String(o.name ?? '').toLowerCase().trim();
  if (!FIELD_NAME.test(name)) return { field: null, error: `invalid field name: ${String(o.name).slice(0, 40)}` };
  if ((RESERVED as readonly string[]).includes(name)) return { field: null, error: `reserved name: ${name} belongs to the panel, not to the folder` };
  const type = String(o.type ?? '') as FieldType;
  if (!(FIELD_TYPES as readonly string[]).includes(type)) return { field: null, error: `unknown field type: ${String(o.type).slice(0, 20)}` };
  const label = String(o.label ?? '').trim();
  if (!label || label.length > 80) return { field: null, error: `field ${name} needs a label of 1 to 80 characters` };
  if (type === 'choice') {
    const choices = Array.isArray(o.choices) ? o.choices.filter((c): c is string => typeof c === 'string') : [];
    if (choices.length < 2 || choices.length > 20) return { field: null, error: `field ${name}: a choice needs 2 to 20 options` };
    return { field: { name, type, label, choices, ...(o.default !== undefined ? { default: String(o.default) } : {}) }, error: '' };
  }
  return { field: { name, type, label, ...(o.default !== undefined ? { default: o.default as string | number | boolean } : {}) }, error: '' };
}

export type SchemaParse = { fields: ConfigField[]; errors: string[] };

/** Teto de campos: a tela é do dono, e uma pasta não pode enchê-la. */
export const MAX_FIELDS = 12;

/**
 * Lê o esquema inteiro. Diferente do `parseCapabilities`, aqui um campo ruim **não invalida os
 * outros** — e a diferença é deliberada: capacidade é poder (meio-aceito é perigoso), campo é
 * conveniência (perder todos porque um veio torto punia o dono pelo erro do agente).
 * Todo campo recusado vira erro VISÍVEL.
 */
export function parseSchema(raw: unknown): SchemaParse {
  if (!Array.isArray(raw)) return { fields: [], errors: raw === undefined ? [] : ['config must be a list of fields'] };
  const fields: ConfigField[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const item of raw.slice(0, MAX_FIELDS)) {
    const { field, error } = parseField(item);
    if (!field) errors.push(error);
    else if (seen.has(field.name)) errors.push(`duplicate field: ${field.name}`);
    else {
      seen.add(field.name);
      fields.push(field);
    }
  }
  if (raw.length > MAX_FIELDS) errors.push(`too many fields: ${raw.length}, the limit is ${MAX_FIELDS}`);
  return { fields, errors };
}

/** Script Properties: 9 KB por valor. Mesma margem do `usage.ts` e do `saveAgents`. */
export const CONFIG_MAX = 8_000;

/**
 * Valida o que o dono digitou, **no servidor**, antes de gravar. O cliente é um
 * `google.script.run` e não é fonte da verdade — mesmo princípio do `setAgentRole`, que recusa
 * papel desconhecido antes de escrever.
 */
export function validateValues(fields: readonly ConfigField[], values: Record<string, unknown>): { ok: boolean; clean: Record<string, string | number | boolean>; errors: string[] } {
  const clean: Record<string, string | number | boolean> = {};
  const errors: string[] = [];
  const known = new Map(fields.map((f) => [f.name, f]));
  for (const [k, v] of Object.entries(values ?? {})) {
    const f = known.get(k);
    if (!f) {
      errors.push(`unknown field: ${k.slice(0, 40)}`); // campo fora do esquema nunca é gravado
      continue;
    }
    if (f.type === 'boolean') clean[k] = v === true || v === 'true';
    else if (f.type === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n)) errors.push(`field ${k} must be a number`);
      else clean[k] = n;
    } else if (f.type === 'choice') {
      if (!(f.choices ?? []).includes(String(v))) errors.push(`field ${k}: ${String(v).slice(0, 40)} is not one of the options`);
      else clean[k] = String(v);
    } else {
      const t = String(v);
      if (t.length > 500) errors.push(`field ${k} is too long (limit 500)`);
      else clean[k] = t;
    }
  }
  if (JSON.stringify(clean).length > CONFIG_MAX) return { ok: false, clean: {}, errors: [...errors, 'the configuration is too large to store'] };
  return { ok: errors.length === 0, clean, errors };
}

/**
 * Sucessão: a geração nova declara campos diferentes. O valor que o dono configurou e que a nova
 * geração não declara vira **órfão** — e ele é PRESERVADO, nunca apagado em silêncio.
 *
 * Por quê preservar: o valor é do DONO, não do agente. Descartar seria o agente apagando uma
 * escolha humana ao mutar, e uma reversão de bastão devolveria a geração antiga sem a configuração
 * dela. Preservar custa bytes; descartar custa confiança.
 */
export type MergedConfig = { active: Record<string, string | number | boolean>; orphans: Record<string, string | number | boolean> };

export function mergeAcrossGenerations(fields: readonly ConfigField[], stored: Record<string, string | number | boolean>): MergedConfig {
  const known = new Set(fields.map((f) => f.name));
  const active: Record<string, string | number | boolean> = {};
  const orphans: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(stored ?? {})) (known.has(k) ? active : orphans)[k] = v;
  return { active, orphans };
}

/** De onde veio o campo, para a tela mostrar como o ADR-035 fez com os papéis. */
export type FieldOrigin = 'editor' | 'folder' | 'inherited';
export const originLabel = (o: FieldOrigin): string =>
  o === 'editor' ? 'declared in the Apps Script editor (trusted)' : o === 'folder' ? 'declared in the shared Drive folder' : 'inherited from the previous generation';
