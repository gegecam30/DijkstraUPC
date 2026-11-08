// Dijkstra paso a paso: port fiel de dijkstra.py (mismos pasos y mensajes)

// Min-heap de pares [distancia, nodo]; desempata por nodo, igual que heapq con tuplas.
class MinHeap {
  constructor() { this.a = []; }
  get length() { return this.a.length; }
  static less(x, y) { return x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]); }
  push(item) {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!MinHeap.less(a[i], a[p])) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && MinHeap.less(a[l], a[m])) m = l;
        if (r < a.length && MinHeap.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
  nodes() { return this.a.map(([, node]) => node); }
}

export const fmt = (v) => (v === Infinity ? "∞" : String(v));

export function runDijkstra(graph, source, target, labels) {
  const dist = new Array(graph.n).fill(Infinity);
  dist[source] = 0;
  const preds = Array.from({ length: graph.n }, () => []);
  const visited = new Set();
  const pq = new MinHeap();
  pq.push([0, source]);
  const steps = [];

  const snap = (kind, current, edge, message) => steps.push({
    kind, current, edge,
    dist: [...dist],
    visited: new Set(visited),
    frontier: pq.nodes(),
    preds: preds.map((p) => [...p]),
    message,
  });

  snap("init", null, null, `Inicialización: dist[${labels[source]}]=0, resto ∞. Cola: [${labels[source]}]`);

  while (pq.length) {
    const [d0, u] = pq.pop();
    if (visited.has(u)) continue;
    visited.add(u);
    snap("select", u, null,
      `Se selecciona ${labels[u]} (dist=${d0}), el menor no visitado. Se marca como visitado.`);

    for (const [v, w] of graph.adj[u]) {
      const nd = d0 + w;
      const old = dist[v];
      if (nd < old) {
        dist[v] = nd;
        preds[v] = [u];
        pq.push([nd, v]);
        snap("relax", u, [u, v],
          `Arista ${labels[u]}→${labels[v]} (peso ${w}): ${d0}+${w}=${nd} < ${fmt(old)}. ` +
          `Se actualiza dist[${labels[v]}]=${nd}, predecesor ${labels[v]}←${labels[u]}`);
      } else if (nd === old) {
        if (!preds[v].includes(u)) {
          preds[v].push(u);
          snap("tie", u, [u, v],
            `Arista ${labels[u]}→${labels[v]} (peso ${w}): ${d0}+${w}=${nd} = dist[${labels[v]}]. ` +
            `Empate: se agrega ${labels[u]} como predecesor adicional de ${labels[v]}`);
        }
      } else {
        snap("skip", u, [u, v],
          `Arista ${labels[u]}→${labels[v]} (peso ${w}): ${d0}+${w}=${nd} > ${fmt(old)}. No se actualiza.`);
      }
    }
  }

  const msg = dist[target] === Infinity
    ? `Algoritmo finalizado. No existe camino de ${labels[source]} a ${labels[target]}.`
    : `Algoritmo finalizado. Distancia mínima ${labels[source]}→${labels[target]} = ${dist[target]}`;
  snap("done", null, null, msg);
  return steps;
}

// Backtracking sobre la lista de predecesores: todos los caminos mínimos (límite 50).
export function allMinPaths(preds, source, target, dist, limit = 50) {
  if (dist[target] === Infinity) return { paths: [], truncated: false };
  const paths = [];
  let truncated = false;

  const backtrack = (node, acc) => {
    if (paths.length >= limit) { truncated = true; return; }
    if (node === source) { paths.push([source, ...[...acc].reverse()]); return; }
    for (const p of preds[node]) {
      if (paths.length >= limit) { truncated = true; return; }
      backtrack(p, [...acc, node]);
    }
  };
  backtrack(target, []);
  return { paths, truncated };
}
