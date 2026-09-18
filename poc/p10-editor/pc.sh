# POC P10, lado do PC. Carregado por `./gasclaw poc p10` (usa clasp_, remote, publish, keep_editor_agents e deploy do gasclaw).
# Fluxo: fixture no editor → C1 pull → C3 leitura no runtime → C4 edição simulada → C5 up → C6 lista do projeto.
P10=poc/p10-editor
T=.tmp/p10
now()  { node -e 'console.log(Date.now())'; }
secs() { node -e "console.log(((Date.now() - $1) / 1000).toFixed(1))"; }
shas() { # $1 raiz → {"agentes/p10/X.md.html": sha256}
  (cd "$1" && find agentes/p10 -type f -name '*.md.html' | sort | while read -r f; do printf '"%s":"%s",' "$f" "$(shasum -a 256 "$f" | cut -d' ' -f1)"; done) | sed 's/,$//; s/^/{/; s/$/}/'
}
pull_to() { rm -rf "$1"; mkdir -p "$1"; pull_into "$1"; }
edit_soul() { # simula o editor: baixa o HEAD, altera o SOUL e grava o HEAD inteiro de volta
  pull_to "$T/edit"
  printf '\nEditado no editor: %s\n' "$1" >> "$T/edit/agentes/p10/SOUL.md.html"
  CLASP_ROOT="$T/edit" clasp_ push --force >/dev/null
}
at() { # $1 URL base (…/exec ou …/dev) · $2 querystring extra (M1: POST com o segredo, pelo remote_to)
  remote_to "$1" "poc&id=p10&step=read$2"
}
has_mark() { # $1 arquivo JSON do read · $2 variante
  node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.exit(r.variants?.[process.argv[2]]?.files?.["agentes/p10/SOUL.md"]?.hasMark?0:1)' "$1" "$2"
}

rm -rf "$T"; mkdir -p "$T"
say "P10 1/6 build, testes e fixture agentes/p10/*.md.html no editor (versão nova no dev)"
npm test > .tmp/test.log 2>&1 || die "testes falharam: veja .tmp/test.log"
export GCP_NUMBER="$(var "GCP_NUMBER_$UP")" GASCLAW_DEV=1 # B1: o mesmo build do deploy (Monitoring e POCs)
OUT_DIR=dist npm run build > .tmp/build.log 2>&1 || die "build falhou: veja .tmp/build.log"
keep_editor_agents
rm -rf dist/agentes/p10 && mkdir -p dist/agentes/p10 && cp "$P10"/fixture/agentes/p10/*.md.html dist/agentes/p10/
clasp_ push --force >/dev/null
publish

say "P10 2/6 C1: clasp pull devolve nomes e bytes"
pull_to "$T/c1"
LOCAL=$(shas dist); PULLED=$(shas "$T/c1")

say "P10 3/6 C3: pasta do Drive + leitura no runtime (versão fixa)"
remote "poc&id=p10&step=setup" > "$T/setup.json" || die "setup falhou"
remote "poc&id=p10&step=read" > "$T/read.json" || die "read falhou"

say "P10 4/6 C4: edição simulada no editor e três formas de ela chegar ao agente"
MARK="p10-edit-$(date +%s)"
t0=$(now); edit_soul "$MARK"; EDIT_S=$(secs "$t0")
t0=$(now); VISIBLE=null
for _ in 1 2 3 4 5 6 7 8 9 10; do
  at "$(url)" "&mark=$MARK&runs=1" > "$T/c4-exec.json" || die "read (exec) falhou"
  if has_mark "$T/c4-exec.json" driveExport; then VISIBLE=$(secs "$t0"); break; fi
  sleep 3
done
HEAD_TRIES=0 # a execução 2 levou um 404 isolado no /dev; 24 chamadas seguidas depois de push não reproduziram: até 3 tentativas, registradas
until [ "$HEAD_TRIES" -ge 3 ]; do
  HEAD_TRIES=$((HEAD_TRIES + 1))
  HEAD_ID=$(clasp_ list-deployments | grep '@HEAD' | grep -oE 'AKfy[A-Za-z0-9_-]+' | head -1)
  if at "$(dev_url "$HEAD_ID")" "&mark=$MARK&runs=1" > "$T/c4-head.json"; then break; fi
  warn "read (@HEAD) falhou (tentativa $HEAD_TRIES de 3)"
  [ "$HEAD_TRIES" -lt 3 ] && sleep 5
done
[ -s "$T/c4-head.json" ] || die "read (@HEAD) falhou 3 vezes"
t0=$(now); publish >/dev/null; PUBLISH_S=$(secs "$t0")
at "$(url)" "&mark=$MARK&runs=1" > "$T/c4-publish.json" || die "read (após publicar) falhou"

say "P10 5/6 C5: nova edição no editor → ./gasclaw up (deploy) → a edição continua lá"
MARK2="p10-up-$(date +%s)"
edit_soul "$MARK2"
t0=$(now); deploy; UP_S=$(secs "$t0")
pull_to "$T/c5"
PULLED_MARK=false; grep -q "$MARK2" "$T/c5/agentes/p10/SOUL.md.html" && PULLED_MARK=true
at "$(url)" "&mark=$MARK2&runs=1" > "$T/c5-read.json" || die "read (após up) falhou"

say "P10 6/6 veredito (C6 usa a lista do projeto depois do up)"
printf '{"c1":{"local":%s,"pulled":%s},"setup":%s,"read":%s,"c4":{"editS":%s,"exec":%s,"execVisibleS":%s,"headTries":%s,"head":%s,"publishS":%s,"afterPublish":%s},"c5":{"upS":%s,"pulledHasMark":%s,"read":%s}}\n' \
  "$LOCAL" "$PULLED" "$(cat "$T/setup.json")" "$(cat "$T/read.json")" "$EDIT_S" "$(cat "$T/c4-exec.json")" "$VISIBLE" "$HEAD_TRIES" "$(cat "$T/c4-head.json")" \
  "$PUBLISH_S" "$(cat "$T/c4-publish.json")" "$UP_S" "$PULLED_MARK" "$(cat "$T/c5-read.json")" > "$T/obs.json"
node --no-warnings "$P10/summary-cli.mjs" "$T/obs.json"
