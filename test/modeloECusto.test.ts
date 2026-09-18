// Dois achados de CUSTO, que o teste anterior não cobria porque ambos moram no caminho de exceção.
//
// 10. O rodízio nunca registrava falha total. `rotate` lança quando os 3 candidatos falham, então a linha que
//     chamava `noteFreeFailure` ficava depois do throw e nunca rodava: a memória curta de falhas continuava
//     vazia e os MESMOS 3 modelos mortos eram tentados de novo, a cada turno, para sempre.
//
// 13. O `model` escrito na PASTA nunca passava por `validateChoice` — só o escolhido na tela passava. Como a
//     pasta é compartilhável (ADR-021), quem tiver edição aponta o agente para o modelo mais caro do
//     OpenRouter, ou para um que não aceita ferramentas (e aí as ferramentas somem sem aviso).
import { describe, expect, test } from 'vitest';
import { rotate, type Attempt } from '../src/freeModels';

describe('rodízio: a falha é registrada mesmo quando TODOS falham', () => {
  const sempreFalha = () => {
    throw new Error('503 upstream');
  };

  test('quando todos falham, cada tentativa ainda é avisada antes do throw', () => {
    const avisados: string[] = [];
    expect(() => rotate(['a:free', 'b:free', 'c:free'], sempreFalha, 3, (f: Attempt) => avisados.push(f.model))).toThrow(/503/);
    expect(avisados).toEqual(['a:free', 'b:free', 'c:free']); // antes: [] — nenhum era penalizado, e voltavam sempre
  });

  test('quando um dá certo, só os que falharam antes dele são avisados', () => {
    const avisados: string[] = [];
    const r = rotate<string>(['a:free', 'b:free'], (m: string) => {
      if (m === 'a:free') throw new Error('503');
      return 'ok';
    }, 3, (f: Attempt) => avisados.push(f.model));
    expect(r.value).toBe('ok');
    expect(avisados).toEqual(['a:free']);
  });

  test('erro que manda PARAR não penaliza o modelo: não é culpa dele', () => {
    const avisados: string[] = [];
    expect(() => rotate(['a:free'], () => {
      throw new Error('402 insufficient credits');
    }, 3, (f: Attempt) => avisados.push(f.model))).toThrow();
    expect(avisados).toEqual([]);
  });

  test('um aviso que lança não derruba o rodízio (registrar é secundário; responder não é)', () => {
    const r = rotate<string>(['a:free', 'b:free'], (m: string) => {
      if (m === 'a:free') throw new Error('503');
      return 'ok';
    }, 3, () => {
      throw new Error('Properties cheias');
    });
    expect(r.value).toBe('ok');
  });
});
