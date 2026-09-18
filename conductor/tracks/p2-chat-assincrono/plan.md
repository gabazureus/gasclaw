# Plano: P2 - Google Chat assincrono

1. Fixar em testes o estado de entrega e as transicoes puras.
2. Implementar cliente IAM Credentials + Chat API por `UrlFetchApp` injetavel.
3. Fazer mensagens do Chat entrarem no loop duravel e o worker entregar estados finais.
4. Provisionar identidade e permissoes de forma idempotente no `./gasclaw up`.
5. Construir `./gasclaw poc p2`: criar entrega com `notBefore = evento + 120 s`, esperar o gatilho e verificar a mensagem real.
6. Revisar seguranca, concorrencia e testes vacuos; publicar somente dev e medir.

