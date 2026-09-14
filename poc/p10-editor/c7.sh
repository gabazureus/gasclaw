# POC P10 · C7 (gate do ADR-013): uma edição no editor chega ao agente em ≤ 30 s, sem ./gasclaw up.
# Carregado por `./gasclaw poc p10 c7`. Usa o agente de teste p10 (pasta gasclaw-poc/p10/agentes/p10 ↔ agentes/p10/ no editor).
T=.tmp/p10c7
now()  { node -e 'console.log(Date.now())'; }
secs() { node -e "console.log(((Date.now() - $1) / 1000).toFixed(1))"; }
jget() { node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=process.argv[2].split(".").reduce((o,k)=>o?.[k],r);console.log(typeof v==="object"?JSON.stringify(v):v)' "$1" "$2"; }

rm -rf "$T"; mkdir -p "$T/edit"
say "P10 C7 1/4 publica o dev com a leitura do editor ligada no loadAgent"
deploy

say "P10 C7 2/4 leitura antes da edição (aquece o cache de 30 s)"
remote "poc&id=p10&step=c7&trace=0" > "$T/before.json" || die "c7 (antes) falhou"
remote "poc&id=p10&step=c7&trace=0" > "$T/before2.json" || die "c7 (antes, 2ª) falhou"

say "P10 C7 3/4 edita agentes/p10/SOUL.md.html como o editor e espera o agente usar"
MARK="p10-c7-$(date +%s)"
pull_into "$T/edit"
[ -f "$T/edit/agentes/p10/SOUL.md.html" ] || die "agentes/p10/SOUL.md.html ausente no HEAD: rode ./gasclaw poc p10 antes"
printf '\nEditado no editor (C7): %s\n' "$MARK" >> "$T/edit/agentes/p10/SOUL.md.html"
CLASP_ROOT="$T/edit" clasp_ push --force >/dev/null
t0=$(now); VIS=null; TRIES=0
for _ in $(seq 1 20); do
  TRIES=$((TRIES + 1))
  remote "poc&id=p10&step=c7&mark=$MARK&trace=0" > "$T/after.json" || { sleep 3; continue; }
  if [ "$(jget "$T/after.json" hasMark)" = true ]; then VIS=$(secs "$t0"); break; fi
  sleep 3
done

say "P10 C7 4/4 export do editor falhando: cai para o Drive e registra o erro"
remote "poc&id=p10&step=c7&broken=1&trace=0" > "$T/broken.json" || die "c7 (quebrado) falhou"

node -e '
const fs=require("fs"),T=process.argv[1],r=(f)=>JSON.parse(fs.readFileSync(`${T}/${f}`,"utf8"));
const vis=process.argv[2]==="null"?null:Number(process.argv[2]);
const b=r("before.json"),b2=r("before2.json"),a=r("after.json"),x=r("broken.json");
const c7={pass:vis!==null&&vis<=30,visivelEmS:vis,tentativas:Number(process.argv[3]),antes:{origem:b.origem,ms:b.ms,cached:b.cached},antesComCache:{ms:b2.ms,cached:b2.cached},depois:{origem:a.origem,cached:a.cached,ms:a.ms}};
const fallback={pass:!!x.editorError&&x.origem.SOUL!=="editor"&&x.origem.AGENTS!=="editor"&&x.systemChars>0,editorError:x.editorError,origem:x.origem,ms:x.ms};
const precedencia={pass:b.origem.AGENTS==="editor"&&b.origem.SOUL==="editor"&&b.origem.IDENTITY==="doc"&&b.origem.USER==="md",origem:b.origem};
const s={poc:"P10",criterio:"C7",pass:c7.pass&&fallback.pass&&precedencia.pass,c7,fallback,precedencia};
console.log(JSON.stringify(s,null,2));process.exit(s.pass?0:1);
' "$T" "$VIS" "$TRIES"
