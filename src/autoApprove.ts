// Auto-aprovação: quais ferramentas um run PROATIVO pode usar sem parar para perguntar.
//
// Este módulo é o que sobrou de uma linguagem de política com predicados que foi REPROVADA em revisão
// de desenho (F3a, 2026-09-17), por dois revisores independentes que vieram de lados opostos e chegaram
// ao mesmo lugar:
//
// - **Segurança:** uma regra com predicado restringe SÓ O ARGUMENTO QUE NOMEIA.
//   `sheets.append: permitir quando id em [planilha X]` prende o destino e deixa `rows` — 20.000
//   caracteres — livre. A regra LÊ como restrita e SE COMPORTA como irrestrita exceto por um campo.
// - **Complexidade:** a forma `<arg> <= N` não tinha NENHUMA ferramenta aplicável no registro inteiro.
//
// A síntese dos dois: trocar a linguagem por uma LISTA DE NOMES. Não há regra que prenda um argumento e
// liberte os outros — porque não há regra. É mais simples E mais segura, o que é raro o bastante para
// merecer o comentário.
//
// O que destrava um run não supervisionado não é isto, aliás: é a falha honesta (D7). Um run que ninguém
// pediu não tem direito de fazer pergunta; ele falha, registra, e o dono vê no trace.

/**
 * Nunca auto-aprováveis, em nenhuma circunstância, por lista fechada no CÓDIGO.
 *
 * O critério é irreversibilidade para terceiros: enviar e-mail, alterar evento na agenda de outra
 * pessoa e apagar memória não se desfazem com um clique. Auto-aprovar o irreversível troca a
 * conveniência do dono pelo risco de alguém que nem sabe que existe um agente.
 *
 * Esta lista mora aqui e não em configuração de propósito: configurável, ela seria a primeira coisa
 * afrouxada no dia em que o agente ficasse "chato demais".
 */
export const NEVER_AUTO: readonly string[] = ['gmail.send', 'calendar.update', 'memory.remove'];

export type AutoVerdict = { auto: boolean; reason: string };

/**
 * Pode auto-aprovar `tool` neste run?
 *
 * Fail-closed em toda dúvida: fora da lista aprovada, na lista proibida, ou num run que o DONO pediu
 * (onde ele está do outro lado e pode clicar) ⇒ não. Auto-aprovação existe para o run que ninguém está
 * olhando; quando há alguém olhando, perguntar é barato.
 */
export function mayAutoApprove(tool: string, approved: readonly string[], proactive: boolean): AutoVerdict {
  const name = String(tool ?? '').trim();
  if (!name) return { auto: false, reason: 'no tool named' };
  if (!proactive) return { auto: false, reason: 'the owner asked for this run: ask instead of assuming' };
  if (NEVER_AUTO.includes(name)) return { auto: false, reason: `${name} is never auto-approved: it cannot be undone with one click` };
  if (!approved.includes(name)) return { auto: false, reason: `${name} is not in the auto-approve list` };
  return { auto: true, reason: '' };
}

/**
 * Normaliza a lista aprovada: só nomes que existem, nunca os proibidos, sem repetição.
 *
 * Aceitar um nome proibido e "ignorá-lo depois" daria ao dono a impressão de ter aprovado o que ele não
 * aprovou — a mesma razão pela qual `parseCapabilities` invalida a lista inteira em vez de aceitar meia.
 */
export function cleanAutoList(raw: unknown, known: readonly string[]): { list: string[]; dropped: string[] } {
  const entrada = Array.isArray(raw) ? raw.map((x) => String(x ?? '').trim()).filter(Boolean) : [];
  const list: string[] = [];
  const dropped: string[] = [];
  for (const n of entrada) {
    if (list.includes(n)) continue;
    if (NEVER_AUTO.includes(n) || !known.includes(n)) dropped.push(n);
    else list.push(n);
  }
  return { list, dropped };
}

/**
 * O que o dono lê antes de aprovar a lista. Em inglês (ADR-033).
 *
 * Diz o que a lista NÃO cobre, porque é isso que evita a leitura errada: alguém que aprova
 * `calendar.create` pode achar que aprovou mexer na agenda, e mexer é `calendar.update`, que nunca entra.
 */
export const AUTO_NOTE =
  'Only for runs nobody asked for. Sending email, changing someone else’s calendar event and deleting memory are never on this list, whatever you put in it — they cannot be undone with one click.';

// ---------- D7: a falha honesta ----------

/**
 * O que fazer quando um run PROATIVO esbarra em algo que exige clique.
 *
 * A revisão da F3a escreveu, com todas as letras, que é ISTO que destrava um run não supervisionado —
 * não uma linguagem de política. Um run que ninguém pediu não tem direito de fazer pergunta: ficar
 * `waiting` deixaria o run pendurado esperando um clique que nunca vem, segurando lease e sumindo do
 * radar. Ele falha, REGISTRA o motivo, e o dono encontra no trace.
 *
 * A diferença entre falhar e ficar esperando não é de elegância: um run `waiting` que ninguém vai
 * atender é indistinguível, para quem olha o painel, de um run que ainda está trabalhando.
 */
export type ProactiveOutcome = { status: 'failed'; reason: string } | { status: 'continue' };

export function onProactiveBlock(tool: string, proactive: boolean): ProactiveOutcome {
  if (!proactive) return { status: 'continue' }; // o dono está do outro lado: o card faz sentido
  return { status: 'failed', reason: `stopped: ${tool} needs approval, and nobody asked for this run` };
}

/**
 * Silêncio é resposta VÁLIDA de um run proativo — e precisa aparecer.
 *
 * Sem o span, "acordou, olhou a agenda e não tinha nada" fica indistinguível de "o gatilho não rodou".
 * A primeira é o comportamento certo; a segunda é defeito. Um agente discreto e um agente quebrado
 * parecem iguais de fora, e é isso que este rastro separa.
 */
export const NO_REPLY = 'no_reply';
// `||` e não `??`: string VAZIA precisa cair no padrão, e `??` só cobre null/undefined. O teste pegou —
// um span de silêncio com motivo vazio não explicaria nada, que é justamente o que ele existe para fazer.
export const noReplySpan = (why: string): { name: string; why: string } => ({ name: NO_REPLY, why: (String(why ?? '').trim() || 'nothing to say').slice(0, 200) });
