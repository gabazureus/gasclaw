// P34 — o pai avalia o sucessor DE FORA.
//
// A regra que a F6 aprendeu com o CSV, agora para agentes: o avaliado RESPONDE, quem julga é outro. O
// sucessor tem o código que o Opus reescreveu — se o juiz morasse nele, o Opus poderia reescrever o juiz.
//
// Então o `runEval` se parte em duas metades: `runSpec` RODA os turnos e devolve o que aconteceu, e
// `judgeRun` JULGA. O pai manda ao sucessor só o `RunSpec` e julga com o próprio `judgeRun`.
//
// E o RunSpec NÃO carrega o gabarito: nem o critério do juiz, nem a rubrica, nem as verificações.
// Um patch malicioso poderia ler o critério e responder para agradar — o esperado nunca atravessa.
import { describe, expect, test } from 'vitest';
import { parseScenario } from '../src/eval';
import { toRunSpec } from '../src/evalEntry';

const md = `---
name: exemplo
channel: chat
tools: []
judge: A resposta cumprimenta o usuário em português.
---
# exemplo

## turnos
- oi

## verificações
- span: reply
- noTool
`;

describe('toRunSpec: o que atravessa até o sucessor não tem gabarito', () => {
  const spec = toRunSpec(parseScenario(md));

  test('o critério do juiz NÃO vai', () => {
    expect(spec).not.toHaveProperty('judge');
    expect(JSON.stringify(spec)).not.toMatch(/cumprimenta/);
  });

  test('as verificações NÃO vão', () => {
    expect(spec).not.toHaveProperty('checks');
    expect(JSON.stringify(spec)).not.toMatch(/noTool/);
  });

  test('a rubrica e o conjunto NÃO vão', () => {
    expect(spec).not.toHaveProperty('rubric');
    expect(spec).not.toHaveProperty('set');
  });

  test('o que é preciso para RODAR vai: nome, canal, turnos', () => {
    expect(spec.name).toBe('exemplo');
    expect(spec.channel).toBe('chat');
    expect(spec.turns).toEqual(['oi']);
  });
});

// A PORTA DO SUCESSOR recebe o RunSpec de uma requisição HTTP. O pai é confiável; o que chega pela rede
// é conferido mesmo assim — um JSON malformado não pode virar um eval que roda qualquer coisa.
import { parseRunSpec } from '../src/evalEntry';
describe('parseRunSpec: o que chega pela rede é conferido', () => {
  const bom = toRunSpec(parseScenario(md));

  test('um RunSpec válido volta igual', () => {
    expect(parseRunSpec(JSON.stringify(bom))).toEqual(bom);
  });

  test('lixo não vira eval', () => {
    for (const bruto of ['', 'não é json', '[]', '{}', JSON.stringify({ name: 'x' })]) expect(parseRunSpec(bruto)).toBeNull();
  });

  test('sem turnos não roda: não há o que perguntar', () => {
    expect(parseRunSpec(JSON.stringify({ ...bom, turns: [] }))).toBeNull();
  });

  test('passos fora de 1..50 são recusados, como no parseScenario', () => {
    expect(parseRunSpec(JSON.stringify({ ...bom, steps: 999 }))).toBeNull();
  });

  // O GABARITO NÃO ENTRA NEM PELA PORTA DE TRÁS: se alguém mandar `judge`/`checks` junto, eles caem.
  test('um RunSpec que chega COM gabarito tem o gabarito descartado', () => {
    const r = parseRunSpec(JSON.stringify({ ...bom, judge: 'x', checks: [{ kind: 'noTool', arg: '' }], rubric: 'y' }));
    expect(r).not.toHaveProperty('judge');
    expect(r).not.toHaveProperty('checks');
    expect(r).not.toHaveProperty('rubric');
  });
});

// A FIAÇÃO DA PORTA. As três guardas de `evalRunForParent` são o que a deixa dispensar o segredo da
// CLI. Se qualquer uma sumir, a porta vira um jeito de rodar conversas no sucessor sem o dono saber.
import { readFileSync } from 'node:fs';
describe('fiação: a porta do sucessor e o juiz do pai', () => {
  const main = readFileSync('src/main.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const porta = main.slice(main.indexOf('function evalRunForParent'), main.indexOf('\n}', main.indexOf('function evalRunForParent')));

  test('só um sucessor responde', () => expect(porta).toMatch(/if \(!store\.isSuccessor\(\)\) return/));
  test('só PARADO responde: a avaliação é antes da coroa', () => expect(porta).toMatch(/if \(store\.isEnabled\(\)\) return/));
  test('só em caixa de areia', () => expect(porta).toContain('sandboxEvalEnv('));
  test('o que chega é conferido', () => expect(porta).toContain('parseRunSpec('));

  // O AVALIADO NUNCA JULGA A SI MESMO: a porta roda, e não pode chamar nenhum juiz.
  test('a porta do sucessor RODA e não JULGA', () => {
    expect(porta).toContain('runSpec(');
    expect(porta).not.toMatch(/judgeRun\(|evaluate\(|judgeMessages\(|gradeMessages\(/);
  });


  test('a porta vem antes do segredo da CLI — o pai não o tem', () => {
    expect(main.indexOf("action === 'evalrun'")).toBeLessThan(main.indexOf("action === 'setsecret'"));
  });
});
