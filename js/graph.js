// Modelo del grafo: port fiel de graph_model.py

export const LABELS = "ABCDEFGHIJKLMNOP".split("");
export const MAX_NODES = LABELS.length;
export const MAX_LEVEL_WIDTH = 5;

// extra: prob. de arista adicional entre capas consecutivas; skip: prob. de atajo que salta una capa
export const DENSITY_PROFILES = {
  baja: { extra: 0.10, skip: 0.04 },
  media: { extra: 0.30, skip: 0.12 },
  alta: { extra: 0.55, skip: 0.25 },
};

// ------------------------------------------------------------------ azar con semilla
export class Random {
  constructor(seed) {
    this.s = (seed === undefined || seed === null ? Math.floor(Math.random() * 2 ** 32) : seed) >>> 0;
  }
  random() { // mulberry32
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  randint(a, b) { return a + Math.floor(this.random() * (b - a + 1)); }
  choice(arr) { return arr[Math.floor(this.random() * arr.length)]; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

// ------------------------------------------------------------------ Graph
export class Graph {
  constructor(n) {
    this.n = n;
    this.adj = Array.from({ length: n }, () => []);
    this.info = {};
  }

  get labels() { return LABELS.slice(0, this.n); }

  addNode() {
    if (this.n >= MAX_NODES) throw new Error(`Máximo ${MAX_NODES} nodos.`);
    this.adj.push([]);
    this.n += 1;
    return this.n - 1;
  }

  removeNode(node) {
    // Los nodos restantes se renumeran para que las etiquetas sigan siendo A, B, C...
    const remap = (i) => (i < node ? i : i - 1);
    this.adj = this.adj
      .filter((_, u) => u !== node)
      .map((nbrs) => nbrs.filter(([v]) => v !== node).map(([v, w]) => [remap(v), w]));
    this.n -= 1;
  }

  addEdge(u, v, w) { this.adj[u].push([v, w]); }
  removeEdge(u, v) { this.adj[u] = this.adj[u].filter(([x]) => x !== v); }
  hasEdge(u, v) { return this.adj[u].some(([x]) => x === v); }
  setWeight(u, v, w) { this.adj[u] = this.adj[u].map(([x, old]) => [x, x === v ? w : old]); }

  edges() {
    const out = [];
    for (let u = 0; u < this.n; u++) for (const [v, w] of this.adj[u]) out.push([u, v, w]);
    return out;
  }

  createsCycle(u, v) {
    if (u === v) return true;
    const stack = [v];
    const visited = new Set();
    while (stack.length) {
      const node = stack.pop();
      if (node === u) return true;
      if (visited.has(node)) continue;
      visited.add(node);
      for (const [nxt] of this.adj[node]) if (!visited.has(nxt)) stack.push(nxt);
    }
    return false;
  }

  indexOfLabel(label) { return this.labels.indexOf(label); }
}

export function topologicalOrder(graph) {
  const indeg = new Array(graph.n).fill(0);
  for (const [, v] of graph.edges()) indeg[v] += 1;
  const queue = [];
  for (let i = 0; i < graph.n; i++) if (indeg[i] === 0) queue.push(i);
  const order = [];
  let head = 0;
  while (head < queue.length) {
    const node = queue[head++];
    order.push(node);
    for (const [v] of graph.adj[node]) {
      indeg[v] -= 1;
      if (indeg[v] === 0) queue.push(v);
    }
  }
  return order;
}

export function topologicalLayers(graph) {
  const order = topologicalOrder(graph);
  const depth = new Array(graph.n).fill(0);
  for (const node of order) {
    for (const [v] of graph.adj[node]) depth[v] = Math.max(depth[v], depth[node] + 1);
  }
  return depth;
}

// ------------------------------------------------------------------ métricas
export function hopDistance(graph, source, target) {
  const seen = new Map([[source, 0]]);
  const queue = [source];
  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    if (u === target) return seen.get(u);
    for (const [v] of graph.adj[u]) {
      if (!seen.has(v)) { seen.set(v, seen.get(u) + 1); queue.push(v); }
    }
  }
  return Infinity;
}

function hopPath(graph, source, target) {
  const parent = new Map([[source, null]]);
  const queue = [source];
  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    if (u === target) break;
    for (const [v] of graph.adj[u]) {
      if (!parent.has(v)) { parent.set(v, u); queue.push(v); }
    }
  }
  const path = [];
  let node = target;
  while (node !== null && node !== undefined) { path.push(node); node = parent.get(node); }
  return path.reverse();
}

export function countPaths(graph, source, target) {
  const ways = new Array(graph.n).fill(0);
  ways[source] = 1;
  for (const u of topologicalOrder(graph)) for (const [v] of graph.adj[u]) ways[v] += ways[u];
  return ways[target];
}

function costsFromSource(graph, order, source) {
  const dist = new Array(graph.n).fill(Infinity);
  dist[source] = 0;
  for (const u of order) {
    if (dist[u] < Infinity) for (const [v, w] of graph.adj[u]) dist[v] = Math.min(dist[v], dist[u] + w);
  }
  return dist;
}

function costsToTarget(graph, order, target) {
  const dist = new Array(graph.n).fill(Infinity);
  dist[target] = 0;
  for (let i = order.length - 1; i >= 0; i--) {
    const u = order[i];
    for (const [v, w] of graph.adj[u]) if (dist[v] < Infinity) dist[u] = Math.min(dist[u], w + dist[v]);
  }
  return dist;
}

// Holgura de (u,v,w) = d(s,u) + w + d(v,t) - d*. Holgura 0: la arista está en un camino óptimo.
export function optimalSlacks(graph, source, target) {
  const order = topologicalOrder(graph);
  const ds = costsFromSource(graph, order, source);
  const dt = costsToTarget(graph, order, target);
  const best = ds[target];
  const ways = new Array(graph.n).fill(0);
  ways[source] = 1;
  const slacks = [];
  for (const u of order) {
    for (const [v, w] of graph.adj[u]) {
      if (ds[u] === Infinity || dt[v] === Infinity) continue;
      const slack = ds[u] + w + dt[v] - best;
      slacks.push([slack, u, v, w]);
      if (slack === 0) ways[v] += ways[u];
    }
  }
  return { best, nOpt: ways[target], slacks };
}

// ------------------------------------------------------------------ generador
function assignLevels(n, source, target, minHops, maxOut, rng) {
  const others = [];
  for (let v = 0; v < n; v++) if (v !== source && v !== target) others.push(v);
  rng.shuffle(others);
  const midLevels = Math.min(others.length, Math.max(minHops - 1, Math.floor((others.length + 1) / 2)));
  const sizes = new Array(midLevels).fill(1);
  let remaining = others.length - midLevels;
  while (remaining > 0) {
    const options = [];
    for (let i = 0; i < midLevels; i++) {
      const prev = i > 0 ? sizes[i - 1] : 1;
      if (sizes[i] < MAX_LEVEL_WIDTH && sizes[i] + 1 <= maxOut * prev) options.push(i);
    }
    if (!options.length) throw new Error("No se pudo repartir los nodos en capas con esos parámetros.");
    sizes[rng.choice(options)] += 1;
    remaining -= 1;
  }
  const levels = [[source]];
  let pos = 0;
  for (const s of sizes) { levels.push(others.slice(pos, pos + s)); pos += s; }
  levels.push([target]);
  return levels;
}

// Baja el peso de UNA arista para crear un segundo camino de costo exactamente d*.
function forceTie(graph, source, target, wMin, rng) {
  const { nOpt, slacks } = optimalSlacks(graph, source, target);
  if (nOpt >= 2) return true;
  const candidates = slacks.filter(([s, , , w]) => s > 0 && w - s >= wMin);
  if (!candidates.length) return false;
  const smallest = Math.min(...candidates.map((c) => c[0]));
  const [, u, v, w] = rng.choice(candidates.filter((c) => c[0] === smallest));
  graph.setWeight(u, v, w - smallest);
  return true;
}

export function generateAdvancedDag(n, opts = {}) {
  const {
    source = 0, minHops = 4, density = "media", maxOut = 3, forbidDirect = true,
    forceTieOpt = false, minPaths = 1, wMin = 1, wMax = 99, seed,
  } = opts;
  const target = opts.target === undefined || opts.target === null ? n - 1 : opts.target;
  const rng = new Random(seed);
  let hops = minHops;

  if (!(n >= 2 && n <= MAX_NODES)) throw new Error(`n debe estar entre 2 y ${MAX_NODES}.`);
  if (!(source >= 0 && source < n && target >= 0 && target < n) || source === target)
    throw new Error("Origen y destino deben ser nodos distintos del grafo.");
  if (!DENSITY_PROFILES[density]) throw new Error("Densidad no válida (baja, media o alta).");
  if (maxOut < 2) throw new Error("Máx. salidas por nodo debe ser al menos 2.");
  if (!(wMin >= 1 && wMin <= wMax && wMax <= 99))
    throw new Error("Los pesos deben cumplir 1 ≤ mínimo ≤ máximo ≤ 99.");
  if (forbidDirect) hops = Math.max(hops, 2);
  if (!(hops >= 1 && hops <= n - 1))
    throw new Error(`Con n=${n} los saltos mínimos deben estar entre 1 y ${n - 1}.`);

  const prof = DENSITY_PROFILES[density];
  const levels = assignLevels(n, source, target, hops, maxOut, rng);
  const levelOf = new Map();
  levels.forEach((lv, i) => lv.forEach((v) => levelOf.set(v, i)));
  const graph = new Graph(n);
  const outDeg = new Array(n).fill(0);

  const add = (u, v) => { graph.addEdge(u, v, rng.randint(wMin, wMax)); outDeg[u] += 1; };

  // 1) Conectividad: todo nodo recibe una arista de la capa anterior y emite una a la siguiente.
  for (let i = 0; i + 1 < levels.length; i++) {
    const a = levels[i], b = levels[i + 1];
    for (const v of b) add(rng.choice(a.filter((u) => outDeg[u] < maxOut)), v);
    for (const u of a) if (outDeg[u] === 0) add(u, rng.choice(b));
  }

  // 2) Aristas adicionales y atajos que saltan una capa.
  const extraCandidates = () => {
    const adjacent = [], skips = [];
    levels.forEach((a, i) => {
      for (const u of a) {
        [[i + 1, adjacent], [i + 2, skips]].forEach(([j, bucket]) => {
          if (j < levels.length) for (const v of levels[j]) if (!graph.hasEdge(u, v)) bucket.push([u, v]);
        });
      }
    });
    return { adjacent, skips };
  };

  const first = extraCandidates();
  for (const [pool, p] of [[first.adjacent, prof.extra], [first.skips, prof.skip]]) {
    for (const [u, v] of pool) if (outDeg[u] < maxOut && rng.random() < p) add(u, v);
  }

  // 3) Regla de saltos: eliminar atajos hasta que no exista camino con menos de minHops aristas.
  while (hopDistance(graph, source, target) < hops) {
    const path = hopPath(graph, source, target);
    const shortcuts = [];
    for (let i = 0; i + 1 < path.length; i++) {
      if (levelOf.get(path[i + 1]) - levelOf.get(path[i]) > 1) shortcuts.push([path[i], path[i + 1]]);
    }
    const [u, v] = rng.choice(shortcuts);
    graph.removeEdge(u, v);
    outDeg[u] -= 1;
  }

  // 4) Caminos alternativos mínimos.
  const warnings = [];
  if (countPaths(graph, source, target) < minPaths) {
    const { adjacent, skips } = extraCandidates();
    const pool = rng.shuffle([...adjacent, ...skips]);
    for (const [u, v] of pool) {
      if (countPaths(graph, source, target) >= minPaths) break;
      if (outDeg[u] >= maxOut) continue;
      add(u, v);
      if (hopDistance(graph, source, target) < hops) { graph.removeEdge(u, v); outDeg[u] -= 1; }
    }
    const got = countPaths(graph, source, target);
    if (got < minPaths) warnings.push(`Solo se lograron ${got} caminos distintos (pedidos: ${minPaths}).`);
  }

  // 5) Empate exacto en el óptimo; si los pesos no lo permiten se vuelven a sortear.
  if (forceTieOpt) {
    let tied = forceTie(graph, source, target, wMin, rng);
    let attempts = 0;
    while (!tied && attempts < 50) {
      attempts += 1;
      for (let u = 0; u < n; u++) graph.adj[u] = graph.adj[u].map(([v]) => [v, rng.randint(wMin, wMax)]);
      tied = forceTie(graph, source, target, wMin, rng);
    }
    if (!tied) warnings.push("No fue posible forzar el empate con ese rango de pesos.");
  }

  const { best, nOpt } = optimalSlacks(graph, source, target);
  graph.info = {
    source, target,
    hops: hopDistance(graph, source, target),
    paths: countPaths(graph, source, target),
    optimalCost: best,
    optimalPaths: nOpt,
    warnings,
  };
  return graph;
}

// ------------------------------------------------------------------ JSON (mismo formato que la app de escritorio)
export function graphToDict(graph, source = null, target = null, positions = null) {
  const data = {
    formato: "dijkstra-dag",
    version: 1,
    n: graph.n,
    aristas: graph.edges().map(([u, v, w]) => ({ desde: graph.labels[u], hasta: graph.labels[v], peso: w })),
  };
  if (source !== null && target !== null) {
    data.origen = graph.labels[source];
    data.destino = graph.labels[target];
  }
  if (positions) {
    data.posiciones = {};
    for (const [i, [x, y]] of Object.entries(positions)) {
      if (Number(i) < graph.n) data.posiciones[graph.labels[i]] = [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4];
    }
  }
  return data;
}

export function graphFromDict(data) {
  const n = parseInt(data && data.n, 10);
  const edges = data && data.aristas;
  if (!Number.isInteger(n) || !Array.isArray(edges))
    throw new Error("El archivo no tiene el formato esperado (faltan 'n' o 'aristas').");
  if (!(n >= 2 && n <= MAX_NODES)) throw new Error(`n debe estar entre 2 y ${MAX_NODES}.`);

  const graph = new Graph(n);
  for (const e of edges) {
    const u = graph.indexOfLabel(e && e.desde);
    const v = graph.indexOfLabel(e && e.hasta);
    const w = Number.parseInt(e && e.peso, 10);
    if (u < 0 || v < 0 || !Number.isInteger(w)) throw new Error(`Arista no válida: ${JSON.stringify(e)}`);
    if (!(w >= 1 && w <= 99)) throw new Error(`Peso fuera de 1-99 en ${e.desde}→${e.hasta}.`);
    if (u === v || graph.hasEdge(u, v)) throw new Error(`Arista repetida o bucle: ${e.desde}→${e.hasta}.`);
    graph.addEdge(u, v, w);
  }
  if (topologicalOrder(graph).length !== n) throw new Error("El grafo contiene un ciclo: no es un DAG.");

  let source = null, target = null;
  if ("origen" in data && "destino" in data) {
    source = graph.indexOfLabel(data.origen);
    target = graph.indexOfLabel(data.destino);
    if (source < 0 || target < 0) throw new Error("Origen o destino no existen en el grafo.");
  }

  let positions = null;
  if (data.posiciones && Object.keys(data.posiciones).length) {
    positions = {};
    for (const [k, xy] of Object.entries(data.posiciones)) {
      const i = graph.indexOfLabel(k);
      const x = Number(xy && xy[0]), y = Number(xy && xy[1]);
      if (i < 0 || !Number.isFinite(x) || !Number.isFinite(y)) { positions = null; break; }
      positions[i] = [x, y];
    }
    if (positions && Object.keys(positions).length !== n) positions = null;
  }
  return { graph, source, target, positions };
}
