// Pictures the page draws for itself (as opposed to the Twemoji sprites): the sun, the
// moon, clouds, a ridge of mountains, a one-of-a-kind monster, stick-figure bodies. Each
// returns pixels that shapes.js turns into letters, so none of this is ever seen directly.
import { paintMask } from './shapes.js';

export const MARKERS = [
  [43, 75, 215], [47, 138, 37], [201, 48, 44], [236, 126, 28], [122, 62, 184],
  [236, 100, 160], [30, 150, 160], [214, 164, 30], [134, 84, 48], [74, 58, 184],
];
export function seeded(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
export function hashWord(word) {
  let h = 2166136261;
  for (const ch of word) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const css = (c, k = 1) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;

export const sunMask = () => paintMask(120, 120, (c) => {
  c.translate(60, 60);
  c.fillStyle = '#f08a1c';
  for (let i = 0; i < 12; i++) {
    c.save(); c.rotate((i * Math.PI) / 6);
    c.beginPath(); c.moveTo(-7.5, -33); c.lineTo(0, -58); c.lineTo(7.5, -33); c.closePath(); c.fill();
    c.restore();
  }
  c.fillStyle = '#f7c21a'; c.beginPath(); c.arc(0, 0, 33, 0, 7); c.fill();
  c.fillStyle = '#f2a516'; c.beginPath(); c.arc(0, 0, 33, 0.5, 2.3); c.arc(0, -5, 31, 2.3, 0.5, true); c.fill();
  // the face every child gives the sun
  c.fillStyle = '#5a3a1a';
  c.beginPath(); c.arc(-11, -6, 4, 0, 7); c.arc(11, -6, 4, 0, 7); c.fill();
  c.strokeStyle = '#5a3a1a'; c.lineWidth = 4; c.lineCap = 'round';
  c.beginPath(); c.arc(0, 2, 15, 0.35, Math.PI - 0.35); c.stroke();
});

export const moonMask = () => paintMask(100, 100, (c) => {
  c.fillStyle = '#f1dc8a'; c.beginPath(); c.arc(50, 50, 40, 0, 7); c.fill();
  c.globalCompositeOperation = 'destination-out';
  c.beginPath(); c.arc(68, 40, 34, 0, 7); c.fill();
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = '#d9bf5e'; c.beginPath(); c.arc(26, 62, 5, 0, 7); c.arc(20, 44, 3, 0, 7); c.fill();
});

export const cloudMask = (seed, dark = false) => paintMask(150, 80, (c) => {
  const r = seeded(seed);
  const body = dark ? '#8d96aa' : '#eef2fa', belly = dark ? '#737c92' : '#cfd8ea';
  const bumps = 4 + Math.floor(r() * 2);
  c.fillStyle = belly; c.beginPath(); c.ellipse(75, 56, 62, 17, 0, 0, 7); c.fill();
  c.fillStyle = body;
  for (let i = 0; i < bumps; i++) {
    const x = 28 + (i * 94) / (bumps - 1), rad = 17 + r() * 13 - Math.abs(i - (bumps - 1) / 2) * 2;
    c.beginPath(); c.arc(x, 44 - r() * 9, rad, 0, 7); c.fill();
  }
  c.fillRect(22, 42, 106, 20);
});

export const mountainMask = (seed) => paintMask(260, 104, (c) => {
  const r = seeded(seed);
  const peaks = [[62, 34, 60, '#8a86b4'], [200, 44, 66, '#9b93bd'], [132, 8, 84, '#6f6aa3']];
  for (const [x, top, half, col] of peaks) {
    const jx = x + (r() - 0.5) * 16, jt = top + r() * 8;
    c.fillStyle = col;
    c.beginPath(); c.moveTo(jx - half, 104); c.quadraticCurveTo(jx - half * 0.3, jt + 22, jx, jt);
    c.quadraticCurveTo(jx + half * 0.35, jt + 26, jx + half, 104); c.closePath(); c.fill();
    c.fillStyle = '#f4f6fb';      // snow cap with a ragged edge
    c.beginPath(); c.moveTo(jx, jt); c.lineTo(jx - half * 0.23, jt + 21); c.lineTo(jx - half * 0.1, jt + 16);
    c.lineTo(jx, jt + 24); c.lineTo(jx + half * 0.12, jt + 16); c.lineTo(jx + half * 0.25, jt + 23); c.closePath(); c.fill();
  }
  c.fillStyle = '#5c8a4a'; c.beginPath(); c.ellipse(130, 108, 150, 15, 0, 0, 7); c.fill();
});

// Every monster is its own: the word's letters will fill whatever this draws.
export const monsterMask = (seed) => paintMask(96, 104, (c) => {
  const r = seeded(seed);
  const body = MARKERS[Math.floor(r() * MARKERS.length)];
  const eyes = 1 + Math.floor(r() * 3);
  const wide = 30 + r() * 10, tall = 30 + r() * 8, cy = 56;
  c.fillStyle = css(body, 0.78);                   // feet and arms
  c.beginPath(); c.ellipse(34, 96, 11, 6, 0, 0, 7); c.ellipse(62, 96, 11, 6, 0, 0, 7); c.fill();
  c.lineCap = 'round'; c.strokeStyle = css(body, 0.78); c.lineWidth = 7;
  c.beginPath(); c.moveTo(48 - wide + 4, cy); c.lineTo(48 - wide - 8, cy - 14 + r() * 26);
  c.moveTo(48 + wide - 4, cy); c.lineTo(48 + wide + 8, cy - 14 + r() * 26); c.stroke();
  c.fillStyle = css(body);                          // a wobbly blob
  c.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2, k = 1 + Math.sin(a * 3 + r() * 6) * 0.05 + (r() - 0.5) * 0.05;
    c.lineTo(48 + Math.cos(a) * wide * k, cy + Math.sin(a) * tall * k);
  }
  c.closePath(); c.fill();
  if (r() < 0.6) {                                  // horns, or antennae with knobs
    c.fillStyle = '#f3ead0';
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(48 + s * 14, cy - tall + 6); c.lineTo(48 + s * 22, cy - tall - 15); c.lineTo(48 + s * 25, cy - tall + 9); c.closePath(); c.fill(); }
  } else {
    c.strokeStyle = css(body, 0.7); c.lineWidth = 4;
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(48 + s * 10, cy - tall + 4); c.lineTo(48 + s * 17, cy - tall - 15); c.stroke(); c.fillStyle = css(body, 0.7); c.beginPath(); c.arc(48 + s * 17, cy - tall - 17, 5, 0, 7); c.fill(); }
  }
  for (let i = 0; i < eyes; i++) {
    const ex = 48 + (i - (eyes - 1) / 2) * 20, ey = cy - 12 + (eyes === 3 && i === 1 ? -7 : 0), er = eyes === 1 ? 12 : 8.5;
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(ex, ey, er, 0, 7); c.fill();
    c.fillStyle = '#23233b'; c.beginPath(); c.arc(ex + 1.5, ey + 1, er * 0.48, 0, 7); c.fill();
  }
  c.fillStyle = '#3a1420';                          // a mouth full of teeth
  c.beginPath(); c.ellipse(48, cy + 13, 18, 9, 0, 0, 7); c.fill();
  c.fillStyle = '#ffffff';
  for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(48 + i * 7 - 3.5, cy + 6); c.lineTo(48 + i * 7, cy + 13); c.lineTo(48 + i * 7 + 3.5, cy + 6); c.closePath(); c.fill(); }
});

export const ballMask = () => paintMask(90, 90, (c) => {
  c.fillStyle = '#2b4bd7'; c.beginPath(); c.arc(45, 45, 40, 0, 7); c.fill();
  c.fillStyle = '#4f6ff0'; c.beginPath(); c.arc(34, 32, 20, 0, 7); c.fill();
  c.fillStyle = '#14204f';
  c.beginPath(); c.arc(40, 30, 5, 0, 7); c.arc(54, 30, 5, 0, 7); c.arc(47, 43, 5, 0, 7); c.fill();
});

export const splatMask = (seed) => paintMask(110, 64, (c) => {
  const r = seeded(seed);
  c.fillStyle = '#888';
  c.beginPath();
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * Math.PI * 2, k = 0.72 + r() * 0.3;
    c.lineTo(55 + Math.cos(a) * 50 * k, 36 + Math.sin(a) * 24 * k);
  }
  c.closePath(); c.fill();
  for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(10 + r() * 90, 6 + r() * 52, 2 + r() * 4, 0, 7); c.fill(); }
});

// A person the way a seven-year-old draws one: a big head, a shirt, two arms, two legs.
export function personMask(head, seed) {
  return paintMask(88, 132, (c) => {
    const r = seeded(seed);
    const shirt = MARKERS[Math.floor(r() * MARKERS.length)];
    const hd = head.data;
    // skin: the commonest warm colour near the middle of the face
    let sr = 0, sg = 0, sb = 0, sn = 0;
    for (let y = 30; y < 44; y++) for (let x = 30; x < 42; x++) {
      const i = (y * head.width + x) * 4;
      if (hd[i + 3] > 200) { sr += hd[i]; sg += hd[i + 1]; sb += hd[i + 2]; sn++; }
    }
    const skin = sn ? [sr / sn, sg / sn, sb / sn] : [240, 190, 140];
    c.lineCap = 'round';
    c.strokeStyle = '#3d4a78'; c.lineWidth = 9;                 // legs
    c.beginPath(); c.moveTo(36, 100); c.lineTo(33, 124); c.moveTo(52, 100); c.lineTo(55, 124); c.stroke();
    c.fillStyle = '#23233b'; c.beginPath(); c.ellipse(30, 127, 9, 4.5, 0, 0, 7); c.ellipse(58, 127, 9, 4.5, 0, 0, 7); c.fill();
    c.strokeStyle = css(skin); c.lineWidth = 7;                 // arms
    c.beginPath(); c.moveTo(28, 76); c.lineTo(11, 92); c.moveTo(60, 76); c.lineTo(77, 92); c.stroke();
    c.fillStyle = css(shirt);                                   // shirt
    c.beginPath(); c.moveTo(26, 68); c.lineTo(62, 68); c.lineTo(66, 104); c.lineTo(22, 104); c.closePath(); c.fill();
    const tmp = document.createElement('canvas'); tmp.width = head.width; tmp.height = head.height;
    tmp.getContext('2d').putImageData(head, 0, 0);
    c.drawImage(tmp, 4, 0, head.width, head.height, 8, 0, 72, 72);   // head on top
  });
}
