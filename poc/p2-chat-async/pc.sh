# POC P2: evento real no Chat, espera minima de 2 min e entrega pelo gatilho como app sem chave.
mkdir -p "$PWD/.tmp"
P2_TMP=$(mktemp -d "$PWD/.tmp/p2.XXXXXX")
trap 'rm -r "$P2_TMP"' EXIT

p2_remote() {
  remote "poc&id=p2&step=$1&trace=0${2:-}" > "$P2_TMP/$1.json" || die "P2 $1 falhou"
}

say "P2 1/7 garante a identidade sem chave e publica o dev"
ensure_chat_identity
deploy

say "P2 2/7 aguarda o protocolo novo"
p2_attempt=1
until p2_remote protocol && node -e 'const r=require(process.argv[1]);process.exit(r.protocol==="chat-app-iam-v2"?0:1)' "$P2_TMP/protocol.json"; do
  [ "$p2_attempt" -ge 6 ] && die "P2 nao propagou depois de 30 s"
  sleep 5
  p2_attempt=$((p2_attempt + 1))
done
p2_remote reset
p2_remote auth
node -e 'const r=require(process.argv[1]);if(r.pass!==true)process.exit(1);console.log(`auth do app: ${r.spaces} espaco(s)`)' "$P2_TMP/auth.json" || die "escopo IAM/Chat ainda nao autorizado: abra o Apps Script, execute authorize e rode a P2 de novo"

say "P2 3/7 envie /poc p2 na DM do gasclaw dev (a aba do Chat foi aberta)"
open "https://chat.google.com/"
p2_wait=0
while [ "$p2_wait" -lt 120 ]; do
  p2_remote status || true
  if node -e 'const r=require(process.argv[1]);process.exit(r.eventAt?0:1)' "$P2_TMP/status.json" 2>/dev/null; then break; fi
  sleep 5
  p2_wait=$((p2_wait + 5))
done
node -e 'const r=require(process.argv[1]);if(!r.eventAt)process.exit(1);console.log(`evento: ${new Date(r.eventAt).toISOString()} · prazo: ${new Date(r.delivery.notBefore).toISOString()} · ${r.delivery.space}`)' "$P2_TMP/status.json" || die "evento /poc p2 nao chegou em 2 min"

say "P2 4/7 espera o worker entregar depois de 120 s"
p2_wait=0
while [ "$p2_wait" -lt 240 ]; do
  p2_remote status || true
  if node -e 'const r=require(process.argv[1]);process.exit(r.pass===true?0:1)' "$P2_TMP/status.json" 2>/dev/null; then break; fi
  sleep 10
  p2_wait=$((p2_wait + 10))
done
node -e 'const r=require(process.argv[1]);if(r.pass!==true)process.exit(1);console.log(`entregue: ${r.delivery.messageName} em ${r.delivery.sentAt-r.eventAt} ms`)' "$P2_TMP/status.json" || die "worker nao entregou o card em 4 min"

say "P2 5/7 confirma que nao existe chave USER_MANAGED"
P2_SA=$(var "CHAT_SA_EMAIL_$UP")
P2_PROJECT=$(var "GCP_PROJECT_$UP")
P2_KEYS=$(gcloud iam service-accounts keys list --iam-account "$P2_SA" --project "$P2_PROJECT" --managed-by=user --format='value(name)' | wc -l | tr -d ' ')
gcloud iam service-accounts get-iam-policy "$P2_SA" --project "$P2_PROJECT" --format=json > "$P2_TMP/policy.json"
gcloud iam roles describe gasclawChatTokenMinter --project "$P2_PROJECT" --format=json > "$P2_TMP/role.json"
P2_POLICY_EXACT=$(node -e '
  const policy=require(process.argv[1]), role=require(process.argv[2]), project=process.argv[3], account=process.argv[4];
  const bindings=policy.bindings||[], expected=`projects/${project}/roles/gasclawChatTokenMinter`;
  const ok=bindings.length===1 && bindings[0].role===expected && JSON.stringify(bindings[0].members)===JSON.stringify([`user:${account}`])
    && JSON.stringify(role.includedPermissions)===JSON.stringify(["iam.serviceAccounts.getAccessToken"]);
  process.stdout.write(String(ok));
' "$P2_TMP/policy.json" "$P2_TMP/role.json" "$P2_PROJECT" "$ACCOUNT")

say "P2 6/7 procura material secreto no git e no bundle"
P2_LEAKS=$(node - <<'NODE'
const fs = require('fs'), path = require('path');
const skip = new Set(['.git', '.tmp', 'node_modules', 'test']);
let leaks = 0;
// Symlink nao e seguido: o devmode instala 43 links em .agents/skills/ apontando para pastas fora da
// arvore. Sem este guarda, isDirectory() e false para eles e o readFileSync estoura EISDIR na varredura.
function walk(dir) { for (const e of fs.readdirSync(dir, {withFileTypes:true})) { if (skip.has(e.name) || e.isSymbolicLink()) continue; const p=path.join(dir,e.name); if(e.isDirectory()) walk(p); else if (e.isFile()) { if (/credentials\.json$|\.(?:pem|p12|key)$/i.test(e.name)) leaks++; const s=fs.readFileSync(p); if(s.includes(Buffer.from('BEGIN PRIVATE ' + 'KEY')) || /ya29\.[A-Za-z0-9_-]{20,}/.test(s.toString('utf8'))) leaks++; } } }
walk('.'); console.log(leaks);
NODE
)

say "P2 7/7 repete a requestId, le a mensagem real e julga"
p2_remote finish "&userManagedKeys=$P2_KEYS&policyExact=$P2_POLICY_EXACT&secretLeaks=$P2_LEAKS"
node -e 'const r=require(process.argv[1]);console.log(JSON.stringify(r,null,2));process.exit(r.pass===true?0:1)' "$P2_TMP/finish.json"
