import { useEffect, useRef, useState } from "react";
import axios from "axios";
import cytoscape, { type Core } from "cytoscape";



const API = import.meta.env.VITE_API_URL as string;

type Edge = { u:number; v:number; capacity:number };
type Log = { augmenting_path:number[][]; bottleneck:number; flow_so_far:number };
type Result = {
  max_flow:number;
  logs: Log[];
  flow_assignments: {u:number; v:number; flow:number}[];
  min_cut: { S:number[]; T:number[]; edges_S_to_T:number[][] };
};

/* ------------------------ CONSTANTES “LITE” ------------------------ */

const LITE_LABELS = ["O","A","B","C","D","E","F"]; // 7 nodos (0..6)
const LIDX = Object.fromEntries(LITE_LABELS.map((lab,i)=>[lab,i]));


const LITE_DEFAULT_EDGES: Edge[] = [
  {u:LIDX["O"], v:LIDX["A"], capacity:5},
  {u:LIDX["O"], v:LIDX["B"], capacity:7},
  {u:LIDX["O"], v:LIDX["C"], capacity:4},
  {u:LIDX["A"], v:LIDX["D"], capacity:3},
  {u:LIDX["A"], v:LIDX["B"], capacity:7},
  {u:LIDX["B"], v:LIDX["D"], capacity:4},
  {u:LIDX["B"], v:LIDX["E"], capacity:5},
  {u:LIDX["B"], v:LIDX["C"], capacity:2},
  {u:LIDX["C"], v:LIDX["E"], capacity:4},
  {u:LIDX["E"], v:LIDX["D"], capacity:6},
  {u:LIDX["D"], v:LIDX["F"], capacity:9},
  {u:LIDX["E"], v:LIDX["F"], capacity:8},
];


const LITE_POS: Record<string,{x:number;y:number}> = {
  "O": {x: 60,  y: 250},
  "A": {x: 220, y: 120},
  "B": {x: 240, y: 250},
  "C": {x: 230, y: 380},
  "D": {x: 460, y: 120},
  "E": {x: 460, y: 340},
  "F": {x: 640, y: 230},
};

const randInt = (a:number,b:number)=> Math.floor(Math.random()*(b-a+1))+a;
/* ------------------------------------------------------------------ */

export default function App(){
  /* ------------------------ ESTADO GENERAL ------------------------ */
  const [n,setN] = useState(8);
  const [s,setS] = useState(0);
  const [t,setT] = useState(7);
  const [edgesText,setEdgesText] = useState(
`0 1 10
0 2 5
1 2 15
1 3 10
2 3 10
2 4 7
3 5 10
4 5 8
5 7 10
4 6 5
6 7 12`
  );

  const [activeTab, setActiveTab] =
    useState<"viz"|"resumen"|"pasos"|"asign"|"enun"|"lite">("viz");

  const [summary,setSummary] = useState("—");
  const [steps,setSteps] = useState<string[]>([]);
  const [assign,setAssign] = useState<string[]>([]);
  const [cut,setCut] = useState("");
  const [statement,setStatement] = useState("—");
  const [lastResult,setLastResult] = useState<Result|null>(null);
  const [busy,setBusy] = useState(false);

  const cyRef = useRef<HTMLDivElement>(null);
  const cy = useRef<Core|null>(null);

  
  useEffect(() => {
    if (!cyRef.current || cy.current) return;

    cy.current = cytoscape({
      container: cyRef.current,
      style: [
        { selector: "node", style: {
            "background-color": "#38bdf8",
            "label": "data(id)",
            "color": "#e5e7eb",
            "font-size": "12px",
            "text-outline-color": "#0b1020",
            "text-outline-width": 2
        }},
        { selector: "edge", style: {
            "curve-style": "bezier",
            "target-arrow-shape": "triangle",
            "width": 2.5,
            "line-color": "#94a3b8",
            "target-arrow-color": "#94a3b8",
            "label": "data(label)",
            "font-size": "11px",
            "color": "#e5e7eb",
            "text-outline-color": "#0b1020",
            "text-outline-width": 2
        }},
        { selector: ".hl", style: {
            "line-color": "#22c55e",
            "target-arrow-color": "#22c55e",
            "width": 4
        }},
        { selector: ".cut", style: {
            "line-color": "#ef4444",
            "target-arrow-color": "#ef4444",
            "width": 4
        }},
      ],
      layout: { name: "cose", nodeRepulsion: 12000 },
      wheelSensitivity: 0.25
    });
  }, []);

  const parseEdges = (txt:string):Edge[] =>
    txt.trim().split("\n").filter(Boolean).map(line=>{
      const [u,v,c] = line.trim().split(/\s+/);
      return {u:+u, v:+v, capacity:+c};
    });

  const drawGraph = (nNow:number, edges:Edge[], result?:Result)=>{
    if(!cy.current) return;
    const g = cy.current;
    g.elements().remove();

    

    const nodes = Array.from({length:nNow}, (_,i)=>({data:{id:String(i)}}));
    const eds = edges.map(e=>({
      data:{
        id:`${e.u}-${e.v}`,
        source:String(e.u),
        target:String(e.v),
        label:`${e.u}→${e.v} cap=${e.capacity}`
      }
    }));
    g.add([...nodes,...eds]);

    g.layout({ name:"cose", nodeRepulsion:12000 }).run();

    if(result){
      const set = new Set(result.min_cut.edges_S_to_T.map(([u,v])=>`${u}-${v}`));
      g.edges().forEach(ed=>{ if(set.has(ed.id())) ed.addClass("cut"); });
    }
    g.fit(undefined, 30);
  };

  

  const buildStatement = (nNow:number, sNow:number, tNow:number, edges:Edge[], r?:Result)=>{
    const L = [
      `Enunciado (versión narrativa):`,
      `Se tiene una red de flujo dirigida con ${nNow} nodos (0..${nNow-1}).`,
      `El nodo fuente es s=${sNow} y el sumidero es t=${tNow}.`,
      `Cada arista (u→v) posee capacidad c(u,v). Se pide calcular el flujo máximo de s a t,`,
      `mostrar los caminos aumentantes utilizados, la asignación final de flujo y un corte mínimo.`,
      ``,
      `Aristas:`,
      ...edges.map(e => `• (${e.u}→${e.v}) con capacidad ${e.capacity}`),
      ``,
    ];
    if(r) L.push(`Valor obtenido (para comparación): ${r.max_flow}`);
    setStatement(L.join("\n"));
  };

  const buildAcademicStatement = (nNow:number, sNow:number, tNow:number, edges:Edge[])=>{
    const E = edges.map(e=>`(${e.u},${e.v}; ${e.capacity})`).join(", ");
    const academic =
`Problema de Flujo Máximo (formulación académica)

Sea G=(V,E) una red de flujo dirigida con V = {0,1,...,${nNow-1}} y E ⊆ V×V.
Para cada arista (u,v)∈E se tiene una capacidad c(u,v) ≥ 0. El nodo fuente es s=${sNow} y el nodo sumidero es t=${tNow}.

Datos del grafo:
- Conjunto de aristas con capacidades:
  ${E}

Tareas:
1) Determinar el valor del flujo máximo |f| desde s hasta t.
2) Proporcionar una asignación de flujo f(u,v) que alcance ese valor máximo.
3) Exponer la secuencia de caminos aumentantes y el cuello de botella en cada iteración (método de Ford–Fulkerson/Edmonds–Karp).
4) Indicar un corte mínimo (S,T) que certifique la maximalidad del flujo (teorema del flujo máximo–corte mínimo).

(Notas)
• Restricciones del flujo: 0 ≤ f(u,v) ≤ c(u,v) para todo (u,v)∈E.
• Conservación de flujo: ∑_u f(u,x) = ∑_v f(x,v) para todo x∈V\\{s,t}.
• Valor del flujo: |f| = ∑_v f(s,v) = ∑_u f(u,t).`;
    setStatement(academic);
    setActiveTab("enun");
  };

  const sleep = (ms:number)=> new Promise(r=>setTimeout(r,ms));
  const animateLogs = async (logs:Log[])=>{
    if(!cy.current) return;
    for(const st of logs){
      const ids = st.augmenting_path.map(([u,v])=>`${u}-${v}`);
      ids.forEach(id=> cy.current!.getElementById(id).addClass("hl"));
      await sleep(800);
      ids.forEach(id=> cy.current!.getElementById(id).removeClass("hl"));
      await sleep(200);
    }
  };

  const fillPanelsFromResult = (res:Result)=>{
    setSummary(`Flujo máximo = ${res.max_flow}`);
    setSteps(res.logs.map((st,i)=>{
      const path = st.augmenting_path.map(p=>`${p[0]}→${p[1]}`).join(" - ");
      return `Paso ${i+1}: camino ${path}, cuello=${st.bottleneck}, acumulado=${st.flow_so_far}`;
    }));
    setAssign(res.flow_assignments.map(e=>`(${e.u}→${e.v}) = ${e.flow}`));
    setCut(`Corte mínimo: S=${res.min_cut.S} | T=${res.min_cut.T}`);
  };

  const run = async ()=>{
    const edges = parseEdges(edgesText);
    await runWith(n, s, t, edges);
  };

  const runWith = async (nNow:number, sNow:number, tNow:number, edges:Edge[])=>{
    if(nNow<8||nNow>16){ alert("n debe estar entre 8 y 16"); return; }
    if(sNow===tNow){ alert("Fuente y sumidero no pueden ser iguales"); return; }
    for(const e of edges){
      if(e.u<0||e.u>=nNow||e.v<0||e.v>=nNow){ alert(`Arista fuera de rango: ${e.u}→${e.v}`); return; }
      if(e.capacity<0){ alert("Capacidad negativa no permitida"); return; }
    }
    try{
      setBusy(true);
      const { data } = await axios.post<Result>(`${API}/api/maxflow`, { n:nNow, source:sNow, sink:tNow, edges });
      setLastResult(data);
      fillPanelsFromResult(data);
      drawGraph(nNow, edges, data);
      buildStatement(nNow, sNow, tNow, edges, data);
      setActiveTab("viz");
    } finally { setBusy(false); }
  };

  const generateRandom = async ()=>{
    setBusy(true);
    try{
      const { data } = await axios.get(`${API}/api/random`, { params:{ n }});
      const nNow = data.n ?? n;
      const sNow = data.source ?? 0;
      const tNow = data.sink ?? (nNow-1);
      const edges:Edge[] = (data.edges as any[]).map((e:any)=>({u:e.u, v:e.v, capacity:e.capacity}));
      setN(nNow); setS(sNow); setT(tNow);
      setEdgesText(edges.map(e=>`${e.u} ${e.v} ${e.capacity}`).join("\n"));
      await runWith(nNow, sNow, tNow, edges);
    } finally { setBusy(false); }
  };

  const clearAll = ()=>{
    setN(8); setS(0); setT(7);
    setEdgesText("");
    setSummary("—"); setSteps([]); setAssign([]); setCut(""); setStatement("—");
    setLastResult(null);
    if(cy.current){ cy.current.elements().remove(); }
    setActiveTab("viz");
  };

  const copyStatement = async ()=>{
    try{
      await navigator.clipboard.writeText(statement);
      alert("Enunciado copiado al portapapeles ✔");
    }catch{ alert("No se pudo copiar. Copia manualmente desde el cuadro."); }
  };

  /* ------------------------ ESTADO / UI DE “LITE” ------------------------ */
  const [liteEdges, setLiteEdges] = useState<Edge[]>(LITE_DEFAULT_EDGES);
  const [liteS, setLiteS] = useState(LIDX["O"]);
  const [liteT, setLiteT] = useState(LIDX["F"]);
  const [liteMin, setLiteMin] = useState(3);
  const [liteMax, setLiteMax] = useState(10);
  const [liteText, setLiteText] = useState<string>("");

  const cyLiteRef = useRef<HTMLDivElement>(null);
  const cyLite = useRef<Core|null>(null);

  
  useEffect(() => {
    if (activeTab !== "lite" || !cyLiteRef.current) return;

    if (!cyLite.current) {
      cyLite.current = cytoscape({
        container: cyLiteRef.current,
        style: [
          { selector:"node", style: {
        'background-color': '#e9edf1',
        'label': 'data(label)',      
        'color': '#0b1020',          
        'font-size': 16,
        'text-valign': 'center',     
        'text-halign': 'center',     
        'text-margin-y': 0,          
        'text-outline-width': 0
      }},
          { selector:"edge", style:{
            'width': 4,
        'line-color': '#a6b3c5',
        'target-arrow-shape': 'triangle',
        'target-arrow-color': '#a6b3c5',
        'curve-style': 'bezier',
        'label': 'data(label)',      
        'font-size': 12,
        'color': '#a9d1e2',
        'text-background-opacity': 0
          }},
        ],
        layout:{ name:"preset" },
        wheelSensitivity:0.25
      });
    }

    drawLite(liteEdges);
    cyLite.current.resize();
    cyLite.current.fit(undefined, 20);
  }, [activeTab]);

  
  useEffect(() => {
    if (activeTab === "lite" && cyLite.current) {
      drawLite(liteEdges);
    }
  }, [liteEdges, activeTab]);

  
  useEffect(() => {
  const onResize = () => { if (cy.current) cy.current.resize(); };
  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
}, []);

useEffect(() => {
  if (activeTab === "viz" && cy.current) {
    cy.current.resize();
    cy.current.fit(undefined, 30);
  }
}, [activeTab]);


  const drawLite = (edges:Edge[])=>{
    if(!cyLite.current) return;
    const g = cyLite.current;
    g.elements().remove();
    const nodes = LITE_LABELS.map((lab,i)=>({
      data:{ id:String(i), label:lab },
      position: LITE_POS[lab]
    }));
    const es = edges.map(e=>({
      data:{
        id:`L${e.u}-${e.v}`, source:String(e.u), target:String(e.v),
        label:`${LITE_LABELS[e.u]}→${LITE_LABELS[e.v]} (${e.capacity})`
      }
    }));
    g.add([...nodes,...es]);
    g.fit(undefined,20);
  };

  const genLiteStatement = (edges:Edge[], sIdx:number, tIdx:number)=>{
    const lines = [
      `La siguiente gráfica representa una red de flujo dirigida que modela el tránsito en hora punta.`,
      `Calcule el **flujo máximo** que puede enviarse desde el punto **${LITE_LABELS[sIdx]}** (fuente) hasta el punto **${LITE_LABELS[tIdx]}** (sumidero).`,
      ``,
      `Nodos: ${LITE_LABELS.join(", ")}`,
      `Aristas con capacidades (u→v ; c):`,
      ...edges.map(e=>`• ${LITE_LABELS[e.u]}→${LITE_LABELS[e.v]} ; ${e.capacity}`),
      ``,
      `Pida:`,
      `1) Valor del flujo máximo.`,
      `2) Caminos aumentantes y cuello de botella por iteración (Edmonds–Karp).`,
      `3) Asignación final de flujo por arista.`,
      `4) Un corte mínimo (S,T) que certifique la maximalidad.`,
    ];
    setLiteText(lines.join("\n"));
  };

  const randomizeLite = ()=>{
    const edges = LITE_DEFAULT_EDGES.map(e=>({...e, capacity: randInt(liteMin,liteMax)}));
    setLiteEdges(edges);
    drawLite(edges);
    genLiteStatement(edges, liteS, liteT);
  };

  
  const useInSolver = async ()=>{
    const txt = liteEdges.map(e=>`${e.u} ${e.v} ${e.capacity}`).join("\n");
    const N_SOLVER = 8;
    const S_SOLVER = liteS;
    const T_SOLVER = liteT;

    setN(N_SOLVER); setS(S_SOLVER); setT(T_SOLVER); setEdgesText(txt);
    await runWith(N_SOLVER, S_SOLVER, T_SOLVER, liteEdges);
  };

  

  
  /* ------------------------------ RENDER ------------------------------ */
return (
  <div className="grid">
    <header className="header">
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span className="badge">🔗 Problema de Flujo Máximo</span>
          <span className="small">Ford–Fulkerson (Edmonds–Karp)</span>
        </div>
        <div className="tabs">
          <div className={`tab ${activeTab==="viz"?"active":""}`} onClick={()=>setActiveTab("viz")}>Visualización</div>
          <div className={`tab ${activeTab==="resumen"?"active":""}`} onClick={()=>setActiveTab("resumen")}>Resumen</div>
          <div className={`tab ${activeTab==="pasos"?"active":""}`} onClick={()=>setActiveTab("pasos")}>Pasos</div>
          <div className={`tab ${activeTab==="asign"?"active":""}`} onClick={()=>setActiveTab("asign")}>Asignación</div>
          <div className={`tab ${activeTab==="enun"?"active":""}`} onClick={()=>setActiveTab("enun")}>Enunciado</div>
          <div className={`tab ${activeTab==="lite"?"active":""}`} onClick={()=>setActiveTab("lite")}>Generar lite</div>
        </div>
      </div>
    </header>

    {/* ====== LITE: SIEMPRE montado; ocupa todo el ancho y se oculta/mostrar con display ====== */}
    <section
      className="card"
      style={{
        gridColumn: "1 / -1",
        display: activeTab === "lite" ? "grid" : "none",
        gap: 12,
        gridTemplateColumns: "360px 1fr"
      }}
    >
      {/* Config lite */}
      <div style={{display:"grid", gap:12}}>
        <h2>Generar ejercicio (lite)</h2>

        <div>
          <label>Fuente (s)</label>
          <select value={liteS} onChange={e=>setLiteS(+e.target.value)}>
            {LITE_LABELS.map((lab,i)=><option key={lab} value={i}>{lab}</option>)}
          </select>
        </div>

        <div>
          <label>Sumidero (t)</label>
          <select value={liteT} onChange={e=>setLiteT(+e.target.value)}>
            {LITE_LABELS.map((lab,i)=><option key={lab} value={i} disabled={i===liteS}>{lab}</option>)}
          </select>
        </div>

        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8}}>
          <div><label>Capacidad mín.</label><input type="number" value={liteMin} onChange={e=>setLiteMin(+e.target.value)} /></div>
          <div><label>Capacidad máx.</label><input type="number" value={liteMax} onChange={e=>setLiteMax(+e.target.value)} /></div>
        </div>

        <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
          <button className="purple" onClick={randomizeLite}>Generar nuevo ejercicio</button>
          <button className="green" onClick={()=>genLiteStatement(liteEdges, liteS, liteT)}>Generar enunciado</button>
          <button className="primary" onClick={useInSolver}>Usar en el solver</button>
        </div>

        <div>
          <label>Enunciado</label>
          <pre style={{maxHeight:"28vh"}}>{liteText || "— (pulsa Generar enunciado)"}</pre>
        </div>
      </div>

      {/* Preview lite */}
      <div>
        <div
          ref={cyLiteRef}
          style={{height:"60vh", border:"1px solid var(--border)", borderRadius:12, background:"#0b1020"}}
        />
        <div className="small" style={{marginTop:8}}>
          Vista previa del ejercicio. Las etiquetas son O..F y las capacidades se muestran sobre las aristas.
        </div>
      </div>
    </section>

    {/* ====== PRINCIPAL IZQUIERDA: SIEMPRE montado; oculto si activeTab === "lite" ====== */}
    <section
      className="card"
      style={{ display: activeTab === "lite" ? "none" : "block", maxHeight:"calc(100vh - 140px)", overflow:"auto" }}
    >
      <h2 style={{marginBottom:"1rem"}}>Configuración</h2>
      <div style={{display:"grid",gap:12}}>
        <div><label>N (8–16)</label><input type="number" min={8} max={16} value={n} onChange={e=>setN(+e.target.value)} /></div>
        <div><label>Fuente s</label><input type="number" value={s} onChange={e=>setS(+e.target.value)} /></div>
        <div><label>Sumidero t</label><input type="number" value={t} onChange={e=>setT(+e.target.value)} /></div>
        <div><label>Aristas (u v capacidad)</label><textarea rows={10} value={edgesText} onChange={e=>setEdgesText(e.target.value)} /></div>
        <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
          <button className="primary" onClick={run} disabled={busy}>Resolver / Calcular flujo</button>
          <button className="purple" onClick={generateRandom} disabled={busy}>Generar aleatorio</button>
          <button className="green" disabled={!lastResult||busy} onClick={()=> lastResult && animateLogs(lastResult.logs)}>Animar pasos</button>
          <button className="ghost" onClick={clearAll}>Limpiar entradas</button>
        </div>
      </div>
    </section>

    {/* ====== PRINCIPAL DERECHA: SIEMPRE montado; oculto si activeTab === "lite" ====== */}
    <section
      className="card"
      style={{ display: activeTab === "lite" ? "none" : "grid", gap:12, gridTemplateRows:"1fr auto" }}
    >
      {/* Contenedor del grafo: altura y ANCHO explícitos */}
      <div id="cy" ref={cyRef} style={{ height:"60vh", width:"100%", display: activeTab==="viz" ? "block" : "none" }} />

      {activeTab!=="viz" && (
        <div style={{display:"grid",gap:12}}>
          {activeTab==="resumen" && (<><h2>Resumen</h2><pre>{summary + "\n" + (cut||"")}</pre></>)}
          {activeTab==="pasos"   && (<><h2>Todos los pasos</h2><pre>{steps.join("\n") || "—"}</pre></>)}
          {activeTab==="asign"   && (<><h2>Asignación de flujo</h2><pre>{assign.join("\n") || "—"}</pre></>)}
          {activeTab==="enun"    && (
            <>
              <h2>Enunciado</h2>
              <div style={{display:"flex", gap:8, flexWrap:"wrap", marginBottom:8}}>
                <button className="purple" onClick={()=>buildAcademicStatement(n,s,t,parseEdges(edgesText))}>Generar académico</button>
                <button className="ghost"  onClick={()=>buildStatement(n,s,t,parseEdges(edgesText), lastResult || undefined)}>Generar narrativo</button>
                <button className="green"  onClick={copyStatement}>Copiar</button>
              </div>
              <pre>{statement}</pre>
            </>
          )}
        </div>
      )}

      <div className="small">Tips: zoom con rueda • arrastra para pan • <b>rojo</b>= aristas del corte mínimo</div>
    </section>
  </div>
);

}
