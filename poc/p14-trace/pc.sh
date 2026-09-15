# POC P14, lado do PC. Carregado por `./gasclaw poc p14` (usa remote, deploy, cmd_trace, var e lock_dev do gasclaw).
# Trace com lote de 1 min (ADR-014): C1 custo no turno · C3 falha de gravação · C6 tela ≤ 5 s e planilha ≤ 70 s · C11 20 runs · C12 cota de gatilhos.
P14=poc/p14-trace
T=.tmp/p14
now()  { node -e 'console.log(Date.now())'; }
secs() { node -e "console.log(((Date.now() - $1) / 1000).toFixed(1))"; }
field() { node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(r[process.argv[2]])' "$1" "$2"; }

rm -rf "$T"; mkdir -p "$T"
say "P14 1/8 publica o dev"
deploy

say "P14 2/8 C1 (50 runs no turno) · C4 (criação) · C9 (canário depois do lote)"
remote "poc&id=p14&step=bench&trace=0" > "$T/bench.json" || die "bench falhou"

say "P14 3/8 C3: planilha indisponível no lote não perde a fila"
remote "poc&id=p14&step=failsafe&trace=0" > "$T/failsafe.json" || die "failsafe falhou"

say "P14 4/8 C2: 5 runs simultâneos"
TAGS=""
for i in 1 2 3 4 5; do
  tag="c2x$(date +%s)x$i"
  TAGS="$TAGS,$tag"
  remote "poc&id=p14&step=one&tag=$tag&trace=0" > "$T/one-$i.json" &
done
wait
remote "poc&id=p14&step=verify&tags=${TAGS#,}&trace=0" > "$T/verify.json" || die "verify falhou"

say "P14 5/8 C6: tela (run lento ao vivo) e planilha (lote: gatilho ou fallback ao abrir a tela)"
TOKEN=$(gcloud auth print-access-token 2>/dev/null) # uma vez só: a sonda não pode medir o gcloud
fast() { curl -fsSL -H "Authorization: Bearer $TOKEN" "$(url)?action=$1"; }
tag="c6x$(date +%s)"
remote "poc&id=p14&step=slow&tag=$tag&trace=0" > "$T/slow.json" &
SLOW=$!
LIVE=null
for _ in $(seq 1 20); do
  fast live > "$T/live.json" 2>/dev/null || true
  LIVE=$(node -e 'try{const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const x=r.running.find((y)=>y.question.includes(process.argv[2]));console.log(x?((Date.now()-x.startedAt)/1000).toFixed(1):"null")}catch{console.log("null")}' "$T/live.json" "$tag")
  [ "$LIVE" != null ] && break
done
wait "$SLOW" || true
tag="c6y$(date +%s)"
remote "poc&id=p14&step=one&tag=$tag&sleep=1&trace=0" > "$T/one-c6.json" || die "one (C6) falhou"
ENDED=$(field "$T/one-c6.json" endedAt)
SHEET=null; VIA="gatilho"
for _ in $(seq 1 20); do
  sleep 5
  fast "poc&id=p14&step=row&tag=$tag&fallback=1&trace=0" > "$T/row.json" 2>/dev/null || continue
  if [ "$(field "$T/row.json" status)" = ok ]; then
    SHEET=$(node -e "console.log(((Date.now() - $ENDED) / 1000).toFixed(1))")
    [ "$(field "$T/row.json" gatilho)" = ativo ] || VIA="fallback (tela aberta a cada 5 s, sem gatilho)"
    break
  fi
done

say "P14 6/8 C11 (20 runs, um lote) · C12 (lote vazio)"
remote "poc&id=p14&step=burst&n=20&trace=0" > "$T/burst.json" || die "burst falhou"
remote "poc&id=p14&step=drainbench&trace=0" > "$T/drainbench.json" || die "drainbench falhou"

say "P14 7/8 C7: custo do polling e parada com a aba oculta"
remote "poc&id=p14&step=pollbench&n=60&trace=0" > "$T/poll.json" || die "pollbench falhou"
HIDES=false
grep -q "visibilitychange" dist/settings.html && grep -q "document.hidden" dist/settings.html && HIDES=true

say "P14 8/8 C8 · C10: 2 runs reais com o modelo + ./gasclaw trace"
remote "poc&id=p14&step=real&trace=0" > "$T/real-1.json" || die "real 1 falhou"
remote "poc&id=p14&step=real&trace=0&q=Diga+ola+em+tres+palavras" > "$T/real-2.json" || die "real 2 falhou"
cmd_trace "$(field "$T/real-1.json" runId)" > "$T/trace.txt" || die "./gasclaw trace falhou"
cat "$T/trace.txt"

node -e '
const fs=require("fs"),T=process.argv[1],r=(f)=>JSON.parse(fs.readFileSync(`${T}/${f}`,"utf8"));
const num=(s)=>s==="null"?null:Number(s);
fs.writeFileSync(`${T}/obs.json`,JSON.stringify({bench:r("bench.json"),failsafe:r("failsafe.json"),verify:r("verify.json"),c6:{liveS:num(process.argv[2]),sheetS:num(process.argv[3]),via:process.argv[5]},poll:r("poll.json"),hidesOnHidden:process.argv[4]==="true",real:[r("real-1.json"),r("real-2.json")],traceText:fs.readFileSync(`${T}/trace.txt`,"utf8"),burst:r("burst.json"),drainbench:r("drainbench.json")}));
' "$T" "$LIVE" "$SHEET" "$HIDES" "$VIA"
node --no-warnings "$P14/summary-cli.mjs" "$T/obs.json"
