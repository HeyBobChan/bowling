import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { quizApi } from '../chana-quiz-api.mjs';
import { api } from '../chana-api.mjs';
import { steps, rounds, questionOf, normalizeText } from '../chana-quiz-game.mjs';
import { createStore } from '../store.mjs';
import { migrateDatabase } from '../migrate.mjs';
import { createServer } from '../app.mjs';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw Error('Set TEST_DATABASE_URL to a disposable PostgreSQL database.');
let store;
before(async () => { await migrateDatabase(connectionString); store = await createStore(connectionString); });
after(async () => { await store.close(); });

const quiz = (s = () => store) => async (path, { method = 'GET', token, body, origin } = {}) => {
  const r = await s().chanaTransaction('quiz:' + (path.match(/rooms\/(\d{7})/)?.[1] || 'create'), (db) => quizApi(new Request('http://localhost/quiz' + path,
    { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(origin ? { Origin: origin } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), { DB: db }));
  return { status: r.status, ...await r.json() };
};
const call = quiz();
async function room(call, names = ['דנה', 'יוסי']) {
  const host = crypto.randomUUID();
  const created = await call('/rooms', { method: 'POST', body: { hostToken: host } });
  const code = created.room.code, players = [];
  for (const name of names) {
    const token = crypto.randomUUID();
    const joined = await call(`/rooms/${code}/join`, { method: 'POST', body: { playerToken: token, name } });
    players.push({ token, id: joined.me.id, name });
  }
  return { host, code, players };
}
const next = (call, r, from) => call(`/rooms/${r.code}/next`, { method: 'POST', token: r.host, body: { from } });
const answer = (call, r, p, questionId, value) => call(`/rooms/${r.code}/answer`, { method: 'POST', token: p.token, body: { questionId, value } });
const firstStep = (kind, type) => steps.findIndex((s) => s.kind === kind && (!type || questionOf(s).type === type));

test('every question is well formed and every round ends with standings', () => {
  assert.ok(rounds.length >= 3);
  for (const r of rounds) assert.ok(r.questions.length > 0, r.id);
  assert.equal(steps.filter((s) => s.kind === 'standings').length, rounds.length);
  const ids = rounds.flatMap((r) => r.questions.map((q) => q.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(firstStep('open') !== -1 && firstStep('write') !== -1);
});

test('quiz rooms have seven-digit codes; the two games never open each other\'s rooms', async () => {
  const host = crypto.randomUUID();
  const a = await call('/rooms', { method: 'POST', body: { hostToken: host } });
  const b = await call('/rooms', { method: 'POST', body: { hostToken: host } });
  assert.equal(a.status, 201); assert.match(a.room.code, /^\d{7}$/); assert.equal(b.room.code, a.room.code);
  // The timeline API refuses a seven-digit code, and the same host token makes a separate timeline room.
  const timeline = async (path, opts = {}) => { const r = await store.chanaTransaction('t', (db) => api(new Request('http://localhost/api' + path, opts), { DB: db })); return { status: r.status, ...await r.json() }; };
  assert.equal((await timeline(`/rooms/${a.room.code}`, { headers: { Authorization: 'Bearer ' + host } })).status, 404);
  const t = await timeline('/rooms', { method: 'POST', body: JSON.stringify({ hostToken: host }) });
  assert.match(t.room.code, /^\d{6}$/);
  assert.equal((await call(`/rooms/${t.room.code}`, { token: host })).status, 404);
  assert.equal((await call(`/rooms/${t.room.code.padStart(7, '0')}`, { token: host })).status, 404);
});

test('a choice question hides the answer and other picks until the reveal, then scores it', async () => {
  const r = await room(call), [dana, yossi] = r.players;
  await call(`/rooms/${r.code}/start`, { method: 'POST', token: r.host, body: {} });
  const open = firstStep('open'), q = questionOf(steps[open]);
  let s = await call(`/rooms/${r.code}`, { token: r.host });
  assert.equal(s.stage.kind, 'intro');
  // jump the room to the first open question
  await store.chanaTransaction('x', (db) => db.prepare('UPDATE rooms SET review_index=? WHERE code=?').bind(open, r.code).run());
  const wrong = (q.answer + 1) % q.options.length;
  s = await answer(call, r, dana, q.id, wrong);
  assert.equal(s.me.answer, wrong);
  s = await answer(call, r, dana, q.id, q.answer);           // may change until the reveal
  assert.equal(s.me.answer, q.answer);
  await answer(call, r, yossi, q.id, wrong);
  for (const who of [r.host, dana.token]) {
    s = await call(`/rooms/${r.code}`, { token: who });
    const text = JSON.stringify(s);
    assert.equal(s.stage.question.answer, undefined); assert.equal(s.reveal, undefined); assert.equal(s.gained, undefined);
    assert.ok(!text.includes('"answer":' + q.answer + ',') || who === dana.token);
    assert.deepEqual(s.players.map((p) => p.answered), [true, true]);
  }
  assert.equal((await answer(call, r, dana, 'not-this-one', 0)).status, 409);
  assert.equal((await answer(call, r, dana, q.id, 9)).status, 409);
  assert.equal((await call(`/rooms/${r.code}/answer`, { method: 'POST', token: r.host, body: { questionId: q.id, value: 0 } })).status, 403);
  // a double tap on "reveal" moves one step only
  await next(call, r, open); s = await next(call, r, open);
  assert.equal(s.room.step, open + 1); assert.equal(s.stage.kind, 'reveal');
  assert.equal(s.reveal.answer, q.answer);
  assert.deepEqual(s.reveal.picks[q.answer], ['דנה']); assert.deepEqual(s.reveal.picks[wrong], ['יוסי']);
  assert.deepEqual(s.gained.map((g) => [g.name, g.gained]), [['דנה', 10], ['יוסי', 0]]);
  const mine = await call(`/rooms/${r.code}`, { token: yossi.token });
  assert.equal(mine.me.picked, wrong); assert.equal(mine.me.gained, 0);
  assert.equal((await answer(call, r, dana, q.id, wrong)).status, 409);       // closed after the reveal
});

test('a written question: guests vote on the real headline among their inventions', async () => {
  const r = await room(call, ['אבי', 'בתיה', 'גדי', 'דורית']), [avi, batya, gadi, dorit] = r.players;
  await call(`/rooms/${r.code}/start`, { method: 'POST', token: r.host, body: {} });
  const write = firstStep('write'), q = questionOf(steps[write]);
  await store.chanaTransaction('x', (db) => db.prepare('UPDATE rooms SET review_index=? WHERE code=?').bind(write, r.code).run());
  await answer(call, r, avi, q.id, 'חנה מציירת את העננים');
  await answer(call, r, batya, q.id, '  חנה   מציירת את העננים! ');   // the same invention, written differently
  await answer(call, r, gadi, q.id, q.answerHe);                     // wrote the real one
  assert.equal((await answer(call, r, dorit, q.id, 'x'.repeat(81))).status, 409);
  await answer(call, r, dorit, q.id, 'צבע, אור ואמונה');
  let s = await next(call, r, write);
  assert.equal(s.stage.kind, 'vote');
  const options = s.stage.question.options;
  assert.equal(options.length, 3);                                  // real + two distinct inventions
  assert.ok(!JSON.stringify(s).includes('"real"'));
  const real = options.find((o) => normalizeText(o.text) === normalizeText(q.answerHe));
  const aviOption = options.find((o) => o.text.startsWith('חנה מציירת'));
  const doritOption = options.find((o) => o.text === 'צבע, אור ואמונה');
  const aviView = await call(`/rooms/${r.code}`, { token: avi.token });
  assert.equal(aviView.me.ownKey, aviOption.key);
  assert.equal((await answer(call, r, avi, q.id, aviOption.key)).status, 409);      // not your own
  assert.equal((await answer(call, r, gadi, q.id, real.key)).status, 409);          // already wrote it
  await answer(call, r, avi, q.id, real.key);
  await answer(call, r, batya, q.id, doritOption.key);
  await answer(call, r, dorit, q.id, aviOption.key);
  s = await call(`/rooms/${r.code}`, { token: r.host });
  assert.deepEqual(s.players.map((p) => p.answered), [true, true, true, true]);
  s = await next(call, r, write + 1);
  assert.equal(s.stage.kind, 'reveal');
  const points = Object.fromEntries(s.gained.map((g) => [g.name, g.gained]));
  // Avi: found the real one (10) + fooled Dorit (5, shared invention credits both authors).
  assert.deepEqual(points, { 'אבי': 15, 'בתיה': 5, 'גדי': 10, 'דורית': 5 });
  assert.deepEqual(s.reveal.wroteReal, ['גדי']);
  const shown = s.reveal.options.find((o) => o.key === aviOption.key);
  assert.deepEqual(shown.authors, ['אבי', 'בתיה']); assert.deepEqual(shown.voters, ['דורית']);
});

test('skip, late joining, removal, standings with shared ranks and the final results', async () => {
  const r = await room(call, ['רות', 'שי']);
  await call(`/rooms/${r.code}/start`, { method: 'POST', token: r.host, body: {} });
  let s = await call(`/rooms/${r.code}/skip`, { method: 'POST', token: r.host, body: { from: 0 } });
  assert.equal(s.stage.kind, 'intro'); assert.equal(s.stage.round.index, 1);
  const late = crypto.randomUUID();
  const joined = await call(`/rooms/${r.code}/join`, { method: 'POST', body: { playerToken: late, name: 'מאוחר' } });
  assert.equal(joined.status, 200); assert.equal(joined.players.length, 3);
  s = await call(`/rooms/${r.code}/remove`, { method: 'POST', token: r.host, body: { playerId: joined.me.id } });
  assert.equal(s.players.length, 2);
  assert.equal((await call(`/rooms/${r.code}`, { token: late })).status, 403);
  const standings = steps.findIndex((x, i) => i > s.room.step && x.kind === 'standings');
  s = await call(`/rooms/${r.code}/skip`, { method: 'POST', token: r.host, body: { from: s.room.step } });
  assert.equal(s.room.step, standings + 1);
  await store.chanaTransaction('x', (db) => db.prepare('UPDATE rooms SET review_index=? WHERE code=?').bind(standings, r.code).run());
  s = await call(`/rooms/${r.code}`, { token: r.players[0].token });
  assert.equal(s.stage.kind, 'standings'); assert.deepEqual(s.standings.map((p) => p.rank), [1, 1]);
  await store.chanaTransaction('x', (db) => db.prepare('UPDATE rooms SET review_index=? WHERE code=?').bind(steps.length - 1, r.code).run());
  s = await next(call, r, steps.length - 1);
  assert.equal(s.room.phase, 'results'); assert.equal(s.standings.length, 2);
  assert.equal((await call(`/rooms/${r.code}/join`, { method: 'POST', body: { playerToken: crypto.randomUUID(), name: 'אחרי' } })).status, 409);
  assert.equal((await call(`/rooms/${r.code}/next`, { method: 'POST', token: r.players[0].token, body: { from: 0 } })).status, 403);
});

test('the quiz is reachable over HTTP from the /kids/ origin, ahead of the timeline router', async () => {
  const app = createServer({ store, allowedOrigins: ['https://matanbob.com'] });
  const server = app.listen(0); await new Promise((ok) => server.once('listening', ok));
  const base = `http://127.0.0.1:${server.address().port}/api/leaderboards/chana/quiz`;
  try {
    const pre = await fetch(base + '/rooms', { method: 'OPTIONS', headers: { Origin: 'https://matanbob.com', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
    assert.equal(pre.status, 204); assert.match(pre.headers.get('access-control-allow-headers'), /Authorization/);
    const host = crypto.randomUUID();
    const created = await fetch(base + '/rooms', { method: 'POST', headers: { Origin: 'https://matanbob.com', 'Content-Type': 'application/json' }, body: JSON.stringify({ hostToken: host }) });
    assert.equal(created.status, 201);
    const code = (await created.json()).room.code;
    const start = await fetch(`${base}/rooms/${code}/start`, { method: 'POST', headers: { Origin: 'https://matanbob.com', Authorization: 'Bearer ' + host, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(start.status, 200); assert.equal((await start.json()).stage.kind, 'intro');
    const evil = await fetch(base + '/rooms', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ hostToken: crypto.randomUUID() }) });
    assert.equal(evil.status, 403);
    const timeline = await fetch(`http://127.0.0.1:${server.address().port}/api/leaderboards/chana/rooms/123456`);
    assert.equal(timeline.status, 404);   // still answered by the timeline router
    assert.match((await timeline.json()).error, /שש הספרות/);
  } finally { server.close(); }
});
