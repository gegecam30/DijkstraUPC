// Pruebas del núcleo (equivalentes a tests/test_modelo.py de la app de escritorio)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  Graph, generateAdvancedDag, hopDistance, countPaths, topologicalOrder,
  graphToDict, graphFromDict,
} from "../js/graph.js";
import { runDijkstra, allMinPaths } from "../js/dijkstra.js";

function bruteForce(graph, s, t) {
  const costs = [];
  const dfs = (u, acc) => {
    if (u === t) { costs.push(acc); return; }
    for (const [v, w] of graph.adj[u]) dfs(v, acc + w);
  };
  dfs(s, 0);
  const best = Math.min(...costs);
  return { best, ties: costs.filter((c) => c === best).length };
}

test("generador: propiedades en una malla de parámetros", () => {
  let count = 0;
  for (const n of [7, 8, 10, 13, 16]) {
    for (const minHops of [1, 2, 3, 4, 5, 6]) {
      if (minHops > n - 1) continue;
      for (const maxOut of [2, 3, 4]) {
        for (const density of ["baja", "media", "alta"]) {
          for (let seed = 0; seed < 8; seed++) {
            const s = (seed * 3) % n;
            let t = (seed * 5 + 1) % n;
            if (s === t) t = (t + 1) % n;
            const g = generateAdvancedDag(n, { source: s, target: t, minHops, density, maxOut,
              forbidDirect: true, forceTieOpt: false, minPaths: 2, wMin: 1, wMax: 99, seed });
            assert.equal(topologicalOrder(g).length, n, "debe ser DAG");
            assert.ok(hopDistance(g, s, t) >= Math.max(minHops, 2));
            for (let u = 0; u < n; u++) assert.ok(g.adj[u].length <= maxOut);
            for (let v = 0; v < n; v++) {
              assert.ok(v === s || hopDistance(g, s, v) < Infinity);
              assert.ok(v === t || hopDistance(g, v, t) < Infinity);
            }
            count++;
          }
        }
      }
    }
  }
  assert.ok(count > 1000);
});

test("empate forzado verificado contra fuerza bruta", () => {
  for (const n of [7, 8, 12, 16]) {
    for (let seed = 0; seed < 40; seed++) {
      const g = generateAdvancedDag(n, { source: 0, target: n - 1, minHops: 4, forceTieOpt: true,
        minPaths: 2, wMin: 1, wMax: 30, seed });
      const { best, ties } = bruteForce(g, 0, n - 1);
      assert.ok(ties >= 2, `n=${n} seed=${seed}`);
      assert.equal(best, g.info.optimalCost);
      assert.equal(ties, g.info.optimalPaths);
      assert.equal(countPaths(g, 0, n - 1), g.info.paths);
    }
  }
});

test("Dijkstra coincide con fuerza bruta (distancia y cantidad de caminos)", () => {
  for (let seed = 0; seed < 150; seed++) {
    const n = 7 + (seed % 6);
    const g = generateAdvancedDag(n, { source: 0, target: n - 1, minHops: 3, density: "alta",
      maxOut: 4, forceTieOpt: seed % 2 === 0, wMin: 1, wMax: 20, seed });
    const last = runDijkstra(g, 0, n - 1, g.labels).at(-1);
    const { best, ties } = bruteForce(g, 0, n - 1);
    assert.equal(last.dist[n - 1], best);
    assert.equal(allMinPaths(last.preds, 0, n - 1, last.dist).paths.length, ties);
  }
});

test("caso del informe: d*=13, dos caminos y 23 pasos (mismo resultado que Python)", () => {
  const data = JSON.parse(readFileSync(new URL("../ejemplos/grafo_8nodos.json", import.meta.url)));
  const { graph, source, target } = graphFromDict(data);
  const steps = runDijkstra(graph, source, target, graph.labels);
  assert.equal(steps.length, 23);
  const last = steps.at(-1);
  assert.equal(last.dist[target], 13);
  const { paths } = allMinPaths(last.preds, source, target, last.dist);
  const names = paths.map((p) => p.map((i) => graph.labels[i]).join("")).sort();
  assert.deepEqual(names, ["ABEH", "ACFH"]);
  assert.equal(steps[0].message, "Inicialización: dist[A]=0, resto ∞. Cola: [A]");
  assert.equal(steps.at(-1).message, "Algoritmo finalizado. Distancia mínima A→H = 13");
});

test("JSON: ida y vuelta, ciclos y formato inválido", () => {
  const g = generateAdvancedDag(10, { source: 2, target: 7, forceTieOpt: true, minPaths: 2, wMax: 50, seed: 5 });
  const pos = {};
  for (let i = 0; i < 10; i++) pos[i] = [i * 0.1, -i * 0.05];
  const back = graphFromDict(JSON.parse(JSON.stringify(graphToDict(g, 2, 7, pos))));
  assert.equal(back.source, 2);
  assert.equal(back.target, 7);
  assert.deepEqual([...back.graph.edges()].sort(), [...g.edges()].sort());
  assert.ok(Math.abs(back.positions[3][0] - 0.3) < 1e-3);

  const ciclo = { n: 3, aristas: [
    { desde: "A", hasta: "B", peso: 1 }, { desde: "B", hasta: "C", peso: 1 }, { desde: "C", hasta: "A", peso: 1 }] };
  assert.throws(() => graphFromDict(ciclo), /ciclo/);
  assert.throws(() => graphFromDict({ hola: 1 }), /formato/);
});

test("removeNode renumera las etiquetas", () => {
  const g = new Graph(4);
  g.addEdge(0, 1, 1); g.addEdge(1, 2, 2); g.addEdge(2, 3, 3); g.addEdge(0, 3, 9);
  g.removeNode(1);
  assert.equal(g.n, 3);
  assert.deepEqual([...g.edges()].sort(), [[0, 2, 9], [1, 2, 3]]);
  assert.deepEqual(g.labels, ["A", "B", "C"]);
});

test("parámetros inválidos", () => {
  assert.throws(() => generateAdvancedDag(7, { source: 0, target: 6, minHops: 7 }));
  assert.throws(() => generateAdvancedDag(7, { source: 3, target: 3 }));
  assert.throws(() => generateAdvancedDag(7, { source: 0, target: 6, maxOut: 1 }));
});
