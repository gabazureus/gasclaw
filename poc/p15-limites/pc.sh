# POC P15, lado do PC. Carregado por `./gasclaw poc p15` (usa deploy, remote, cmd_limits e lock_dev do gasclaw).
P15=poc/p15-limites
T=.tmp/p15
rm -rf "$T"; mkdir -p "$T"
# A checagem de ok:false veio da P11 na v37: o web app responde 200 com {"ok":false,...}, o step segue
# e só o veredito quebra — medição que "passa" sem medir.
step() {
  remote "poc&id=p15&step=$1&trace=0" > "$T/$1.json" || die "P15 $1 falhou"
  node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(r&&r.ok===false){console.error("P15 "+process.argv[2]+": o servidor recusou: "+String(r.error).slice(0,300));process.exit(1)}' "$T/$1.json" "$1" || die "P15 $1 não mediu"
}

say "P15 1/3 publica o dev"
deploy
say "P15 2/3 fontes (sem cache e com cache), linha diária na aba limites, quem executa"
step read
step dailyrow
step whose
say "P15 3/3 ./gasclaw limits"
set +e
cmd_limits > "$T/cli.txt" 2>&1
CLI_EXIT=$?
set -e
cat "$T/cli.txt"
node -e '
const fs=require("fs"),T=process.argv[1],r=(f)=>JSON.parse(fs.readFileSync(`${T}/${f}.json`,"utf8"));
const lines=fs.readFileSync(`${T}/cli.txt`,"utf8").split("\n").filter((l)=>/%|—/.test(l)).length;
fs.writeFileSync(`${T}/obs.json`,JSON.stringify({read:r("read"),dailyrow:r("dailyrow"),whose:r("whose"),cli:{exit:Number(process.argv[2]),linhas:lines}}));' "$T" "$CLI_EXIT"
node --no-warnings "$P15/summary-cli.mjs" "$T/obs.json"
