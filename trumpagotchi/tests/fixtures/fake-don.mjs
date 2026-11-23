// Stands in for don/main.mjs in tests, with no Canon. He reads his notes, is approved a moment
// later (or declined, for a number ending in 0000), and keeps running until he is stopped.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.env.DON_DATA_DIR, file = join(dir, 'don.json');
const read = () => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; } };
const write = (patch) => writeFileSync(file, JSON.stringify(Object.assign(read(), patch)), { mode: 0o600 });
appendFileSync(join(dir, 'starts.log'), JSON.stringify({ id: process.env.DON_ID, phone: process.env.CANON_OWNER_PHONE || '', hostKey: process.env.DON_HOST_KEY || '' }) + '\n');
console.log('fake Don ' + process.env.DON_ID + ' is up');
const notes = read();
if (notes.crashOnce && !notes.crashed) { write({ crashed: true }); process.exit(1); }
setTimeout(() => {
  const phone = read().ownerPhone || process.env.CANON_OWNER_PHONE || '';
  if (phone.endsWith('0000')) write({ phase: 'declined' });
  else write({ phase: 'listening', ownerPhone: null });
}, Number(process.env.FAKE_APPROVE_MS || 300));
process.on('SIGTERM', () => process.exit(0));
setInterval(() => {}, 1 << 30);
