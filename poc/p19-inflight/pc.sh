# POC P19: duas execuções GAS sobre o mesmo run; a primeira aborta depois do efeito e antes do checkpoint final.
mkdir -p "$PWD/.tmp"
P19_TMP=$(mktemp -d "$PWD/.tmp/p19.XXXXXX")
trap 'rm -r "$P19_TMP"' EXIT
p19_remote() {
  remote "poc&id=p19&step=$1&trace=0" > "$P19_TMP/$2.json" || die "P19 $1 falhou"
}
p19_protocol() {
  p19_remote protocol protocol
  node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(r&&r.ok===false||r.protocol!=="inflight-crash-v1")process.exit(1)' "$P19_TMP/protocol.json"
}

say "P19 1/5 publica o dev"
deploy
say "P19 2/5 cria o run durável"
p19_attempt=1
until p19_protocol; do
  [ "$p19_attempt" -ge 6 ] && die "P19 não propagou depois de 30 s"
  sleep 5
  p19_attempt=$((p19_attempt + 1))
done
p19_remote reset reset
node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(r&&r.ok===false||r.protocol!=="inflight-crash-v1")process.exit(1)' "$P19_TMP/reset.json" || die "P19 reset não mediu"
say "P19 3/5 força morte depois do efeito e antes do checkpoint final"
p19_remote crash crash
node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(r.ok!==false||!String(r.error).includes("morte forçada depois do efeito"))process.exit(1)' "$P19_TMP/crash.json" || die "P19 não observou a morte forçada"
say "P19 4/5 retoma do Drive sem executar o passo"
p19_remote resume resume
node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(r.pass!==true||r.effectCount!==1||r.stepCalls!==0)process.exit(1)' "$P19_TMP/resume.json" || die "P19 repetiu o efeito ou não fechou com incerteza"
say "P19 5/5 julga persistência, não repetição e aviso"
p19_remote fim verdict
node - "$P19_TMP" <<'NODE'
const fs = require('fs');
const dir = process.argv[2];
const read = (name) => JSON.parse(fs.readFileSync(`${dir}/${name}.json`, 'utf8'));
console.log(JSON.stringify({ crash: read('crash'), resume: read('resume'), verdict: read('verdict') }, null, 2));
NODE
node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.exit(r.pass===true?0:1)' "$P19_TMP/verdict.json"
