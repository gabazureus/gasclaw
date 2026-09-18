# ADR-030 — Licença MIT no lugar da Apache-2.0

**Status:** Aceito · 2026-09-18
**Substitui:** a decisão de licença do [ADR-011](011-licenca-e-docs-da-comunidade.md). O resto do ADR-011
(docs da comunidade em inglês, README espelhado) continua valendo.

## Contexto

O ADR-011 escolheu Apache-2.0 por causa da concessão explícita de patente e do `NOTICE`, olhando para
projetos de referência que são mantidos por empresas. O gasclaw não é isso: é um projeto de uma pessoa,
publicado para ser adotado e forkado por quem mexe com Google Workspace.

Duas coisas mudaram a leitura:

- **Adoção pesa mais que proteção formal aqui.** A MIT é a licença que quem chega já conhece de cor. A
  Apache-2.0 exige ler 11 KB e carregar um `NOTICE` adiante — fricção real para quem só quer copiar uma
  ideia deste repositório.
- **Não há patente a conceder.** O projeto não inventa nada patenteável; ele costura APIs do Google dentro
  dos limites do Apps Script. A concessão de patente da Apache-2.0 protege contra um risco que, neste
  código, não existe.

## Decisão

O gasclaw passa a ser licenciado sob a **MIT License**. Copyright (c) 2026 Gabriel Sorrentino.

- `LICENSE` recebe o texto da MIT.
- `NOTICE` é **removido**: é artefato exclusivo da Apache-2.0 e, sob MIT, dizer que ele precisa viajar com
  redistribuições seria falso.
- `LICENSING.md` passa a explicar a MIT, e registra que o projeto foi Apache-2.0 até 18/09/2026.
- `package.json` passa a declarar `"license": "MIT"`.
- Contribuição segue *inbound = outbound*, agora sob MIT. Sem CLA.
- Arquivo novo **não precisa** de cabeçalho de licença. Quem preferir, usa `SPDX-License-Identifier: MIT`.

## Por que a relicença é legítima

Relicenciar exige ser o titular de tudo que está no pacote. Isto foi **conferido no código**, não suposto:

- `dependencies` de produção: **vazio**.
- Imports externos em `src/`: **nenhum** — todo import é relativo.
- Cabeçalhos `Copyright` de terceiros dentro de `dist/_motor.js`: **zero**.
- Não existe `vendor/` nem `third_party/`. O GASADK segue apenas *proposto* ([ADR-004](004-gasadk-condicional.md))
  e nunca foi vendorizado.

Logo, cada linha redistribuída é obra original do titular do copyright, e nenhuma anuência de terceiro é
necessária.

> Se o GASADK (ou qualquer código de terceiro) vier a ser vendorizado, a licença dele passa a valer sobre a
> parte vendorizada e este ADR precisa ser revisitado **antes** do merge.

## Consequências

- Quem redistribui precisa manter só o aviso de copyright e a permissão — não há mais obrigação de `NOTICE`
  nem de declarar mudanças significativas.
- Some a concessão explícita de patente. Para este projeto, o risco aceito é pequeno (ver acima), mas é uma
  perda real e fica registrada aqui, não escondida.
- Quem já tiver recebido o código sob Apache-2.0 continua com aquela licença para aquela cópia. Licença
  concedida não se revoga; o que muda é o que sai daqui para a frente.
- Marcas continuam fora: a MIT não concede direito de marca, e o `LICENSING.md` mantém a seção sobre isso.
