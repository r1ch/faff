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

/* Faff piste map. A painted panorama of a mountain (seen from across the valley, like a paper piste map),
 * generated first; the questionnaire is then draped over it: every question is a lift station, every answer
 * a lift up to the next question or a run down to an ending. The form works like the original index.html. */
(function () {
  "use strict";
  const Q = window.questions;
  const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const rng = mulberry(20261115), noise = new SimplexNoise(rng), n2 = new SimplexNoise(rng);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), mix = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

  // optional colour for the places; anything not listed still gets a spot and its own text as a name
  const PLACES = {
    "start": { name: "Faff-les-Bains" }, "james": { name: "Lac du Faff", lake: true }, "not-faff": { name: "Bar de l'Après" },
    "faff": { name: "Combe du Faff" }, "non-parallel-faff": { name: "Couloir de la Mort" }, "you-know": { name: "Trou de la Honte" },
    "not-team": { name: "Vallon du Solitaire" }, "potential": { name: "Col du Hmm" }, "faff-avoidance": { name: "Pic de l'Illumination", up: true }
  };
  const PEAKS = ["Pic du Faff", "Aiguille de Dracup", "Dent de la Procrastination", "Mont Tergiverse", "Tête de Linotte"];
  const RUNCOL = { success: "#1f6fe0", warning: "#e03131", danger: "#16181d" };

  // ---- the questionnaire as a graph ---------------------------------------------------------------------
  const depth = {};
  (function walk(k, d, seen) { if (seen.has(k) || !Q[k]) return; if (!(depth[k] >= d)) depth[k] = d; const s = new Set(seen); s.add(k); (Q[k].answers || []).forEach(a => walk(a.next, d + 1, s)); })("start", 0, new Set());
  const keys = Object.keys(depth), qn = keys.filter(k => Q[k].answers), ends = keys.filter(k => !Q[k].answers), maxD = Math.max(1, ...qn.map(k => depth[k]));
  const edges = []; qn.forEach(k => Q[k].answers.forEach((a, i) => { if (Q[a.next]) edges.push({ from: k, to: a.next, i, text: a.text }); }));
  const parents = k => [...new Set(edges.filter(e => e.to === k).map(e => e.from))];

  // ---- world: a ground square (u across, v away from the viewer) drawn as an oblique panorama -----------
  const portrait = innerWidth < innerHeight, ASP = clamp(innerWidth / innerHeight, 0.6, 1.8), RH = Math.round(Math.sqrt(520000 / ASP)), RW = Math.round(RH * ASP), S = 2, W = RW * S, H = RH * S;
  const GW = RW, GV = 640, VD = RH * 0.60, HZ = RH * 0.31, BASE = RH + 2;
  const peaks = [0, 1, 2, 3].map(k => ({ u: (k + 0.5) / 4 + (rng() - 0.5) * 0.14, ht: 0.1 + rng() * 0.2, w: 0.05 + rng() * 0.05 }));
  const crest = u => 0.74 + peaks.reduce((s, p) => s + p.ht * Math.exp(-(((u - p.u) / p.w) ** 2)), 0) + 0.05 * noise.noise2D(u * 3.1, 7);
  function height(u, v) {
    const p = Math.pow(smooth(0.11, 0.86, v), 1.1);
    let a = p * crest(u);
    a += (1 - Math.abs(noise.noise2D(u * 4.2 + 0.25 * n2.noise2D(u * 2, v * 2), v * 1.3 + 3)) - 0.5) * 0.16 * p * (0.4 + 0.6 * p);   // spurs and gullies
    a += 0.03 * p * noise.noise2D(u * 14, v * 14) + 0.11 * smooth(0.6, 0.86, v) * (1 - Math.abs(n2.noise2D(u * 10, v * 6)) - 0.5);   // crags near the top
    a += 0.006 * noise.noise2D(u * 9, v * 30);
    return a * (1 - 0.85 * smooth(0.86, 1, v));
  }
  const hg = new Float32Array(GW * GV);
  for (let j = 0; j < GV; j++) for (let i = 0; i < GW; i++) hg[j * GW + i] = height(i / (GW - 1), j / (GV - 1));
  const hAt = (u, v) => { const x = clamp(u, 0, 1) * (GW - 1), y = clamp(v, 0, 1) * (GV - 1), i = Math.min(GW - 2, x | 0), j = Math.min(GV - 2, y | 0), fx = x - i, fy = y - j, k = j * GW + i; return mix(mix(hg[k], hg[k + 1], fx), mix(hg[k + GW], hg[k + GW + 1], fx), fy); };
  const rowY = (v, h) => BASE - v * VD - h * HZ;                       // raster row of a ground point
  const pos = (u, v) => [u * W, S * rowY(v, hAt(u, v))];               // world (= baked canvas) coordinates

  // ---- where everything goes: try many arrangements, keep the tidiest -----------------------------------
  function arrange(seed) {
    const r = mulberry(seed), P = {}, layers = [];
    qn.forEach(k => (layers[depth[k]] = layers[depth[k]] || []).push(k));
    layers.forEach((L, d) => {
      const o = L.slice(); for (let i = o.length - 1; i > 0; i--) { const j = r() * (i + 1) | 0; [o[i], o[j]] = [o[j], o[i]]; }
      o.forEach((k, x) => { const b = o.length === 1 ? 0.5 + (d ? (r() - 0.5) * 0.5 : 0) : 0.5 + (x / (o.length - 1) - 0.5) * Math.min(0.68, 0.3 * (o.length - 1)); P[k] = { u: clamp(b + (r() - 0.5) * 0.1, 0.08, 0.92), v: 0.135 + Math.pow(d / maxD, 0.75) * 0.55 + (d ? (r() - 0.5) * 0.04 : 0) }; });
    });
    ends.forEach(k => {
      const par = parents(k), f = PLACES[k] || {}, pu = par.reduce((s, p) => s + P[p].u, 0) / par.length, lo = Math.min(...par.map(p => P[p].v)), hi = Math.max(...par.map(p => P[p].v));
      let u, v;
      if (f.lake) { v = 0.05; u = clamp(P.start.u + (r() < 0.5 ? -1 : 1) * (0.2 + r() * 0.12), 0.16, 0.84); }
      else if (f.up) { v = Math.min(0.8, hi + 0.15 + r() * 0.06); u = pu + (r() - 0.5) * 0.2; }
      else if (par.length >= 3) { v = 0.075 + r() * 0.03; u = 0.1 + r() * 0.8; }
      else { v = Math.max(0.07, lo - (0.07 + r() * 0.09)); u = pu + (r() - 0.5) * 0.36; }
      P[k] = { u: clamp(u, 0.07, 0.93), v };
    });
    return P;
  }
  const isLift = (e, P) => P[e.to].v > P[e.from].v;
  function untidiness(P) {
    const pt = k => [P[k].u * W, P[k].v * VD * S * 1.3], seen = new Set(), segs = [];
    edges.forEach(e => { const id = e.from + ">" + e.to; if (!seen.has(id)) { seen.add(id); segs.push([pt(e.from), pt(e.to), e, isLift(e, P)]); } });
    const ccw = (a, b, c) => (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0]);
    const dseg = (p, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], t = clamp(((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy || 1), 0, 1); return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy); };
    let sc = 0;
    for (let i = 0; i < segs.length; i++) {
      const A = segs[i]; if (A[3]) { const rx = Math.abs(A[1][0] - A[0][0]) / Math.max(1, Math.abs(A[1][1] - A[0][1])); if (rx > 1.3) sc += (rx - 1.3) * 7; } sc += Math.hypot(A[1][0] - A[0][0], A[1][1] - A[0][1]) / (A[3] ? 900 : 400);
      for (let j = i + 1; j < segs.length; j++) { const B = segs[j]; if (A[2].from === B[2].from || A[2].to === B[2].to) { const a1 = Math.atan2(A[1][1] - A[0][1], A[1][0] - A[0][0]), a2 = Math.atan2(B[1][1] - B[0][1], B[1][0] - B[0][0]); let da = Math.abs(a1 - a2); if (da > Math.PI) da = 6.283 - da; if (da < 0.3) sc += 14 * (0.3 - da) / 0.3; continue; }
        if (A[2].from === B[2].to || A[2].to === B[2].from) continue;
        if (ccw(A[0], B[0], B[1]) !== ccw(A[1], B[0], B[1]) && ccw(A[0], A[1], B[0]) !== ccw(A[0], A[1], B[1])) sc += A[3] && B[3] ? 20 : 8; }
      for (const k of keys) if (k !== A[2].from && k !== A[2].to) { const d = dseg(pt(k), A[0], A[1]); if (d < 50) sc += (50 - d) / 3; }
    }
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) { const a = pt(keys[i]), b = pt(keys[j]), d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (d < 110) sc += (110 - d) / 2; }
    return sc;
  }
  let P = null, bestSc = Infinity;
  for (let s = 1; s <= 2500; s++) { const c = arrange(s * 7919), sc = untidiness(c); if (sc < bestSc) { bestSc = sc; P = c; } }
  keys.forEach(k => { P[k].xy = pos(P[k].u, P[k].v); });
  const lakeKey = ends.find(k => (PLACES[k] || {}).lake), lake = lakeKey ? P[lakeKey] : null;
  const lakeV = (u, v) => lake && v < 0.108 ? 1 - Math.hypot((u - lake.u) / 0.17, (v - lake.v) / 0.042) + 0.16 * noise.noise2D(u * 9, v * 16) : -1;

  // ---- lifts and runs -----------------------------------------------------------------------------------
  const pairN = {};
  edges.forEach((e, n) => {
    const a = P[e.from], b = P[e.to], id = e.from + ">" + e.to, dup = pairN[id] = (pairN[id] || 0) + 1;
    e.lift = isLift(e, P); e.kind = n % 3; e.color = e.lift ? "#22252b" : RUNCOL[Q[e.to].type] || "#16181d";
    if (e.lift) {
      const A = a.xy, B = b.xy, L = Math.hypot(B[0] - A[0], B[1] - A[1]), off = (dup - 1) * 11 * (dup % 2 ? 1 : -1), nx = -(B[1] - A[1]) / L * off, ny = (B[0] - A[0]) / L * off;
      e.pts = [[A[0] + nx, A[1] + ny], [B[0] + nx, B[1] + ny]]; e.g = [[a.u, a.v], [b.u, b.v]];
    } else {                                                 // a run wanders down the hill, following the ground
      const gx = (b.u - a.u) * W, gy = (b.v - a.v) * VD * S, L = Math.hypot(gx, gy), N = Math.max(10, L / 9 | 0), nx = -gy / L, ny = gx / L;
      const amp = Math.min(26, L * 0.12) * (0.6 + rng() * 0.6), k = Math.max(1, L / 170) * (0.8 + rng() * 0.5), ph = rng() * 6.28, bow = (rng() - 0.5) * L * 0.3 + (dup - 1) * 30;
      e.pts = []; e.g = [];
      for (let s = 0; s <= N; s++) { const t = s / N, env = Math.sin(Math.PI * t), o = env * (Math.sin(t * 6.283 * k + ph) * amp + bow), u = a.u + (gx * t + nx * o) / W, v = a.v + (gy * t + ny * o) / (VD * S); e.g.push([u, v]); e.pts.push(pos(u, v)); }
      e.pts[0] = a.xy.slice(); e.pts[N] = b.xy.slice();
    }
    e.cum = [0]; for (let s = 1; s < e.pts.length; s++) e.cum.push(e.cum[s - 1] + Math.hypot(e.pts[s][0] - e.pts[s - 1][0], e.pts[s][1] - e.pts[s - 1][1]));
    e.len = e.cum[e.cum.length - 1];
  });
  function pointAt(e, f) { const d = f * e.len; let s = 1; while (s < e.cum.length - 1 && e.cum[s] < d) s++; const t = (d - e.cum[s - 1]) / Math.max(1e-6, e.cum[s] - e.cum[s - 1]), p = e.pts[s - 1], q = e.pts[s]; return [mix(p[0], q[0], t), mix(p[1], q[1], t)]; }
  function trace(c, e, f) { c.beginPath(); c.moveTo(e.pts[0][0], e.pts[0][1]); const lim = f * e.len; for (let s = 1; s < e.pts.length; s++) { if (f < 1 && e.cum[s] >= lim) { const p = pointAt(e, f); c.lineTo(p[0], p[1]); return; } c.lineTo(e.pts[s][0], e.pts[s][1]); } }

  // ---- the painting, done once --------------------------------------------------------------------------
  const bake = document.createElement("canvas"); bake.width = W; bake.height = H; let baked = false;
  const SKY0 = [62, 124, 192], SKY1 = [206, 228, 244];
  function paint() {
    // lanes cut through the forest under every lift and run
    const m = document.createElement("canvas"); m.width = GW; m.height = GV; const mc = m.getContext("2d", { willReadFrequently: true });
    mc.fillStyle = "#000"; mc.fillRect(0, 0, GW, GV); mc.strokeStyle = "#fff"; mc.lineCap = mc.lineJoin = "round";
    for (const e of edges) { mc.lineWidth = e.lift ? 5 : 9; mc.beginPath(); e.g.forEach((p, s) => s ? mc.lineTo(p[0] * (GW - 1), p[1] * (GV - 1)) : mc.moveTo(p[0] * (GW - 1), p[1] * (GV - 1))); mc.stroke(); }
    const md = mc.getImageData(0, 0, GW, GV).data, lane = (u, v) => md[4 * ((clamp(v, 0, 1) * (GV - 1) | 0) * GW + (clamp(u, 0, 1) * (GW - 1) | 0))] / 255;
    const forest = (u, v, h) => v > 0.1 && v < 0.84 && h < 0.3 + 0.07 * noise.noise2D(u * 3 + 11, v * 3) && n2.noise2D(u * 6 + 5, v * 6) > -0.45 + h * 1.6 && lane(u, v) < 0.3 && lakeV(u, v) < -0.25;

    const img = new ImageData(RW, RH), px = img.data, ZS = 0.5, L = [-0.62, -0.36, 0.7], ll = Math.hypot(...L);
    for (let x = 0; x < RW; x++) {
      const u = x / (RW - 1), f1 = RH * (0.25 - 0.09 * (1 - Math.abs(noise.noise2D(u * 2.3, 40))) - 0.03 * noise.noise2D(u * 9, 41)), f2 = RH * (0.3 - 0.07 * (1 - Math.abs(n2.noise2D(u * 3.1, 50))) - 0.02 * n2.noise2D(u * 12, 51));
      for (let y = 0; y < RH; y++) {                         // sky and two far-off ranges
        let c = mix3(SKY0, SKY1, smooth(0, RH * 0.3, y)); if (y > f1) c = [186, 208, 234]; if (y > f2) c = [164, 192, 226];
        const k = 4 * (y * RW + x); px[k] = c[0]; px[k + 1] = c[1]; px[k + 2] = c[2]; px[k + 3] = 255;
      }
      let top = RH;
      for (let j = 0; j < GV; j++) {                         // the mountain, front to back
        const v = j / (GV - 1), h = hg[j * GW + x], yi = Math.ceil(rowY(v, h)); if (yi >= top) continue;
        const gu = (hg[j * GW + Math.min(GW - 1, x + 1)] - hg[j * GW + Math.max(0, x - 1)]) * (GW - 1) / 2 * ZS, gv = (hg[Math.min(GV - 1, j + 1) * GW + x] - hg[Math.max(0, j - 1) * GW + x]) * (GV - 1) / 2 * ZS;
        const lam = (-gu * L[0] - gv * L[1] + L[2]) / (ll * Math.hypot(gu, gv, 1)); let t = smooth(0.3, 0.95, lam); t = mix(t, Math.round(t * 3) / 3, 0.55);
        const lk = lakeV(u, v); let c;
        if (lk > 0) c = lk < 0.08 ? [190, 226, 236] : mix3([104, 178, 210], [50, 122, 172], clamp(lk * 1.3, 0, 1));
        else if (forest(u, v, h)) c = mix3([36, 74, 68], [66, 110, 88], t);
        else if (Math.hypot(gu, gv) > 1.55 + 0.35 * noise.noise2D(u * 9, v * 9 + 2) && h > 0.3) c = mix3([92, 90, 112], [190, 174, 160], t);
        else c = mix3([146, 174, 216], [255, 255, 255], t);
        c = mix3(c, [208, 224, 242], 0.28 * smooth(0.3, 0.9, v));    // haze with distance
        for (let y = Math.max(0, yi); y < top; y++) { const k = 4 * (y * RW + x); px[k] = c[0]; px[k + 1] = c[1]; px[k + 2] = c[2]; }
        top = yi; if (top <= 0) break;
      }
    }
    const r = document.createElement("canvas"); r.width = RW; r.height = RH; r.getContext("2d").putImageData(img, 0, 0);
    const c = bake.getContext("2d"); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high"; c.drawImage(r, 0, 0, W, H);

    // rock strokes, then the forest tree by tree (back to front), then the village
    c.lineCap = "round"; c.strokeStyle = "rgba(60,58,78,.3)"; c.lineWidth = 1;
    c.beginPath(); for (let n = 0; n < 5000; n++) { const u = rng(), v = 0.3 + rng() * 0.56, h = hAt(u, v); if (h < 0.3) continue; const e = 0.004, s = Math.hypot(hAt(u + e, v) - hAt(u - e, v), hAt(u, v + e) - hAt(u, v - e)) / (2 * e) * 0.5; if (s < 1.6) continue; const p = pos(u, v), l = 4 + rng() * 7; c.moveTo(p[0], p[1]); c.lineTo(p[0] + l * 0.35, p[1] + l); } c.stroke();
    const du = 8 / W, dv = 6 / (VD * S);
    for (let v = 0.84; v > 0.1; v -= dv) for (let u = 0; u < 1; u += du) {
      const tu = u + rng() * du, tv = v + rng() * dv, h = hAt(tu, tv); if (!forest(tu, tv, h)) continue;
      const p = pos(tu, tv), s = (4.5 + rng() * 3.5) * (1.2 - 0.5 * tv);
      c.fillStyle = "#1f4a44"; c.beginPath(); c.moveTo(p[0], p[1] - s * 2); c.lineTo(p[0] + s * 0.62, p[1] + s * 0.3); c.lineTo(p[0] - s * 0.62, p[1] + s * 0.3); c.fill();
      c.fillStyle = "#3f7a62"; c.beginPath(); c.moveTo(p[0], p[1] - s * 2); c.lineTo(p[0] - s * 0.1, p[1] + s * 0.3); c.lineTo(p[0] - s * 0.62, p[1] + s * 0.3); c.fill();
      if (rng() < 0.35) { c.fillStyle = "rgba(255,255,255,.85)"; c.beginPath(); c.moveTo(p[0], p[1] - s * 2); c.lineTo(p[0] + s * 0.2, p[1] - s * 1.3); c.lineTo(p[0] - s * 0.2, p[1] - s * 1.3); c.fill(); }
    }
    const hamlets = [[P.start, 11]].concat(ends.filter(k => P[k].v < 0.11 && !(PLACES[k] || {}).lake).map(k => [P[k], 6])), houses = [];
    hamlets.forEach(([n, cnt]) => { for (let i = 0; i < cnt; i++) { const u = n.u + (rng() - 0.5) * 0.14, v = clamp(n.v + (rng() - 0.5) * 0.045, 0.012, 0.105); if (lakeV(u, v) > -0.2 || Math.hypot((u - n.u) * W, (v - n.v) * VD * S) < 16) continue; houses.push([pos(u, v), 5 + rng() * 4, rng()]); } });
    houses.sort((a, b) => a[0][1] - b[0][1]).forEach(([p, s, k]) => {
      c.fillStyle = k < 0.5 ? "#7a5236" : "#93643f"; c.fillRect(p[0] - s, p[1] - s * 0.9, s * 2, s * 0.9); c.fillStyle = "#4a2f1e"; c.fillRect(p[0] - s * 0.2, p[1] - s * 0.5, s * 0.4, s * 0.5);
      c.fillStyle = "#fff"; c.strokeStyle = "rgba(60,70,100,.6)"; c.lineWidth = 0.8; c.beginPath(); c.moveTo(p[0] - s * 1.25, p[1] - s * 0.85); c.lineTo(p[0], p[1] - s * 1.75); c.lineTo(p[0] + s * 1.25, p[1] - s * 0.85); c.closePath(); c.fill(); c.stroke();
    });
    baked = true;
  }

  // ---- the questionnaire (same behaviour as the original form) ------------------------------------------
  const formEl = document.getElementById("form"), panel = document.getElementById("panel");
  let steps = [{ key: "start", pick: null }], anim = null;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const edgeOf = st => edges.find(e => e.from === st.key && e.i === st.pick);
  function choose(n, pick) {
    steps.length = n + 1; steps[n].pick = pick; const e = edgeOf(steps[n]);
    steps.push({ key: e.to, pick: null }); anim = { e, t0: performance.now(), dur: clamp(e.len * 4.5, 900, 2600) }; render();
  }
  function render() {
    formEl.innerHTML = steps.map((st, n) => {
      const q = Q[st.key];
      if (!q.answers) return `<div class="alert alert-${q.type} mb-0 mt-2"><h5 class="mb-1">${esc(q.answer)}</h5>${esc(q.text)}</div>`;
      const body = q.answers.length <= 2
        ? q.answers.map((a, i) => `<div class="form-check"><input class="form-check-input" type="radio" name="q${n}" id="q${n}a${i}" data-n="${n}" data-i="${i}"${st.pick === i ? " checked" : ""}><label class="form-check-label" for="q${n}a${i}">${esc(a.text)}</label></div>`).join("")
        : `<select class="form-select form-select-sm" data-n="${n}">${st.pick === null ? "<option selected disabled></option>" : ""}${q.answers.map((a, i) => `<option value="${i}"${st.pick === i ? " selected" : ""}>${esc(a.text)}</option>`).join("")}</select>`;
      return `<div class="q"><div class="qt">${esc(q.text)}</div>${body}</div>`;
    }).join("");
    formEl.querySelectorAll("input").forEach(el => el.onchange = () => choose(+el.dataset.n, +el.dataset.i));
    formEl.querySelectorAll("select").forEach(el => el.onchange = () => choose(+el.dataset.n, +el.value));
    panel.scrollTop = panel.scrollHeight;
  }

  // ---- drawing ------------------------------------------------------------------------------------------
  const canvas = document.getElementById("map"), ctx = canvas.getContext("2d");
  let vw, vh, dpr, z = 1, zoomMul = portrait ? 1.2 : 1; const cam = { x: W / 2, y: H / 2 }, pan = { x: 0, y: 0 }; let camSet = false;
  function resize() { vw = innerWidth; vh = innerHeight; dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = vw * dpr; canvas.height = vh * dpr; }
  addEventListener("resize", resize);
  function tag(text, x, y, col, align) {                    // little sign, like the names on a piste map
    const fs = 11.5 / z; ctx.font = `700 ${fs}px system-ui, sans-serif`; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    const w = ctx.measureText(text).width + 10 / z, h = fs + 6 / z, x0 = align === "c" ? x - w / 2 : x;
    ctx.beginPath(); ctx.roundRect(x0, y - h / 2, w, h, h / 2); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1.5 / z; ctx.strokeStyle = "#fff"; ctx.stroke(); ctx.fillStyle = "#fff"; ctx.fillText(text, x0 + 5 / z, y + 0.5 / z);
  }
  function name(text, x, y, size, col, align) {             // place names: italic serif with a pale halo
    ctx.font = `italic 700 ${size / z}px Georgia, 'Times New Roman', serif`; ctx.textAlign = align || "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    ctx.lineWidth = 3.5 / z; ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.strokeText(text, x, y); ctx.fillStyle = col || "#1d2b45"; ctx.fillText(text, x, y);
  }
  function drawEdge(e, now, f, hot) {
    ctx.lineCap = ctx.lineJoin = "round";
    if (hot) { trace(ctx, e, f); ctx.strokeStyle = "rgba(255,205,30,.95)"; ctx.lineWidth = e.lift ? 9 : 14; ctx.stroke(); }
    if (e.lift) {
      trace(ctx, e, f); ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 4.2; ctx.stroke();
      trace(ctx, e, f); ctx.strokeStyle = e.color; ctx.lineWidth = 1.7; ctx.stroke();
      ctx.fillStyle = e.color; for (let d = 32; d < e.len * f - 8; d += 32) { const p = pointAt(e, d / e.len); ctx.fillRect(p[0] - 1.7, p[1] - 1.7, 3.4, 3.4); }
      const sp = e.kind === 1 ? 64 : 96; for (let d = (now / 1000 * 20) % sp; d < e.len * f; d += sp) { const p = pointAt(e, d / e.len); ctx.fillStyle = e.kind === 1 ? "#d9480f" : "#fff"; ctx.strokeStyle = "#22252b"; ctx.lineWidth = 1; ctx.beginPath(); ctx.rect(p[0] - 2.8, p[1] - 0.5, 5.6, 4.6); ctx.fill(); ctx.stroke(); }
    } else {
      trace(ctx, e, f); ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 8; ctx.stroke();
      trace(ctx, e, f); ctx.strokeStyle = e.color; ctx.lineWidth = 4.6; ctx.stroke();
    }
  }
  function frame(now) {
    const prog = anim ? clamp((now - anim.t0) / anim.dur, 0, 1) : 1; if (anim && prog >= 1) anim = null;
    const riding = anim && prog < 1, here = steps[steps.length - 1], head = riding ? pointAt(anim.e, prog) : P[here.key].xy;
    // camera: cover the screen with the map, keep "you" in the part of the screen the form doesn't use
    const pr = panel.getBoundingClientRect(), cover = Math.max(vw / W, vh / H), wide = vw >= 800;
    z = cover * zoomMul;
    const fx = wide ? (pr.right + vw) / 2 : vw / 2, fy = wide ? vh * 0.55 : (pr.bottom + vh) / 2, over = wide ? 0 : pr.bottom / z;
    const lim = (v, a, b) => a > b ? (a + b) / 2 : clamp(v, a, b);
    const tx = lim(head[0] - (fx - vw / 2) / z + pan.x, vw / 2 / z, W - vw / 2 / z), ty = lim(head[1] - (fy - vh / 2) / z + pan.y, vh / 2 / z - over, H - vh / 2 / z);
    if (!camSet) { cam.x = tx; cam.y = ty; camSet = true; } else { cam.x += (tx - cam.x) * 0.07; cam.y += (ty - cam.y) * 0.07; }

    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = `rgb(${SKY0})`; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const s = z * dpr; ctx.setTransform(s, 0, 0, s, canvas.width / 2 - cam.x * s, canvas.height / 2 - cam.y * s);
    if (baked) ctx.drawImage(bake, 0, 0);

    const route = steps.slice(0, -1).map(edgeOf), hot = new Set(route), ahead = riding ? [] : edges.filter(e => e.from === here.key);
    edges.forEach(e => { if (!e.lift && !hot.has(e)) drawEdge(e, now, 1, false); });
    edges.forEach(e => { if (e.lift && !hot.has(e)) drawEdge(e, now, 1, false); });
    route.forEach((e, i) => drawEdge(e, now, riding && i === route.length - 1 ? prog : 1, true));
    // stations, endings and their names
    qn.forEach(k => { const p = P[k].xy; ctx.fillStyle = "#fff"; ctx.strokeStyle = "#22252b"; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.rect(p[0] - 4.5, p[1] - 4.5, 9, 9); ctx.fill(); ctx.stroke(); });
    ends.forEach(k => { const p = P[k].xy, col = RUNCOL[Q[k].type] || "#16181d"; ctx.fillStyle = col; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, 6.283); ctx.fill(); ctx.stroke();
      name((PLACES[k] || {}).name || Q[k].answer, p[0], p[1] + 17 / z, 12.5, k === lakeKey ? "#0d3c63" : "#1d2b45"); });
    name((PLACES.start || {}).name || "Start", P.start.xy[0], P.start.xy[1] + 19 / z, 15);
    peaks.forEach((pk, i) => { const p = pos(pk.u, 0.86); name("▲ " + PEAKS[i % PEAKS.length], p[0], p[1] - 16 / z, 11.5, "#33415c"); name(Math.round(1450 + hAt(pk.u, 0.86) * 1900) + " m", p[0], p[1] - 3 / z, 9.5, "#33415c"); });
    ctx.font = `700 ${34}px Georgia, serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.fillText("LE GRAND FAFF", W / 2, H * 0.045);
    ctx.font = `italic 400 ${15}px Georgia, serif`; ctx.fillText("plan des pistes · domaine faffable", W / 2, H * 0.045 + 27);
    // names of what you took and what you can take from here
    const label = (e, f) => { const p = pointAt(e, f), t = e.text.length > 30 ? e.text.slice(0, 29) + "…" : e.text; tag(t, p[0] + 8 / z, p[1], e.lift ? "#4b5563" : e.color); };
    route.forEach((e, i) => { if (!(riding && i === route.length - 1)) label(e, 0.5); });
    ahead.forEach((e, i) => label(e, ahead.length > 1 ? 0.38 + 0.34 * i / (ahead.length - 1) : 0.5));
    // you
    const pulse = 1 + 0.25 * Math.sin(now / 300);
    ctx.fillStyle = "rgba(224,49,49,.3)"; ctx.beginPath(); ctx.arc(head[0], head[1], (riding ? 9 : 13 * pulse), 0, 6.283); ctx.fill();
    ctx.fillStyle = "#e03131"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(head[0], head[1], 5.5, 0, 6.283); ctx.fill(); ctx.stroke();
    requestAnimationFrame(frame);
  }

  // drag to look around, wheel / pinch to zoom; answering a question brings the view back to you
  const ptrs = new Map(); let pinch = 0; canvas.style.touchAction = "none";
  const zlim = v => clamp(v, Math.min(vw / W, vh / H) / Math.max(vw / W, vh / H), 5);
  canvas.addEventListener("pointerdown", e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); });
  ["pointerup", "pointercancel"].forEach(t => canvas.addEventListener(t, e => { ptrs.delete(e.pointerId); pinch = 0; }));
  canvas.addEventListener("pointermove", e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    if (ptrs.size === 1) { pan.x -= (e.clientX - p[0]) / z; pan.y -= (e.clientY - p[1]) / z; }
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) zoomMul = zlim(zoomMul * d / pinch); pinch = d; }
  });
  canvas.addEventListener("wheel", e => { e.preventDefault(); zoomMul = zlim(zoomMul * Math.exp(-e.deltaY / 500)); }, { passive: false });
  const _choose = choose; choose = function (n, pick) { pan.x = pan.y = 0; _choose(n, pick); };

  resize(); render(); requestAnimationFrame(frame);
  setTimeout(paint, 30);
  window.faffMap = { P, edges, steps: () => steps, choose: (n, i) => choose(n, i), zoom: v => { zoomMul = v; } };
})();
