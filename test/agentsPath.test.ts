// A pasta do agente passou a se chamar `agents/` (inglês). O prefixo antigo `agentes/` continua sendo LIDO.
//
// O que se escreve muda; o que já existe não pode sumir. Há agente autorado no editor do Apps Script com o
// prefixo antigo, e trocar o padrão sem aceitar o legado apagaria esse agente da tela sem nenhum sinal —
// o `editorAgents` simplesmente devolveria uma lista menor.
import { describe, expect, test } from 'vitest';
import { agentFolderPath, editorAgents, type ProjectFile } from '../src/workspace';

const arquivo = (name: string): ProjectFile => ({ name, type: 'html', source: '# conteúdo' });

describe('agentFolderPath: agente novo nasce em Meu Drive/gasclaw/agents/<nome>', () => {
  test('o caminho está em inglês', () => {
    expect(agentFolderPath('assistente')).toEqual(['gasclaw', 'agents', 'assistente']);
  });
});

describe('editorAgents aceita os dois prefixos, e só esses dois', () => {
  test('o prefixo novo é lido', () => {
    expect(editorAgents([arquivo('agents/nova/SOUL.md')])).toEqual(['nova']);
  });

  test('o prefixo antigo continua lido: agente que já existe não pode sumir da tela', () => {
    expect(editorAgents([arquivo('agentes/antiga/SOUL.md')])).toEqual(['antiga']);
  });

  test('os dois convivem, sem duplicar quem aparece nas duas formas', () => {
    const lista = editorAgents([arquivo('agents/nova/SOUL.md'), arquivo('agentes/antiga/AGENTS.md'), arquivo('agents/antiga/USER.md')]);
    expect(lista).toEqual(['antiga', 'nova']);
  });

  test('prefixo parecido não entra: a regra é exata, não "começa com agent"', () => {
    expect(editorAgents([arquivo('agent/x/SOUL.md'), arquivo('agentess/x/SOUL.md'), arquivo('outro/x/SOUL.md')])).toEqual([]);
  });
});
