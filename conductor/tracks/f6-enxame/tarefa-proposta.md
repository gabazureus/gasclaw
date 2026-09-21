# A tarefa da primeira corrida — e o que o Opus vê

O **enunciado** abaixo vai para o Opus a cada geração. A **bateria**
([`bateria-proposta.json`](bateria-proposta.json)) NÃO vai: se fosse, o modelo escreveria uma tabela
com as 17 respostas e venceria sem resolver nada.

## Enunciado (o que o Opus recebe)

> Compose a CSV from a JSON input. `doGet(e)` reads `e.parameter.input`, a JSON object:
> `{ "columns": [string], "rows": [object], "delimiter"?: string, "currency"?: "BRL", "total"?: string }`
>
> Rules:
> - Output one header line with the column names, then one line per row, joined by `\n`. No trailing newline.
> - The field separator is `delimiter`, default `","`.
> - A row's field is `row[column]`; missing or null becomes an empty string.
> - If `currency` is `"BRL"`, format every numeric field as Brazilian currency: thousands separator
>   `"."`, decimal separator `","`, always 2 decimals (`1234.5` → `1.234,50`).
> - Quote a field with double quotes if it contains the delimiter, a double quote, or a newline;
>   escape internal double quotes by doubling them.
> - If `total` names a column, append a final line: `TOTAL` in the first column, the sum of that
>   column in its own column (same currency rule), other columns empty.
>
> Answer with `ContentService.createTextOutput(JSON.stringify({ output: <the csv> })).setMimeType(ContentService.MimeType.JSON)`.

## Como os esperados foram obtidos

**Não foram digitados à mão.** Uma implementação de referência gerou os 17 esperados a partir dos
17 enunciados de entrada. Um esperado errado reprovaria um filho certo, e digitar 17 respostas à mão
é o jeito mais provável de errar um.

A referência foi escrita **duas vezes, em Python e em JavaScript**, e as duas produzem os mesmos 17
esperados. Isso não é zelo: o primeiro rascunho tinha um caso (`TOTAL,31.0`) em que Python e JS
divergem — `String(31.0)` é `"31"` em JS — e um filho **correto** seria reprovado por trivia de
float. O caso foi removido. O que sobrou mede a tarefa, não a linguagem.

## Onde mora a dificuldade (é o que dá espaço para evoluir)

| Caso | O que quebra uma solução ingênua |
|---|---|
| `"0,00"` com delimitador `,` | a vírgula decimal do BRL **colide** com o separador: o campo precisa de aspas |
| `tipo "A4"` | aspas internas dobram |
| `linha1\nlinha2` | quebra de linha dentro do campo exige aspas |
| `a,b` com delimitador `;` | não pode citar: o gatilho é o delimitador **em uso**, não a vírgula |
| coluna faltando na linha | vira campo vazio, não `undefined` |
| `rows: []` com `total` | a linha TOTAL existe, e a soma é `0` |
| `1000000` em BRL | `1.000.000,00` — separador de milhar em toda casa |

Uma solução direta acerta ~11 de 17. Os 6 restantes são a escada.
