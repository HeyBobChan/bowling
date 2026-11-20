// What one Don remembers between restarts: which pet is his, where he talks to his keeper,
// and what he has already said. One small private JSON file, written whole each time.
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const EMPTY = { key: null, conversationId: null, ownerId: null, alerts: true, greeted: false, memory: null };

/** A store kept in a file. The file holds the keeper code, so it is readable by its owner only. */
export function fileStore(path) {
  let data = Object.assign({}, EMPTY);
  try { data = Object.assign(data, JSON.parse(readFileSync(path, 'utf8'))); }
  catch (e) { if (e.code !== 'ENOENT') throw new Error('Don cannot read his notes at ' + path + ': ' + e.message); }
  return {
    get: () => data,
    set(patch) {
      data = Object.assign({}, data, patch);
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      const tmp = path + '.tmp';
      writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
      chmodSync(tmp, 0o600);
      renameSync(tmp, path);
      return data;
    },
  };
}

/** The same thing in memory, for tests. */
export function memoryStore(initial) {
  let data = Object.assign({}, EMPTY, initial);
  return { get: () => data, set(patch) { data = Object.assign({}, data, patch); return data; } };
}
