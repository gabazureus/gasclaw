import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { toolCatalog, toolGroup } from '../src/tools/registry';

// O README dizia "poucas ferramentas: o agente só usa now, memory.* e ask" quando já eram 23 — documentação
// que afirmava o CONTRÁRIO do código. O risco de escrever a lista à mão é ela divergir no primeiro release:
// já aconteceu quatro vezes nesta sessão (MUTATING, contagem de globais, regra de idioma, e este README).
//
// A escolha aqui é deliberada: o README lista os GRUPOS, não as 23 ferramentas. Grupo muda devagar e o
// painel já mostra o catálogo completo com liga/desliga. O teste trava o que o README afirma — o NÚMERO e
// os GRUPOS — contra o registry, que é a fonte da verdade. Ferramenta nova não quebra o README; grupo novo
// quebra, e é exatamente aí que o texto precisa ser revisto.

const EN = readFileSync('README.md', 'utf8');
const PT = readFileSync('README_PT_BR.md', 'utf8');

// Como cada grupo do registry aparece escrito nos dois READMEs.
const NOMES: Record<string, { en: string; pt: string }> = {
  calendar: { en: 'Calendar', pt: 'Agenda' },
  gmail: { en: 'Gmail', pt: 'Gmail' },
  contacts: { en: 'Contacts', pt: 'Contatos' },
  tasks: { en: 'Tasks', pt: 'Tarefas' },
  drive: { en: 'Drive, Docs and Sheets', pt: 'Drive, Docs e Planilhas' },
  memory: { en: 'Memory', pt: 'Memória' },
  agent: { en: 'Agent', pt: 'Agente' },
  skill: { en: 'Skill', pt: 'Skill' },
  '': { en: 'General', pt: 'Gerais' },
};

describe('o README conta a verdade sobre as ferramentas', () => {
  test('o número de ferramentas no texto é o número real', () => {
    const n = toolCatalog().length;
    expect(EN, 'README.md').toContain(`**${n} tools today**`);
    expect(PT, 'README_PT_BR.md').toContain(`**${n} ferramentas hoje**`);
  });

  test('todo grupo do registry tem linha nos dois READMEs', () => {
    const grupos = [...new Set(toolCatalog().map((t) => t.group))].sort();
    for (const g of grupos) {
      const nome = NOMES[g];
      expect(nome, `grupo sem nome no README: "${g}" — acrescente a linha na tabela e aqui`).toBeDefined();
      expect(EN, `EN sem o grupo ${g}`).toContain(`| ${nome.en} |`);
      expect(PT, `PT sem o grupo ${g}`).toContain(`| ${nome.pt} |`);
    }
  });

  test('o README não inventa grupo que o registry não tem', () => {
    const reais = new Set(toolCatalog().map((t) => t.group));
    for (const g of Object.keys(NOMES)) expect(reais.has(g), `grupo "${g}" saiu do registry: tire do README`).toBe(true);
  });

  // A regra que muda o que a pessoa pode compartilhar: se uma ferramenta do Google deixar de ser só do
  // dono, a frase do README vira mentira — e é uma mentira sobre acesso.
  test('as ferramentas do Google continuam sendo só do dono', () => {
    const google = toolCatalog().filter((t) => ['calendar', 'gmail', 'contacts', 'tasks', 'drive'].includes(t.group));
    expect(google.length).toBeGreaterThan(0);
    expect(google.filter((t) => !t.ownerOnly)).toEqual([]);
    expect(EN).toContain('Google tools are owner-only');
    expect(PT).toContain('As ferramentas do Google são só do dono');
  });

  test('toolGroup: tool sem ponto é do grupo geral', () => {
    expect(toolGroup('now')).toBe('');
    expect(toolGroup('docs.read')).toBe('drive'); // docs e sheets entram no grupo drive
  });
});
