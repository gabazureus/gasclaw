// O CRIVO DE GUARDAS do agente sucessor (F7, ADR-043). NÚCLEO PURO.
//
// O crivo das automações recusa `getOAuthToken` e `script.googleapis.com` — e recusaria o PRÓPRIO motor,
// que usa os dois (16× e 8× no bundle). Para um sucessor a pergunta é outra: **o patch enfraquece alguma
// guarda?** Compara ANTES × DEPOIS e recusa se qualquer uma diminuir. Acrescentar guarda é fortalecer, e
// o crivo nunca recusa isso.
//
// O que conta como guarda, e por quê:
// - `assertOwner()` — quem não é o dono não muda nada;
// - `mayWriteProject(` — o motor nunca escreve em si mesmo (senão um patch apagaria o `assertOwner` dele);
// - `mayAct(` e `isRunnable(` — o portão único do que age sozinho, e o de arquivado;
// - `isEnabled()` — a chave de parada: o D6 provou que, sem ela em `mayAct`, `down` para o que fala e
//   deixa correr o que paga;
// - `NEVER_AUTO` — as ferramentas que nunca se auto-aprovam;
// - o registro FECHADO de tools, com o nível de aprovação de cada uma — ferramenta nova é poder novo, e
//   descer uma aprovação ("always" → "never") enfraquece sem apagar linha nenhuma.

export type Approval = 'always' | 'once' | 'never';
export type Guards = { counts: Record<string, number>; neverAuto: string[] | null; tools: Record<string, Approval> };

/** Força de cada nível: descer na escada é enfraquecer. */
const FORCA: Record<Approval, number> = { always: 2, once: 1, never: 0 };

const CHAMADAS: Record<string, string> = {
  assertOwner: 'assertOwner()',
  mayWriteProject: 'mayWriteProject(',
  mayAct: 'mayAct(',
  isRunnable: 'isRunnable(',
  isEnabled: 'isEnabled()',
};

const conta = (src: string, s: string) => src.split(s).length - 1;

/** Uma `/` abre regex (e não divide) quando vem depois de operador, abertura ou palavra como `return`. */
function abreRegex(out: string[], i: number): boolean {
  let k = i - 1;
  while (k >= 0 && /\s/.test(out[k])) k--;
  if (k < 0 || '(,=:[!&|?{};+-*%<>~^'.includes(out[k])) return true;
  let w = '';
  while (k >= 0 && /[\w$]/.test(out[k])) w = out[k--] + w;
  return /^(return|typeof|case|in|of|void|delete|throw|new|else|do)$/.test(w);
}

/**
 * Troca comentários, literais de string ('', "", ``) e regex literais por espaços, MANTENDO o comprimento
 * e as quebras de linha — os índices continuam valendo no fonte original. Sem isto, `// assertOwner();`
 * ou `"assertOwner();"` contavam como guarda. O regex é reconhecido por heurística (`abreRegex`); se ela
 * errar, erra igual nos dois lados, e a regra de `changesTouchGuards` cobre o que escapar daqui.
 */
export function codeOnly(source: string): string {
  const s = String(source ?? '');
  const out = s.split('');
  const apaga = (de: number, ate: number) => { for (let k = de; k < ate && k < s.length; k++) if (s[k] !== '\n') out[k] = ' '; };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '/') { const f = s.indexOf('\n', i); const fim = f < 0 ? s.length : f; apaga(i, fim); i = fim; }
    else if (c === '/' && s[i + 1] === '*') { const f = s.indexOf('*/', i + 2); const fim = f < 0 ? s.length : f + 2; apaga(i, fim); i = fim - 1; }
    else if (c === '/' && abreRegex(out, i)) {
      // Regex literal: vai até a `/` que fecha, fora de `[...]`. Sem fechar na mesma linha, era divisão.
      let j = i + 1;
      let classe = false;
      for (; j < s.length && s[j] !== '\n'; j++) {
        if (s[j] === '\\') j++;
        else if (s[j] === '[') classe = true;
        else if (s[j] === ']') classe = false;
        else if (s[j] === '/' && !classe) break;
      }
      if (s[j] === '/') { apaga(i, j + 1); i = j; }
    }
    else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < s.length && s[j] !== c && !(c !== '`' && s[j] === '\n')) j += s[j] === '\\' ? 2 : 1;
      apaga(i, j + 1); i = j;
    }
  }
  return out.join('');
}

/** Tira comentários de linha — o bundle tem comentários DENTRO da lista `NEVER_AUTO`, com aspas. */
const semComentarios = (src: string) => src.replace(/\/\/[^\n]*/g, '');

export function guardsOf(source: string): Guards {
  const src = String(source ?? '');
  const counts: Record<string, number> = {};
  const codigo = codeOnly(src);
  for (const [k, s] of Object.entries(CHAMADAS)) counts[k] = conta(codigo, s);

  // `NEVER_AUTO = [ ... ]` — `null` quando a lista SUMIU, que é diferente de lista vazia.
  let neverAuto: string[] | null = null;
  const m = /NEVER_AUTO\s*=\s*\[([\s\S]*?)\]/.exec(src);
  if (m) neverAuto = [...semComentarios(m[1]).matchAll(/["']([a-z]+\.[a-z_.]+)["']/g)].map((x) => x[1]).sort();

  // O registro: cada `name: "x.y"` e a `approval` que vem depois dele, antes do próximo `name:`.
  const tools: Record<string, Approval> = {};
  const nomes = [...src.matchAll(/name:\s*"([a-z]+\.[a-z_.]+)"/g)];
  nomes.forEach((n, i) => {
    const fim = i + 1 < nomes.length ? (nomes[i + 1].index as number) : src.length;
    const a = /approval:\s*"(always|once|never)"/.exec(src.slice(n.index as number, fim));
    if (a) tools[n[1]] = a[1] as Approval;
  });
  return { counts, neverAuto, tools };
}

/**
 * O patch enfraquece alguma guarda? Devolve o motivo de CADA enfraquecimento — vazio quer dizer que
 * nada diminuiu. O motivo diz qual guarda e quanto, para o dono ler antes de coroar.
 */
export function guardsWeakened(before: string, after: string): string[] {
  const a = guardsOf(before);
  const d = guardsOf(after);
  const motivos: string[] = [];
  for (const k of Object.keys(CHAMADAS)) {
    if (d.counts[k] < a.counts[k]) motivos.push(`\`${CHAMADAS[k]}\` appears ${d.counts[k]} times, it was ${a.counts[k]}`);
  }
  if (a.neverAuto && !d.neverAuto) motivos.push('the NEVER_AUTO list is gone');
  else if (a.neverAuto && d.neverAuto) {
    for (const t of a.neverAuto) if (!d.neverAuto.includes(t)) motivos.push(`${t} left NEVER_AUTO`);
  }
  for (const [t, nivel] of Object.entries(d.tools)) {
    const antes = a.tools[t];
    if (antes === undefined) motivos.push(`new tool registered: ${t} — the tool registry is closed, and new power does not come in through a patch`);
    else if (FORCA[nivel] < FORCA[antes]) motivos.push(`${t} approval went from "${antes}" to "${nivel}"`);
  }
  for (const t of Object.keys(a.tools)) if (!(t in d.tools)) motivos.push(`tool ${t} disappeared from the registry`);
  return motivos;
}

/**
 * As funções que SÃO a segurança do motor, e o próprio crivo. Contar chamadas não basta: um patch que
 * troca o `throw` de `assertOwner` por `console.log` não mexe em chamada nenhuma, e `cliAuthorized`,
 * `inheritable` e o `parent !== successorOf()` nem eram contados. `enabledWith` entra porque `isEnabled`
 * só delega a ele.
 */
const PROTEGIDAS = [
  'assertOwner', 'mayAct', 'mayWriteProject', 'isRunnable', 'isEnabled', 'enabledWith', 'cliAuthorized', 'validSecret', 'safeEqual',
  'crownFromParent', 'inheritFromParent', 'evalRunForParent', 'inheritable', 'successorOf',
  'guardsOf', 'guardsWeakened', 'changesTouchGuards', 'codeOnly', 'abreRegex', 'definitionsOf', 'PROTEGIDAS', 'CHAMADAS',
  // REVISÃO FINAL F9 — do que as guardas DEPENDEM: trocar o corpo de `ownerEmail` desarma `assertOwner` sem
  // tocar nele; redefinir `can` desliga a capacidade dentro de `mayAct`. Um nível de dependência, não o grafo.
  'ownerEmail', 'isDev', 'can', 'effectiveCapabilities', 'parseCapabilities', 'capsEnabled', 'parseStatus', 'claimable',
  'familySpendQuiet', 'budgetNow', 'capAction', 'forgetAgentProps', 'mayAutoApprove', 'onProactiveBlock', 'cleanAutoList',
];
// `\d*`: o esbuild renomeia nomes que colidem (`successorOf2` existe no bundle). Nome CURTO ("can") é palavra
// comum em comentário: ele só conta como uso de código — seguido de `(` ou `=`.
const nomeRegex = (n: string) => new RegExp(n.length <= 4 ? `\\b${n}\\d*\\s*[(=]` : `\\b${n}\\d*\\b`);
const nomeProtegido = (txt: string) => PROTEGIDAS.find((n) => nomeRegex(n).test(txt));

/** Onde cada função protegida é DEFINIDA no fonte: `function X(...) {...}` ou `var|let|const X = ...;`. */
export function definitionsOf(source: string): { name: string; from: number; to: number }[] {
  const c = codeOnly(source);
  const defs: { name: string; from: number; to: number }[] = [];
  for (const n of PROTEGIDAS) {
    for (const m of c.matchAll(new RegExp(`\\b(function\\s+|(?:var|let|const)\\s+)${n}\\d*\\s*[(=]`, 'g'))) {
      const funcao = m[1].startsWith('function');
      let prof = 0;
      let k = m.index as number;
      for (; k < c.length; k++) {
        const ch = c[k];
        if (ch === '(' || ch === '[' || ch === '{') prof++;
        else if (ch === ')' || ch === ']' || ch === '}') { prof--; if (funcao && ch === '}' && prof === 0) break; }
        else if (!funcao && ch === ';' && prof === 0) break;
      }
      defs.push({ name: n, from: m.index as number, to: k + 1 });
    }
  }
  return defs;
}

/**
 * A troca TOCA uma guarda? Regra simples e conservadora — recusar à toa é aceitável, deixar passar não:
 * 1. o `find` OU o `replace` cita o nome de uma função protegida (em qualquer lugar, até em comentário
 *    ou string) — pega `if (false) assertOwner();`, a chamada comentada, e a redefinição por sombra;
 * 2. o trecho do `find` cai (ainda que em parte) DENTRO da definição de uma protegida no fonte do pai —
 *    pega a troca no corpo que não cita nome nenhum.
 * Um patch que precisa mexer numa guarda não é um patch pontual: é o dono quem muda isso, pelo `up`.
 */
export function changesTouchGuards(files: readonly { name: string; source: string }[], changes: readonly { file: string; find: string; replace: string }[]): string[] {
  const motivos: string[] = [];
  for (const ch of changes) {
    const nome = nomeProtegido(ch.find) ?? nomeProtegido(ch.replace);
    if (nome) { motivos.push(`a change in ${ch.file} touches the guard ${nome}`); continue; }
    const src = files.find((f) => f.name === ch.file)?.source ?? '';
    const at = src.indexOf(ch.find);
    const def = at < 0 ? undefined : definitionsOf(src).find((d) => at < d.to && d.from < at + ch.find.length);
    if (def) motivos.push(`a change in ${ch.file} edits inside the guard ${def.name}`);
  }
  return motivos;
}
