# POC P20: publica somente no dev e mede aprovação Drive-backed com cache removido.
mkdir -p "$PWD/.tmp"
P20_TMP=$(mktemp -d "$PWD/.tmp/p20.XXXXXX")
trap 'rm -r "$P20_TMP"' EXIT

say "P20 1/3 publica o dev"
deploy
say "P20 2/3 aguarda o protocolo novo"
p20_attempt=1
until remote "poc&id=p20&step=protocol&trace=0" > "$P20_TMP/protocol.json" && node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(r.protocol!=="durable-approval-v1")process.exit(1)' "$P20_TMP/protocol.json"; do
  [ "$p20_attempt" -ge 6 ] && die "P20 não propagou depois de 30 s"
  sleep 5
  p20_attempt=$((p20_attempt + 1))
done
say "P20 3/3 remove cache e mede Drive, terceiro, clique duplo e expiração"
p20_attempt=1
until remote "poc&id=p20&step=run&trace=0" > "$P20_TMP/verdict.json" && node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(r.poc!=="P20"&&String(r.error||"").indexOf("POC desconhecida")<0)process.exit(2);process.exit(r.poc==="P20"?0:1)' "$P20_TMP/verdict.json"; do
  [ "$p20_attempt" -ge 6 ] && die "P20 não propagou depois de 30 s"
  sleep 5
  p20_attempt=$((p20_attempt + 1))
done
node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(JSON.stringify(r,null,2));process.exit(r.pass===true?0:1)' "$P20_TMP/verdict.json"
