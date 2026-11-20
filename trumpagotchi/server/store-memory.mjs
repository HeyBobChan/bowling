// Pets kept in memory: for tests and for trying cloud saves on your own machine.
// Nothing survives a restart, so the server refuses to use this in production.
export function createMemoryStore({ maxPets = 1000, now = Date.now } = {}) {
  const pets = new Map(); // key hash -> { rev, state, updatedAt }
  const copy = (v) => JSON.parse(JSON.stringify(v));
  return {
    kind: 'memory',
    async create(hash, state) {
      if (pets.size >= maxPets || pets.has(hash)) return null;
      pets.set(hash, { rev: 1, state: copy(state), updatedAt: now() });
      return { rev: 1 };
    },
    async get(hash) { const p = pets.get(hash); return p ? { rev: p.rev, state: copy(p.state), updatedAt: p.updatedAt } : null; },
    async put(hash, baseRev, state) {
      const p = pets.get(hash);
      if (!p) return null;
      if (p.rev !== baseRev) return { ok: false, rev: p.rev, state: copy(p.state), updatedAt: p.updatedAt };
      p.rev++; p.state = copy(state); p.updatedAt = now();
      return { ok: true, rev: p.rev };
    },
    async rotate(hash, newHash) {
      const p = pets.get(hash);
      if (!p || pets.has(newHash)) return false;
      pets.delete(hash); pets.set(newHash, p);
      return true;
    },
    async remove(hash) { return pets.delete(hash); },
    async count() { return pets.size; },
    async prune(days) { const cut = now() - days * 864e5; let n = 0; for (const [h, p] of pets) if (p.updatedAt < cut) { pets.delete(h); n++; } return n; },
    async close() {},
  };
}
