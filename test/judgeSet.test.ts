// O conjunto-juiz precisa estar NO BUNDLE, não só no PC.
//
// Achado ao fiar o ciclo de sonho: `dist/_motor.js` não continha um único cenário. Os evals viviam em
// `evals/*.md`, o CLI os lia do PC e os enviava por POST — o que funciona para `./gasclaw eval`, e NÃO
// funciona para um ciclo que roda sozinho no gatilho: ele não enxergaria o próprio juiz.
//
// A spec diz, desde a pesquisa de 2026-09-19, que "o juiz vem do build, não da pasta". Era aspiracional:
// a pasta estava fora, mas o build também. Agora é literal — se o cenário não está no build, ele não
// existe para o motor.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { namesOf, scenarioMd, scenariosOf, type Scenario } from '../src/judgeSet';

const fake: Scenario[] = [
  { name: 'g2', set: 'gate', md: '# g2' },
  { name: 'g1', set: 'gate', md: '# g1' },
  { name: 'q1', set: 'quality', md: '# q1' },
  { name: 'h1', set: 'holdout', md: '# h1' },
];

describe('leitura do conjunto', () => {
  test('separa por conjunto', () => {
    expect(scenariosOf('gate', fake).map((s) => s.name).sort()).toEqual(['g1', 'g2']);
    expect(scenariosOf('holdout', fake)).toHaveLength(1);
  });

  // O plano do ciclo precisa ser reproduzível: mesma entrada, mesma ordem de passos.
  test('os nomes saem em ordem estável, não na ordem do disco', () => {
    expect(namesOf('gate', fake)).toEqual(['g1', 'g2']);
  });

  // Cenário inexistente devolvendo string vazia faria o candidato "passar" em nada.
  test('cenário que não existe devolve null, nunca vazio', () => {
    expect(scenarioMd('nao-existe', fake)).toBeNull();
    expect(scenarioMd('q1', fake)).toBe('# q1');
  });
});

describe('o build embute os cenários de verdade', () => {
  const bundle = () => readFileSync('dist/_motor.js', 'utf8');

  test('o bundle publicado contém cenários, não a lista vazia', () => {
    expect(bundle()).not.toContain('var SCENARIOS = [];');
    expect(bundle()).toContain('"set":"quality"');
    expect(bundle()).toContain('"set":"holdout"'); // o reservado também viaja: ele atesta depois
  });

  test('todo eval do disco chegou ao bundle', () => {
    const noDisco = execFileSync('bash', ['-c', 'ls evals/*.md | wc -l'], { encoding: 'utf8' }).trim();
    const noBundle = (bundle().match(/"set":"(gate|quality|holdout)"/g) ?? []).length;
    expect(noBundle).toBe(Number(noDisco));
  });

  // Um build que publica o motor com o juiz vazio é pior que um build que falha: todo candidato
  // "passaria" em nada, e o placar ficaria verde sobre coisa nenhuma.
  test('o build FALHA se o ponto de injeção sumir ou se não houver cenário', () => {
    const b = readFileSync('build.mjs', 'utf8');
    expect(b).toContain("nao achei o ponto de injecao do conjunto-juiz");
    expect(b).toContain('o motor nao pode publicar sem juiz');
  });

  // Sem `set` declarado o cenário cai no conjunto ABSOLUTO: errar para o lado estrito é errar seguro.
  test('cenário sem `set` cai em gate, não em quality', () => {
    expect(readFileSync('build.mjs', 'utf8')).toContain("m ? m[1] : 'gate'");
  });
});
