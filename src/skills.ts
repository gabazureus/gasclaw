// Skills (spec §4), núcleo puro: skills/<nome>/SKILL.md na pasta do agente.
// Só o índice (nome + descrição) entra no prompt; o corpo vem sob demanda pela tool read_skill.
// Nada aqui é executado: skill é TEXTO (ADR-002).
import { parseFrontmatter } from './workspace';

export const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const SKILL_BODY_MAX = 6000;
export const SKILL_INDEX_MAX = 1500;

export type Skill = { name: string; description: string };

/** Nome da skill a partir do caminho `skills/<nome>/SKILL.md` (no Drive ou no editor). */
export function skillNameOf(path: string): string | null {
  const m = String(path).match(/(?:^|\/)skills\/([^/]+)\/SKILL\.md$/i);
  const name = m?.[1]?.toLowerCase();
  return name && SKILL_NAME.test(name) ? name : null;
}

/** Descrição da skill: frontmatter `description`, senão a primeira linha de texto do corpo. */
export function skillDescription(md: string, max = 200): string {
  const { data, body } = parseFrontmatter(md ?? '');
  const fromFm = typeof data.description === 'string' ? data.description.trim() : '';
  const first = body
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').trim())
    .find((l) => l.length > 0);
  return (fromFm || first || '(sem descrição)').slice(0, max);
}

/** Índice que vai no prompt: uma linha por skill, dentro do teto. */
export function skillIndex(skills: Skill[], max = SKILL_INDEX_MAX): string {
  if (!skills.length) return '';
  const lines: string[] = [];
  let left = max;
  for (const s of [...skills].sort((a, b) => a.name.localeCompare(b.name))) {
    const line = `- ${s.name}: ${s.description}`;
    if (line.length + 1 > left) break;
    lines.push(line);
    left -= line.length + 1;
  }
  return lines.join('\n');
}

/** Bloco do índice no prompt do agente (vazio quando não há skills). */
export const skillsBlock = (skills: Skill[]): string =>
  skills.length ? `\n\n## Skills disponíveis (peça o passo a passo com read_skill)\n${skillIndex(skills)}` : '';

/** Corpo da skill como DADO para o modelo: é instrução do dono, mas nunca executa nada. */
export const skillBody = (name: string, md: string, max = SKILL_BODY_MAX): string => {
  const { body } = parseFrontmatter(md ?? '');
  const text = body.trim() || (md ?? '').trim();
  return text ? `## skill ${name}\n${text.slice(0, max)}${text.length > max ? '\n(cortado)' : ''}` : `A skill ${name} está vazia.`;
};

/** O que o agente propõe como skill. Texto, sempre: nada aqui vira código (ADR-002). */
export type SkillProposal = { name: string; description: string; body: string };

export const SKILL_DESCRIPTION_MAX = 200;

/**
 * A proposta vira skill? Núcleo puro: devolve `null` quando pode, ou o motivo em inglês (ADR-033).
 *
 * As regras são as mesmas da LEITURA que já existe — nome de pasta, teto de corpo —, porque uma skill
 * escrita pelo agente não pode nascer fora do que o índice e o `read_skill` conseguem servir depois.
 */
export function validateSkill(p: SkillProposal): string | null {
  const name = String(p?.name ?? '').trim().toLowerCase();
  if (!SKILL_NAME.test(name)) return 'invalid skill name: lowercase letters, numbers and hyphens, up to 40 characters';
  const description = String(p?.description ?? '').trim();
  if (!description) return 'the skill needs a one-line description';
  if (description.length > SKILL_DESCRIPTION_MAX) return `description is too long: at most ${SKILL_DESCRIPTION_MAX} characters`;
  const body = String(p?.body ?? '').trim();
  if (!body) return 'the skill body is empty: write the steps';
  if (body.length > SKILL_BODY_MAX) return `body is too long: at most ${SKILL_BODY_MAX} characters`;
  return null;
}

/**
 * O `SKILL.md` que vai para a pasta: o NOSSO frontmatter primeiro, o corpo do modelo depois.
 *
 * A ordem é a garantia. `parseFrontmatter` lê o PRIMEIRO bloco, então um `---` que o corpo traga é só
 * texto — o índice mostra a descrição que o dono aprovou, nunca uma que o corpo tentou impor. Eu tinha
 * escrito aqui uma "neutralização" do `---`; a mutação provou que ela não mudava nada observável, e
 * guarda que não morre com teste é decoração.
 */
export function skillMarkdown(p: SkillProposal): string {
  const name = String(p.name).trim().toLowerCase();
  const description = String(p.description).trim().replace(/\r?\n/g, ' ').slice(0, SKILL_DESCRIPTION_MAX);
  const body = String(p.body).trim();
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`;
}
