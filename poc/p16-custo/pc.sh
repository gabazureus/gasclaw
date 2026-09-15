# POC P16, lado do PC. Carregado por `./gasclaw poc p16` (usa deploy, remote e lock_dev do gasclaw).
P16=poc/p16-custo
T=.tmp/p16
rm -rf "$T"; mkdir -p "$T"
step() { remote "poc&id=p16&step=$1&trace=0$2" > "$T/$1.json" || die "P16 $1 falhou"; }

say "P16 1/4 publica o dev"
deploy
say "P16 2/4 C4 troca de modelo (run real) e C5 recusa sem tools"
step setmodel
step refuse
say "P16 3/4 grava a fila e confere: C1 ±2% · C3 somas · C6 prune · C7 chamadas ao /key"
step check
step sum
step prune
step keycalls
say "P16 4/4 C2 leitura da tela (cache)"
step speed
node -e '
const fs=require("fs"),T=process.argv[1],r=(f)=>JSON.parse(fs.readFileSync(`${T}/${f}.json`,"utf8"));
fs.writeFileSync(`${T}/obs.json`,JSON.stringify(Object.fromEntries(["check","speed","sum","setmodel","refuse","prune","keycalls"].map((k)=>[k,r(k)]))));' "$T"
node --no-warnings "$P16/summary-cli.mjs" "$T/obs.json"
