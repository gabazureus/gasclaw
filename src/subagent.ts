// Sub-agente como DECLARAÇÃO (ADR-039). NÚCLEO PURO — sem Drive, sem Properties, sem relógio.
// Só markdown entra; nada executa (ADR-002). Um sub-agente é nome + papel + subconjunto das tools
// JÁ APROVADAS pelo dono, rodando como um PASSO dentro do run do pai.
//
// A regra de segurança central deste módulo é uma só, e ela não é óbvia:
//
//   `allowedTools` (registry.ts:115-116) filtra contra `TOOLS`, o REGISTRO — o parâmetro tem
//   `tools = TOOLS` por padrão e ele NÃO conhece o acesso do pai. Filtrar a lista declarada só
//   com ele garante "existe no registro", jamais "o pai tem". Seria união disfarçada de filtro.
//
// Por isso `subagentTools` intersecta DUAS vezes: contra o registro e contra o pai. Um sub-agente
// nunca tem mais que o pai — só menos.
import { allowedTools } from './tools/registry';
import { parseFrontmatter } from './workspace';

export const SUBAGENT_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** Teto próprio, menor que o `DEFAULT_STEPS = 10` do pai: 5 sub-agentes não podem comer o turno dele. */
export const SUBAGENT_STEPS = 4;

export type Subagent = { name: string; role: string; declaredTools: string[]; steps: number };

/**
 * As ferramentas que o sub-agente REALMENTE recebe: interseção do que ele declara, do que o
 * registro conhece, e do que o pai tem aprovado. Sempre subconjunto do pai.
 *
 * `parentEnabled` vem de `enabledTools(acessoAprovado)` — nomes já expandidos de grupo.
 */
export function subagentTools(declared: readonly string[], parentEnabled: readonly string[]): string[] {
  const real = new Set(allowedTools([...declared]).map((t) => t.name)); // existe no registro?
  return [...new Set(parentEnabled.filter((t) => real.has(t)))]; // …E o pai tem? (ordem do pai)
}

/** Quem pode delegar: só o agente da pasta (profundidade 0). Sub-agente não cria sub-agente. */
export const canDelegate = (depth: number): boolean => depth === 0;

/** Teto de passos declarado, limitado pelo teto do motor. Valor absurdo cai no padrão. */
export const stepsFor = (declared: number | undefined): number =>
  Number.isInteger(declared) && (declared as number) > 0 ? Math.min(declared as number, SUBAGENT_STEPS) : SUBAGENT_STEPS;

/**
 * Nome do span do trace. Sem ele, as chamadas do sub-agente caem no run do pai indistinguíveis
 * das dele, e "a squad trabalhou" vira fé em vez de registro.
 * Nome inválido devolve `null`: a pasta não inventa nome de span.
 */
export const subagentSpan = (name: string): string | null => (SUBAGENT_NAME.test(String(name ?? '')) ? `subagent:${name}` : null);

/** Lê `subagents/<nome>.md` da pasta. Sem frontmatter ⇒ nenhuma ferramenta (nunca todas). */
export function parseSubagent(name: string, md: string): Subagent | null {
  if (!SUBAGENT_NAME.test(String(name ?? ''))) return null;
  const { data, body } = parseFrontmatter(md);
  const role = String(body ?? '').trim();
  if (!role) return null; // sub-agente sem papel não é nada
  const declaredTools = Array.isArray(data.tools) ? data.tools.filter((t): t is string => typeof t === 'string') : [];
  const steps = typeof data.steps === 'string' ? Number(data.steps) : typeof data.steps === 'number' ? data.steps : undefined;
  return { name, role, declaredTools, steps: stepsFor(steps) };
}
