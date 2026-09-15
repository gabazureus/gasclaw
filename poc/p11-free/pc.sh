# POC P11, lado do PC. Carregado por `./gasclaw poc p11` (usa deploy, remote e lock_dev do gasclaw).
P11=poc/p11-free
T=.tmp/p11
LOTES=4      # 4 lotes de 5 = as 20 mensagens do C1
POR_LOTE=5   # 5 por minuto fica bem abaixo das 20 requisições gratuitas por minuto
rm -rf "$T"; mkdir -p "$T"
step() { remote "poc&id=p11&step=$1&trace=0${2:-}" > "$T/${3:-$1}.json" || die "P11 $1 falhou"; } # ${2:-}: com set -u, $2 vazio abortava a POC

say "P11 1/5 publica o dev"
deploy
say "P11 2/5 cota antes de medir (as 20 mensagens precisam caber no que resta do dia)"
step quota "" quota-antes
node -e '
const q=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
if(q.blocked){console.error("P11: a cota gratuita está no limite ("+q.note+"); a medição não vale hoje");process.exit(1)}
console.log("   cota: "+q.today+" requisições gratuitas hoje · pico "+q.perMinute+"/min");' "$T/quota-antes.json" || die "P11 sem cota para medir"

say "P11 3/5 C4: candidatos e escolha para um agente com ferramentas"
step tools
say "P11 4/5 C3: troca em 429 simulado"
step switch
say "P11 5/5 C1 e C2: $((LOTES * POR_LOTE)) mensagens pelo rodízio, em $LOTES lotes de $POR_LOTE (um por minuto)"
i=1
while [ "$i" -le "$LOTES" ]; do
  [ "$i" -gt 1 ] && sleep 60 # mantém o ritmo abaixo de 20 requisições gratuitas por minuto
  say "   lote $i de $LOTES"
  step burst "&n=$POR_LOTE&tag=l$i-" "burst-$i"
  i=$((i + 1))
done
step quota "" quota-depois

node -e '
const fs=require("fs"),T=process.argv[1],L=Number(process.argv[2]),r=(f)=>JSON.parse(fs.readFileSync(`${T}/${f}.json`,"utf8"));
const lotes=Array.from({length:L},(_,i)=>r(`burst-${i+1}`));
const burst={n:lotes.reduce((t,b)=>t+b.n,0),ok:lotes.reduce((t,b)=>t+b.ok,0),ms:lotes.flatMap((b)=>b.ms),erros:lotes.flatMap((b)=>b.erros),modelos:lotes.flatMap((b)=>b.modelos)};
const sw=r("switch"),tl=r("tools"),q=r("quota-depois");
fs.writeFileSync(`${T}/obs.json`,JSON.stringify({
  burst,
  switch429:{ms:sw.ms,modelUsed:sw.modelUsed,fallback:sw.fallback},
  tools:{agentTools:tl.agentTools,candidatos:tl.candidatos,escolhido:tl.escolhido},
  quota:{today:q.today,perMinute:q.perMinute,blocked:q.blocked,warn:q.warn},
}));' "$T" "$LOTES"
node --no-warnings "$P11/summary-cli.mjs" "$T/obs.json"
