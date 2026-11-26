// The second Chana game: a quiz led from the big screen. The host moves through a
// fixed list of steps; phones answer the open step. Correct answers, other guests'
// picks and scores reach a browser only once the host reveals that question.
import bank from './chana-quiz.json' with { type: 'json' };

export const rounds = bank.rounds;
export const POINTS = { correct: 10, fooled: 5 };
export const MAX_VOTE_OPTIONS = 8;
export const MAX_TEXT = 80;

// One flat list of steps: a round opens with its title, every question has its
// answering stage(s) and a reveal, and every round closes with the standings.
export const steps = [];
rounds.forEach((round, r) => {
  steps.push({ kind: 'intro', r });
  round.questions.forEach((question, q) => {
    if (question.type === 'write') steps.push({ kind: 'write', r, q }, { kind: 'vote', r, q }, { kind: 'reveal', r, q });
    else steps.push({ kind: 'open', r, q }, { kind: 'reveal', r, q });
  });
  steps.push({ kind: 'standings', r });
});
export const questionOf = (step) => step && step.q !== undefined ? rounds[step.r].questions[step.q] : null;
export const nextRoundStep = (index) => {
  const r = steps[index]?.r;
  const next = steps.findIndex((s, i) => i > index && s.r !== r);
  return next === -1 ? steps.length : next;
};

for (const round of rounds) for (const q of round.questions) {
  if (q.type === 'choice' && !(Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 4 && Number.isInteger(q.answer) && q.options[q.answer] !== undefined)) throw new Error('Bad quiz question ' + q.id);
  if (q.type === 'write' && !q.answerHe) throw new Error('Bad quiz question ' + q.id);
}

// Typed text is compared without niqqud, punctuation, spacing, case or final letters.
const FINAL = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
export const normalizeText = (value) => String(value || '').normalize('NFKC').replace(/[֑-ׇ]/g, '')
  .toLowerCase().replace(/[ךםןףץ]/g, (l) => FINAL[l]).replace(/[^\p{L}\p{N}]/gu, '');
// A short, stable, non-secret label for a text, used as an option key and for ordering.
export const hashKey = (text) => {
  let h = 0x811c9dc5;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'k' + h.toString(36);
};

const answerKey = (qid) => 'q:' + qid, textKey = (qid) => 't:' + qid, voteKey = (qid) => 'v:' + qid;
export const readAnswer = (guesses, step) => {
  const q = questionOf(step);
  if (!q) return null;
  if (step.kind === 'open') return guesses[answerKey(q.id)] ?? null;
  if (step.kind === 'write') return guesses[textKey(q.id)] ?? null;
  if (step.kind === 'vote') return guesses[voteKey(q.id)] ?? null;
  return null;
};

// The options a "write" question is voted on: the real answer and up to seven of the
// guests' inventions, the same for everyone in the room, in a room-specific order.
export function voteOptions(code, q, players) {
  const real = normalizeText(q.answerHe), groups = new Map(), wroteReal = new Set();
  for (const p of players) {
    const text = String(p.guesses[textKey(q.id)] || '').trim(), norm = normalizeText(text);
    if (!norm) continue;
    if (norm === real) { wroteReal.add(p.id); continue; }
    if (!groups.has(norm)) groups.set(norm, { key: hashKey(norm), text, authors: [] });
    groups.get(norm).authors.push(p.id);
  }
  const order = (key) => hashKey(code + ':' + q.id + ':' + key);
  const fakes = [...groups.values()].sort((a, b) => order(a.key).localeCompare(order(b.key))).slice(0, MAX_VOTE_OPTIONS - 1);
  const options = [{ key: hashKey(real), text: q.answerHe, real: true, authors: [] }, ...fakes]
    .sort((a, b) => order(a.key).localeCompare(order(b.key)));
  return { options, wroteReal };
}

// Points from every question already revealed (index < upTo), never from open ones.
export function scores(code, players, upTo) {
  const total = new Map(players.map((p) => [p.id, 0])), gained = new Map(players.map((p) => [p.id, 0]));
  const lastReveal = steps.findLastIndex((s, i) => i < upTo && s.kind === 'reveal');
  steps.forEach((step, i) => {
    if (step.kind !== 'reveal' || i >= upTo) return;
    const q = questionOf(step), add = (id, n) => { total.set(id, total.get(id) + n); if (i === lastReveal) gained.set(id, gained.get(id) + n); };
    if (q.type === 'choice') {
      for (const p of players) if (p.guesses[answerKey(q.id)] === q.answer) add(p.id, POINTS.correct);
    } else {
      const { options, wroteReal } = voteOptions(code, q, players), byKey = new Map(options.map((o) => [o.key, o]));
      for (const id of wroteReal) add(id, POINTS.correct);
      for (const p of players) {
        const picked = byKey.get(p.guesses[voteKey(q.id)]);
        if (!picked) continue;
        if (picked.real) add(p.id, POINTS.correct);
        else for (const author of picked.authors) if (author !== p.id) add(author, POINTS.fooled);
      }
    }
  });
  return { total, gained };
}

export function ranked(code, players, upTo) {
  const { total, gained } = scores(code, players, upTo);
  const list = players.map((p) => ({ id: p.id, name: p.name, score: total.get(p.id), gained: gained.get(p.id) }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'he'));
  let rank = 0;
  return list.map((p, i) => { if (i === 0 || p.score !== list[i - 1].score) rank = i + 1; return { ...p, rank }; });
}

// What a phone may submit at this step. Returns [key, value] for the guesses map.
export function validateAnswer(code, step, body, me, players) {
  const q = questionOf(step);
  if (!q || !['open', 'write', 'vote'].includes(step.kind)) throw new Error('אפשר לענות רק כשהשאלה פתוחה.');
  if (body.questionId !== q.id) throw new Error('השאלה כבר התחלפה.');
  if (step.kind === 'open') {
    if (!Number.isInteger(body.value) || body.value < 0 || body.value >= q.options.length) throw new Error('התשובה אינה תקינה.');
    return [answerKey(q.id), body.value];
  }
  if (step.kind === 'write') {
    const text = typeof body.value === 'string' ? body.value.trim().replace(/\s+/g, ' ') : '';
    if (!text || [...text].length > MAX_TEXT || /[\p{C}]/u.test(text)) throw new Error(`כתבו עד ${MAX_TEXT} תווים.`);
    return [textKey(q.id), text];
  }
  const { options, wroteReal } = voteOptions(code, q, players);
  if (wroteReal.has(me.id)) throw new Error('כתבת את הכותרת האמיתית — אין צורך להצביע.');
  const option = options.find((o) => o.key === body.value);
  if (!option || option.authors.includes(me.id)) throw new Error('אפשר להצביע רק על כותרת של מישהו אחר.');
  return [voteKey(q.id), option.key];
}

const publicRound = (r) => ({ index: r, count: rounds.length, id: rounds[r].id, titleHe: rounds[r].titleHe, introHe: rounds[r].introHe || '' });
const publicQuestion = (step) => {
  const q = questionOf(step), round = rounds[step.r];
  const base = { id: q.id, type: q.type, number: step.q + 1, count: round.questions.length, promptHe: q.promptHe || '' };
  for (const key of ['quoteHe', 'titleHe', 'contextHe', 'image', 'crop']) if (q[key] !== undefined) base[key] = q[key];
  if (q.type === 'choice') base.options = q.options.map((text) => ({ text }));
  return base;
};

// Everything the browser may know at this moment.
export function roomView(room, identity, players) {
  const index = room.review_index, step = room.phase === 'playing' ? steps[index] : null;
  const answered = (p) => step ? readAnswer(p.guesses, step) !== null : false;
  const result = {
    room: { code: room.code, phase: room.phase, step: index, steps: steps.length, expiresAt: room.expires_at },
    role: identity.role,
    players: players.map((p) => ({ id: p.id, name: p.name, answered: answered(p) })),
  };
  let options = null, wroteReal = new Set();
  if (step) {
    result.stage = { kind: step.kind, round: publicRound(step.r) };
    if (questionOf(step)) {
      result.stage.question = publicQuestion(step);
      if (step.kind === 'vote' || step.kind === 'reveal') {
        if (questionOf(step).type === 'write') ({ options, wroteReal } = voteOptions(room.code, questionOf(step), players));
      }
      if (step.kind === 'vote') {
        result.stage.question.options = options.map((o) => ({ key: o.key, text: o.text }));
        result.voters = players.filter((p) => !wroteReal.has(p.id)).length;
        result.players = players.map((p) => ({ id: p.id, name: p.name, answered: wroteReal.has(p.id) || readAnswer(p.guesses, step) !== null }));
      }
    }
  }
  if (identity.role === 'player') {
    const me = players.find((p) => p.id === identity.id);
    result.me = { id: me.id, name: me.name, answer: step ? readAnswer(me.guesses, step) : null };
    if (step?.kind === 'vote') {
      result.me.ownKey = options.find((o) => o.authors.includes(me.id))?.key || null;
      result.me.wroteReal = wroteReal.has(me.id);
    }
  }
  if (step?.kind === 'reveal') {
    const q = questionOf(step), name = new Map(players.map((p) => [p.id, p.name]));
    if (q.type === 'choice') {
      result.reveal = { answer: q.answer, revealHe: q.revealHe || '', revealImage: q.revealImage || q.image || null,
        picks: q.options.map((_, i) => players.filter((p) => p.guesses[answerKey(q.id)] === i).map((p) => p.name)) };
    } else {
      result.reveal = { answerHe: q.answerHe, revealHe: q.revealHe || '', wroteReal: [...wroteReal].map((id) => name.get(id)),
        options: options.map((o) => ({ key: o.key, text: o.text, real: !!o.real, authors: o.authors.map((id) => name.get(id)),
          voters: players.filter((p) => p.guesses[voteKey(q.id)] === o.key).map((p) => p.name) })) };
    }
    const list = ranked(room.code, players, index + 1);
    result.gained = list.map(({ id, name, gained }) => ({ id, name, gained }));
    if (identity.role === 'player') {
      const mine = list.find((p) => p.id === identity.id);
      result.me.gained = mine.gained; result.me.score = mine.score;
      if (q.type === 'choice') result.me.picked = me(players, identity).guesses[answerKey(q.id)] ?? null;
      else result.me.picked = me(players, identity).guesses[voteKey(q.id)] ?? null;
    }
  }
  if (step?.kind === 'standings' || room.phase === 'results') {
    result.standings = ranked(room.code, players, room.phase === 'results' ? steps.length : index + 1).map(({ id, name, score, rank }) => ({ id, name, score, rank }));
  }
  return result;
}
const me = (players, identity) => players.find((p) => p.id === identity.id);
