import * as THREE from 'three';
import { flatMat, clamp } from './kit/toon.js';

// ---------- The winding lane ----------
// The lane is an endless centre line of straights and circular arcs drawn on the paper.
// Things on it live in LANE coordinates — s = metres along the centre line, d = sideways
// offset, positive to the RIGHT of the direction of travel — and pose()/point() map them
// to the world while project() goes the other way. The heading `th` is measured from the
// opening direction (-Z), positive = turning left; tangent(th) is the direction of travel
// and right(th) the sideways axis.
//
// Two rules keep the geometry honest: the heading stays inside ±HEADING_MAX, so the lane
// always keeps advancing and never doubles back over itself, and every bend is wider than
// the lane, so the inner edge line never folds into a cusp.

export const OPENING_STRAIGHT = 60;  // metres of straight lane before the first bend (the drawing's lane)
export const HEADING_MAX = 1.0;      // rad (≈57°): how far the lane may swing off the opening direction
export const RADIUS_MIN = 30;        // metres — the lane is 26 wide, so the inner edge keeps 17 m of radius
export const RADIUS_MAX = 75;
export const TURN_MIN = 0.35;        // rad (≈20°): anything smaller reads as a wobble, not a bend
export const GENTLE_BENDS = 2;       // the first bends of a run are wide and shallow — a warm-up
const BEHIND_START = 80;             // the opening straight also runs behind the start line
const SAMPLE_M = 2;                  // edge-line ribbon sample spacing (the tightest bend is 30 m)

export function createTrack({ scene, laneHalf, lineColor, lineOffsets = [0.4, 1.4], lineWidth = 0.24 }) {
  const segs = [];           // { s0, len, k, x0, z0, th0, mesh } — k is the signed curvature (0 = straight)
  let end = 0;               // s where the built lane currently ends
  let bends = 0;
  let nextIsBend = false;
  const lineMat = flatMat(lineColor, { side: THREE.DoubleSide });
  const _pp = { x: 0, z: 0, th: 0 };

  // the segment that owns arc length s (extrapolates the first / last one beyond the ends)
  function segAt(s) {
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segs[mid].s0 <= s) lo = mid; else hi = mid - 1;
    }
    return segs[lo];
  }

  // centre-line point and heading at arc length s
  function pose(s, out = { x: 0, z: 0, th: 0 }) {
    const g = segAt(s);
    const u = s - g.s0;
    if (g.k === 0) {
      out.x = g.x0 - Math.sin(g.th0) * u;
      out.z = g.z0 - Math.cos(g.th0) * u;
      out.th = g.th0;
    } else {
      const th = g.th0 + g.k * u;
      out.x = g.x0 + (Math.cos(th) - Math.cos(g.th0)) / g.k;
      out.z = g.z0 - (Math.sin(th) - Math.sin(g.th0)) / g.k;
      out.th = th;
    }
    return out;
  }

  const tangent = (th, out = new THREE.Vector3()) => out.set(-Math.sin(th), 0, -Math.cos(th));
  const right = (th, out = new THREE.Vector3()) => out.set(Math.cos(th), 0, -Math.sin(th));

  // world point for lane coordinates (s, d), on the paper
  function point(s, d, out = new THREE.Vector3()) {
    pose(s, _pp);
    return out.set(_pp.x + Math.cos(_pp.th) * d, 0, _pp.z - Math.sin(_pp.th) * d);
  }

  // lane coordinates of a world point: Newton steps on "the foot point is where the
  // offset is perpendicular to the tangent", started from a guess (the thing's last s).
  // A guess that is far off (a fresh thing, the debug helper) first coarse-scans the lane.
  function project(x, z, sHint, out = { s: 0, d: 0, th: 0, x: 0, z: 0 }, iters = 8) {
    let s = sHint;
    pose(s, _pp);
    if (Math.hypot(x - _pp.x, z - _pp.z) > 30) {
      let best = Infinity;
      for (let u = segs[0].s0; u <= end; u += 8) {
        pose(u, _pp);
        const dd = (x - _pp.x) ** 2 + (z - _pp.z) ** 2;
        if (dd < best) { best = dd; s = u; }
      }
    }
    for (let i = 0; i < iters; i++) {
      pose(s, _pp);
      const dx = x - _pp.x, dz = z - _pp.z;
      const ahead = -dx * Math.sin(_pp.th) - dz * Math.cos(_pp.th);   // along the tangent
      const side = dx * Math.cos(_pp.th) - dz * Math.sin(_pp.th);     // along right()
      const step = clamp(ahead / Math.max(0.3, 1 + segAt(s).k * side), -10, 10);
      s += step;
      if (Math.abs(step) < 1e-3) break;
    }
    pose(s, _pp);
    out.s = s;
    out.th = _pp.th;
    out.x = _pp.x;
    out.z = _pp.z;
    out.d = (x - _pp.x) * Math.cos(_pp.th) - (z - _pp.z) * Math.sin(_pp.th);
    return out;
  }

  // the two pairs of brown edge lines of one segment, as flat ribbons on the paper — with
  // a little hand-drawn waver so the pairs are never quite parallel
  function buildRibbons(seg) {
    const n = Math.max(2, Math.ceil(seg.len / SAMPLE_M) + 1);
    const lines = [];
    for (const side of [-1, 1]) for (const off of lineOffsets) lines.push([side, off]);
    const pos = new Float32Array(lines.length * n * 2 * 3);
    const idx = [];
    let v = 0;
    lines.forEach(([side, off], li) => {
      const base = li * n * 2;
      for (let i = 0; i < n; i++) {
        const s = seg.s0 + (seg.len * i) / (n - 1);
        pose(s, _pp);
        const rx = Math.cos(_pp.th), rz = -Math.sin(_pp.th);
        const waver = 0.05 * Math.sin(s * 0.21 + side * 3 + li * 1.7) + 0.03 * Math.sin(s * 0.63 + li);
        const c = side * (laneHalf + off) + waver;
        for (const e of [-lineWidth / 2, lineWidth / 2]) {
          pos[v++] = _pp.x + rx * (c + e);
          pos[v++] = 0.012;
          pos[v++] = _pp.z + rz * (c + e);
        }
        if (i > 0) {
          const a = base + (i - 1) * 2, b = a + 1, c2 = base + i * 2, d2 = c2 + 1;
          idx.push(a, b, c2, b, d2, c2);
        }
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, lineMat);
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  function addSegment(len, k, start = null) {
    const seg = { s0: end, len, k, x0: 0, z0: 0, th0: 0, mesh: null };
    if (start) Object.assign(seg, start);
    else if (segs.length) { pose(end, _pp); seg.x0 = _pp.x; seg.z0 = _pp.z; seg.th0 = _pp.th; }
    segs.push(seg);
    end += len;
    seg.mesh = buildRibbons(seg);
    scene.add(seg.mesh);
    return seg;
  }

  function dropSegment(seg) {
    scene.remove(seg.mesh);
    seg.mesh.geometry.dispose();
  }

  const track = {
    get laneHalf() { return laneHalf; },
    get end() { return end; },
    segments: segs,
    pose, point, project, tangent, right,
    heading: (s) => pose(s, _pp).th,
    curvature: (s) => segAt(s).k,

    // a fresh lane: the drawing's straight opening, then the bends begin
    reset() {
      for (const g of segs) dropSegment(g);
      segs.length = 0;
      bends = 0;
      end = -BEHIND_START;
      addSegment(BEHIND_START + OPENING_STRAIGHT, 0, { x0: 0, z0: BEHIND_START, th0: 0 });
      nextIsBend = true;
    },

    // build lane until it reaches at least sMax: bends alternate with straights (a third
    // of the straights are skipped, which gives S-bends), and every bend picks a new
    // heading inside the band that is at least TURN_MIN away from the current one
    extendTo(sMax) {
      while (end < sMax) {
        if (nextIsBend) {
          const th = pose(end, _pp).th;
          const gentle = bends < GENTLE_BENDS;
          const radius = gentle ? 45 + Math.random() * 30 : RADIUS_MIN + Math.random() * (RADIUS_MAX - RADIUS_MIN);
          let target;
          do target = (Math.random() * 2 - 1) * HEADING_MAX; while (Math.abs(target - th) < TURN_MIN);
          let turn = target - th;
          if (gentle) turn = clamp(turn, -0.55, 0.55);
          addSegment(Math.abs(turn) * radius, Math.sign(turn) / radius);
          bends += 1;
          nextIsBend = false;
        } else {
          const len = Math.random() < 0.3 ? 0 : 10 + Math.random() * Math.random() * 55;
          if (len > 0) addSegment(len, 0);
          nextIsBend = true;
        }
      }
    },

    // forget lane that is far behind (everything on it has been culled by then)
    trim(sMin) {
      while (segs.length > 1 && segs[0].s0 + segs[0].len < sMin) dropSegment(segs.shift());
    },
  };
  track.reset();
  return track;
}
