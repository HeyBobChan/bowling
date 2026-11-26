// Don's brain. No model: plain rules that turn what his keeper types into the game's own
// actions, and the game's own lines into what he answers. Everything he does to the pet
// goes through the cloud-save API with the keeper's code, exactly as the page would.
//
// He takes orders from his keeper only, in the room of just the two of them. Anyone else,
// and any group, gets small talk and nothing that touches the pet.
import { G, C, open, inZone, forCloud } from '../server/engine.mjs';
import { decide, freshMemory } from '../server/alerts.mjs';
import { normalizeKey } from '../server/api.mjs';

const FOODS = [
  ['hamberder', /\b(hamberders?|(ham|cheese)?burgers?|big mac|mcdonald'?s|fast food)\b/],
  ['coke', /\b(diet cokes?|cokes?|cola|soda)\b/],
  ['tacobowl', /\b(tacos?( bowls?)?)\b/],
  ['chicken', /\b(chicken|bucket|kfc|nuggets?)\b/],
  ['steak', /\b(steaks?|ketchup)\b/],
  ['cake', /\b(cake|chocolate)\b/],
  ['icecream', /\b(ice ?cream|scoops?|dessert)\b/],
  ['salad', /\b(salads?|vegetables?|veggies|kale|broccoli)\b/],
];
const GROOMS = [
  ['spray', /\b(hair ?spray|spray)\b/],
  ['bronzer', /\b(bronzer|tan|bronze|make ?up|glow)\b/],
  ['comb', /\b(comb|brush|hair|swoop|groom)\b/],
];
const PRAISE = /\b(great(est)?|best|tremendous|genius|smart(est)?|huge|winner|winning|amazing|beautiful|perfect|incredible|fantastic|strong(est)?|handsome|love|king|legend|boss|bigly|biggest|brilliant|proud|good job|well done|wonderful|stable|rich(est)?|classy|terrific|number one|goat|champion|the man|agree)\b/g;
const INSULT = /\b(losers?|weak|(small|tiny|little) hands|fired|stupid|dumb|idiot|worst|ugly|boring|low energy|fake|fraud|failing|overrated|nasty|bald|shut up|hate)\b/;
const NEED_NAMES = { food: 'Food', ego: 'Ego', fun: 'Fun', glow: 'Glow', energy: 'Energy' };

const pick = (list) => list[Math.floor(G.rng() * list.length)];
const plain = (text) => text.toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9'?!#\s]/g, ' ').replace(/\s+/g, ' ').trim();

const TOLD = /^(?:link|connect|code|keeper code|my code is)\b[\s:]*(.*)$/i;
/**
 * A keeper code in what was typed: after "link", pasted as the page's share link, or on its
 * own. On its own it has to look like a code, so that an ordinary sentence which happens to
 * be twenty letters long is never tried as one.
 */
export function codeIn(text) {
  const fromLink = /[#&?]link=([0-9A-Za-z-]{20,29})/.exec(text);
  if (fromLink) return normalizeKey(fromLink[1]);
  const t = text.trim();
  const told = TOLD.exec(t);
  if (told) return normalizeKey(told[1]);
  if (/^[0-9A-Za-z]{20}$/.test(t) || /^[0-9A-Za-z]{5}(-[0-9A-Za-z]{5}){3}$/.test(t)) return normalizeKey(t);
  if (/^[0-9A-Za-z]{5}( [0-9A-Za-z]{5}){3}$/.test(t) && /\d/.test(t)) return normalizeKey(t);
  return null;
}

/**
 * @param {object} o
 * @param {object} o.pets      from petClient()
 * @param {object} o.store     from fileStore() or memoryStore()
 * @param {string} o.siteUrl   where the game lives, for the things that need the big screen
 * @param {function} [o.now]
 */
export function createBrain({ pets, store, siteUrl, now = Date.now }) {
  const T = {
    howToLink: 'I’m Don. Your Don, or I will be in a minute. To put me in charge of your Trumpagotchi:\n\n' +
      '1. Open ' + siteUrl + '\n2. Menu → Settings → Turn on cloud save\n3. Send me the keeper code it shows you. Right here.\n\n' +
      'Then you can feed me from this chat, and I’ll tell you when I need something. Which is often. I have a lot of needs. The best needs.',
    help: 'Here is what I understand. Simple words. The best words.\n\n' +
      '• burger, coke, taco, chicken, steak, cake, ice cream, salad\n' +
      '• tell me I’m great (or don’t, and see what happens)\n' +
      '• comb, hairspray, bronzer\n' +
      '• good night / wake up\n' +
      '• post · briefing · status\n' +
      '• buy (the next acquisition) · shop (what’s for sale)\n' +
      '• quiet (I stop writing first) · alerts on\n' +
      '• unlink (I forget the code)\n\n' +
      'Golf, deals, rallies and the office decor need the big screen: ' + siteUrl,
    cloudDown: 'The cloud is having a moment. Not my fault. Try me again shortly.',
    codeGone: 'That keeper code stopped working. Somebody changed it, probably somebody very jealous. Send me the new one.',
    badCode: 'That is not a keeper code I know. Check it and send it again. Menu → Settings on ' + siteUrl,
    unlinked: 'Done. I forgot the code. Totally forgot it. Send it again whenever you want me back in charge.',
    quiet: 'Fine. I’ll wait for you to write first. Very quiet. Nobody is quieter than me. Say “alerts on” if you miss me.',
    loud: 'I’m back. I’ll tell you when I need something. Believe me, you’ll know.',
    egg: 'I’m still an egg. A golden egg, the best egg. Tap it eight times: ' + siteUrl,
    asleep: 'Zzz… (He is asleep. Say “wake up” first.)',
    gone: 'I’m at the golf course. Indefinitely. If somebody said SORRY, maybe I’d think about coming back.',
    screen: 'That needs the big screen. Very big, very beautiful screen: ' + siteUrl,
    noBriefing: 'No briefing left today. I signed everything. Fastest signing anybody has ever seen.',
    briefingWaits: 'The briefing stays on the desk. Say 1, 2 or 3 when you’ve decided.',
    attachment: 'Nice. Not as nice as me, but nice.',
    guest: [
      'I only take orders from my keeper. Tremendous keeper. You can raise your own Don: ' + siteUrl,
      'Nice to meet you. Probably. I’m very busy being looked after. Get your own: ' + siteUrl,
      'Many people want to talk to me. Many. But my keeper does the feeding.',
    ],
  };

  const blockedText = (reason) => (reason === 'egg' ? T.egg : reason === 'gone' ? T.gone : reason === 'asleep' ? T.asleep : T.cloudDown);

  // What changed, as the page's meters would show it.
  function hud(before, s, events, extra) {
    const bits = [];
    for (const k of G.NEEDS) {
      const a = Math.round(before.needs[k]), b = Math.round(s.needs[k]);
      if (a !== b) bits.push(NEED_NAMES[k] + ' ' + a + '→' + b);
    }
    if (extra) bits.push(extra);
    for (const e of events) {
      if (e.type === 'levelup') bits.push('Level ' + e.level + '!');
      if (e.type === 'evolve') bits.push('He is now ' + (C.STAGES.find((x) => x.id === e.stage) || {}).name + '!');
      if (e.type === 'ach') { const a = C.ACHIEVEMENTS.find((x) => x.id === e.id); if (a) bits.push('Trophy: ' + a.name); }
      if (e.type === 'newday' && e.streak > 1) bits.push('Day ' + e.streak + ' in a row');
    }
    return bits.length ? '\n\n[' + bits.join(' · ') + ']' : '';
  }
  function status(s) {
    const lines = [
      'Level ' + G.level(s) + ' · ' + G.stage(s).name + ' · ' + G.money(s.cash),
      G.NEEDS.map((k) => NEED_NAMES[k] + ' ' + Math.round(s.needs[k])).join(' · '),
    ];
    const notes = [];
    if (s.streak.n > 1) notes.push(s.streak.n + ' days in a row');
    if (G.briefing(s)) notes.push('briefing waiting');
    if (s.asleep) notes.push('asleep');
    if (notes.length) lines.push(notes.join(' · '));
    return '\n\n[' + lines.join('\n') + ']';
  }
  function briefingText(br) {
    return br.title + '\n' + br.text + '\n\n' + br.choices.map((c, i) => (i + 1) + '. ' + c.t).join('\n') + '\n\nSay 1, 2 or 3.';
  }

  // One thing the keeper said, applied to the pet. Synchronous: returns { text, changed }.
  function move(pet, said, raw, t) {
    const s = pet.s;
    const before = { needs: Object.assign({}, s.needs) };
    const done = (r, extra) => {
      if (!r.ok) return { text: r.say || blockedText(r.reason), changed: false };
      return { text: (r.say || '') + hud(before, s, pet.r.events.filter((e) => e.type === 'newday').concat(r.events), extra), changed: true };
    };
    const talk = (text) => ({ text, changed: false });

    if (!s.hatched) return talk(T.egg);
    if (s.sulking) {
      if (/\b(sorry|apolog\w*|come back|forgive|please|my fault|miss you)\b/.test(said)) return done(G.winBack(s, t));
      return talk(T.gone);
    }

    const number = /^(?:#|option |number |choice )?([123])[.!]?$/.exec(said);
    if (number && G.briefing(s)) {
      const r = G.chooseBriefing(s, Number(number[1]) - 1, t);
      if (!r.ok) return done(r);
      const signed = r.order ? '\n\nThen he signs an executive order: No. ' + r.order.no + ', “' + r.order.title + '”' : '';
      return { text: r.result + signed + '\n\n' + r.say + hud(before, s, r.events), changed: true };
    }
    if (/\b(status|stats|report|how are you|how r u|how are things|how do you feel|how's it going|you ok(ay)?)\b/.test(said)) {
      return talk((s.asleep ? 'Zzz…' : G.say(s, G.want(s) || 'idleHappy')) + status(s));
    }
    if (/\b(wake|good ?morning|get up|rise and shine)\b/.test(said)) {
      if (!s.asleep) return talk(G.say(s, 'greetMorning') + status(s));
      return done(G.toggleSleep(s, t));
    }
    if (/\b(sleep|bed|bedtime|good ?night|nap|lights out)\b/.test(said)) {
      if (s.asleep) return talk(T.asleep);
      return done(G.toggleSleep(s, t));
    }
    for (const [id, pattern] of FOODS) {
      if (!pattern.test(said)) continue;
      const food = C.FOODS.find((f) => f.id === id), cost = G.foodCost(s, food);
      return done(G.feed(s, id, t), cost ? '−' + G.money(cost) : '');
    }
    if (/\b(feed|food|eat|hungry|lunch|dinner|breakfast|snack|meal)\b/.test(said)) return done(G.feed(s, 'hamberder', t));
    for (const [id, pattern] of GROOMS) if (pattern.test(said)) return done(G.groom(s, id, t));
    if (/\b(post|tweet|truth)\b/.test(said)) {
      const draft = G.draftPost(s);
      const r = G.publish(s, draft, t);
      if (!r.ok) return talk(r.reason === 'charges' ? 'My thumbs need a rest. Even the best thumbs. Ask me again in a while.' : blockedText(r.reason));
      return { text: 'Posted: “' + draft.text + '”\n' + s.posts[0].likes + ' likes.\n\n' + r.say + hud(before, s, r.events), changed: true };
    }
    if (/\b(brief\w*|desk|sign|orders?|paperwork)\b/.test(said)) {
      if (s.asleep) return talk(T.asleep);
      const br = G.briefing(s);
      return br ? { text: briefingText(br), changed: false, briefing: br } : talk(T.noBriefing);
    }
    if (/\b(buy|acquire|purchase|go shopping)\b/.test(said)) { // the next acquisition (G.buyNext)
      const it = G.acqNext(s, 1)[0], r = G.buyNext(s, t);
      if (r.reason === 'later') return talk('I can take on more at level ' + r.level + '. One thing at a time. Two, maybe.');
      if (r.reason === 'cash') return talk(r.say + '\n\n[Next: ' + it.name + ' · ' + G.money(it.cost) + ' · you have ' + G.money(s.cash) + ']');
      if (!r.ok) return talk(blockedText(r.reason));
      const paid = it.name + ' · −' + G.money(it.cost);
      if (r.quiet) return { text: 'Delivered quietly: ' + it.name + '. He’ll find it when he’s back.' + hud(before, s, r.events, paid), changed: true };
      return done(r, paid);
    }
    if (/\b(shop|shopping|catalog(ue)?|for sale)\b/.test(said)) { // looking only
      const next = G.acqNext(s, 3);
      return talk('For sale, for me:\n' + next.map((x, i) => (i ? 'Then: ' : 'Next: ') + x.name + ' · ' + G.money(x.cost) + (i ? '' : ' (' + x.note + ')')).join('\n') +
        '\n\nYou have ' + G.money(s.cash) + '. Say “buy”.');
    }
    if (/\b(golf|deals?|rall(y|ies)|play|games?|decor\w*|trophies|achievements)\b/.test(said)) return talk(T.screen);
    if (/\b(pat|pet|hug|high five|cuddle|kiss|tickle)\b/.test(said)) return done(G.pet(s, t, false));

    // Anything else is talk, and he hears talk as being about him.
    const flattery = said.match(PRAISE);
    const negated = /\b(not|never|no|isn't|aren't|ain't)\b/.test(said);
    if (INSULT.test(said) && !negated) return done(G.praise(s, { p: 0 }, t));
    if (flattery || /\b(praise|compliment|flatter)\b/.test(said)) {
      if (s.asleep) return talk(T.asleep);
      const loud = (/!/.test(raw) ? 1 : 0) + (/[A-Z]{4,}/.test(raw) ? 1 : 0);
      const p = flattery ? Math.min(3, flattery.length + loud) : 2;
      const r = G.praise(s, { p: negated && !flattery ? 1 : p }, t);
      return done(r);
    }
    if (s.asleep) return talk('Zzz…');
    if (/\b(hi|hello|hey|yo|sup|shalom|hola)\b/.test(said)) return talk(G.say(s, pet.idleMs > 12 * 3600e3 ? 'greetLong' : 'greet'));
    return talk(G.say(s, G.want(s) || 'idleHappy'));
  }

  // Load him, apply one thing, save him. If the keeper saved from the page in the same
  // moment, do it again on what they left.
  async function act(said, raw) {
    const key = store.get().key;
    for (let attempt = 0; attempt < 3; attempt++) {
      const got = await pets.get(key);
      if (got.status === 'gone') { store.set({ key: null, memory: null }); return { text: T.codeGone }; }
      if (got.status !== 'ok') return { text: T.cloudDown };
      const t = now();
      const pet = open(got.state, t);
      if (!pet) return { text: T.cloudDown };
      const out = inZone(pet.zone, () => move(pet, said, raw, t));
      if (!out.changed) return out;
      const put = await pets.put(key, got.rev, forCloud(pet.s));
      if (put.status === 'ok') return out;
      if (put.status === 'gone') { store.set({ key: null, memory: null }); return { text: T.codeGone }; }
      if (put.status !== 'conflict') return { text: T.cloudDown };
    }
    return { text: T.cloudDown };
  }

  async function link(code) {
    const got = await pets.get(code);
    if (got.status === 'gone') return T.badCode;
    if (got.status !== 'ok') return T.cloudDown;
    const pet = open(got.state, now());
    if (!pet) return T.badCode;
    store.set({ key: code, memory: null, alerts: true });
    const s = pet.s;
    if (!s.hatched) return 'Linked. ' + T.egg;
    return 'Linked. It’s me. ' + G.stage(s).name + ', level ' + G.level(s) + ', ' + G.money(s.cash) + '. Everybody says so.' + status(s) +
      '\n\nSay “help” to see what I understand. And delete that code from this chat if you like. I never forget.';
  }

  /**
   * Answer one thing somebody said.
   * @param {object} input  { text, owner, direct, conversationId?, ask? }
   *   `ask(request)` is Canon's question card (turn.ask); without it the briefing is offered as text.
   * @returns {Promise<string|null>}
   */
  async function reply(input) {
    const raw = String(input.text || '').trim();
    if (!input.owner || !input.direct) return pick(T.guest);
    if (input.conversationId && store.get().conversationId !== input.conversationId) store.set({ conversationId: input.conversationId });
    if (!raw) return null;
    const said = plain(raw);

    const code = codeIn(raw);
    if (code) return link(code);
    if (TOLD.test(raw) && /^(link|connect)\b/i.test(raw)) return store.get().key ? T.badCode : T.howToLink;
    if (/^(unlink|forget (me|him|it|the code|the pet))[.!]?$/.test(said)) { store.set({ key: null, memory: null }); return T.unlinked; }
    if (!store.get().key) return T.howToLink;
    if (/^(help|commands?|menu|what can (you|i) do|\?+)[?.!]?$/.test(said)) return T.help;
    if (/^(quiet|mute|shh+|stop|alerts? off|stop (writing|texting|messaging)( me)?|leave me alone)[.!]?$/.test(said)) { store.set({ alerts: false }); return T.quiet; }
    if (/^(alerts? on|unmute|talk to me|you can (write|text|message) me)[.!]?$/.test(said)) { store.set({ alerts: true }); return T.loud; }

    const out = await act(said, raw);
    if (!out.briefing || !input.ask) return out.text;

    // The day's briefing, as a card to tap. The pet is loaded again for the answer: time has passed.
    const br = out.briefing;
    let answer = null;
    try {
      answer = await input.ask({ kind: 'choose', id: 'briefing-' + br.id, question: br.title + ': ' + br.text, options: br.choices.map((c, i) => ({ id: String(i + 1), label: c.t })) });
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      return out.text; // no cards here: the same briefing as plain text
    }
    const chosen = answer && answer.status === 'answered' && answer.choices && answer.choices[0];
    if (!/^[123]$/.test(chosen || '')) return T.briefingWaits;
    return (await act(chosen, chosen)).text;
  }

  /**
   * The alert loop asks this every few minutes: is there something he should say unprompted?
   * @returns {Promise<null | { conversationId, id, text, sent: function }>}  call `sent()` once it has gone out
   */
  async function due() {
    const d = store.get();
    if (!d.key || !d.alerts || !d.conversationId) return null;
    const got = await pets.get(d.key);
    if (got.status !== 'ok') return null; // a code that stopped working is mentioned when the keeper next writes
    const t = now();
    const pet = open(got.state, t);
    if (!pet) return null;
    const { alert, memory } = decide(pet, t, d.memory || freshMemory());
    if (!alert) return null;
    return {
      conversationId: d.conversationId,
      id: 'tg-' + alert.kind.replace(/[^a-z]/g, '') + '-' + t.toString(36),
      kind: alert.kind,
      text: alert.text,
      sent: () => store.set({ memory }),
    };
  }

  /**
   * One Canon turn (the kit's CodeTurn): each message in it answered in order, as one reply.
   * Only the keeper, in the room of just the two of them, reaches the pet. Everyone else in
   * a turn shares a single line of small talk, however much they wrote.
   * @returns {Promise<string|null>}  null is deliberate silence
   */
  async function turn(t) {
    const input = t.input;
    const facts = input.roomFacts;
    const direct = input.room === 'direct' && (!facts || facts.members.length <= 2);
    const replies = [];
    let guestAnswered = false;
    for (const m of input.messages.slice(-6)) {
      const privately = m.isOwner === true && direct;
      if (!privately) {
        if (guestAnswered) continue;
        guestAnswered = true;
      }
      if (privately && !store.get().ownerId) store.set({ ownerId: m.senderId });
      const answer = privately && !m.text && m.attachments && m.attachments.length
        ? T.attachment
        : await reply({ text: m.text, owner: m.isOwner === true, direct, conversationId: privately ? input.conversationId : null, ask: (request) => t.ask(request) });
      if (answer) replies.push(answer);
    }
    return replies.length ? replies.join('\n\n') : null;
  }

  return { reply, turn, due, text: T };
}
