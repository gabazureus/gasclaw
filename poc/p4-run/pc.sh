# POC P4: cada chamada remota é uma execução GAS distinta sobre o mesmo run no Drive.
mkdir -p "$PWD/.tmp"
P4_TMP=$(mktemp -d "$PWD/.tmp/p4.XXXXXX")
trap 'rm -r "$P4_TMP"' EXIT
p4_step() {
  remote "poc&id=p4&step=$1&trace=0" > "$P4_TMP/$2.json" || die "P4 $1 falhou"
  node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(r&&r.ok===false){console.error(r.error);process.exit(1)}' "$P4_TMP/$2.json" || die "P4 $1 não mediu"
}
p4_try_reset() {
  remote "poc&id=p4&step=protocol&trace=0" > "$P4_TMP/protocol.json" || return 1
  node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(r&&r.ok===false||r.protocol!=="drive-resume-v1")process.exit(1)' "$P4_TMP/protocol.json"
}

say "P4 1/6 publica o dev"
deploy
say "P4 2/6 cria o run durável"
# A implantação do Apps Script propaga de forma eventual: v61 foi conferida, mas a primeira chamada ainda caiu na v60.
p4_attempt=1
until p4_try_reset; do
  [ "$p4_attempt" -ge 6 ] && die "P4 reset não propagou depois de 30 s"
  sleep 5
  p4_attempt=$((p4_attempt + 1))
done
remote "poc&id=p4&step=reset&trace=0" > "$P4_TMP/reset.json" || die "P4 reset falhou"
node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(r&&r.ok===false||r.protocol!=="drive-resume-v1")process.exit(1)' "$P4_TMP/reset.json" || die "P4 reset não mediu"
say "P4 3/6 primeira execução: efeito + checkpoint"
p4_step advance execution-1
say "P4 4/6 segunda execução: retoma o checkpoint"
p4_step advance execution-2
say "P4 5/6 terceira execução: resposta final"
p4_step advance execution-3
say "P4 6/6 julga runId, desfecho e efeito único"
p4_step fim verdict
node - "$P4_TMP" <<'NODE'
const fs = require('fs');
const dir = process.argv[2];
const read = (name) => JSON.parse(fs.readFileSync(`${dir}/${name}.json`, 'utf8'));
console.log(JSON.stringify({ executions: [read('execution-1'), read('execution-2'), read('execution-3')], verdict: read('verdict') }, null, 2));
NODE
node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.exit(r.pass===true?0:1)' "$P4_TMP/verdict.json"
