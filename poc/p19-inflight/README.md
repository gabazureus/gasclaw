# P19 — morte entre efeito e checkpoint

Pergunta: se uma execução morrer depois de uma tool alterar o mundo e antes do checkpoint final, a retomada evita
repetir a alteração e informa honestamente que o resultado é incerto?

## Critérios

- C1: `inflight: gmail.send` está no Drive antes do efeito; a morte ocorre com um efeito e nenhuma `done key`.
- C2: a retomada termina em `failed` sem chamar o passo nem repetir o efeito.
- C3: a resposta nomeia `gmail.send`, declara a incerteza e recusa repetição automática.

## Execução

```sh
./gasclaw poc p19
```

A etapa `crash` lança deliberadamente um erro depois de gravar `inflight` no Drive e incrementar o efeito sintético,
sem executar o checkpoint final. A etapa `resume` remove o cache, relê o Drive em outra execução GAS e passa o run
pelo pump real. O contador do passo denuncia qualquer tentativa de reexecução.

## Resultado

**Aprovada 3/3 no dev v72 em 2026-09-16.** A morte é disparada depois de uma tool sintética atravessar o
`beforeEffect` do motor real de turno; a retomada reivindica o mesmo run pela fila real do `RunIO`.

- C1: 1 efeito, `inflight: gmail.send` relido do Drive e 0 `done key` depois da morte forçada.
- C2: a retomada chamou o passo 0 vezes, manteve o efeito em 1 e fechou o run como `failed`.
- C3: a resposta nomeou `gmail.send`, declarou que o resultado era incerto e recusou a repetição automática.
