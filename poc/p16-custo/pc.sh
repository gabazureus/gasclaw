# POC P16, lado do PC. Carregado por `./gasclaw poc p16` (usa deploy, remote e lock_dev do gasclaw).
P16=poc/p16-custo
T=.tmp/p16
N=10
rm -rf "$T"; mkdir -p "$T"
step() { remote "poc&id=p16&step=$1&trace=0${2:-}" > "$T/${3:-$1}.json" || die "P16 $1 falhou"; } # ${2:-}: com set -u, $2 vazio abortava a POC
num() { node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(r[process.argv[2]])' "$1" "$2"; }

say "P16 1/5 publica o dev"
deploy
say "P16 2/5 C4 troca de modelo (run real) e C5 recusa sem tools"
step setmodel
step refuse
say "P16 3/5 grava a fila e confere: C3 somas · C6 prune · C7 chamadas ao /key (antes das leituras do C1)"
step check
step sum
step prune
step keycalls
say "P16 4/5 C1 controlado: usage_daily antes → $N turnos → usage_daily depois (até estabilizar, teto de 5 min)"
step c1read "" c1-before
step c1turns "&n=$N"
BEFORE=$(num "$T/c1-before.json" usageDaily)
t0=$(date +%s); POLLS=0; PREV=""; AFTER="$BEFORE"; STABLE_S=null
while [ $(( $(date +%s) - t0 )) -lt 300 ]; do
  sleep 20
  POLLS=$((POLLS + 1))
  step c1read "" c1-after
  AFTER=$(num "$T/c1-after.json" usageDaily)
  # estável: subiu em relação ao antes e repetiu o valor da leitura anterior
  if node -e 'process.exit(Number(process.argv[1]) > Number(process.argv[2]) && process.argv[1] === process.argv[3] ? 0 : 1)' "$AFTER" "$BEFORE" "$PREV"; then
    STABLE_S=$(( $(date +%s) - t0 )); break
  fi
  PREV="$AFTER"
done
say "P16 5/5 C2 leitura da tela (cache)"
step speed
node -e '
const fs=require("fs"),T=process.argv[1],r=(f)=>JSON.parse(fs.readFileSync(`${T}/${f}.json`,"utf8"));
const turns=r("c1turns");
const obs=Object.fromEntries(["check","speed","sum","setmodel","refuse","prune","keycalls"].map((k)=>[k,r(k)]));
obs.c1ctrl={n:turns.n,feitos:turns.feitos,before:Number(process.argv[2]),after:Number(process.argv[3]),traceSum:turns.traceSum,polls:Number(process.argv[4]),stableS:process.argv[5]==="null"?null:Number(process.argv[5])};
fs.writeFileSync(`${T}/obs.json`,JSON.stringify(obs));' "$T" "$BEFORE" "$AFTER" "$POLLS" "$STABLE_S"
node --no-warnings "$P16/summary-cli.mjs" "$T/obs.json"
