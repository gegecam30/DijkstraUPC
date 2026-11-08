// Dibujo del grafo en SVG: port de visualizer.py (mismas paletas, colores y gestos)

export const THEME_PALETTES = {
  light: {
    bg: "#fafafa", current: "#ff9800", current_edge: "#e65100",
    visited: "#d4d4d4", visited_edge: "#616161", frontier: "#90caf9", frontier_edge: "#1565c0",
    unreached: "#ffffff", unreached_edge: "#757575", node_text: "#111111", dist_text: "#222222",
    dist_current_text: "#111111", edge_default: "#9e9e9e", edge_eval: "#ff9800", edge_tree: "#2e7d32",
    badge_bg: "#ffffff", badge_edge: "#cccccc", badge_text: "#222222",
    legend_bg: "#ffffff", legend_edge: "#cccccc", legend_text: "#222222",
    path_colors: ["#d32f2f", "#1976d2", "#2e7d32", "#7b1fa2", "#ef6c00", "#6d4c41"],
  },
  dark: {
    bg: "#1e1e1e", current: "#ff9800", current_edge: "#ffe082",
    visited: "#383d47", visited_edge: "#6c7689", frontier: "#1976d2", frontier_edge: "#64b5f6",
    unreached: "#2b3240", unreached_edge: "#5c6b84", node_text: "#ffffff", dist_text: "#abb2bf",
    dist_current_text: "#ffffff", edge_default: "#5e697d", edge_eval: "#ffb74d", edge_tree: "#81c784",
    badge_bg: "#282c34", badge_edge: "#4b5263", badge_text: "#e5c07b",
    legend_bg: "#252526", legend_edge: "#444444", legend_text: "#f0f0f0",
    path_colors: ["#ff5252", "#40c4ff", "#69f0ae", "#ea80fc", "#ffd740", "#ffab91"],
  },
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const NS = "http://www.w3.org/2000/svg";

export class GraphView {
  constructor(svg, graph) {
    this.svg = svg;
    this.graph = graph;
    this.dark = false;
    this.pos = {};
    this.nodeRadius = 0.06;
    this.base = { x0: -1.1, x1: 1.1, y0: -1.1, y1: 1.1 };
    this.view = { cx: 0, cy: 0, scale: 100 };
    this.zoomed = false;
    this.editMode = false;
    this.handlers = {};
    this.gesture = null;
    this.guide = null;
    this.lastRender = {};
    this.size = { w: 600, h: 500 };

    new ResizeObserver(() => this.onResize()).observe(svg);
    svg.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    svg.addEventListener("pointerdown", (e) => this.onDown(e));
    svg.addEventListener("pointermove", (e) => this.onMove(e));
    svg.addEventListener("pointerup", (e) => this.onUp(e));
    svg.addEventListener("pointercancel", (e) => this.onUp(e));
    svg.addEventListener("contextmenu", (e) => e.preventDefault());
    this.setGraph(graph);
  }

  setDark(isDark) { this.dark = !!isDark; }
  get palette() { return THEME_PALETTES[this.dark ? "dark" : "light"]; }
  getPathColors() { return this.palette.path_colors; }

  // ---------------------------------------------------------------- disposición
  setGraph(graph, { layers = null, positions = null, resetView = true } = {}) {
    this.graph = graph;
    let pos = null;
    let numLayers = 1;
    let useLayers = layers;

    if (positions) {
      pos = {};
      for (const [k, v] of Object.entries(positions)) pos[k] = [v[0], v[1]];
      useLayers = null;
    }

    if (useLayers) {
      const byLayer = new Map();
      for (let node = 0; node < graph.n; node++) {
        const l = useLayers[node] ?? 0;
        if (!byLayer.has(l)) byLayer.set(l, []);
        byLayer.get(l).push(node);
      }
      numLayers = Math.max(...Object.values(useLayers)) + 1;
      pos = {};
      for (let l = 0; l < numLayers; l++) {
        const nodes = byLayer.get(l) || [];
        const x = -1.0 + (2.0 * l) / Math.max(numLayers - 1, 1);
        const m = nodes.length;
        if (m === 1) {
          const y = l === 0 || l === numLayers - 1 ? 0.0 : (l % 2 === 1 ? 0.32 : -0.22);
          pos[nodes[0]] = [x, y];
        } else if (m > 1) {
          nodes.forEach((node, idx) => { pos[node] = [x, -0.72 + (1.44 * idx) / (m - 1)]; });
        }
      }
    }

    if (!pos) {
      // Disposición circular: empieza arriba (12:00) y sigue en sentido horario.
      pos = {};
      for (let i = 0; i < graph.n; i++) {
        const angle = Math.PI / 2 - (2 * Math.PI * i) / graph.n;
        pos[i] = [Math.cos(angle), Math.sin(angle)];
      }
      numLayers = 1;
    }
    this.pos = pos;

    if (positions) {
      this.nodeRadius = 0.06;
    } else if (useLayers) {
      const gap = 2.0 / Math.max(numLayers - 1, 1);
      this.nodeRadius = Math.max(0.048, Math.min(0.075, gap * 0.30));
    } else {
      const chord = 2.0 * Math.sin(Math.PI / Math.max(graph.n, 1));
      this.nodeRadius = Math.max(0.050, Math.min(0.075, chord * 0.22));
    }

    const pts = Object.values(this.pos);
    if (!pts.length) {
      this.base = { x0: -1.1, x1: 1.1, y0: -1.1, y1: 1.1 };
    } else {
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const padX = this.nodeRadius * 2 + 0.08;
      const padY = this.nodeRadius * 2 + 0.10;
      const top = useLayers && numLayers > 1 ? 0.18 : 0.0;
      this.base = {
        x0: Math.min(...xs) - padX, x1: Math.max(...xs) + padX,
        y0: Math.min(...ys) - padY, y1: Math.max(...ys) + padY + top,
      };
    }
    if (resetView) this.fit();
  }

  placeNode(node, x, y) { this.pos[node] = [x, y]; }

  dropNode(node) {
    const next = {};
    for (const [k, v] of Object.entries(this.pos)) {
      const i = Number(k);
      if (i !== node) next[i < node ? i : i - 1] = v;
    }
    this.pos = next;
  }

  // ---------------------------------------------------------------- vista (zoom / desplazamiento)
  measure() {
    const r = this.svg.getBoundingClientRect();
    this.size = { w: Math.max(r.width, 10), h: Math.max(r.height, 10) };
  }

  fit() {
    this.measure();
    const { x0, x1, y0, y1 } = this.base;
    const scale = Math.min(this.size.w / (x1 - x0), this.size.h / (y1 - y0));
    this.view = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, scale };
    this.zoomed = false;
    this.render(this.lastRender);
  }

  onResize() {
    if (!this.zoomed) this.fit();
    else { this.measure(); this.render(this.lastRender); }
  }

  zoomBy(factor, ax = null, ay = null) {
    this.measure();
    const v = this.view;
    const ns = v.scale * factor;
    if (ax === null) { v.scale = ns; }
    else {
      const xd = v.cx + (ax - this.size.w / 2) / v.scale;
      const yd = v.cy - (ay - this.size.h / 2) / v.scale;
      v.scale = ns;
      v.cx = xd - (ax - this.size.w / 2) / ns;
      v.cy = yd + (ay - this.size.h / 2) / ns;
    }
    this.zoomed = true;
    this.render(this.lastRender);
  }
  zoomIn() { this.zoomBy(1 / 0.8); }
  zoomOut() { this.zoomBy(1 / 1.25); }
  resetZoom() { this.fit(); }

  toData(px, py) {
    const v = this.view;
    return [v.cx + (px - this.size.w / 2) / v.scale, v.cy - (py - this.size.h / 2) / v.scale];
  }
  toPx(x, y) {
    const v = this.view;
    return [this.size.w / 2 + (x - v.cx) * v.scale, this.size.h / 2 - (y - v.cy) * v.scale];
  }
  local(e) {
    const r = this.svg.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  // ---------------------------------------------------------------- edición
  setEditMode(enabled, handlers = null) {
    this.editMode = !!enabled;
    this.handlers = handlers || {};
    this.gesture = null;
    this.guide = null;
    this.svg.classList.toggle("editing", this.editMode);
  }

  call(name, ...args) { if (this.handlers[name]) this.handlers[name](...args); }

  nodeAt(x, y) {
    let best = null, bestD = this.nodeRadius * 1.15;
    for (const [k, [nx, ny]] of Object.entries(this.pos)) {
      const d = Math.hypot(x - nx, y - ny);
      if (d <= bestD) { best = Number(k); bestD = d; }
    }
    return best;
  }

  edgeAt(x, y) {
    const tol = this.nodeRadius * 0.45;
    for (const [u, v] of this.graph.edges()) {
      const [x1, y1] = this.pos[u], [x2, y2] = this.pos[v];
      const dx = x2 - x1, dy = y2 - y1;
      const l2 = dx * dx + dy * dy;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / l2));
      if (Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)) <= tol) return [u, v];
    }
    return null;
  }

  onWheel(e) {
    // En la web la rueda sigue desplazando la página; con Ctrl (o Cmd) hace zoom sobre el grafo.
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const [px, py] = this.local(e);
    this.zoomBy(e.deltaY < 0 ? 1 / 0.82 : 1 / 1.22, px, py);
  }

  onDown(e) {
    const [px, py] = this.local(e);
    const [x, y] = this.toData(px, py);
    this.measure();

    if (this.editMode && e.button === 2) {
      const node = this.nodeAt(x, y);
      if (node !== null) this.call("deleteNode", node);
      else {
        const edge = this.edgeAt(x, y);
        if (edge) this.call("deleteEdge", edge[0], edge[1]);
      }
      return;
    }
    if (e.button !== 0 && e.button !== 1) return;
    this.svg.setPointerCapture(e.pointerId);

    if (this.editMode && e.button === 0) {
      const node = this.nodeAt(x, y);
      if (node !== null) {
        this.gesture = { kind: e.shiftKey ? "move" : "edge", node, x0: px, y0: py, moved: false };
        if (!e.shiftKey) this.guide = { from: [...this.pos[node]], to: [...this.pos[node]] };
        return;
      }
      this.gesture = { kind: "click", x0: px, y0: py, moved: false, xd: x, yd: y,
        cx: this.view.cx, cy: this.view.cy };
      return;
    }
    this.gesture = { kind: "pan", x0: px, y0: py, cx: this.view.cx, cy: this.view.cy, moved: false };
  }

  onMove(e) {
    const g = this.gesture;
    if (!g) return;
    const [px, py] = this.local(e);
    if (Math.hypot(px - g.x0, py - g.y0) > 4) g.moved = true;
    const [x, y] = this.toData(px, py);

    if (g.kind === "edge") {
      this.guide.to = [x, y];
      this.render(this.lastRender);
    } else if (g.kind === "move") {
      if (g.moved) { this.pos[g.node] = [x, y]; this.render(this.lastRender); }
    } else if (g.moved) { // pan (también desde un clic sobre zona vacía)
      this.view.cx = g.cx - (px - g.x0) / this.view.scale;
      this.view.cy = g.cy + (py - g.y0) / this.view.scale;
      this.zoomed = true;
      this.render(this.lastRender);
    }
  }

  onUp(e) {
    const g = this.gesture;
    this.gesture = null;
    if (!g) return;
    const [px, py] = this.local(e);
    const [x, y] = this.toData(px, py);

    if (g.kind === "edge") {
      this.guide = null;
      const target = this.nodeAt(x, y);
      if (g.moved && target !== null && target !== g.node) this.call("edgeDrawn", g.node, target);
      this.render(this.lastRender);
    } else if (g.kind === "move") {
      this.render(this.lastRender);
    } else if (g.kind === "click" && !g.moved) {
      this.call("emptyClick", g.xd, g.yd);
    }
  }

  // ---------------------------------------------------------------- dibujo
  render(opts = {}) {
    this.lastRender = opts;
    const dist = opts.dist || null;
    const visited = opts.visited || new Set();
    const current = opts.current ?? null;
    const frontier = opts.frontier || [];
    const evalEdge = opts.evalEdge || null;
    const treeEdges = opts.treeEdges || new Set();
    const pathEdgeColors = opts.pathEdgeColors || {};
    const legendEntries = opts.legendEntries || null;
    const p = this.palette;
    const { w, h } = this.size;
    const r = this.nodeRadius;
    const rpx = r * this.view.scale;
    const out = [];

    this.svg.style.background = p.bg;
    this.svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

    const key = (u, v) => `${u},${v}`;
    for (const [u, v, wt] of this.graph.edges()) {
      if (!this.pos[u] || !this.pos[v]) continue;
      const [x1, y1] = this.pos[u], [x2, y2] = this.pos[v];
      let color = p.edge_default, width = 1.5;
      const pc = pathEdgeColors[key(u, v)];
      if (pc) { color = pc[0]; width = 3.2; }
      else if (treeEdges.has && treeEdges.has(key(u, v))) { color = p.edge_tree; width = 2.4; }
      if (evalEdge && evalEdge[0] === u && evalEdge[1] === v) { color = p.edge_eval; width = 3.2; }

      const dx = x2 - x1, dy = y2 - y1;
      const length = Math.hypot(dx, dy);
      const off = length > 1e-6 ? Math.min(r, length / 2 - 0.001) : 0;
      const ux = length > 1e-6 ? dx / length : 0, uy = length > 1e-6 ? dy / length : 0;
      const [sx, sy] = this.toPx(x1 + ux * off, y1 + uy * off);
      const [ex, ey] = this.toPx(x2 - ux * off, y2 - uy * off);
      const pl = Math.hypot(ex - sx, ey - sy) || 1;
      const dxp = (ex - sx) / pl, dyp = (ey - sy) / pl;
      const L = 9, W = 3.6;
      const bx = ex - dxp * L, by = ey - dyp * L;
      out.push(`<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="${color}" stroke-width="${width}"/>`);
      out.push(`<polygon points="${ex.toFixed(1)},${ey.toFixed(1)} ${(bx - dyp * W).toFixed(1)},${(by + dxp * W).toFixed(1)} ${(bx + dyp * W).toFixed(1)},${(by - dxp * W).toFixed(1)}" fill="${color}"/>`);

      const t = 0.35 + (0.15 * ((u + v * 3) % 3)) / 2.0;
      const [mx, my] = this.toPx(x1 + t * dx, y1 + t * dy);
      const label = String(wt);
      const bw = label.length * 7 + 8;
      out.push(`<g class="badge"><rect x="${(mx - bw / 2).toFixed(1)}" y="${(my - 8).toFixed(1)}" width="${bw}" height="16" rx="3" fill="${p.badge_bg}" stroke="${p.badge_edge}" stroke-width="0.7"/>` +
        `<text x="${mx.toFixed(1)}" y="${(my + 0.5).toFixed(1)}" fill="${p.badge_text}" font-size="11" text-anchor="middle" dominant-baseline="middle">${label}</text></g>`);
    }

    if (this.guide) {
      const [gx1, gy1] = this.toPx(...this.guide.from);
      const [gx2, gy2] = this.toPx(...this.guide.to);
      out.push(`<line x1="${gx1.toFixed(1)}" y1="${gy1.toFixed(1)}" x2="${gx2.toFixed(1)}" y2="${gy2.toFixed(1)}" stroke="#ff9800" stroke-width="2.4" stroke-dasharray="7 5"/>`);
    }

    const fsLabel = Math.max(8.0, Math.min(10.5, r * 135)) * 1.333;
    const fsDist = Math.max(6.5, Math.min(8.0, r * 105)) * 1.333;
    const dyOff = rpx * 0.23;
    const vis = visited instanceof Set ? visited : new Set(visited);
    const fro = new Set(frontier);

    for (let node = 0; node < this.graph.n; node++) {
      if (!this.pos[node]) continue;
      const [x, y] = this.toPx(...this.pos[node]);
      let face, edge, lw;
      if (node === current) { face = p.current; edge = p.current_edge; lw = 2.5; }
      else if (vis.has(node)) { face = p.visited; edge = p.visited_edge; lw = 1.8; }
      else if (fro.has(node)) { face = p.frontier; edge = p.frontier_edge; lw = 1.8; }
      else { face = p.unreached; edge = p.unreached_edge; lw = 1.4; }
      out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rpx.toFixed(1)}" fill="${face}" stroke="${edge}" stroke-width="${lw}"/>`);

      const label = this.graph.labels[node];
      if (dist) {
        const dv = dist[node];
        const dStr = dv === Infinity ? "∞" : String(Math.trunc(dv));
        const fd = dStr.length >= 3 ? fsDist * 0.85 : fsDist;
        out.push(`<text x="${x.toFixed(1)}" y="${(y - dyOff).toFixed(1)}" font-size="${fsLabel.toFixed(1)}" font-weight="700" fill="${p.node_text}" text-anchor="middle" dominant-baseline="central">${esc(label)}</text>`);
        out.push(`<text x="${x.toFixed(1)}" y="${(y + dyOff * 1.35).toFixed(1)}" font-size="${fd.toFixed(1)}" font-weight="700" fill="${node === current ? p.dist_current_text : p.dist_text}" text-anchor="middle" dominant-baseline="central">${dStr}</text>`);
      } else {
        out.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${(fsLabel + 1.3).toFixed(1)}" font-weight="700" fill="${p.node_text}" text-anchor="middle" dominant-baseline="central">${esc(label)}</text>`);
      }
    }

    if (legendEntries && legendEntries.length) {
      const cols = Math.min(legendEntries.length, 4);
      const cellW = 86;
      const lw = cols * cellW + 12;
      const lx = (w - lw) / 2;
      const rows = Math.ceil(legendEntries.length / cols);
      out.push(`<rect x="${lx.toFixed(1)}" y="8" width="${lw}" height="${rows * 22 + 8}" rx="3" fill="${p.legend_bg}" stroke="${p.legend_edge}" opacity="0.94"/>`);
      legendEntries.forEach(([name, color], i) => {
        const cx = lx + 10 + (i % cols) * cellW;
        const cy = 18 + Math.floor(i / cols) * 22;
        out.push(`<rect x="${cx}" y="${cy - 1}" width="16" height="10" fill="${color}"/>`);
        out.push(`<text x="${cx + 22}" y="${cy + 4}" font-size="11" fill="${p.legend_text}" dominant-baseline="middle">${esc(name)}</text>`);
      });
    }

    this.svg.innerHTML = out.join("");
  }
}
