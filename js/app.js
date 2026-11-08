// Interfaz: port de ui.py (mismos modos, controles, mensajes y flujo)
import {
  LABELS, MAX_NODES, Graph, generateAdvancedDag, topologicalLayers, graphToDict, graphFromDict,
} from "./graph.js";
import { runDijkstra, allMinPaths, fmt } from "./dijkstra.js";
import { GraphView } from "./render.js";

const $ = (id) => document.getElementById(id);
const win = $("tkwin");

const S = {
  graph: new Graph(7),
  graphReady: false,
  steps: [],
  stepIndex: 0,
  sourceIdx: null,
  targetIdx: null,
  autoJob: null,
  dark: false,
};

const view = new GraphView($("graphSvg"), S.graph);

// ------------------------------------------------------------------ diálogos (estilo cuadro de Windows)
function dialog({ title, text, buttons, input = null }) {
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "tkdlg";
    dlg.innerHTML = `<div class="tkdlg-title">${title}</div><div class="tkdlg-body"></div><div class="tkdlg-actions"></div>`;
    const body = dlg.querySelector(".tkdlg-body");
    const actions = dlg.querySelector(".tkdlg-actions");
    body.textContent = text;
    let field = null, err = null;
    if (input) {
      field = document.createElement("input");
      field.className = "tk-input tkdlg-input";
      field.inputMode = "numeric";
      err = document.createElement("div");
      err.className = "tkdlg-err";
      body.append(document.createElement("br"), field, err);
    }
    const close = (value) => { dlg.close(); dlg.remove(); resolve(value); };
    buttons.forEach(({ label, value, primary }) => {
      const b = document.createElement("button");
      b.className = "tk-btn" + (primary ? " primary" : "");
      b.textContent = label;
      b.onclick = () => {
        if (input && value === "ok") {
          const t = field.value.trim();
          if (!/^\d+$/.test(t) || +t < 1 || +t > 99) { err.textContent = "Ingrese un entero entre 1 y 99."; return; }
          close(+t);
        } else close(value);
      };
      actions.append(b);
    });
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(input ? null : false); });
    dlg.addEventListener("keydown", (e) => { if (e.key === "Enter") actions.querySelector(".primary")?.click(); });
    win.append(dlg);
    dlg.showModal();
    (field || actions.querySelector("button")).focus();
  });
}
const showInfo = (title, text) => dialog({ title, text, buttons: [{ label: "Aceptar", value: true, primary: true }] });
const showError = showInfo;
const showWarning = showInfo;
const askYesNo = (title, text) => dialog({ title, text, buttons: [
  { label: "Sí", value: true, primary: true }, { label: "No", value: false }] });
const askWeight = (a, b) => dialog({ title: "Peso de la arista", text: `Peso de ${a} → ${b}  (1 a 99):`, input: true,
  buttons: [{ label: "Aceptar", value: "ok", primary: true }, { label: "Cancelar", value: null }] });

// ------------------------------------------------------------------ utilidades de interfaz
const mode = () => document.querySelector('input[name="mode"]:checked').value;
const readInt = (id, def) => { const v = parseInt($(id).value, 10); return Number.isNaN(v) ? def : v; };
const readN = () => Math.max(2, Math.min(MAX_NODES, readInt("nVar", 7)));

function setOptions(select, values) {
  select.innerHTML = values.map((v) => `<option>${v}</option>`).join("");
}

function refreshCombos(labels) {
  const src = $("sourceSel").value, dst = $("targetSel").value;
  setOptions($("sourceSel"), labels);
  setOptions($("targetSel"), labels);
  if (!labels.length) return;
  $("sourceSel").value = labels.includes(src) ? src : labels[0];
  $("targetSel").value = labels.includes(dst) && dst !== $("sourceSel").value ? dst : labels[labels.length - 1];
}

function updateRunState() {
  const ready = mode() === "draw" ? S.graph.n >= 2 && S.graph.edges().length > 0 : S.graphReady;
  $("runBtn").disabled = !ready;
}

function setMessage(text) { $("msgBox").textContent = text; }

function setNavState(enabled) {
  for (const id of ["btnReset", "btnPrev", "btnAuto", "btnNext", "btnEnd"]) $(id).disabled = !enabled;
}

// ------------------------------------------------------------------ modos
function onNChanged() {
  if (mode() !== "draw") { refreshCombos(LABELS.slice(0, readN())); updateRunState(); }
}

function showManualPanel(show) {
  $("manualPanel").hidden = !show;
  $("infoPanel").hidden = show;
}

function onModeChange() {
  const m = mode();
  $("genBtn").textContent = { random: "Generar grafo", manual: "Crear grafo", draw: "Nuevo lienzo" }[m];
  $("optionsBar").hidden = m !== "random";
  if (m !== "manual") showManualPanel(false);

  const drawing = m === "draw";
  view.setEditMode(drawing, drawing ? {
    emptyClick: onCanvasClick, edgeDrawn: onEdgeDrawn, deleteNode: onDeleteNode, deleteEdge: onDeleteEdge,
  } : null);
  if (drawing) {
    $("hint").textContent = "Clic: nodo • Arrastrar: arista • Mover y Borrar: botones, Shift o clic der.";
    $("drawButtons").hidden = false;
    if (!S.graph.edges().length) newCanvas();
    else refreshCombos(S.graph.labels);
  } else {
    $("hint").textContent = "(Ctrl + rueda para zoom • Arrastra para mover)";
    $("drawButtons").hidden = true;
    setTool("default");
    refreshCombos(LABELS.slice(0, readN()));
  }
  updateRunState();
}

// ------------------------------------------------------------------ generación
async function onGenerate() {
  const m = mode();
  if (m === "draw") { newCanvas(); return; }
  const n = parseInt($("nVar").value, 10);
  if (Number.isNaN(n)) { await showError("Error", `n debe ser un entero entre 7 y ${MAX_NODES}.`); return; }
  if (!(n >= 7 && n <= MAX_NODES)) { await showError("Error", `n debe estar entre 7 y ${MAX_NODES}.`); return; }

  S.graphReady = false;
  resetExecution();

  if (m === "random") await generateRandom(n);
  else {
    S.graph = new Graph(n);
    setOptions($("edgeFrom"), S.graph.labels);
    setOptions($("edgeTo"), S.graph.labels);
    $("edgeList").innerHTML = "";
    showManualPanel(true);
    view.setGraph(S.graph);
    view.render();
    updateRunState();
  }
}

async function generateRandom(n) {
  const srcLabel = $("sourceSel").value, dstLabel = $("targetSel").value;
  const valid = LABELS.slice(0, n);
  if (!valid.includes(srcLabel) || !valid.includes(dstLabel) || srcLabel === dstLabel) {
    await showError("Error", "Elija un Origen y un Destino distintos.");
    return;
  }
  let graph;
  try {
    const num = (id) => { const v = parseInt($(id).value, 10); if (Number.isNaN(v)) throw new Error("Complete todos los campos numéricos."); return v; };
    graph = generateAdvancedDag(n, {
      source: LABELS.indexOf(srcLabel), target: LABELS.indexOf(dstLabel),
      minHops: num("minHops"), density: $("density").value.toLowerCase(), maxOut: num("maxOut"),
      forbidDirect: $("forbidDirect").checked, forceTieOpt: $("forceTie").checked,
      minPaths: num("minPaths"), wMin: num("wMin"), wMax: num("wMax"),
    });
  } catch (exc) {
    await showError("Parámetros no válidos", exc.message);
    return;
  }
  S.graph = graph;
  finishGraphSetup();
  const info = graph.info;
  setMessage([
    `Grafo generado ${srcLabel}→${dstLabel}: mínimo ${info.hops} aristas entre ambos, ${info.paths} caminos posibles.`,
    `Costo óptimo esperado d* = ${info.optimalCost} (${info.optimalPaths} camino(s) óptimo(s)).`,
    ...info.warnings,
  ].join("\n"));
}

function finishGraphSetup(source = null, target = null, positions = null) {
  if (positions) view.setGraph(S.graph, { positions });
  else view.setGraph(S.graph, { layers: topologicalLayers(S.graph) });
  view.render();
  const labels = S.graph.labels;
  if (source !== null && target !== null) {
    setOptions($("sourceSel"), labels); setOptions($("targetSel"), labels);
    $("sourceSel").value = labels[source];
    $("targetSel").value = labels[target];
  }
  refreshCombos(labels);
  S.graphReady = true;
  updateRunState();
}

// ------------------------------------------------------------------ modo dibujo
function newCanvas() {
  resetExecution();
  S.graph = new Graph(0);
  S.graphReady = false;
  view.setGraph(S.graph, { positions: {} });
  view.render();
  refreshCombos([]);
  updateRunState();
  setMessage(`Lienzo vacío: haga clic para crear nodos (hasta ${readN()}; cambie n para ampliar el límite).`);
}

function afterEdit() {
  resetExecution();
  S.graphReady = S.graph.n >= 2;
  refreshCombos(S.graph.labels);
  updateRunState();
  view.render();
}

async function onCanvasClick(x, y) {
  if (S.graph.n >= Math.min(readN(), MAX_NODES)) {
    await showInfo("Límite de nodos", `Ya hay ${S.graph.n} nodos (límite n). Aumente n para agregar más.`);
    return;
  }
  const idx = S.graph.addNode();
  view.placeNode(idx, x, y);
  afterEdit();
}

async function onEdgeDrawn(u, v) {
  const a = S.graph.labels[u], b = S.graph.labels[v];
  if (S.graph.hasEdge(u, v)) { await showError("Error", `La arista ${a}→${b} ya existe.`); return; }
  if (S.graph.createsCycle(u, v)) {
    await showWarning("Ciclo detectado", `No se puede agregar ${a}→${b}: crearía un ciclo.\nEl grafo debe seguir siendo un DAG.`);
    return;
  }
  const w = await askWeight(a, b);
  if (w === null) return;
  S.graph.addEdge(u, v, w);
  afterEdit();
}

function onDeleteNode(node) { S.graph.removeNode(node); view.dropNode(node); afterEdit(); }
function onDeleteEdge(u, v) { S.graph.removeEdge(u, v); afterEdit(); }

function onAutoLayout() {
  if (S.graph.n < 2) return;
  view.setGraph(S.graph, { layers: topologicalLayers(S.graph) });
  view.render();
}

// ------------------------------------------------------------------ modo formulario
async function onAddEdge() {
  const uLabel = $("edgeFrom").value, vLabel = $("edgeTo").value, wText = $("edgeW").value.trim();
  if (!uLabel || !vLabel) { await showError("Error", "Seleccione origen y destino."); return; }
  if (uLabel === vLabel) { await showError("Error", "No se permite un self-loop (origen = destino)."); return; }
  if (!/^\d+$/.test(wText) || +wText < 1 || +wText > 99) { await showError("Error", "El peso debe ser un entero entre 1 y 99."); return; }
  const u = S.graph.indexOfLabel(uLabel), v = S.graph.indexOfLabel(vLabel), w = +wText;
  if (S.graph.hasEdge(u, v)) { await showError("Error", `La arista ${uLabel}→${vLabel} ya existe.`); return; }
  if (S.graph.createsCycle(u, v)) { await showError("Error", `No se puede agregar ${uLabel}→${vLabel}: crearía un ciclo`); return; }
  S.graph.addEdge(u, v, w);
  const opt = document.createElement("option");
  opt.textContent = `${uLabel} → ${vLabel}   (peso ${w})`;
  $("edgeList").append(opt);
  $("edgeW").value = "";
  view.setGraph(S.graph, { resetView: false });
  view.render();
}

function onRemoveEdge() {
  const sel = $("edgeList");
  if (sel.selectedIndex < 0) return;
  const [left, right] = sel.value.split(" → ");
  S.graph.removeEdge(S.graph.indexOfLabel(left.trim()), S.graph.indexOfLabel(right.split("(")[0].trim()));
  sel.remove(sel.selectedIndex);
  view.setGraph(S.graph, { resetView: false });
  view.render();
}

async function onFinishManual() {
  const g = S.graph;
  if (g.edges().length < g.n - 1) {
    await showWarning("Grafo incompleto", `Se necesitan al menos ${g.n - 1} aristas para continuar.`);
    return;
  }
  const isolated = [];
  for (let n = 0; n < g.n; n++) {
    let hasIn = false;
    for (let o = 0; o < g.n; o++) if (g.hasEdge(o, n)) hasIn = true;
    if (!g.adj[n].length && !hasIn) isolated.push(n);
  }
  if (isolated.length) {
    const ok = await askYesNo("Nodos aislados",
      `Los siguientes nodos no tienen ninguna conexión: ${isolated.map((n) => g.labels[n]).join(", ")}. ¿Continuar de todas formas?`);
    if (!ok) return;
  }
  showManualPanel(false);
  finishGraphSetup();
}

function setTool(tool) {
  view.setTool(tool);
  $("toolMove").setAttribute("aria-pressed", String(tool === "move"));
  $("toolDelete").setAttribute("aria-pressed", String(tool === "delete"));
}
const toggleTool = (tool) => setTool(view.tool === tool ? "default" : tool);

// ------------------------------------------------------------------ guardar / cargar
function onSave() {
  const g = S.graph;
  if (g.n < 2 || !g.edges().length) { showInfo("Guardar", "No hay un grafo con aristas para guardar."); return; }
  const labels = g.labels;
  const src = labels.indexOf($("sourceSel").value), dst = labels.indexOf($("targetSel").value);
  const data = graphToDict(g, src >= 0 ? src : null, dst >= 0 ? dst : null, view.pos);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "grafo.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

async function loadFromData(data, nombre) {
  let parsed;
  try { parsed = graphFromDict(data); }
  catch (exc) { await showError("Cargar", `No se pudo cargar el grafo:\n${exc.message}`); return; }
  resetExecution();
  showManualPanel(false);
  S.graph = parsed.graph;
  if (mode() !== "draw") $("nVar").value = parsed.graph.n;
  finishGraphSetup(parsed.source, parsed.target, parsed.positions);
  setMessage(`Grafo cargado: ${nombre} (${parsed.graph.n} nodos, ${parsed.graph.edges().length} aristas).`);
}

function onLoadFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try { loadFromData(JSON.parse(reader.result), file.name); }
    catch (exc) { showError("Cargar", `No se pudo cargar el grafo:\n${exc.message}`); }
  };
  reader.readAsText(file);
}

export async function loadExample(nombre = "grafo_8nodos.json") {
  const res = await fetch(`ejemplos/${nombre}`);
  await loadFromData(await res.json(), nombre);
}

// ------------------------------------------------------------------ ejecución paso a paso
async function onRun() {
  const srcLabel = $("sourceSel").value, dstLabel = $("targetSel").value;
  if (!srcLabel || !dstLabel) { await showError("Error", "Seleccione origen y destino."); return; }
  if (srcLabel === dstLabel) { await showError("Error", "Origen y destino deben ser distintos."); return; }
  if (!S.graph.labels.includes(srcLabel) || !S.graph.labels.includes(dstLabel)) {
    await showError("Error", "Origen/destino no pertenecen al grafo actual. Genere o cargue el grafo de nuevo.");
    return;
  }
  S.sourceIdx = S.graph.indexOfLabel(srcLabel);
  S.targetIdx = S.graph.indexOfLabel(dstLabel);
  stopAuto();
  S.steps = runDijkstra(S.graph, S.sourceIdx, S.targetIdx, S.graph.labels);
  S.stepIndex = 0;
  setNavState(true);
  renderCurrent();
}

function onPrev() { if (S.stepIndex > 0) { S.stepIndex -= 1; renderCurrent(); } }
function onNext() { if (S.stepIndex < S.steps.length - 1) { S.stepIndex += 1; renderCurrent(); } }
function onReset() { stopAuto(); S.stepIndex = 0; renderCurrent(); }
function onEnd() { stopAuto(); S.stepIndex = S.steps.length - 1; renderCurrent(); }

function onToggleAuto() {
  if (S.autoJob !== null) { stopAuto(); return; }
  $("btnAuto").textContent = "Pausa";
  const tick = () => {
    if (S.stepIndex >= S.steps.length - 1) { stopAuto(); return; }
    S.stepIndex += 1;
    renderCurrent();
    S.autoJob = setTimeout(tick, 1200);
  };
  S.autoJob = setTimeout(tick, 0);
}

function stopAuto() {
  if (S.autoJob !== null) { clearTimeout(S.autoJob); S.autoJob = null; }
  $("btnAuto").textContent = "Auto";
}

function resetExecution() {
  stopAuto();
  S.steps = [];
  S.stepIndex = 0;
  $("stepLabel").textContent = "Paso 0 / 0";
  setNavState(false);
  clearResults();
  setMessage("");
  $("distBody").innerHTML = "";
  view.render();
}

function treeEdges(preds) {
  const edges = new Set();
  preds.forEach((plist, node) => plist.forEach((p) => edges.add(`${p},${node}`)));
  return edges;
}

function renderCurrent() {
  if (!S.steps.length) return;
  const step = S.steps[S.stepIndex];
  const total = S.steps.length;
  $("stepLabel").textContent = `Paso ${S.stepIndex + 1} / ${total}`;
  $("btnPrev").disabled = S.stepIndex <= 0;
  $("btnNext").disabled = S.stepIndex >= total - 1;
  $("btnReset").disabled = S.stepIndex <= 0;
  $("btnEnd").disabled = S.stepIndex >= total - 1;

  updateTable(step);
  setMessage(step.message);

  if (S.stepIndex === total - 1) {
    const dv = step.dist[S.targetIdx];
    const { paths, truncated } = dv === Infinity ? { paths: [], truncated: false }
      : allMinPaths(step.preds, S.sourceIdx, S.targetIdx, step.dist);
    updateResults(step, paths, truncated);
    const shown = shownIndices(paths);
    view.render({
      dist: step.dist, visited: step.visited, current: null, frontier: step.frontier,
      evalEdge: null, treeEdges: null,
      pathEdgeColors: buildPathColors(paths, shown), legendEntries: legendForPaths(shown),
    });
  } else {
    clearResults();
    view.render({
      dist: step.dist, visited: step.visited, current: step.current, frontier: step.frontier,
      evalEdge: step.edge, treeEdges: treeEdges(step.preds),
    });
  }
}

function updateTable(step) {
  const g = S.graph;
  $("distBody").innerHTML = Array.from({ length: g.n }, (_, node) => {
    const preds = step.preds[node].map((p) => g.labels[p]).join(", ");
    return `<tr${node === step.current ? ' class="current"' : ""}><td>${g.labels[node]}</td>` +
      `<td>${fmt(step.dist[node])}</td><td>${step.visited.has(node) ? "Sí" : "No"}</td><td>${preds}</td></tr>`;
  }).join("");
}

function updateResults(step, paths, truncated) {
  const g = S.graph;
  const dv = step.dist[S.targetIdx];
  const lines = [];
  if (dv === Infinity) lines.push(`No existe camino de ${g.labels[S.sourceIdx]} a ${g.labels[S.targetIdx]}.`);
  else {
    lines.push(`Distancia mínima: ${dv}`);
    lines.push(`Cantidad de caminos mínimos: ${paths.length}${truncated ? "+" : ""}`);
    for (const path of paths) lines.push(`${path.map((n) => g.labels[n]).join(" → ")}   (distancia: ${dv})`);
    if (truncated) lines.push("Se muestran los primeros 50 caminos mínimos.");
  }
  $("resultBox").textContent = lines.join("\n");
  const sel = $("pathSel");
  const previous = sel.value;
  const options = ["Todos", ...paths.map((_, i) => `Camino ${i + 1}`)];
  setOptions(sel, options);
  sel.value = options.includes(previous) ? previous : "Todos";
}

function clearResults() {
  $("resultBox").textContent = "";
  setOptions($("pathSel"), ["Todos"]);
}

function shownIndices(paths) {
  const sel = $("pathSel").value;
  if (sel === "Todos" || !paths.length) return paths.map((_, i) => i);
  const idx = parseInt(sel.split(" ")[1], 10) - 1;
  return idx >= 0 && idx < paths.length ? [idx] : paths.map((_, i) => i);
}

function buildPathColors(paths, shown) {
  const colors = {};
  const palette = view.getPathColors();
  for (const i of shown) {
    const color = palette[i % palette.length];
    for (let k = 0; k + 1 < paths[i].length; k++) {
      (colors[`${paths[i][k]},${paths[i][k + 1]}`] ||= []).push(color);
    }
  }
  return colors;
}

function legendForPaths(shown) {
  if (shown.length <= 1) return null;
  const palette = view.getPathColors();
  return shown.map((i) => [`Camino ${i + 1}`, palette[i % palette.length]]);
}

// ------------------------------------------------------------------ tema
function toggleDark() {
  S.dark = !S.dark;
  win.classList.toggle("dark", S.dark);
  $("themeBtn").textContent = S.dark ? "Modo Claro" : "Modo Oscuro";
  view.setDark(S.dark);
  if (S.steps.length) renderCurrent(); else view.render();
}

// ------------------------------------------------------------------ conexiones
$("nVar").addEventListener("input", onNChanged);
document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener("change", onModeChange));
$("genBtn").onclick = onGenerate;
$("runBtn").onclick = onRun;
$("saveBtn").onclick = onSave;
$("loadBtn").onclick = () => $("fileInput").click();
$("fileInput").onchange = (e) => { onLoadFile(e.target.files[0]); e.target.value = ""; };
$("themeBtn").onclick = toggleDark;
$("sourceSel").onchange = resetExecution;
$("targetSel").onchange = resetExecution;
$("zoomIn").onclick = () => view.zoomIn();
$("zoomOut").onclick = () => view.zoomOut();
$("zoomReset").onclick = () => view.resetZoom();
$("toolMove").onclick = () => toggleTool("move");
$("toolDelete").onclick = () => toggleTool("delete");
$("autoLayout").onclick = onAutoLayout;
$("clearCanvas").onclick = newCanvas;
$("addEdge").onclick = onAddEdge;
$("removeEdge").onclick = onRemoveEdge;
$("finishManual").onclick = onFinishManual;
$("pathSel").onchange = renderCurrent;
$("btnReset").onclick = onReset;
$("btnPrev").onclick = onPrev;
$("btnAuto").onclick = onToggleAuto;
$("btnNext").onclick = onNext;
$("btnEnd").onclick = onEnd;
document.querySelectorAll("[data-load-example]").forEach((el) => el.addEventListener("click", (e) => {
  e.preventDefault();
  loadExample(el.dataset.loadExample || undefined);
}));

setNavState(false);
onNChanged();
onModeChange();
toggleDark(); // la página y la demo arrancan en modo oscuro

// ------------------------------------------------------------------ banner del proyecto destacado (se puede ocultar)
(() => {
  const card = document.querySelector(".ad-card");
  const btn = $("adToggle");
  if (!card || !btn) return;
  const video = card.querySelector("video");
  const apply = (collapsed) => {
    card.classList.toggle("is-collapsed", collapsed);
    btn.setAttribute("aria-expanded", String(!collapsed));
    btn.innerHTML = collapsed ? "+" : "&minus;";
    btn.title = collapsed ? "Mostrar" : "Ocultar";
    btn.setAttribute("aria-label", collapsed ? "Mostrar proyecto destacado" : "Ocultar proyecto destacado");
    if (video) { if (collapsed) video.pause(); else video.play().catch(() => {}); }
  };
  let saved = false;
  try { saved = localStorage.getItem("adColapsado") === "1"; } catch (e) { /* sin almacenamiento */ }
  apply(saved);
  btn.addEventListener("click", () => {
    const next = !card.classList.contains("is-collapsed");
    apply(next);
    try { localStorage.setItem("adColapsado", next ? "1" : "0"); } catch (e) { /* sin almacenamiento */ }
  });
})();
