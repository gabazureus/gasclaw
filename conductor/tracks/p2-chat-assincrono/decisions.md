# Decisoes: P2

- Autenticacao como app: service account no mesmo projeto GCP do Chat app.
- Credencial: IAM `generateAccessToken` com `chat.bot`; nenhuma chave exportada.
- Idempotencia: `requestId` estavel da Chat API, persistida no run.
- Destino: espaco e thread capturados do evento; fallback para nova thread apenas se a original nao existir.
- Entrega: estado no Drive; Script Properties continua sendo apenas fila.

