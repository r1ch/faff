// Minimal Simplex Noise implementation
class SimplexNoise {
    constructor(random) {
        if (!random) random = Math.random;
        this.p = new Uint8Array(256);
        this.perm = new Uint8Array(512);
        this.permMod12 = new Uint8Array(512);
        for (let i = 0; i < 256; i++) {
            this.p[i] = Math.floor(random() * 256);
        }
        for (let i = 0; i < 512; i++) {
            this.perm[i] = this.p[i & 255];
            this.permMod12[i] = this.perm[i] % 12;
        }
        this.grad3 = [
            [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
            [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
            [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
        ];
    }
    noise2D(xin, yin) {
        const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
        const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
        let n0, n1, n2;
        let s = (xin + yin) * F2;
        let i = Math.floor(xin + s);
        let j = Math.floor(yin + s);
        let t = (i + j) * G2;
        let X0 = i - t;
        let Y0 = j - t;
        let x0 = xin - X0;
        let y0 = yin - Y0;
        let i1, j1;
        if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
        let x1 = x0 - i1 + G2;
        let y1 = y0 - j1 + G2;
        let x2 = x0 - 1.0 + 2.0 * G2;
        let y2 = y0 - 1.0 + 2.0 * G2;
        let ii = i & 255;
        let jj = j & 255;
        let gi0 = this.permMod12[ii + this.perm[jj]];
        let gi1 = this.permMod12[ii + i1 + this.perm[jj + j1]];
        let gi2 = this.permMod12[ii + 1 + this.perm[jj + 1]];
        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 < 0) n0 = 0.0;
        else { t0 *= t0; n0 = t0 * t0 * (this.grad3[gi0][0] * x0 + this.grad3[gi0][1] * y0); }
        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 < 0) n1 = 0.0;
        else { t1 *= t1; n1 = t1 * t1 * (this.grad3[gi1][0] * x1 + this.grad3[gi1][1] * y1); }
        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 < 0) n2 = 0.0;
        else { t2 *= t2; n2 = t2 * t2 * (this.grad3[gi2][0] * x2 + this.grad3[gi2][1] * y2); }
        return 70.0 * (n0 + n1 + n2);
    }
}

/* Faff piste map (background for the questionnaire).
 * Tree laid out as a mountain: start at the village at the bottom, question answers are lifts climbing up,
 * result answers are runs coming back down. Terrain is generated from the layout and baked once to a canvas.
 * Fog of war: only the route taken and the unlabelled stubs of the next choices are visible. */
(function () {
  "use strict";
  const rng = (a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; })(20261114);
  const noise = new SimplexNoise(rng), pnoise = new SimplexNoise(rng);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ---- tree -> mountain layout -------------------------------------------------------------------------
  function build(key, seen) {
    const q = questions[key], n = { key, q, children: [] };
    if (q.answers) for (const a of q.answers) {
      if (seen.has(a.next)) continue;
      const c = build(a.next, new Set([...seen, key])); c.answer = a.text; n.children.push(c);
    }
    return n;
  }
  const root = d3.hierarchy(build("start", new Set()));
  d3.tree().nodeSize([64, 1]).separation((a, b) => a.parent === b.parent ? 1 : 1.3)(root);
  const nodes = root.descendants();
  root.each(d => { d.leaf = !d.data.q.answers; });
  // try many jittered layouts and keep the one whose lifts and runs cross and crowd each other least
  const mk = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const links = root.links();
  function place(seed) {
    const r = mk(seed), sx = 0.65 + r() * 0.6, rise = 115 + r() * 50, drop = 60 + r() * 60, lat = 15 + r() * 50, out = {};
    root.each(d => {
      d.wx = d.x * sx + (d.parent ? (r() - 0.5) * 24 : 0);
      if (d.parent && d.leaf) d.wx += (r() < 0.5 ? -1 : 1) * lat * r();
      d.wy = !d.parent ? 0 : d.leaf ? d.parent.wy + drop * (0.7 + r() * 0.6) : d.parent.wy - rise * (0.85 + r() * 0.3);
    });
  }
  const ccw = (a, b, c) => (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0]);
  const cross = (p, q, r, t) => ccw(p, r, t) !== ccw(q, r, t) && ccw(p, q, r) !== ccw(p, q, t);
  const dseg = (p, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], u = clamp(((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy || 1), 0, 1); return Math.hypot(p[0] - a[0] - u * vx, p[1] - a[1] - u * vy); };
  function score() {
    let sc = 0; const seg = links.map(l => [[l.source.wx, l.source.wy], [l.target.wx, l.target.wy], l]);
    for (let i = 0; i < seg.length; i++) {
      for (let j = i + 1; j < seg.length; j++) {
        const A = seg[i], B = seg[j], share = A[2].source === B[2].source || A[2].target === B[2].target || A[2].source === B[2].target || A[2].target === B[2].source;
        if (!share && cross(A[0], A[1], B[0], B[1])) sc += 12;
      }
      for (const d of nodes) if (d !== seg[i][2].source && d !== seg[i][2].target) { const dd = dseg([d.wx, d.wy], seg[i][0], seg[i][1]); if (dd < 34) sc += (34 - dd) / 4; }
    }
    let w = 0, h = 0; nodes.forEach(d => { w = Math.max(w, Math.abs(d.wx)); h = Math.max(h, Math.abs(d.wy)); });
    return sc + (w + h) / 400;                                // slight preference for a compact map
  }
  let best = 1e9, bestSeed = 1;
  for (let sd = 1; sd <= 600; sd++) { place(sd * 7919); const sc = score(); if (sc < best) { best = sc; bestSeed = sd * 7919; } }
  place(bestSeed);
  const RUN = { danger: "#1c1f24", success: "#1c6fe0", warning: "#e03131" };
  const edges = root.links().map((l, i) => {
    const a = l.source, b = l.target, run = b.leaf;
    const e = { a, b, run, color: run ? RUN[b.data.q.type] || "#1c1f24" : "#2b2f36", pts: [[a.wx, a.wy], [b.wx, b.wy]], kind: i % 3 };
    if (run) {                                              // runs meander down the hill
      const dx = b.wx - a.wx, dy = b.wy - a.wy, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len, N = Math.max(8, len / 8 | 0);
      const amp = 8 + rng() * 10, ph = rng() * 6, k = 1.5 + rng() * 1.5;
      e.pts = [];
      for (let s = 0; s <= N; s++) {
        const t = s / N, off = Math.sin(Math.PI * t) * (Math.sin(t * Math.PI * 2 * k + ph) * amp + pnoise.noise2D(t * 3, i) * amp * 0.5);
        e.pts.push([a.wx + dx * t + nx * off, a.wy + dy * t + ny * off]);
      }
    }
    e.cum = [0]; for (let s = 1; s < e.pts.length; s++) e.cum.push(e.cum[s - 1] + Math.hypot(e.pts[s][0] - e.pts[s - 1][0], e.pts[s][1] - e.pts[s - 1][1]));
    e.len = e.cum[e.cum.length - 1];
    b.edge = e;
    return e;
  });
  function pointAt(e, f) {                                  // f in 0..1 along the edge
    const d = f * e.len; let s = 1; while (s < e.cum.length - 1 && e.cum[s] < d) s++;
    const u = (d - e.cum[s - 1]) / Math.max(1e-6, e.cum[s] - e.cum[s - 1]), p = e.pts[s - 1], q = e.pts[s];
    return [mix(p[0], q[0], u), mix(p[1], q[1], u), Math.atan2(q[1] - p[1], q[0] - p[0])];
  }
  function trace(c, pts, frac) {                            // smooth polyline, cut off at frac of its length
    const e = pts.e; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    const end = frac >= 1 ? null : pointAt(e, frac), lim = frac * e.len;
    for (let s = 1; s < pts.length; s++) {
      if (end && e.cum[s] >= lim) { c.lineTo(end[0], end[1]); return; }
      const mx = (pts[s][0] + (pts[s + 1] || pts[s])[0]) / 2, my = (pts[s][1] + (pts[s + 1] || pts[s])[1]) / 2;
      if (s < pts.length - 1) c.quadraticCurveTo(pts[s][0], pts[s][1], mx, my); else c.lineTo(pts[s][0], pts[s][1]);
    }
  }
  edges.forEach(e => e.pts.e = e);

  // ---- terrain, baked once -------------------------------------------------------------------------------
  const PAD = 620, CELL = 3;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  nodes.forEach(d => { x0 = Math.min(x0, d.wx); x1 = Math.max(x1, d.wx); y0 = Math.min(y0, d.wy); y1 = Math.max(y1, d.wy); });
  x0 -= PAD; x1 += PAD; y0 -= PAD; y1 += PAD;
  const WW = x1 - x0, WH = y1 - y0, B = Math.min(1.5, Math.sqrt(5.5e6 / (WW * WH)));
  const bake = document.createElement("canvas"); bake.width = Math.round(WW * B); bake.height = Math.round(WH * B);

  // Lac du Faff: the "James Dracup" answer ends in a lake
  const lakeNode = nodes.find(d => d.data.key === "james");
  const LR = 95, lakeC = lakeNode ? [lakeNode.wx, lakeNode.wy + 30] : [0, 1e9];
  const lakeV = (x, y) => 1 - Math.hypot((x - lakeC[0]) / 1.35, y - lakeC[1]) / LR + 0.2 * noise.noise2D(x * 0.025 + 7, y * 0.025);

  function makeTerrain() {
    const gw = Math.ceil(WW / CELL), gh = Math.ceil(WH / CELL), alt = new Float32Array(gw * gh), shade = new Float32Array(gw * gh);
    const SOFT = 160 * 160, fbm = (x, y) => { let s = 0, a = 1, f = 0.0035; for (let o = 0; o < 5; o++) { s += a * (1 - Math.abs(noise.noise2D(x * f, y * f))); a *= 0.5; f *= 2; } return s / 1.9 - 0.5; };
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const x = x0 + i * CELL, y = y0 + j * CELL; let num = 0, den = 0;
      for (const d of nodes) { const w = 1 / Math.pow((x - d.wx) ** 2 + (y - d.wy) ** 2 + SOFT, 2); num += w * -d.wy; den += w; }
      const h = num / den + 330 * fbm(x, y) + 40 * pnoise.noise2D(x * 0.02, y * 0.02);
      alt[j * gw + i] = h; lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    const range = hi - lo; for (let k = 0; k < alt.length; k++) alt[k] = (alt[k] - lo) / range;
    // hillshade, sun from the top left
    const L = [-0.6, -0.6, 0.55], ll = Math.hypot(...L), flat = L[2] / ll, ex = range * 0.45 / (2 * CELL);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const g = (a, b) => alt[clamp(b, 0, gh - 1) * gw + clamp(a, 0, gw - 1)];
      const dx = (g(i + 1, j) - g(i - 1, j)) * ex, dy = (g(i, j + 1) - g(i, j - 1)) * ex;
      shade[j * gw + i] = (-dx * L[0] - dy * L[1] + L[2]) / (ll * Math.hypot(dx, dy, 1)) - flat;
    }
    // piste mask: every trail and lift line carves a groomed lane
    const m = document.createElement("canvas"); m.width = gw; m.height = gh; const mc = m.getContext("2d", { willReadFrequently: true });
    mc.fillStyle = "#000"; mc.fillRect(0, 0, gw, gh); mc.strokeStyle = "#fff"; mc.lineCap = mc.lineJoin = "round"; mc.lineWidth = 26 / CELL;
    for (const e of edges) { mc.beginPath(); e.pts.forEach((p, s) => s ? mc.lineTo((p[0] - x0) / CELL, (p[1] - y0) / CELL) : mc.moveTo((p[0] - x0) / CELL, (p[1] - y0) / CELL)); mc.stroke(); }
    const md = mc.getImageData(0, 0, gw, gh).data, mask = new Float32Array(gw * gh); for (let k = 0; k < mask.length; k++) mask[k] = md[k * 4] / 255;

    // flat painted look: a few flat colour zones with smooth outlines, three-tone facets, clean white piste lanes
    const c = bake.getContext("2d"); c.imageSmoothingEnabled = true; c.lineJoin = c.lineCap = "round";
    const gp = d3.geoPath(d3.geoIdentity().scale(CELL * B), c);
    const blur = (arr, r, passes) => { let a = arr; for (let p = 0; p < passes; p++) { const t = new Float32Array(a.length), u = new Float32Array(a.length), n = 2 * r + 1;
      for (let j = 0; j < gh; j++) { let acc = 0; for (let i = -r; i <= r; i++) acc += a[j * gw + clamp(i, 0, gw - 1)]; for (let i = 0; i < gw; i++) { t[j * gw + i] = acc / n; acc += a[j * gw + clamp(i + r + 1, 0, gw - 1)] - a[j * gw + clamp(i - r, 0, gw - 1)]; } }
      for (let i = 0; i < gw; i++) { let acc = 0; for (let j = -r; j <= r; j++) acc += t[clamp(j, 0, gh - 1) * gw + i]; for (let j = 0; j < gh; j++) { u[j * gw + i] = acc / n; acc += t[clamp(j + r + 1, 0, gh - 1) * gw + i] - t[clamp(j - r, 0, gh - 1) * gw + i]; } }
      a = u; } return a; };
    const fill = (field, thr, color, edge) => { const g = d3.contours().size([gw, gh]).thresholds([thr])(field)[0]; c.beginPath(); gp(g); c.fillStyle = color; c.fill(); if (edge) { c.strokeStyle = edge; c.lineWidth = 1.2; c.stroke(); } };
    const forestF = new Float32Array(gw * gh), rockF = new Float32Array(gw * gh), snowF = new Float32Array(gw * gh), lakeF = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const k = j * gw + i, x = x0 + i * CELL, y = y0 + j * CELL, a = alt[k], tl = 0.42 + 0.07 * noise.noise2D(x * 0.006, y * 0.006), sl = 0.6 + 0.07 * noise.noise2D(x * 0.011 + 50, y * 0.011);
      forestF[k] = (tl - a) + 0.12 * noise.noise2D(x * 0.011 + 9, y * 0.011) - 0.1; rockF[k] = a - (tl + 0.04); snowF[k] = a - sl; lakeF[k] = lakeV(x, y);
    }
    const sh = blur(shade, 9, 2), fF = blur(forestF, 2, 1);
    c.fillStyle = "#c3d9a8"; c.fillRect(0, 0, bake.width, bake.height);          // meadow
    fill(fF, 0, "#86b47a");                                                         // forest
    fill(rockF, 0, "#c4ccd6", "rgba(110,125,145,.35)");                            // rock
    fill(snowF, 0, "#f7fafd", "rgba(150,170,195,.35)");                            // snow
    fill(sh, -0.05, "rgba(72,96,140,.13)"); fill(sh, -0.13, "rgba(60,82,130,.15)"); fill(sh, 0.07, "rgba(255,255,255,.22)");   // facets
    // groomed lanes: clean white corridors through everything, soft edge first
    c.setTransform(B, 0, 0, B, -x0 * B, -y0 * B);
    for (const [w, col] of [[40, "rgba(246,250,240,.55)"], [26, "#fbfdff"]]) { c.strokeStyle = col; c.lineWidth = w;
      for (const e of edges) { c.beginPath(); e.pts.forEach((p, s) => s ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke(); } }
    c.setTransform(1, 0, 0, 1, 0, 0);
    // the lake
    fill(lakeF, -0.06, "#e8f4e6"); fill(lakeF, 0, "#5fbad8", "#f1fafb"); fill(lakeF, 0.3, "#3f9ec8");

    // trees (clustered triangles in the forest) and a few rocks above it
    const sample = (x, y) => { const i = clamp(((x - x0) / CELL) | 0, 0, gw - 1), j = clamp(((y - y0) / CELL) | 0, 0, gh - 1); return [fF[j * gw + i], mask[j * gw + i], rockF[j * gw + i]]; };
    const greens = ["#4f8a5a", "#5d9a63", "#447a50"], trees = greens.map(() => new Path2D()), rocks = new Path2D();
    c.setTransform(B, 0, 0, B, -x0 * B, -y0 * B);
    for (let y = y0; y < y1; y += 7) for (let x = x0; x < x1; x += 7) {
      const px = x + rng() * 7, py = y + rng() * 7, [f, mk, rf] = sample(px, py);
      if (mk > 0.3 || lakeV(px, py) > -0.1) continue;
      if (f > 0.02 && noise.noise2D(px * 0.02 + 3, py * 0.02) > -0.35) {
        const s = 4 + rng() * 3.5, p = trees[rng() * 3 | 0]; p.moveTo(px, py - s * 1.7); p.lineTo(px - s * 0.6, py + s * 0.4); p.lineTo(px + s * 0.6, py + s * 0.4); p.closePath();
      } else if (rf > 0.03 && rng() < 0.1) {
        const s = 1.5 + rng() * 2.5; rocks.moveTo(px, py); rocks.lineTo(px + s, py - s * 0.4); rocks.lineTo(px + s * 0.5, py + s * 0.6); rocks.closePath();
      }
    }
    trees.forEach((p, i) => { c.fillStyle = greens[i]; c.fill(p); });
    c.fillStyle = "rgba(105,120,140,.35)"; c.fill(rocks);
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---- state + UI ----------------------------------------------------------------------------------------
  const histEl = document.getElementById("history"), cardEl = document.getElementById("card");
  let path = [root], choices = [], anim = null;
  const cur = () => path[path.length - 1];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function choose(child) { pan.x = pan.y = 0; zoomMul = 1; if (window.__fitOff) window.__fitOff();  anim = { edge: child.edge, t0: performance.now(), dur: Math.max(900, child.edge.len * 5) }; choices.push(child.data.answer); path.push(child); ui(); }
  function back(i) { pan.x = pan.y = 0; zoomMul = 1; if (window.__fitOff) window.__fitOff();  path.length = i + 1; choices.length = i; anim = null; ui(); }
  function ui() {
    histEl.innerHTML = choices.map((c, i) => `<div class="history-item" data-i="${i}"><span class="history-label text-muted">${esc(path[i].data.q.text)}</span><b>${esc(c)}</b></div>`).join("");
    histEl.querySelectorAll(".history-item").forEach(el => el.onclick = () => back(+el.dataset.i));
    const n = cur(), q = n.data.q;
    if (!q.answers) { cardEl.innerHTML = `<div class="alert alert-${q.type} result-alert shadow-lg"><h4 class="alert-heading mb-3">${esc(q.answer)}</h4><p class="mb-0 fs-5">${esc(q.text)}</p></div>`; return; }
    const kids = n.children || [], few = kids.length <= 2;
    cardEl.innerHTML = `<div class="question-container"><label class="form-label h5 mb-3">${esc(q.text)}</label>` + (few
      ? kids.map((k, i) => `<div class="form-check mb-2"><input class="form-check-input" type="radio" name="a" id="a${i}" data-i="${i}"><label class="form-check-label" for="a${i}">${esc(k.data.answer)}</label></div>`).join("")
      : `<select class="form-select"><option selected disabled>Select an option</option>${kids.map((k, i) => `<option value="${i}">${esc(k.data.answer)}</option>`).join("")}</select>`) + "</div>";
    cardEl.querySelectorAll("input").forEach(el => el.onchange = () => choose(kids[+el.dataset.i]));
    const sel = cardEl.querySelector("select"); if (sel) sel.onchange = () => choose(kids[+sel.value]);
  }

  // ---- drawing -------------------------------------------------------------------------------------------
  const canvas = document.getElementById("map"), ctx = canvas.getContext("2d");
  let vw, vh, dpr, z; const cam = { x: 0, y: 0 }; let camSet = false;
  let zoomMul = 1; const pan = { x: 0, y: 0 };
  const setZ = () => { z = clamp(vw / 560, 0.62, 1.35) * zoomMul; };
  function resize() {
    vw = innerWidth; vh = innerHeight; dpr = Math.min(devicePixelRatio || 1, 2); setZ();
    canvas.width = vw * dpr; canvas.height = vh * dpr;
  }
  addEventListener("resize", resize);
  const labelFont = () => `700 ${Math.round(13 / z)}px system-ui, sans-serif`;
  function halo(text, x, y, align) {
    ctx.font = labelFont(); ctx.textAlign = align || "left"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    ctx.lineWidth = 4 / z; ctx.strokeStyle = "rgba(255,255,255,.92)"; ctx.strokeText(text, x, y); ctx.fillStyle = "#1c2430"; ctx.fillText(text, x, y);
  }
  function sign(text, x, y, col) {                       // piste-map style tag
    const fs = Math.round(11.5 / z); ctx.font = `700 ${fs}px system-ui, sans-serif`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    const w = ctx.measureText(text).width + 10 / z, h = fs + 6 / z, r = h / 2;
    ctx.beginPath(); ctx.roundRect(x, y - h / 2, w, h, r); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1.5 / z; ctx.strokeStyle = "#fff"; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.fillText(text, x + 5 / z, y + 0.5 / z);
  }
  function drawEdge(n, now, f, taken, label) {
    const e = n.edge;
    ctx.globalAlpha = taken ? 1 : 0.9;
    trace(ctx, e.pts, f); ctx.strokeStyle = "rgba(255,255,255,.96)"; ctx.lineWidth = e.run ? 11 : 4.5; ctx.stroke();
    trace(ctx, e.pts, f); ctx.strokeStyle = e.color; ctx.lineWidth = e.run ? 6.5 : 1.7; ctx.stroke();
    if (!e.run) {                                          // pylons and cabins
      ctx.fillStyle = "#2b2f36";
      for (let d = 34; d < e.len * f; d += 34) { const [px, py] = pointAt(e, d / e.len); ctx.fillRect(px - 1.6, py - 1.6, 3.2, 3.2); }
      const sp = e.kind === 1 ? 70 : 100;
      for (let d = (now / 1000 * 22) % sp; d < e.len * f; d += sp) { const [px, py] = pointAt(e, d / e.len); ctx.fillStyle = e.kind === 1 ? "#d9480f" : "#343a40"; ctx.fillRect(px - 3, py - 2.2, 6, 4.4); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.strokeRect(px - 3, py - 2.2, 6, 4.4); }
    }
    ctx.globalAlpha = 1;
    if (label && f > 0.5) { const [mx, my] = pointAt(e, 0.5), t = n.data.answer.length > 26 ? n.data.answer.slice(0, 25) + "…" : n.data.answer; e.run ? sign(t, mx + 9 / z, my, e.color) : sign(t, mx + 7 / z, my, "#4b5563"); }
  }
  function drawRoute(now, prog) {
    ctx.lineCap = ctx.lineJoin = "round";
    const taken = new Set(path.slice(1)), last = path.length - 1, ahead = new Set(cur().children || []);
    nodes.forEach(n => { if (n.edge && !taken.has(n)) drawEdge(n, now, 1, false, false); });   // the whole map
    path.slice(1).forEach((n, i) => drawEdge(n, now, i + 1 === last && anim ? prog : 1, true, false));
    nodes.forEach(n => { if (n.edge && (ahead.has(n) && !anim)) drawEdge(n, now, 1, false, true); });   // labels for the choices
    path.slice(1).forEach((n, i) => { const e = n.edge; if ((i + 1 === last && anim ? prog : 1) > 0.5) { const [mx, my] = pointAt(e, 0.5), t = n.data.answer.length > 26 ? n.data.answer.slice(0, 25) + "…" : n.data.answer; e.run ? sign(t, mx + 9 / z, my, e.color) : sign(t, mx + 7 / z, my, "#4b5563"); } });
    // stations
    nodes.forEach(n => { if (n === cur() && anim) return; const on = path.includes(n); ctx.fillStyle = "#fff"; ctx.strokeStyle = on ? "#2b2f36" : "rgba(43,47,54,.6)"; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(n.wx, n.wy, 4, 0, 6.283); ctx.fill(); ctx.stroke(); });
    if (lakeNode) { ctx.font = `italic 700 ${Math.round(14 / z)}px Georgia, serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineWidth = 3 / z; ctx.strokeStyle = "rgba(20,70,110,.55)"; ctx.strokeText("Lac du Faff", lakeC[0], lakeC[1] + 38); ctx.fillStyle = "#f4fbff"; ctx.fillText("Lac du Faff", lakeC[0], lakeC[1] + 38); }
  }
  function frame(now) {
    setZ();
    const n = cur(), prog = anim ? clamp((now - anim.t0) / anim.dur, 0, 1) : 1, e = anim ? anim.edge : null;
    if (anim && prog >= 1) anim = null;
    // the camera follows the skier, keeping the action in the lower half so the card has the sky
    const head = e && prog < 1 ? pointAt(e, prog) : [n.wx, n.wy], ty = head[1] - 0.2 * vh / z - pan.y; const hx = head[0] - pan.x;
    if (!camSet) { cam.x = hx; cam.y = ty; camSet = true; } else { const a = 1 - Math.exp(-16 / 260); cam.x += (hx - cam.x) * a; cam.y += (ty - cam.y) * a; }

    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#e9eff5"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const s = z * dpr; ctx.setTransform(s, 0, 0, s, canvas.width / 2 - cam.x * s, canvas.height / 2 - cam.y * s);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(bake, x0, y0, WW, WH);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.45); sky.addColorStop(0, "rgba(233,239,245,.4)"); sky.addColorStop(1, "rgba(233,239,245,0)");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(s, 0, 0, s, canvas.width / 2 - cam.x * s, canvas.height / 2 - cam.y * s);
    drawRoute(now, prog);
    if (!e) {                                                // you are here / the end of the run
      const pulse = 1 + 0.25 * Math.sin(now / 300);
      if (n.leaf) {                                          // finish sign
        ctx.fillStyle = n.edge.color; ctx.beginPath(); ctx.moveTo(n.wx, n.wy - 11); ctx.lineTo(n.wx + 11, n.wy); ctx.lineTo(n.wx, n.wy + 11); ctx.lineTo(n.wx - 11, n.wy); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
      } else { ctx.fillStyle = "rgba(224,49,49,.28)"; ctx.beginPath(); ctx.arc(n.wx, n.wy, 14 * pulse, 0, 6.283); ctx.fill(); ctx.fillStyle = "#e03131"; ctx.beginPath(); ctx.arc(n.wx, n.wy, 6, 0, 6.283); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke(); }
    } else if (prog < 1) {                                  // the skier
      const [px, py] = head; ctx.fillStyle = "#e03131"; ctx.beginPath(); ctx.arc(px, py, 5, 0, 6.283); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
    }
    requestAnimationFrame(frame);
  }

  // drag to look around, wheel / pinch to zoom; choosing an answer re-centres on you
  const ptrs = new Map(); let pinch = 0;
  canvas.style.touchAction = "none";
  canvas.addEventListener("pointerdown", e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); });
  canvas.addEventListener("pointerup", e => { ptrs.delete(e.pointerId); pinch = 0; });
  canvas.addEventListener("pointercancel", e => { ptrs.delete(e.pointerId); pinch = 0; });
  canvas.addEventListener("pointermove", e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    if (ptrs.size === 1) { pan.x -= (e.clientX - p[0]) / z; pan.y -= (e.clientY - p[1]) / z; }
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) zoomMul = clamp(zoomMul * d / pinch, 0.25, 2.5); pinch = d; }
  });
  canvas.addEventListener("wheel", e => { e.preventDefault(); zoomMul = clamp(zoomMul * Math.exp(-e.deltaY / 500), 0.25, 2.5); }, { passive: false });

  const fit = document.createElement("button"); fit.textContent = "whole map"; fit.className = "btn btn-light btn-sm shadow";
  fit.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:5;opacity:.92";
  let fitted = false;
  fit.onclick = () => { fitted = !fitted; fit.textContent = fitted ? "back to me" : "whole map"; pan.x = pan.y = 0; if (fitted) { const mw = x1 - x0 - 2 * PAD + 160, mh = y1 - y0 - 2 * PAD + 200; zoomMul = clamp(Math.min(vw / mw, vh / mh) / clamp(vw / 560, 0.62, 1.35), 0.1, 2.5); const zz = clamp(vw / 560, 0.62, 1.35) * zoomMul; pan.x = cur().wx - (x0 + x1) / 2; pan.y = cur().wy - 0.2 * vh / zz - (y0 + y1) / 2; } else zoomMul = 1; };
  window.__fitOff = () => { fitted = false; fit.textContent = "whole map"; };
  document.body.appendChild(fit);
  resize(); ui();
  makeTerrain();
  requestAnimationFrame(frame);
  window.faffMap = { zoom: v => { zoomMul = v; }, nodes: nodes.length, edges: edges.length, world: [WW | 0, WH | 0], choose, back, path };
})();
