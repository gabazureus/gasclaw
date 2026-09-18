# ADR-035 — A procedência de cada papel aparece no painel

Status: **Aceito**
Data: 2026-09-18
Relacionado: [ADR-013](013-autoria-editor-e-drive.md) (autoria nas duas superfícies),
[ADR-012](012-agentes-em-docs-e-sheets.md) (Docs e Sheets), [ADR-021](021-acesso-aprovado-no-painel.md)

## Contexto

Um papel do agente (`AGENTS`, `SOUL`, `IDENTITY`, `USER`) pode vir de três lugares, nesta ordem de
precedência: **editor** do Apps Script > **Google Doc** > **arquivo `.md`** na pasta do Drive (ADR-013).

Os arquivos do editor são encontrados pelo **nome atual da pasta**, no padrão
`agents/<nome>/<PAPEL>.md`, com `<nome>` restrito a `[a-z0-9][a-z0-9-]{0,39}`. Isso cria uma dependência
invisível: **renomear a pasta** — ou só acrescentar um espaço ou uma maiúscula, que o padrão recusa — faz a
busca não achar nada. A precedência então desce para o Doc e daí para o `.md`.

O problema não é a queda em si; é o **silêncio** dela. O agente continua respondendo, com outra instrução,
e nada avisa que a confiança das instruções mudou de nível: o `.md` da pasta é editável por qualquer pessoa
com quem a pasta foi compartilhada, e o do editor não é. Quem renomeia uma pasta não liga uma coisa à outra.
Pior, `loadAgent` guarda o resultado degradado por 30 s, então nem a repetição imediata do teste denuncia.

O dado que responde a essa pergunta **já existia**: `origem`, por papel, montado em `loadAgent`. Ele só ia
para o trace (`resolve_agent`) e parava ali — nenhuma tela lia.

## Decisão

Mostrar a procedência de cada papel no painel, onde o modelo do agente já é mostrado.

- `agentModel` passa a devolver `origem` (e o `editorError`, quando houver).
- A tela mostra, por papel, uma **palavra**: `Apps Script editor`, `Google Doc`, `Drive file (.md)` ou
  `not found`. Em inglês, no vocabulário do painel (ADR-033).
- **Nunca só por cor.** Cada origem é texto; quem usa leitor de tela ou não distingue cores recebe a mesma
  informação. O campo tem `aria-live` como o vizinho.
- Quando algum papel vem da pasta, a tela diz a consequência: arquivos na pasta podem ser editados por quem
  tem acesso a ela; papéis escritos no editor, não. Mostrar `md` sem dizer o que isso significa seria
  informação sem consequência.

## Consequências

- O sintoma deixa de ser invisível: quem renomeou a pasta vê os papéis marcados como vindos da pasta em vez
  do editor, na mesma tela onde já vai conferir o agente.
- **Não guardamos estado novo.** A alternativa de *avisar na mudança* ("antes era editor, agora é `.md`")
  exigiria persistir a procedência anterior por agente, e foi recusada por isso: inventar estado para
  detectar uma transição custa mais do que mostrar o fato atual, que já basta para o diagnóstico.
- A causa raiz — o acoplamento entre o nome da pasta e a localização dos arquivos do editor — **continua de
  pé**. Este ADR torna o efeito visível; não o elimina. Amarrar os papéis do editor a um id estável em vez
  do nome é uma mudança maior, com migração dos agentes existentes, e fica para quando houver necessidade
  medida.
