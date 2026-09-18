# ADR-032 — A CLI sai do macOS: Linux e Windows (WSL e Git Bash)

Status: **Aceito no código; falta rodar numa máquina Linux e numa Windows**
Data: 2026-09-18
Relacionado: [ADR-031](031-conta-pessoal-alem-do-workspace.md)

## Contexto

O `./gasclaw` era só macOS por **três detalhes, não por arquitetura**: `open` (abrir o navegador), `pbcopy`
(área de transferência) e `brew` (instalar o que falta). Nada no desenho do script dependia do macOS — as
demais dependências (`printf`, `grep`, `tr`, `head`, `cut`, `seq`, `sleep`, `date`, `mktemp`, `openssl`,
`curl`, `git`, `node`, `npm`, `npx`) existem nos três sistemas.

Depois veio uma quarta, que só aparece no Windows: o Google Cloud CLI instala o executável como
**`gcloud.cmd`**, e o Git Bash não resolve `command -v gcloud`. O efeito era desproporcional ao tamanho da
causa — o gasclaw morria com "gcloud not found" numa máquina onde o gcloud estava perfeitamente instalado,
e o passo 1 do menu mentia. Por causa de um sufixo, a recomendação teria sido instalar o WSL inteiro
(privilégio de administrador, reinício, uma VM Linux) para rodar uma CLI de shell.

## Decisão

Isolar o que varia por sistema em funções pequenas, e não reescrever o resto.

- **`os_kind`** traduz o `uname` em `mac | linux | wsl | windows | unknown`. O WSL é Linux para tudo, menos
  para abrir o navegador: quem abre é o Windows do outro lado.
- **`open_url` nunca derruba o comando.** Num servidor sem navegador o setup tem de seguir, imprimindo o
  endereço para a pessoa abrir onde quiser.
- **`copy_clip`** tenta `wl-copy`, `xclip`, `xsel`, `clip.exe`; devolve != 0 quando não há ferramenta, e
  quem chama decide o que dizer.
- **`bin_of` / `have`** aceitam `nome`, `nome.cmd` e `nome.exe`, e `bin_of` devolve **qual nome invocar** —
  detectar não basta, quem detecta tem de chamar a forma que existe. O wrapper `gcloud` usa `bin_of` para
  que o resto do arquivo continue escrevendo `gcloud ...` sem saber de nada disso.
  `type -P`, e **não** `command -v`, porque `command -v` encontra função do shell: o wrapper acharia a si
  mesmo e recorreria para sempre.
- **Instalar sozinho só no macOS.** No Linux há apt, dnf, pacman, zypper e snap, cada um com nome de pacote
  diferente e exigindo privilégio; adivinhar errado mexe na máquina de alguém sem permissão. `install_hint`
  diz o comando exato e a pessoa roda. O menu reflete isso: "will install" no macOS, "needs:" nos outros —
  prometer o contrário faria a pessoa apertar `a` esperando mágica e receber um erro.
- **Não há versão PowerShell.** O script é bash; no Windows roda pelo WSL ou pelo Git Bash.

## Consequências

- A mesma pergunta ("esta ferramenta está instalada?") existia em quatro lugares: `ensure_tools`,
  `step_done`, `step_missing` e o `doctor`. Agora é uma só, com um teste estrutural que proíbe
  `command -v gcloud` cru. Nesta mesma sessão vimos o preço de três cópias da mesma regra: a lista de ações
  com efeito do shell divergiu do `MUTATING` do TS e rendeu 405.
- O `.gitattributes` forçando LF é pré-requisito: sem ele o Git para Windows converte o script para CRLF e
  o bash falha na primeira linha.

## O que ainda NÃO foi medido

- **Nada rodou numa máquina Linux ou Windows de verdade.** A verificação foi por substituição
  (`GASCLAW_OS`) e por testes que exercitam as funções do arquivo bash, inclusive um `gcloud.cmd` falso
  provando que o wrapper chama o nome certo e não recorre. Isso cobre a lógica, não o ambiente: falta o
  caminho completo (instalar, autenticar, publicar) nos dois sistemas.
