// O agente SUCESSOR por patch (F7, Fase 2, ADR-043). NÚCLEO PURO.
//
// A casca (`writeSuccessor` no main) lê o próprio código pela API, manda ao Opus, e implanta o que sair
// daqui. Tudo o que DECIDE mora neste arquivo: o que vai no pedido, se o patch vira código, e se o dono
// pode coroar. A casca só faz I/O.
import { beatsIncumbent } from './dream';
import { guardsWeakened } from './guards';
import { applyPatch, parsePatch, type Change, type PatchFile } from './patch';

/**
 * Arquivos que o patch NÃO toca, e por quê:
 * - `appsscript`: os escopos do sucessor são os do pai (decisão 2). Um patch no manifesto seria o Opus
 *   pedindo poder novo por baixo da porta.
 * - `successor_seed`: é o que faz o sucessor nascer PARADO e saber qual agente servir. O pai escreve a
 *   semente dele depois do patch — um patch nela seria sobrescrito, ou pior, obedecido.
 */
const INTOCAVEIS: Record<string, string> = {
  appsscript: 'the patch touches the manifest: the successor keeps the parent scopes, and new power does not come in through a patch',
  successor_seed: 'the patch touches the seed: it is what makes the successor born paused, and only the parent writes it',
};

const SYSTEM =
  'You improve a Google Apps Script agent by returning a SMALL patch, never the whole program. ' +
  'Answer with JSON only: {"explanation": "<what you improved and why, at most 5 sentences>", "changes": [{"file": "<file name>", "find": "<an exact excerpt of that file>", "replace": "<its replacement>"}]}. ' +
  'Rules: at most 3 changes; each "find" must be copied EXACTLY from the file and must appear EXACTLY ONCE in it, at most 300 characters; ' +
  'fix ONE real defect or risk you can point to in the code. ' +
  'Never remove or weaken assertOwner, NEVER_AUTO, mayWriteProject, mayAct, isRunnable, isEnabled, the closed tool registry, or any permission or approval check. ' +
  'Never change the files appsscript (the manifest) or successor_seed.';

/** O pedido ao Opus: o código INTEIRO, e o objetivo do dono quando ele declarou um. */
export function patchMessages(files: readonly PatchFile[], goal: string): { role: 'system' | 'user'; content: string }[] {
  const codigo = files.map((f) => `=== FILE: ${f.name} ===\n${f.source}`).join('\n\n');
  const pedido = String(goal ?? '').trim();
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: pedido ? `${codigo}\n\nThe owner's goal for this improvement:\n${pedido}` : codigo },
  ];
}

export type Prepared = { ok: true; files: PatchFile[]; explanation: string; changes: Change[] } | { ok: false; reason: string };

/**
 * O texto do Opus vira o código do sucessor — ou uma recusa com motivo. Fail-closed em cada passo:
 * parse, arquivos intocáveis, troca que não muda nada, aplicação (cada trecho casa UMA vez), e o crivo
 * de guardas em CADA arquivo trocado.
 */
export function prepareSuccessor(files: readonly PatchFile[], raw: string): Prepared {
  const p = parsePatch(raw);
  if (!p.ok) return p;
  for (const c of p.changes) {
    if (INTOCAVEIS[c.file]) return { ok: false, reason: INTOCAVEIS[c.file] };
    if (c.find === c.replace) return { ok: false, reason: `a change in ${c.file} changes nothing: find and replace are the same text` };
  }
  const a = applyPatch(files, p.changes);
  if (!a.ok) return a;
  const motivos: string[] = [];
  for (const nome of new Set(p.changes.map((c) => c.file))) {
    const antes = files.find((f) => f.name === nome)?.source ?? '';
    const depois = a.files.find((f) => f.name === nome)?.source ?? '';
    for (const m of guardsWeakened(antes, depois)) motivos.push(`${nome}: ${m}`);
  }
  if (motivos.length) return { ok: false, reason: `the patch weakens a guard — ${motivos.join('; ')}` };
  return { ok: true, files: a.files, explanation: p.explanation, changes: p.changes };
}

/** O que o pai mediu ao avaliar o sucessor de fora (P34): o juiz é o do pai, para os dois lados. */
export type Evaluation = { successorPasses: number; incumbentPasses: number; k: number; complete: boolean; verdictLeaked: boolean };

export type CrownVerdict = { ok: true; standing: 'wins' | 'ties' } | { ok: false; reason: string };

/**
 * O portão ANTES do clique do dono. Recusa o que não foi medido direito e o que mede PIOR que o titular.
 *
 * O empate libera o clique, e isso é decisão tomada com o número da P34: os dois motores empataram
 * 5×5 em 6 cenários porque a bateria não toca o que um patch de código conserta. Exigir vitória faria
 * todo sucessor por patch ficar preso. A vitória é dita quando existe; a decisão é do dono (decisão 2).
 */
export function crownVerdict(ev: Evaluation | null): CrownVerdict {
  if (!ev) return { ok: false, reason: 'evaluate the successor first: the parent must judge it from outside before the crown' };
  if (!(ev.k > 0)) return { ok: false, reason: 'the evaluation measured no scenario' };
  if (!ev.complete) return { ok: false, reason: 'the evaluation is incomplete: a scenario without an answer is not a passed scenario' };
  if (ev.verdictLeaked) return { ok: false, reason: 'the successor returned a verdict: the evaluated never judges itself' };
  if (ev.successorPasses < ev.incumbentPasses) return { ok: false, reason: `the successor scores worse than the incumbent: ${ev.successorPasses} vs ${ev.incumbentPasses} of ${ev.k}` };
  return { ok: true, standing: beatsIncumbent(ev.successorPasses, ev.incumbentPasses, ev.k) ? 'wins' : 'ties' };
}

// ---------- O registro dos sucessores ----------
//
// Cada sucessor guarda o que o dono precisa ler antes de coroar: a explicação, as trocas, o custo e a
// avaliação. As trocas não cabem numa Property só (9 KB): o registro vai em PEDAÇOS, e o índice diz
// quantos pedaços cada um tem — para a regravação apagar as sobras em vez de deixá-las ressuscitar.

/** Uma linha da avaliação de fora: o cenário e o que o juiz do PAI disse de cada lado. */
export type EvalRow = { name: string; successor: boolean | null; incumbent: boolean; error?: string; verdictLeaked?: boolean };

export type SuccessorRecord = {
  scriptId: string;
  url: string;
  folderId: string;
  at: number;
  model: string;
  explanation: string;
  changes: Change[];
  costUsd: number;
  evaluation: (Evaluation & { at: number; rows: EvalRow[] }) | null;
  crownedAt: number | null;
};

export const SUCCESSORS_PROP = 'SUCCESSORS';
const PEDACO = 8000;
const pedacoProp = (id: string, i: number) => `SUCC:${id}:${i}`;
type Indice = { scriptId: string; chunks: number }[];

function indiceDe(raw: string | null | undefined): Indice {
  try {
    const v = JSON.parse(raw ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is Indice[number] => !!x && typeof x.scriptId === 'string' && Number.isInteger(x.chunks) && x.chunks > 0) : [];
  } catch {
    return []; // índice ilegível: nenhum sucessor na tela, e nenhum motor derrubado por isso
  }
}

/** Os sucessores registrados, na ordem do índice. Um registro ilegível é pulado sem cegar os outros. */
export function readSuccessorsFrom(all: Record<string, string | null | undefined>): SuccessorRecord[] {
  const out: SuccessorRecord[] = [];
  for (const { scriptId, chunks } of indiceDe(all[SUCCESSORS_PROP])) {
    try {
      const texto = Array.from({ length: chunks }, (_, i) => all[pedacoProp(scriptId, i)] ?? '').join('');
      const r = JSON.parse(texto) as SuccessorRecord;
      if (r && r.scriptId === scriptId) out.push(r);
    } catch {
      // pedaço perdido ou cortado: pula este, mostra os outros
    }
  }
  return out;
}

/**
 * O que gravar para salvar (ou substituir) um registro. `value: null` quer dizer APAGUE: o pedaço que
 * sobrou de uma versão maior do mesmo registro.
 */
export function successorWrites(all: Record<string, string | null | undefined>, rec: SuccessorRecord): { prop: string; value: string | null }[] {
  const texto = JSON.stringify(rec);
  const pedacos: string[] = [];
  for (let i = 0; i < texto.length; i += PEDACO) pedacos.push(texto.slice(i, i + PEDACO));
  const indice = indiceDe(all[SUCCESSORS_PROP]);
  const antes = indice.find((x) => x.scriptId === rec.scriptId)?.chunks ?? 0;
  const novo = [...indice.filter((x) => x.scriptId !== rec.scriptId), { scriptId: rec.scriptId, chunks: pedacos.length }];
  const escritas: { prop: string; value: string | null }[] = pedacos.map((p, i) => ({ prop: pedacoProp(rec.scriptId, i), value: p }));
  for (let i = pedacos.length; i < antes; i++) escritas.push({ prop: pedacoProp(rec.scriptId, i), value: null });
  escritas.push({ prop: SUCCESSORS_PROP, value: JSON.stringify(novo) });
  return escritas;
}

/**
 * Onde escrever a próxima geração: o sucessor PARADO e NÃO coroado mais recente deste agente. Reusar o
 * projeto é o que poupa o dono dos três atos (vincular o GCP, autorizar, colar a chave) a cada geração —
 * eles são do projeto, não do código. `null` = criar um projeto novo.
 */
export function slotFor(list: readonly SuccessorRecord[], folderId: string): SuccessorRecord | null {
  const livres = list.filter((r) => r.folderId === folderId && r.crownedAt === null);
  return livres.length ? livres.reduce((a, b) => (b.at > a.at ? b : a)) : null;
}

// ---------- O HEALTH da coroa: o sucessor pode assumir? ----------
//
// A nota da avaliação não basta. Ela diz que o sucessor responde os cenários na caixa de areia; não diz
// que ele consegue SERVIR o agente depois da coroa. Cada checagem abaixo é uma forma real de a troca
// falhar — e todas precisam passar, porque a coroa pausa o motor que hoje funciona.

/** O que o sucessor diz de si mesmo pelo `health` profundo (lido com o token do dono). */
export type SuccessorSelf = {
  seedParent: string | null;
  enabled: boolean;
  hasKey: boolean;
  authRequired: boolean;
  agentReadable: { ok: boolean; detail: string };
  trigger: 'active' | 'inactive' | 'awaiting authorization';
  /** F8: as permissões do agente como o FILHO as tem (ACCESS:, CAP:, STATUS:) — nunca segredo. */
  settings?: Record<string, string | null>;
};

export type ReadinessInput = {
  parentId: string;
  /** `authorized`, `needs-consent`, `unknown`… — o estado de consentimento lido de fora. */
  authState: string;
  self: SuccessorSelf | null;
  /** O código do sucessor confere com o do pai + o patch? `null` quando nem deu para ler. */
  code: { ok: boolean; reason: string } | null;
  record: Pick<SuccessorRecord, 'at' | 'evaluation'>;
  /** F8: o sucessor já foi coroado? As perguntas mudam — ele tem de estar RESPONDENDO. */
  crowned?: boolean;
  /** F8: as mesmas chaves, como o PAI as tem. A 10ª checagem compara. */
  parentSettings?: Record<string, string | null>;
};

export type ReadinessCheck = { id: string; label: string; ok: boolean; detail: string };

export function crownReadiness(i: ReadinessInput): { ok: boolean; checks: ReadinessCheck[] } {
  const s = i.self;
  const c = (id: string, label: string, ok: boolean, detail: string): ReadinessCheck => ({ id, label, ok, detail });
  const v = crownVerdict(i.record.evaluation);
  const fresca = !!i.record.evaluation && i.record.evaluation.at >= i.record.at;
  const coroado = i.crowned === true;
  // A 10ª: depois da coroa, o filho tem de ter as permissões do pai; antes, é a coroa que as entrega.
  const pai = i.parentSettings ?? {};
  const diferem = Object.keys(pai).filter((k) => !s?.settings || (s.settings as Record<string, string | null>)[k] !== pai[k]);
  const iguais = !!s?.settings && diferem.length === 0;
  const checks = [
    c('authorized', 'You authorized the successor project', i.authState === 'authorized', i.authState === 'authorized' ? 'authorized' : i.authState === 'needs-consent' ? 'open it once and authorize it' : `could not read it (${i.authState})`),
    c('seed', 'Its seed names this engine as the parent', !!s && s.seedParent === i.parentId, !s ? 'no health answer' : s.seedParent === i.parentId ? 'same parent' : `its parent is ${s.seedParent ?? 'nobody'}`),
    coroado
      ? c('paused', 'It answers for the agent (crowned)', !!s && s.enabled === true, !s ? 'no health answer' : s.enabled ? 'running' : 'it is PAUSED: nobody answers for the agent')
      : c('paused', 'It is paused until the crown', !!s && s.enabled === false, !s ? 'no health answer' : s.enabled ? 'it is RUNNING already: two engines would answer the same agent' : 'paused'),
    c('key', 'The OpenRouter key is pasted in its panel', !!s && s.hasKey, !s ? 'no health answer' : s.hasKey ? 'key present' : 'paste the key in its panel'),
    c('scopes', 'No scope is waiting for your consent', !!s && !s.authRequired, !s ? 'no health answer' : s.authRequired ? 'a scope is missing: open its panel and authorize' : 'all scopes granted'),
    c('drive', 'It reads the agent folder in Drive', !!s && s.agentReadable.ok, !s ? 'no health answer' : s.agentReadable.detail),
    // `inactive` passa: a coroa cria o gatilho. `awaiting authorization` não: sem o escopo, ele nunca nasce.
    coroado
      ? c('worker', 'Its 1-minute worker is running', !!s && s.trigger === 'active', !s ? 'no health answer' : s.trigger)
      : c('worker', 'Its 1-minute worker exists or can be created', !!s && s.trigger !== 'awaiting authorization', !s ? 'no health answer' : s.trigger === 'active' ? 'active' : s.trigger === 'inactive' ? 'created by the crown' : 'the trigger scope is not authorized'),
    c('code', coroado ? 'Its code is this engine’s CURRENT code' : 'Its code is this engine’s CURRENT code plus the patch', !!i.code && i.code.ok, !i.code ? 'could not read its code' : i.code.reason),
    coroado
      ? c('evaluation', 'Crowned after an outside evaluation', true, 'the evaluation counted for the crown')
      : c('evaluation', 'Judged from outside after the last write, not worse', v.ok && fresca, !v.ok ? v.reason : fresca ? `${v.standing === 'wins' ? 'wins' : 'ties'}: ${i.record.evaluation!.successorPasses}/${i.record.evaluation!.k} vs ${i.record.evaluation!.incumbentPasses}/${i.record.evaluation!.k}` : 'the successor was written again after this evaluation: evaluate it again'),
    c('settings', 'It has the parent’s permissions and capabilities', !coroado || iguais, !coroado ? 'handed over by the crown' : iguais ? 'same as this engine' : `${diferem.map((k) => k.split(':')[0]).join(', ')} differ from this engine: succession inherit copies this engine's over the successor's`),
  ];
  return { ok: checks.every((x) => x.ok), checks };
}

/**
 * O código do sucessor é o código ATUAL do pai mais o patch? Se o pai mudou depois da geração (um `up`
 * novo), coroar o sucessor DESFARIA essas mudanças — ele foi feito de um pai que não existe mais.
 * Confere também o manifesto (os mesmos escopos) e o crivo de guardas, de novo, no que está implantado.
 */
export function codeMatches(parent: readonly PatchFile[], successor: readonly PatchFile[], changes: readonly Change[]): { ok: boolean; reason: string } {
  const semSemente = (fs: readonly PatchFile[]) => fs.filter((f) => f.name !== 'successor_seed');
  const esperado = applyPatch(semSemente(parent), changes);
  if (!esperado.ok) return { ok: false, reason: `this engine changed since the successor was written (${esperado.reason}): write it again` };
  const real = semSemente(successor);
  for (const f of esperado.files) {
    const r = real.find((x) => x.name === f.name);
    if (!r) return { ok: false, reason: `the successor is missing ${f.name}` };
    if (r.source !== f.source) return { ok: false, reason: f.name === 'appsscript' ? 'its manifest differs from this engine’s' : `${f.name} differs from this engine’s code plus the patch` };
  }
  const extra = real.find((x) => !esperado.files.some((f) => f.name === x.name));
  if (extra) return { ok: false, reason: `the successor has a file this engine does not: ${extra.name}` };
  if (!successor.some((f) => f.name === 'successor_seed')) return { ok: false, reason: 'the successor has no seed' };
  // O crivo de novo, no que está IMPLANTADO: o patch passou por ele ao ser escrito, e a igualdade acima
  // já implica isso — mas a coroa não se apoia numa implicação quando pode medir.
  for (const f of real) {
    const antes = parent.find((x) => x.name === f.name)?.source ?? '';
    const fraco = guardsWeakened(antes, f.source);
    if (fraco.length) return { ok: false, reason: `${f.name}: ${fraco.join('; ')}` };
  }
  return { ok: true, reason: 'identical to this engine plus the patch, no guard weakened' };
}

// ---------- A coroa que chegou pela metade ----------
//
// Achado ao vivo (2026-09-21, dev v153): o dono clicou em Crown it, o sucessor RECEBEU a coroa (criou o
// worker e ligou), mas a resposta não chegou legível ao pai — e o pai, lendo "fracasso", voltou a rodar.
// Resultado: dois motores respondendo pelo mesmo agente, o estado que a coroa existe para evitar. O erro
// foi decidir pela RESPOSTA, que pode se perder, e não pelo ESTADO do sucessor, que pode ser lido.

/**
 * Tudo passa menos "parado": o sucessor já responde. Coroar aqui não cria dois motores — resolve os dois
 * que já existem. Qualquer outra checagem reprovada continua travando a coroa.
 */
export function halfCrowned(checks: readonly ReadinessCheck[]): boolean {
  const reprovadas = checks.filter((c) => !c.ok);
  return reprovadas.length === 1 && reprovadas[0].id === 'paused';
}

/**
 * A coroa pegou? Quando dá para ler o estado do sucessor depois de mandá-la, é ele que decide. Só quando
 * não dá (fora do ar), vale a resposta — e sem resposta legível, não pegou.
 */
export function crownLanded(reply: { ok?: boolean } | null, successorEnabled: boolean | null): boolean {
  return successorEnabled !== null ? successorEnabled : reply?.ok === true;
}

// ---------- A HERANÇA (F8) ----------
//
// O filho serve o MESMO agente: precisa das permissões, capacidades, agenda, modelo e histórico que o
// pai guarda nas Script Properties dele — que são por projeto, e a semente não leva. O que é SEGREDO
// (chave do OpenRouter, segredo da CLI, chaves de filho) ou estado do MOTOR (ligado, registros de
// sucessor e filhos, runs em voo) nunca atravessa: a opção 4 da ADR-040 vale na herança também.

/** Chaves exatas e prefixos do AGENTE. Lista fechada: o que não está aqui não passa. */
const HERDA_EXATAS = ['CREATOR', 'CAPS_ENABLED', 'LINEAGE', 'BUDGET_OVERRIDE', 'RUNS_FOLDER_ID', 'RUNS_SHEET_ID'];
const HERDA_PREFIXOS = ['ACCESS:', 'CAP:', 'STATUS:', 'STEPS:', 'MODEL:', 'AUTOOK:', 'BATTERY:', 'CFG:', 'FAIL:', 'GENINT:', 'MANDATE:', 'SCHED:', 'SCHEDSEEN:', 'LASTGEN:', 'CODEGEN:'];
/** Segredo VENCE a lista: nenhum nome que contenha um destes passa, com qualquer prefixo. */
const SEGREDOS = ['OPENROUTER_API_KEY', 'CLI_SECRET', 'KEYSEC:', 'KEYDEL:'];
/** Teto de uma Script Property (9 KB): acima disso a gravação falharia no destino. */
const PROP_MAX = 8_900;

/**
 * O que o filho herda do pai. Usada nos DOIS lados — o pai filtra o que manda, o filho filtra o que
 * aceita — para que um erro de um lado só não entregue segredo nenhum.
 */
export function inheritable(props: Record<string, string | null | undefined>): { entries: Record<string, string>; refused: { key: string; reason: string }[] } {
  const entries: Record<string, string> = {};
  const refused: { key: string; reason: string }[] = [];
  for (const [key, value] of Object.entries(props ?? {})) {
    if (SEGREDOS.some((s) => key.includes(s))) continue;
    if (!HERDA_EXATAS.includes(key) && !HERDA_PREFIXOS.some((p) => key.startsWith(p))) continue;
    if (typeof value !== 'string') continue;
    if (value.length > PROP_MAX) {
      refused.push({ key, reason: `${value.length} characters, above the ${PROP_MAX} a property holds` });
      continue;
    }
    entries[key] = value;
  }
  return { entries, refused };
}
