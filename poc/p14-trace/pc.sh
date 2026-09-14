# POC P14, lado do PC. Carregado por `./gasclaw poc p14` (usa remote, deploy, cmd_trace e var do gasclaw).
P14=poc/p14-trace
T=.tmp/p14
now()  { node -e 'console.log(Date.now())'; }
secs() { node -e "console.log(((Date.now() - $1) / 1000).toFixed(1))"; }
field() { node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(r[process.argv[2]])' "$1" "$2"; }

rm -rf "$T"; mkdir -p "$T"
say "P14 1/6 publica o dev (Sheets API habilitada, sem escopo novo)"
gcloud services enable sheets.googleapis.com --project "$(var "GCP_PROJECT_$UP")" >/dev/null
deploy

say "P14 2/6 C1 (50 runs) · C3 (falha de gravação) · C4 (criação) · C9 (canário)"
remote "poc&id=p14&step=bench&trace=0" > "$T/bench.json" || die "bench falhou"

say "P14 3/6 C2: 5 runs simultâneos"
TAGS=""
for i in 1 2 3 4 5; do
  tag="c2x$(date +%s)x$i"
  TAGS="$TAGS,$tag"
  remote "poc&id=p14&step=one&tag=$tag&trace=0" > "$T/one-$i.json" &
done
wait
sleep 2
remote "poc&id=p14&step=verify&tags=${TAGS#,}&trace=0" > "$T/verify.json" || die "verify falhou"

say "P14 4/6 C6: run lento aparece ao vivo (tela e planilha); latência = visto no PC − startedAt do servidor"
tag="c6x$(date +%s)"
TOKEN=$(gcloud auth print-access-token 2>/dev/null) # uma vez só: a sonda não pode medir o gcloud
fast() { curl -fsSL -H "Authorization: Bearer $TOKEN" "$(url)?action=$1"; }
remote "poc&id=p14&step=slow&tag=$tag&trace=0" > "$T/slow.json" &
SLOW=$!
LIVE=null; SHEET=null
for _ in $(seq 1 40); do
  if [ "$LIVE" = null ]; then
    fast live > "$T/live.json" 2>/dev/null || true
    LIVE=$(node -e 'try{const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const x=r.running.find((y)=>y.question.includes(process.argv[2]));console.log(x?((Date.now()-x.startedAt)/1000).toFixed(1):"null")}catch{console.log("null")}' "$T/live.json" "$tag")
  fi
  if [ "$SHEET" = null ]; then
    fast "poc&id=p14&step=row&tag=$tag&trace=0" > "$T/row.json" 2>/dev/null || true
    SHEET=$(node -e 'try{const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(r.status==="running"&&r.startedAt?((Date.now()-Date.parse(r.startedAt))/1000).toFixed(1):"null")}catch{console.log("null")}' "$T/row.json")
  fi
  [ "$LIVE" != null ] && [ "$SHEET" != null ] && break
done
wait "$SLOW" || true

say "P14 5/6 C7: custo do polling e parada com a aba oculta"
remote "poc&id=p14&step=pollbench&n=60&trace=0" > "$T/poll.json" || die "pollbench falhou"
HIDES=false
grep -q "visibilitychange" dist/settings.html && grep -q "document.hidden" dist/settings.html && HIDES=true

say "P14 6/6 C8 · C10: 2 runs reais com o modelo + ./gasclaw trace"
remote "poc&id=p14&step=real&trace=0" > "$T/real-1.json" || die "real 1 falhou"
remote "poc&id=p14&step=real&trace=0&q=Diga+ola+em+tres+palavras" > "$T/real-2.json" || die "real 2 falhou"
cmd_trace "$(field "$T/real-1.json" runId)" > "$T/trace.txt" || die "./gasclaw trace falhou"
cat "$T/trace.txt"

node -e '
const fs=require("fs"),T=process.argv[1],r=(f)=>JSON.parse(fs.readFileSync(`${T}/${f}`,"utf8"));
const num=(s)=>s==="null"?null:Number(s);
fs.writeFileSync(`${T}/obs.json`,JSON.stringify({bench:r("bench.json"),verify:r("verify.json"),c6:{liveS:num(process.argv[2]),sheetS:num(process.argv[3])},poll:r("poll.json"),hidesOnHidden:process.argv[4]==="true",real:[r("real-1.json"),r("real-2.json")],traceText:fs.readFileSync(`${T}/trace.txt`,"utf8")}));
' "$T" "$LIVE" "$SHEET" "$HIDES"
node --no-warnings "$P14/summary-cli.mjs" "$T/obs.json"
