# ADR-036 — Chegar ao agente sem digitar o link (e por que não encurtamos)

Status: **Aceito**
Data: 2026-09-18
Relacionado: [ADR-001](001-gas-only-runtime.md) (runtime 100% Apps Script),
[ADR-019](019-tela-de-chat-e-voz.md) (tela de chat), [ADR-031](031-conta-pessoal-alem-do-workspace.md)

## Contexto

O endereço do agente é o do web app do Apps Script:

- conta pessoal: `script.google.com/macros/s/<id>/exec` — **94 caracteres**
- Workspace: `script.google.com/a/macros/<domínio>/s/<id>/exec` — **109 caracteres**

O `<id>` tem ~57 caracteres, é gerado pelo Google e **não é configurável**. O pedido que chegou foi "link
mais simples, ou imprimir o link quando o agente é criado".

## Decisão

**Não encurtar.** Atacar o incômodo real, que não é o comprimento.

Encurtar esbarra em quatro paredes, todas verificadas:

| Caminho | Por que não |
|---|---|
| Encurtador do Google | O goo.gl foi **desligado em 2025**; não existe substituto. |
| Domínio próprio no Apps Script | **Não é suportado.** |
| Encurtador de terceiro | Põe um **servidor de fora no caminho crítico** de alcançar o agente — contra o "runtime 100% Apps Script, nenhum servidor externo" do ADR-001 e do `CLAUDE.md`. Também vira ponto de rastreamento e de falha para algo que precisa funcionar sempre. |
| Google Sites (`sites.google.com/view/<nome>`) | Daria um endereço curto, mas exige **afrouxar `XFrameOptions`** para embutir o painel num iframe — e esse painel controla **acesso e ferramentas**, ou seja, abrir-se a *clickjacking* exatamente onde o dano é maior. Além disso, criar um Site **não é automatizável**, ferindo o "zero operação manual" do `CLAUDE.md`. |

**Reformulação do problema:** a dor não é o link ser longo, é ter de **digitar ou mandar** um link longo.
Quem nunca digita não sofre com o tamanho. Isso não tem trade-off nenhum:

- **`chat_url`** — a tela de conversa servida pelo próprio Apps Script (`?page=chat`).
- **`./gasclaw open --chat`** — vai direto para a conversa; o `open` sem argumento continua abrindo o painel.
- **O link é impresso quando o agente nasce** (passo 6 do onboarding) e **copiado para a área de
  transferência** no mesmo instante, usando o `copy_clip` que já existe da portabilidade (macOS, Linux, WSL
  e Git Bash).
- **O `up` imprime o endereço da conversa** ao terminar — mas **sem copiar**, porque a chave do OpenRouter
  pode ter acabado de ir para o clipboard e ela é mais urgente naquele ponto.

Copiar é conveniência, nunca requisito: sem ferramenta de clipboard no sistema, `show_link` só imprime e o
comando segue.

## Consequências

- O caminho comum ("acabei de criar o agente, quero falar com ele") deixa de passar por digitação.
- A tela de conversa ganha destaque. Ela já existia e estava **invisível no README**: quem não tem Google
  Workspace não fica sem conversar com o agente — o Google Chat é um canal **a mais**, não o único.
- As alternativas de encurtamento ficam registradas com o motivo da recusa, para não serem reavaliadas do
  zero.

## Em aberto, para decisão futura

**QR code no terminal**, que resolveria o caso onde o link longo dói de verdade: abrir no **celular**.
Avaliado, não decidido. Um QR de nível de correção baixo para uma URL de ~94 caracteres cabe num terminal,
mas gerar exige **dependência nova** (contra o hábito do projeto de não adicionar dependência por
conveniência) ou **~150 linhas** de implementação própria — codificação, máscara, blocos de Reed-Solomon —
que é bastante código para um atalho. Fica como proposta, não como decisão: o ganho é real mas estreito, e
`minimal-code` pede que a escada seja subida antes.
