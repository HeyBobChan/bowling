// Don's chat brain, against the real cloud-save API over HTTP: `npm test`.
// Canon itself is not involved: the brain is plain text in, plain text out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApi } from '../server/api.mjs';
import { createMemoryStore } from '../server/store-memory.mjs';
import { G, inZone, forCloud } from '../server/engine.mjs';
import { createBrain, codeIn } from '../don/brain.mjs';
import { petClient } from '../don/pet.mjs';
import { memoryStore } from '../don/store.mjs';

const HOUR = 3600e3;
const SITE = 'https://example.test/pet/';
const noon = Date.UTC(2026, 2, 4, 12);
function seeded(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

function petAt(t, patch = {}) {
  G.rng = seeded(5);
  const s = G.newState(t);
  inZone('UTC', () => { G.catchUp(s, t); for (let i = 0; i < G.EGG_TAPS; i++) G.tapEgg(s, t); });
  s.zone = 'UTC';
  s.needs = Object.assign({ food: 60, ego: 60, fun: 60, glow: 60, energy: 70 }, patch.needs);
  delete patch.needs;
  return Object.assign(s, patch);
}

// A game server with one pet in its cloud, and a Don who has not been told about it yet.
async function world(state = petAt(noon), { linked = true } = {}) {
  const api = createApi({ store: createMemoryStore(), proxyKey: 'shared' });
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (!(await api(req, res, pathname))) { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const made = await (await fetch(base + 'api/pets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: forCloud(state) }) })).json();
  const pets = petClient({ baseUrl: base, proxyKey: 'shared', caller: 'don:test' });
  const store = memoryStore(linked ? { key: made.key, conversationId: 'room1' } : {});
  const w = { clock: noon, key: made.key, pets, store, base };
  w.brain = createBrain({ pets, store, siteUrl: SITE, now: () => w.clock });
  w.say = (text, extra) => w.brain.reply(Object.assign({ text, owner: true, direct: true, conversationId: 'room1' }, extra));
  w.cloud = async () => { const got = await pets.get(made.key); return Object.assign(got.state, { rev: got.rev }); };
  w.close = () => new Promise((r) => server.close(r));
  return w;
}

test('codes: recognised when they look like codes, never in ordinary talk', () => {
  const key = 'ABCDE12345FGHJK67890';
  assert.equal(codeIn(key), key);
  assert.equal(codeIn('abcde-12345-fghjk-67890'), key);
  assert.equal(codeIn('  abcde 12345 fghjk 67890 '), key);
  assert.equal(codeIn('link abcde-12345-fghjk-67890'), key);
  assert.equal(codeIn('My code is: ABCDE 12345 FGHJK 67890'), key);
  assert.equal(codeIn('https://matanbob.com/trumpagotchi/#link=ABCDE-12345-FGHJK-67890'), key);
  for (const talk of ['burger', 'feed him a good steak now', 'hello world there again', 'you are the greatest', 'link', 'link please', '12345', '']) assert.equal(codeIn(talk), null, talk);
});

test('strangers and groups get small talk and nothing else', async () => {
  const w = await world();
  try {
    const before = await w.cloud();
    for (const who of [{ owner: false, direct: true }, { owner: true, direct: false }, { owner: false, direct: false }]) {
      for (const text of ['burger', 'status', 'unlink', 'quiet', w.key]) {
        const reply = await w.say(text, who);
        assert.ok(w.brain.text.guest.includes(reply), text + ' → ' + reply);
      }
    }
    assert.equal((await w.cloud()).rev, before.rev);
    assert.equal(w.store.get().key, w.key);
    assert.equal(w.store.get().alerts, true);
  } finally { await w.close(); }
});

test('linking: he explains how, refuses a wrong code, and takes the right one however it is typed', async () => {
  const w = await world(petAt(noon), { linked: false });
  try {
    assert.match(await w.say('hello'), /keeper code/);
    assert.match(await w.say('burger'), new RegExp(SITE.replace(/[.]/g, '\\.')));
    assert.equal(await w.say('link ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ'), w.brain.text.badCode);
    assert.equal(w.store.get().key, null);
    const typed = w.key.toLowerCase().replace(/(.{5})(?=.)/g, '$1-');
    const linked = await w.say('link ' + typed);
    assert.match(linked, /^Linked\./);
    assert.match(linked, /Regular Don, level 1/);
    assert.equal(w.store.get().key, w.key);
    assert.equal(w.store.get().conversationId, 'room1');
    assert.equal(await w.say('unlink'), w.brain.text.unlinked);
    assert.equal(w.store.get().key, null);
    assert.match(await w.say(SITE + '#link=' + typed), /^Linked\./);
  } finally { await w.close(); }
});

test('feeding from the chat feeds the real pet', async () => {
  const w = await world(petAt(noon, { needs: { food: 30 } }));
  try {
    const before = await w.cloud();
    const reply = await w.say('Have a burger!');
    const after = await w.cloud();
    assert.equal(after.stats.burgers, 1);
    assert.equal(Math.round(after.needs.food), 58);
    assert.equal(after.rev, before.rev + 1);
    assert.match(reply, /\[Food 30→58/);
    assert.equal(after.settings, undefined, 'device settings never go to the cloud');
    assert.equal(after.zone, 'UTC');

    await w.say('just feed him');
    assert.equal((await w.cloud()).stats.burgers, 2);
    const cash = (await w.cloud()).cash;
    const steak = await w.say('steak, well done');
    assert.match(steak, /−\$54/);
    assert.equal((await w.cloud()).cash, cash - 54);
    const full = await w.say('more steak');
    assert.equal((await w.cloud()).stats.feeds, 3, 'a full pet is not fed, and says so');
    assert.ok(full.length > 3);
    w.clock += 6 * HOUR; // hungry again
    const salad = await w.say('salad');
    assert.equal((await w.cloud()).tariff, 25);
    assert.match(salad, /Trophy/);
  } finally { await w.close(); }
});

test('praise is whatever you say, and he hears the volume', async () => {
  const w = await world(petAt(noon, { needs: { ego: 20 } }));
  try {
    await w.say('you are great');
    assert.equal(Math.round((await w.cloud()).needs.ego), 32);
    await w.say('You are the GREATEST, a genius, the best!');
    assert.equal(Math.round((await w.cloud()).needs.ego), 66);
    const fired = await w.say('you’re fired');
    const s = await w.cloud();
    assert.equal(Math.round(s.needs.ego), 48);
    assert.equal(s.stats.fired, 1);
    assert.match(fired, /Ego 66→48/);
    await w.say('you are not a loser');
    assert.ok((await w.cloud()).needs.ego >= 48, 'a denial is not an insult');
    assert.equal((await w.cloud()).stats.fired, 1);
  } finally { await w.close(); }
});

test('grooming, sleeping, waking, posting', async () => {
  const w = await world(petAt(noon, { needs: { glow: 30, energy: 50 } }));
  try {
    assert.match(await w.say('hairspray'), /Glow 30→68/);
    await w.say('comb his hair');
    assert.equal((await w.cloud()).stats.grooms, 2);

    const post = await w.say('post something');
    assert.match(post, /^Posted: “.+”\n.+ likes\./);
    const s = await w.cloud();
    assert.equal(s.stats.posts, 1);
    assert.ok(post.includes(s.posts[0].t));

    await w.say('good night');
    assert.equal((await w.cloud()).asleep, true);
    assert.equal(await w.say('burger'), w.brain.text.asleep);
    assert.equal((await w.cloud()).stats.burgers, 0);
    await w.say('wake up');
    assert.equal((await w.cloud()).asleep, false);
  } finally { await w.close(); }
});

test('looking is not touching: status and chatter save nothing', async () => {
  const w = await world();
  try {
    const before = await w.cloud();
    const status = await w.say('status');
    assert.match(status, /Level 1 · Regular Don · \$1\.00M?/);
    assert.match(status, /Food 60 · Ego 60 · Fun 60 · Glow 60 · Energy 70/);
    for (const text of ['hello', 'what is the weather', 'help', 'golf', 'shop']) assert.ok((await w.say(text)).length > 3, text);
    assert.match(await w.say('golf'), /big screen/);
    assert.equal((await w.cloud()).rev, before.rev);
  } finally { await w.close(); }
});

test('the briefing: as a card when Canon offers one, as numbers when it does not', async () => {
  const w = await world();
  try {
    const asked = [];
    const viaCard = await w.say('briefing', { ask: async (request) => { asked.push(request); return { status: 'answered', by: 'owner', choices: ['2'] }; } });
    assert.equal(asked.length, 1);
    assert.equal(asked[0].kind, 'choose');
    assert.deepEqual(asked[0].options.map((o) => o.id), ['1', '2', '3']);
    assert.ok(asked[0].question.length > 10);
    let s = await w.cloud();
    assert.equal(s.stats.briefings, 1);
    assert.equal(s.orders.length, 1);
    assert.match(viaCard, /executive order: No\. \d+, “.+”/);
    assert.equal(await w.say('briefing'), w.brain.text.noBriefing);

    // the next day: no cards, so it is offered as text and answered with a number
    w.clock += 24 * HOUR;
    const offered = await w.say('briefing', { ask: async () => { throw new Error('no cards here'); } });
    assert.match(offered, /1\. .+\n2\. .+\n3\. .+\n\nSay 1, 2 or 3\./);
    assert.equal((await w.cloud()).stats.briefings, 1, 'offering it changes nothing');
    await w.say('3');
    s = await w.cloud();
    assert.equal(s.stats.briefings, 2);
    assert.equal(s.streak.n, 2, 'looking after him from the chat keeps the streak');

    // a card nobody answers leaves the briefing on the desk
    w.clock += 24 * HOUR;
    assert.equal(await w.say('briefing', { ask: async () => ({ status: 'expired' }) }), w.brain.text.briefingWaits);
    assert.equal((await w.cloud()).stats.briefings, 2);
  } finally { await w.close(); }
});

test('if the keeper saved from the page in the same moment, nothing of theirs is lost', async () => {
  const w = await world(petAt(noon, { needs: { food: 30 } }));
  try {
    const real = w.pets.get;
    let raced = false;
    w.pets.get = async (key) => {
      const got = await real(key);
      if (!raced) { // the page saves a new name between Don's read and Don's write
        raced = true;
        const theirs = Object.assign({}, got.state, { name: 'Page Don' });
        assert.equal((await w.pets.put(key, got.rev, theirs)).status, 'ok');
      }
      return got;
    };
    await w.say('burger');
    const s = await w.cloud();
    assert.equal(s.name, 'Page Don');
    assert.equal(s.stats.burgers, 1);
  } finally { await w.close(); }
});

test('a code that stops working is forgotten, and he says so', async () => {
  const w = await world();
  try {
    await fetch(w.base + 'api/pet/key', { method: 'POST', headers: { authorization: 'Bearer ' + w.key } });
    assert.equal(await w.say('burger'), w.brain.text.codeGone);
    assert.equal(w.store.get().key, null);
    assert.equal(await w.say('burger'), w.brain.text.howToLink);
  } finally { await w.close(); }
});

test('he comes back when somebody says sorry', async () => {
  const w = await world(petAt(noon, { sulking: true, neglectH: 40 }));
  try {
    assert.equal(await w.say('burger'), w.brain.text.gone);
    await w.say('I am sorry, please come back');
    const s = await w.cloud();
    assert.equal(s.sulking, false);
    assert.ok(s.ach.comeback);
  } finally { await w.close(); }
});

test('writing first: when he needs something, once, and never when told to be quiet', async () => {
  const w = await world(petAt(noon - 2 * HOUR, { needs: { food: 38 } }));
  try {
    const before = await w.cloud();
    const due = await w.brain.due();
    assert.equal(due.kind, 'want:hungry');
    assert.equal(due.conversationId, 'room1');
    assert.match(due.id, /^[A-Za-z0-9_.:~-]{1,120}$/);
    assert.ok(due.text.length > 5);
    assert.equal((await w.cloud()).rev, before.rev, 'looking at him saves nothing');

    assert.ok(await w.brain.due(), 'not sent yet: still due');
    due.sent();
    assert.equal(await w.brain.due(), null, 'sent: quiet for a while');

    w.store.set({ memory: null });
    assert.equal(await w.say('quiet'), w.brain.text.quiet);
    assert.equal(await w.brain.due(), null);
    assert.equal(await w.say('alerts on'), w.brain.text.loud);
    assert.ok(await w.brain.due());

    w.store.set({ conversationId: null });
    assert.equal(await w.brain.due(), null, 'nowhere to write yet');
  } finally { await w.close(); }
});

// A turn as Canon's kit hands it to a code driver (the fields the brain reads).
const message = (text, isOwner = true, extra) => Object.assign({ id: 'm' + Math.random(), senderId: isOwner ? 'owner1' : 'guest1', senderType: 'human', isOwner, text, contentType: 'text', attachments: [], mentions: [], createdAt: new Date(noon).toISOString() }, extra);
const turnOf = (messages, extra) => ({
  input: Object.assign({ conversationId: 'room9', room: 'direct', sender: { id: 'owner1', type: 'human', isOwner: true }, messages, history: [] }, extra),
  ask: async () => ({ status: 'expired' }),
});

test('a Canon turn: several messages are answered in order, and only the keeper in private reaches the pet', async () => {
  const w = await world(petAt(noon, { needs: { food: 30, glow: 30 } }));
  try {
    const reply = await w.brain.turn(turnOf([message('burger'), message('hairspray')]));
    let s = await w.cloud();
    assert.equal(s.stats.burgers, 1);
    assert.equal(s.stats.grooms, 1);
    assert.match(reply, /Food 30→58[\s\S]+Glow 30→68/);
    assert.equal(w.store.get().conversationId, 'room9', 'he remembers where his keeper talks to him');
    assert.equal(w.store.get().ownerId, 'owner1');

    // somebody else in the room, or a third member: small talk, once
    const guests = await w.brain.turn(turnOf([message('burger', false), message('steak', false)]));
    assert.ok(w.brain.text.guest.includes(guests));
    const facts = { owner: { id: 'owner1' }, members: [{ id: 'owner1' }, { id: 'don' }, { id: 'guest1' }] };
    assert.ok(w.brain.text.guest.includes(await w.brain.turn(turnOf([message('burger')], { roomFacts: facts }))));
    assert.ok(w.brain.text.guest.includes(await w.brain.turn(turnOf([message('burger')], { room: 'group' }))));
    assert.equal((await w.cloud()).stats.burgers, 1);
    assert.equal(w.store.get().conversationId, 'room9');

    assert.equal(await w.brain.turn(turnOf([message('', true, { contentType: 'image', attachments: [{}] })])), w.brain.text.attachment);
    assert.equal(await w.brain.turn(turnOf([message('')])), null, 'nothing to answer is silence');
    // the briefing card goes through the turn's own ask
    const asked = [];
    await w.brain.turn(Object.assign(turnOf([message('briefing')]), { ask: async (r) => { asked.push(r); return { status: 'answered', by: 'owner1', choices: ['1'] }; } }));
    assert.equal(asked.length, 1);
    assert.equal((await w.cloud()).stats.briefings, 1);
  } finally { await w.close(); }
});

test('the game server sees each Don as one caller', async () => {
  const seen = [];
  const pets = petClient({ baseUrl: 'http://game.test/pet', proxyKey: 'k', caller: 'don:a', fetch: async (url, init) => { seen.push({ url: String(url), headers: init.headers }); return new Response('{}', { status: 503 }); } });
  assert.deepEqual(await pets.get('X'), { status: 'busy' });
  assert.equal(seen[0].url, 'http://game.test/pet/api/pet');
  assert.equal(seen[0].headers['x-tg-client-ip'], 'don:a');
  assert.equal(seen[0].headers['x-tg-proxy-key'], 'k');
  const down = petClient({ baseUrl: 'http://game.test/', fetch: async () => { throw new Error('down'); } });
  assert.deepEqual(await down.get('X'), { status: 'offline' });
  assert.deepEqual(await down.put('X', 1, {}), { status: 'offline' });
});
