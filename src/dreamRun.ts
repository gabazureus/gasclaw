// Execução do ciclo: gerar candidatos e rodar um passo. CASCA FINA — toda a decisão está no
// `dreamCycle` (puro); aqui só se chama o modelo e o runner de eval que já existem.
import { stepPassed, type DreamStep } from './dreamCycle';
import type { Message } from './llm';
import { runEval, type EvalEnv } from './evalEntry';
import type { AgentSpec } from './workspace';

/**
 * Temperaturas dos candidatos (decisão do usuário, 2026-09-19): varia a TEMPERATURA, não o modelo.
 *
 * Isolar a variável é o ponto: se cada candidato viesse de um modelo diferente, uma vitória não
 * diria se melhorou o PROMPT ou se apenas um motor escreve melhor que o outro. Três candidatos do
 * mesmo modelo com a mesma temperatura seriam amostra repetida, não busca — daí três valores
 * separados, do conservador ao exploratório.
 */
export const CANDIDATE_TEMPERATURES = [0.3, 0.7, 1.1] as const;

/**
 * O pedido ao gerador. Ele recebe o prompt vigente e o aglomerado de falhas REAIS que motivou o
 * ciclo — nunca um problema inventado (D5).
 *
 * Duas restrições no pedido, e as duas são de segurança, não de estilo:
 *  - o candidato é TEXTO de papel, nunca configuração (o frontmatter escolhe tools e modelo);
 *  - nada no texto pode pedir capacidade, ferramenta ou acesso — quem concede é o painel, e um
 *    candidato que peça isso será ignorado de qualquer forma (`capsAfterSuccession` intersecta).
 */
export function candidateMessages(currentPrompt: string, clusterSummary: string): Message[] {
  return [
    {
      role: 'system',
      content:
        'You rewrite the instruction text of an assistant so it fails less often. ' +
        'Answer with the new instruction text ONLY: no preamble, no explanation, no code fences, no YAML front matter. ' +
        'Never request tools, permissions or capabilities in the text: those are granted elsewhere and any such request is ignored.',
    },
    { role: 'user', content: `Current instruction text:\n---\n${currentPrompt}\n---\n\nReal failures observed recently:\n${clusterSummary}\n\nRewrite the instruction text to reduce those failures.` },
  ];
}

/** Frontmatter no candidato é descartado: papel é TEXTO, e configuração tem caminho próprio. */
export function cleanCandidate(raw: string): string {
  const t = String(raw ?? '').trim();
  const semFence = t.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
  return semFence.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
}

/**
 * Roda UM passo: o cenário de sempre, mas com o `system` do agente trocado pelo prompt candidato.
 *
 * É a substituição inteira — `AgentSpec.system` **é** o prompt. Nada mais do agente muda, e é isso
 * que faz a comparação ser justa: mesmo registro de tools, mesmo acesso, mesmo cenário.
 */
export function runDreamStep(scenarioMd: string, candidateSystem: string, base: AgentSpec, env: EvalEnv, step: DreamStep): { passed: boolean; ms: number } {
  const spec: AgentSpec = { ...base, system: candidateSystem };
  const r = runEval(scenarioMd, { ...env, agent: () => spec });
  return { passed: stepPassed(step.kind, { pass: r.pass, grade: r.grade ?? null }), ms: r.ms };
}
