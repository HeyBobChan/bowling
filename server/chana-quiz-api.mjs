// HTTP API of the quiz. It shares the birthday tables with the timeline game and the
// same restricted database role, so it needs no schema change:
// - quiz rooms have seven-digit codes (the timeline accepts only six digits) and a
//   host hash prefixed with "quiz:", so neither game can open the other's rooms;
// - review_index is the quiz step; chana_players.guesses_json holds every answer.
import { steps, nextRoundStep, roomView, validateAnswer } from './chana-quiz-game.mjs';

const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
class Problem extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new Problem(status, message); };
const tokenValid = (t) => typeof t === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t);
const hash = async (token) => 'quiz:' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))).map((v) => v.toString(16).padStart(2, '0')).join('');
const first = (db, sql, ...args) => db.prepare(sql).bind(...args).first();
const run = (db, sql, ...args) => db.prepare(sql).bind(...args).run();
const all = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results;
export const QUIZ_CODE = /^\d{7}$/;
const MAX_PLAYERS = 120;

async function body(req) {
  if (Number(req.headers.get('Content-Length')) > 4000) fail(413, 'הבקשה גדולה מדי.');
  const value = await req.text();
  if (value.length > 4000) fail(413, 'הבקשה גדולה מדי.');
  try { const b = JSON.parse(value); if (!b || typeof b !== 'object' || Array.isArray(b)) throw Error(); return b; } catch { fail(400, 'הבקשה אינה תקינה.'); }
}
const loadPlayers = async (db, code) => (await all(db, 'SELECT id,name,guesses_json FROM players WHERE room_code=? AND removed=0 ORDER BY joined_at,id', code))
  .map((p) => ({ id: p.id, name: p.name, guesses: JSON.parse(p.guesses_json || '{}') }));
async function view(db, code, identity) {
  const room = await first(db, 'SELECT * FROM rooms WHERE code=?', code);
  const players = await loadPlayers(db, code);
  if (identity.role === 'player' && !players.some((p) => p.id === identity.id)) fail(403, 'ההשתתפות שלך הוסרה מהמשחק.');
  return roomView(room, identity, players);
}

export async function quizApi(req, env) {
  try {
    if (!env.DB) fail(503, 'המשחק אינו מחובר כרגע. נסו שוב בעוד רגע.');
    const db = env.DB, url = new URL(req.url), path = url.pathname, method = req.method;
    if (!['GET', 'POST'].includes(method)) fail(405, 'הפעולה אינה נתמכת.');
    const origin = req.headers.get('Origin'), allowed = origin === url.origin || (env.ALLOWED_ORIGINS || []).includes(origin);
    if (method !== 'GET' && ((origin && !allowed) || (req.headers.get('Sec-Fetch-Site') === 'cross-site' && !allowed))) fail(403, 'יש לשלוח את הבקשה מתוך המשחק.');

    if (path === '/quiz/rooms' && method === 'POST') {
      const b = await body(req);
      if (!tokenValid(b.hostToken)) fail(400, 'מפתח המנחה אינו תקין.');
      const h = await hash(b.hostToken);
      let room = await first(db, 'SELECT * FROM rooms WHERE host_hash=?', h);
      for (let tries = 0; !room && tries < 8; tries++) {
        const r = new Uint32Array(1); crypto.getRandomValues(r);
        const code = String(1000000 + (r[0] % 9000000)), now = Date.now();
        await run(db, 'INSERT OR IGNORE INTO rooms(code,host_hash,created_at,expires_at) VALUES(?,?,?,?)', code, h, now, now + 7 * 86400000);
        room = await first(db, 'SELECT * FROM rooms WHERE host_hash=?', h);
      }
      if (!room) fail(503, 'לא הצלחנו ליצור משחק. נסו שוב.');
      return json(await view(db, room.code, { role: 'host' }), 201);
    }

    const match = path.match(/^\/quiz\/rooms\/(\d{7})(?:\/(join|answer|start|next|skip|remove))?$/);
    if (!match) fail(404, 'העמוד לא נמצא.');
    const [, code, action] = match;
    const room = await first(db, 'SELECT * FROM rooms WHERE code=?', code);
    if (!room || room.expires_at < Date.now() || !room.host_hash.startsWith('quiz:')) fail(404, 'הקוד לא נמצא או שהמשחק הסתיים. בדקו את שבע הספרות.');

    if (action === 'join' && method === 'POST') {
      const b = await body(req);
      if (!tokenValid(b.playerToken)) fail(400, 'מפתח המשתתף אינו תקין.');
      const h = await hash(b.playerToken);
      let p = await first(db, 'SELECT * FROM players WHERE room_code=? AND token_hash=?', code, h);
      if (p?.removed) fail(403, 'ההשתתפות שלך הוסרה מהמשחק.');
      if (!p) {
        const name = typeof b.name === 'string' ? b.name.trim().replace(/\s+/g, ' ') : '';
        if (!name || name.length > 30 || /[\p{C}]/u.test(name)) fail(400, 'כתבו שם באורך של עד 30 תווים.');
        // Late guests may join while the quiz runs; they score from the next question.
        const now = Date.now(), id = crypto.randomUUID();
        await run(db, "INSERT OR IGNORE INTO players(id,room_code,token_hash,name,order_json,joined_at,updated_at) SELECT ?,?,?,?,'[]',?,? WHERE EXISTS(SELECT 1 FROM rooms WHERE code=? AND phase IN ('lobby','playing')) AND (SELECT COUNT(*) FROM players WHERE room_code=? AND removed=0)<?",
          id, code, h, name, now, now, code, code, MAX_PLAYERS);
        p = await first(db, 'SELECT * FROM players WHERE room_code=? AND token_hash=?', code, h);
        if (!p) fail(409, 'המשחק הסתיים או שהוא מלא.');
      }
      return json(await view(db, code, { role: 'player', id: p.id }));
    }

    const token = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
    if (!tokenValid(token)) fail(401, 'יש להצטרף למשחק מחדש במכשיר הזה.');
    const h = await hash(token);
    let identity;
    if (h === room.host_hash) identity = { role: 'host' };
    else {
      const p = await first(db, 'SELECT id FROM players WHERE room_code=? AND token_hash=? AND removed=0', code, h);
      if (!p) fail(403, 'אין הרשאה למשחק הזה.');
      identity = { role: 'player', id: p.id };
    }
    if (!action && method === 'GET') return json(await view(db, code, identity));
    if (method !== 'POST') fail(405, 'הפעולה אינה נתמכת.');

    if (action === 'answer') {
      if (identity.role !== 'player') fail(403, 'הפעולה מיועדת למשתתפים.');
      if (room.phase !== 'playing') fail(409, 'אין כרגע שאלה פתוחה.');
      const b = await body(req), players = await loadPlayers(db, code), me = players.find((p) => p.id === identity.id);
      let entry;
      try { entry = validateAnswer(code, steps[room.review_index], b, me, players); } catch (e) { fail(409, e.message); }
      me.guesses[entry[0]] = entry[1];
      await run(db, 'UPDATE players SET guesses_json=?,revision=revision+1,updated_at=? WHERE id=? AND room_code=? AND removed=0', JSON.stringify(me.guesses), Date.now(), me.id, code);
      return json(await view(db, code, identity));
    }

    if (identity.role !== 'host') fail(403, 'רק המנחה יכול לבצע את הפעולה.');
    const b = await body(req);
    if (action === 'start') {
      await run(db, "UPDATE rooms SET phase='playing',review_index=0 WHERE code=? AND phase='lobby'", code);
    } else if (action === 'next' || action === 'skip') {
      // "from" is the step the host was looking at: a double tap moves only once.
      if (!Number.isInteger(b.from) || b.from < 0 || b.from >= steps.length) fail(400, 'שלב לא תקין.');
      const to = action === 'next' ? b.from + 1 : nextRoundStep(b.from);
      if (to >= steps.length) await run(db, "UPDATE rooms SET phase='results' WHERE code=? AND phase='playing' AND review_index=?", code, b.from);
      else await run(db, "UPDATE rooms SET review_index=? WHERE code=? AND phase='playing' AND review_index=?", to, code, b.from);
    } else if (action === 'remove') {
      if (typeof b.playerId !== 'string') fail(400, 'משתתף לא תקין.');
      await run(db, "UPDATE players SET removed=1 WHERE room_code=? AND id=? AND EXISTS(SELECT 1 FROM rooms WHERE code=? AND phase IN ('lobby','playing'))", code, b.playerId, code);
    } else fail(404, 'הפעולה לא נמצאה.');
    return json(await view(db, code, identity));
  } catch (error) {
    if (!(error instanceof Problem)) console.error('Quiz request failed:', error.message);
    return json({ error: error instanceof Problem ? error.message : 'החיבור למשחק נקטע. נסו שוב בעוד רגע.' }, error.status || 503);
  }
}
