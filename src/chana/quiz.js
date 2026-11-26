// The second Chana game: a quiz led from the big screen, answered on phones.
// Loaded by app.js when the address has ?quiz. It keeps its own storage keys and
// uses data-quiz attributes, so the timeline game's handlers never react to it.
import './quiz.css';
import qrcode from './qrcode.mjs';

const GAME_URL = new URL('./chana', location.href);
const API_ROOT = (import.meta.env.VITE_LEADERBOARD_API_ORIGIN
  ? new URL('/api/leaderboards/chana', import.meta.env.VITE_LEADERBOARD_API_ORIGIN).href
  : new URL('./api/leaderboards/chana', location.href).href) + '/quiz';
const $ = (s) => document.querySelector(s);
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const get = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
const LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח'];
const btn = (label, action, kind = 'primary', extra = '') => `<button class="${kind}" data-quiz="${action}" ${extra}>${label}</button>`;

let session = null, state = null, pollTimer = null, noticeTimer = null, busy = false, lastSignature = '', pending = null;
const drafts = {};
const url = new URL(location.href);

function toast(message) {
  const n = $('#notice');
  n.textContent = message; n.hidden = false;
  clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { n.hidden = true; }, 5500);
}
async function request(path, { method = 'GET', body, token = session?.token } = {}) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch(API_ROOT + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: controller.signal, cache: 'no-store', credentials: 'omit' });
    const data = await r.json();
    if (!r.ok) { const e = Error(data.error || 'לא הצלחנו להתחבר. נסו שוב.'); e.status = r.status; throw e; }
    return data;
  } catch (e) { if (!e.status) throw Error('אין כרגע חיבור למשחק. נסו שוב בעוד רגע.'); throw e; }
  finally { clearTimeout(timeout); }
}

const brand = () => `<a class="brand" href="${GAME_URL.pathname}" aria-label="חנה גולדברג — דף הבית"><span class="brand-mark">ח</span><span>חנה גולדברג</span></a>`;
const footer = () => `<footer><span>היצירות © חנה גולדברג · <a href="https://www.chanagoldberg.com/" target="_blank" rel="noopener">לאתר האמנית</a></span></footer>`;

// ---------- landing ----------
function home() {
  const host = url.searchParams.has('host'), last = get('chana-quiz-last'), code = url.searchParams.get('quiz') || '';
  document.title = 'חנה גולדברג — החידון';
  app.innerHTML = `<main class="landing q-landing"><div class="landing-copy">${brand()}
    <p class="eyebrow">משחק שני</p><p class="lead">חידון על חנה: השאלה על המסך הגדול,<br>התשובות בטלפון.</p>
    <div class="join-panel">${host
      ? `<h1>ניהול החידון</h1>${btn('פתיחת חידון חדש', 'create')}<a class="text-button q-link" href="?quiz">הצטרפות לחידון</a>`
      : `<h1>הצטרפות לחידון</h1><form id="quiz-join-form"><label>קוד החידון<input name="code" inputmode="numeric" pattern="[0-9]{7}" autocomplete="off" maxlength="7" minlength="7" dir="ltr" placeholder="0000000" value="${esc(/^\d{7}$/.test(code) ? code : '')}" required></label><label>שם<input name="name" autocomplete="given-name" maxlength="30" placeholder="השם שלך" required></label><button class="primary" type="submit">הצטרפות</button><p class="form-error" role="alert"></p></form><a class="text-button q-link" href="?quiz&amp;host">ניהול החידון במסך הגדול</a>`}
      ${last?.code ? `<button class="resume" data-quiz="resume">חזרה לחידון ${esc(last.code)}</button>` : ''}
      <a class="text-button q-link" href="${GAME_URL.pathname}">למשחק הראשון: סידור היצירות</a>
    </div></div><div class="landing-art"><img src="./art/chana/cover.webp" alt="נוף שמיים ומים מתוך יצירותיה של חנה גולדברג"></div></main>${footer()}`;
}

function remember(s) {
  session = s;
  put(`chana-quiz-session-${s.role}-${s.code}`, s); put('chana-quiz-last', s);
  const u = new URL(location); u.search = '?quiz=' + s.code; u.hash = s.role === 'host' ? 'host=' + s.token : '';
  history.replaceState(history.state, '', u);
}
function enter(data, s) {
  remember(s); state = data; lastSignature = ''; render();
  clearInterval(pollTimer); pollTimer = setInterval(poll, 2000);
}
async function poll() {
  if (!session || busy || document.hidden) return;
  try { apply(await request('/rooms/' + session.code)); }
  catch (e) { if (e.status === 403 || e.status === 404) { clearInterval(pollTimer); toast(e.message); } }
}
const order = (s) => (s.room.phase === 'lobby' ? 0 : s.room.phase === 'playing' ? 1 + s.room.step : 1e6);
function apply(data) {
  if (state && order(data) < order(state)) return;     // never step back on a late response
  state = data;
  const sig = signature(data);
  if (sig !== lastSignature) render();
}
function signature(s) {
  if (session.role === 'host') return JSON.stringify([s.room, s.players, s.reveal, s.standings, s.voters]);
  return JSON.stringify([s.room.phase, s.room.step, s.me, s.reveal, s.standings, s.room.phase === 'lobby' ? s.players.length : 0,
    s.stage?.kind === 'vote' ? s.stage.question.options : 0]);
}

// ---------- pieces ----------
function questionBody(q, { big, crop = true }) {
  let html = `<p class="q-prompt">${esc(q.promptHe)}</p>`;
  if (q.quoteHe) html += `<blockquote class="q-quote ${big ? 'big' : ''}">${esc(q.quoteHe)}</blockquote>`;
  if (q.titleHe) html += `<p class="q-title ${big ? 'big' : ''}" dir="auto">${esc(q.titleHe)}</p>`;
  if (q.contextHe) html += `<p class="q-context">${esc(q.contextHe)}</p>`;
  if (crop && q.image && q.crop) html += `<div class="q-crop ${big ? 'big' : ''}" role="img" aria-label="פרט מתוך ציור" style="background-image:url('./${esc(q.image)}');background-size:${esc(q.crop.size)};background-position:${esc(q.crop.position)}"></div>`;
  return html;
}
const progress = (st) => st.question ? `סבב ${st.round.index + 1} מתוך ${st.round.count} · שאלה ${st.question.number} מתוך ${st.question.count}` : `סבב ${st.round.index + 1} מתוך ${st.round.count}`;
function topbar() {
  const st = state.stage;
  return `<header class="topbar q-topbar">${brand()}<div class="session-meta">${st ? `<span>${progress(st)}</span>` : ''}<span class="room-tag" dir="ltr">${esc(state.room.code)}</span>${session.role === 'host' ? `<button class="text-button q-small" data-quiz="fullscreen">מסך מלא</button>` : ''}</div></header>`;
}
const answeredRow = (players) => `<ul class="q-answered">${players.map((p) => `<li class="${p.answered ? 'done' : ''}">${esc(p.name)}</li>`).join('') || '<li>ממתינים למשתתפים</li>'}</ul>`;
const count = (players) => `<span class="q-count"><strong>${players.filter((p) => p.answered).length}</strong> / ${players.length} ענו</span>`;
const standingsList = (list, limit = 99) => `<ol class="q-standings">${list.slice(0, limit).map((p) => `<li${session.role === 'player' && p.id === state.me?.id ? ' class="me"' : ''}><span class="q-rank">${p.rank}</span><span class="q-name">${esc(p.name)}</span><span class="q-score">${p.score}</span></li>`).join('')}</ol>`;

// ---------- host (big screen) ----------
function renderHost(screen) {
  const st = state.stage, room = state.room;
  if (room.phase === 'lobby') {
    const q = qrcode(0, 'M'); q.addData(GAME_URL.origin + GAME_URL.pathname + '?quiz=' + room.code); q.make();
    screen.innerHTML = `<div class="host-heading"><p class="eyebrow">משחק שני · חידון</p><h1>הצטרפות לחידון</h1><p>סרקו בטלפון והכניסו שם.</p></div>
      <div class="lobby-layout"><section class="join-board"><div class="qr">${q.createSvgTag({ cellSize: 5, margin: 12, scalable: true })}</div><span class="muted">או נכנסים עם הקוד</span><strong class="big-code" dir="ltr">${room.code}</strong>
      <div class="button-row">${btn('העתקת קישור', 'copy-join', 'secondary')}${btn('מסך מלא', 'fullscreen', 'secondary')}</div></section>
      <section class="attendance"><div class="section-heading"><h2>משתתפים</h2><span class="count">${state.players.length}</span></div>
      <ul class="players">${state.players.map((p) => `<li><span class="avatar">${esc([...p.name][0])}</span><span class="player-name">${esc(p.name)}</span><button class="remove" data-quiz="remove" data-player="${p.id}" aria-label="הסרת ${esc(p.name)}">×</button></li>`).join('') || '<li class="empty">ממתינים למשתתפים</li>'}</ul>
      ${btn('התחלת החידון', 'start', 'primary wide', state.players.length ? '' : 'disabled')}<p class="small">אפשר להצטרף גם באמצע.</p>
      <button class="text-button" data-quiz="copy-host">העתקת קישור המנחה (לשמור, לא לשתף)</button></section></div>`;
    return;
  }
  if (room.phase === 'results') {
    screen.innerHTML = `<section class="q-stage q-final"><p class="eyebrow">סוף החידון</p><h1>התוצאות</h1>${standingsList(state.standings)}<a class="secondary q-link" href="${GAME_URL.pathname}">לדף הבית</a></section>`;
    return;
  }
  const q = st.question, nav = (label, action = 'next', kind = 'primary') => btn(label, action, kind, `data-from="${room.step}"`);
  if (st.kind === 'intro') {
    screen.innerHTML = `<section class="q-stage q-intro"><p class="q-round-no">סבב ${st.round.index + 1}</p><h1>${esc(st.round.titleHe)}</h1><p class="q-intro-text">${esc(st.round.introHe)}</p>
      <div class="q-controls">${nav('התחלת הסבב')}${nav('דילוג על הסבב', 'skip', 'text-button')}</div></section>`;
  } else if (st.kind === 'open' || st.kind === 'write' || st.kind === 'vote') {
    let answers = '';
    if (st.kind === 'open') answers = `<ol class="q-options">${q.options.map((o, i) => `<li class="q-opt c${i}"><span class="q-letter">${LETTERS[i]}</span><span>${esc(o.text)}</span></li>`).join('')}</ol>`;
    if (st.kind === 'write') answers = `<p class="q-instruction">כתבו בטלפון כותרת משלכם. אחר כך מצביעים.</p>`;
    if (st.kind === 'vote') answers = `<p class="q-instruction">איזו כותרת אמיתית? מצביעים בטלפון.</p><ol class="q-options q-list">${q.options.map((o, i) => `<li class="q-opt c${i % 4}"><span class="q-letter">${LETTERS[i]}</span><span>${esc(o.text)}</span></li>`).join('')}</ol>`;
    const label = st.kind === 'write' ? 'סיום הכתיבה — להצבעה' : 'חשיפת התשובה';
    screen.innerHTML = `<section class="q-stage q-question"><div class="q-layout"><div class="q-visual">${questionBody(q, { big: true })}</div>
      <div class="q-side">${answers}<div class="q-status">${count(state.players)}${answeredRow(state.players)}</div>
      <div class="q-controls">${nav(label)}</div></div></div></section>`;
  } else if (st.kind === 'reveal') {
    const r = state.reveal, gained = state.gained.filter((g) => g.gained > 0);
    let body = '';
    if (q.type === 'choice') {
      body = `<ol class="q-options q-revealed">${q.options.map((o, i) => `<li class="q-opt c${i} ${i === r.answer ? 'right' : 'wrong'}"><span class="q-letter">${i === r.answer ? '✓' : LETTERS[i]}</span><span>${esc(o.text)}</span><small class="q-pickers">${r.picks[i].length ? r.picks[i].map(esc).join(' · ') : '—'}</small></li>`).join('')}</ol>`;

    } else {
      body = `<ol class="q-options q-list q-revealed">${r.options.map((o, i) => `<li class="q-opt ${o.real ? 'right' : 'wrong'} c${i % 4}"><span class="q-letter">${o.real ? '✓' : LETTERS[i]}</span><span>${esc(o.text)}${o.real ? '' : `<small class="q-author">כתבו: ${o.authors.map(esc).join(', ')}</small>`}</span><small class="q-pickers">${o.voters.length ? o.voters.map(esc).join(' · ') : '—'}</small></li>`).join('')}</ol>${r.wroteReal.length ? `<p class="q-instruction">כתבו את הכותרת האמיתית בעצמם: ${r.wroteReal.map(esc).join(', ')}</p>` : ''}`;
    }
    const picture = r.revealImage && q.crop;
    screen.innerHTML = `<section class="q-stage q-question"><div class="q-layout"><div class="q-visual">${questionBody(q, { big: !picture, crop: !picture })}${picture ? `<img class="q-reveal-image" src="./${esc(r.revealImage)}" alt="הציור המלא">` : ''}
      ${r.revealHe ? `<p class="q-source">${esc(r.revealHe)}</p>` : ''}</div>
      <div class="q-side">${body}
      <p class="q-gained">${gained.length ? gained.map((g) => `<span>${esc(g.name)} <b dir="ltr">+${g.gained}</b></span>`).join('') : '<span>הפעם אף אחד</span>'}</p>
      <div class="q-controls">${nav('המשך')}</div></div></div></section>`;
  } else if (st.kind === 'standings') {
    const last = st.round.index + 1 === st.round.count;
    screen.innerHTML = `<section class="q-stage q-final"><p class="eyebrow">אחרי סבב ${st.round.index + 1}: ${esc(st.round.titleHe)}</p><h1>הטבלה</h1>${standingsList(state.standings, 12)}<div class="q-controls">${nav(last ? 'לתוצאות הסופיות' : 'לסבב הבא')}</div></section>`;
  }
}

// ---------- phone ----------
function renderPlayer(screen) {
  const st = state.stage, room = state.room, me = state.me;
  const waiting = (title, text = '') => `<section class="waiting q-wait"><span class="round-icon">✓</span><h1>${title}</h1>${text ? `<p>${text}</p>` : ''}<span class="pill">${esc(me.name)}</span></section>`;
  if (room.phase === 'lobby') { screen.innerHTML = waiting('ממתינים להתחלה', `${state.players.length} משתתפים`); return; }
  if (room.phase === 'results') {
    const mine = state.standings.find((p) => p.id === me.id);
    screen.innerHTML = `<section class="q-phone q-final"><p class="eyebrow">סוף החידון</p><h1>מקום ${mine.rank}</h1><p class="q-big-score">${mine.score} נקודות</p>${standingsList(state.standings, 5)}</section>`;
    return;
  }
  const q = st.question;
  if (st.kind === 'intro') { screen.innerHTML = waiting(`סבב ${st.round.index + 1}: ${esc(st.round.titleHe)}`, esc(st.round.introHe)); return; }
  if (st.kind === 'open') {
    const picked = pending?.step === room.step ? pending.value : me.answer;
    screen.innerHTML = `<section class="q-phone">${questionBody(q, { big: false })}
      <div class="q-buttons">${q.options.map((o, i) => `<button class="q-opt c${i} ${picked === i ? 'picked' : ''}" data-quiz="answer" data-value="${i}" aria-pressed="${picked === i}"><span class="q-letter">${LETTERS[i]}</span><span>${esc(o.text)}</span></button>`).join('')}</div>
      <p class="q-note" role="status">${picked === null || picked === undefined ? 'בחרו תשובה.' : 'נקלט. אפשר לשנות עד החשיפה.'}</p></section>`;
    return;
  }
  if (st.kind === 'write') {
    const sent = me.answer, draft = drafts[q.id] ?? sent ?? '';
    screen.innerHTML = `<section class="q-phone">${questionBody(q, { big: false })}
      <form id="quiz-write-form" class="q-write"><label for="quiz-text">הכותרת שלכם</label><textarea id="quiz-text" name="text" maxlength="80" rows="3" required>${esc(draft)}</textarea>
      <button class="primary" type="submit">${sent ? 'עדכון' : 'שליחה'}</button></form>
      <p class="q-note" role="status">${sent ? `נשלח: „${esc(sent)}”. אפשר לעדכן עד ההצבעה.` : 'עד 80 תווים.'}</p></section>`;
    return;
  }
  if (st.kind === 'vote') {
    if (me.wroteReal) { screen.innerHTML = waiting('כתבת את הכותרת האמיתית!', 'הנקודות שלך בחשיפה.'); return; }
    const picked = pending?.step === room.step ? pending.value : me.answer;
    screen.innerHTML = `<section class="q-phone"><p class="q-prompt">איזו כותרת אמיתית?</p>${q.contextHe ? `<p class="q-context">${esc(q.contextHe)}</p>` : ''}
      <div class="q-buttons q-list">${q.options.map((o, i) => o.key === me.ownKey
        ? `<button class="q-opt own" disabled><span class="q-letter">${LETTERS[i]}</span><span>${esc(o.text)} <small>(שלך)</small></span></button>`
        : `<button class="q-opt c${i % 4} ${picked === o.key ? 'picked' : ''}" data-quiz="answer" data-value="${esc(o.key)}" aria-pressed="${picked === o.key}"><span class="q-letter">${LETTERS[i]}</span><span>${esc(o.text)}</span></button>`).join('')}</div>
      <p class="q-note" role="status">${picked ? 'נקלט. אפשר לשנות עד החשיפה.' : 'בחרו כותרת.'}</p></section>`;
    return;
  }
  if (st.kind === 'reveal') {
    const r = state.reveal, good = me.gained > 0;
    let line = '';
    if (q.type === 'choice') line = me.picked === r.answer ? '' : `התשובה: ${esc(q.options[r.answer].text)}`;
    else line = `הכותרת האמיתית: „${esc(r.answerHe)}”`;
    screen.innerHTML = `<section class="q-phone q-result ${good ? 'good' : 'bad'}"><span class="q-mark">${good ? '✓' : '✗'}</span><h1>${good ? `<bdi dir="ltr">+${me.gained}</bdi>` : 'לא הפעם'}</h1>${line ? `<p>${line}</p>` : ''}<p class="q-big-score">${me.score} נקודות</p></section>`;
    return;
  }
  if (st.kind === 'standings') {
    const mine = state.standings.find((p) => p.id === me.id);
    screen.innerHTML = `<section class="q-phone q-final"><p class="eyebrow">אחרי סבב ${st.round.index + 1}</p><h1>מקום ${mine.rank}</h1><p class="q-big-score">${mine.score} נקודות</p>${standingsList(state.standings, 5)}</section>`;
  }
}

function render() {
  lastSignature = signature(state);
  document.documentElement.classList.toggle('in-game', state.room.phase !== 'results');
  const focusWrite = document.activeElement?.id === 'quiz-text';
  app.innerHTML = topbar() + `<main class="game-main q-main ${session.role === 'host' ? 'host-main q-host' : 'q-player'}" id="screen"></main>` + footer();
  const screen = $('#screen');
  if (session.role === 'host') renderHost(screen); else renderPlayer(screen);
  if (focusWrite) { const t = $('#quiz-text'); t?.focus(); t?.setSelectionRange(t.value.length, t.value.length); }
}

// ---------- actions ----------
async function hostAction(action, body = {}) {
  if (busy) return; busy = true;
  try { apply(await request(`/rooms/${session.code}/${action}`, { method: 'POST', body })); }
  catch (e) { toast(e.message); }
  finally { busy = false; }
}
async function sendAnswer(value) {
  const q = state.stage?.question;
  if (!q) return;
  pending = { step: state.room.step, value }; render();
  try { apply(await request(`/rooms/${session.code}/answer`, { method: 'POST', body: { questionId: q.id, value } })); pending = null; render(); }
  catch (e) { pending = null; toast(e.message); poll(); }
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('הקישור הועתק.'); } catch { toast(text); }
}

async function create() {
  if (busy) return; busy = true;
  const token = crypto.randomUUID();
  try { const data = await request('/rooms', { method: 'POST', body: { hostToken: token }, token: null }); busy = false; enter(data, { code: data.room.code, token, role: 'host' }); }
  catch (e) { busy = false; toast(e.message); }
}
async function resume(s) {
  try { enter(await request('/rooms/' + s.code, { token: s.token }), s); }
  catch (e) { toast(e.message); home(); }
}

// Listeners are attached only when the quiz is the page's game.
function listen() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-quiz]');
    if (!t || t.disabled) return;
    const a = t.dataset.quiz;
    if (a === 'create') create();
    if (a === 'resume') { const last = get('chana-quiz-last'); if (last) resume(last); }
    if (a === 'start') hostAction('start');
    if (a === 'next' || a === 'skip') hostAction(a, { from: Number(t.dataset.from) });
    if (a === 'remove') { const p = state.players.find((x) => x.id === t.dataset.player); if (p && confirm(`להסיר את ${p.name}?`)) hostAction('remove', { playerId: p.id }); }
    if (a === 'answer') sendAnswer(state.stage.kind === 'open' ? Number(t.dataset.value) : t.dataset.value);
    if (a === 'fullscreen') { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}); }
    if (a === 'copy-join') copy(GAME_URL.origin + GAME_URL.pathname + '?quiz=' + state.room.code);
    if (a === 'copy-host') copy(location.href);
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'quiz-text' && state?.stage?.question) drafts[state.stage.question.id] = e.target.value; });
  document.addEventListener('submit', async (e) => {
    if (e.target.id === 'quiz-join-form') {
      e.preventDefault(); if (busy) return;
      const form = e.target, f = new FormData(form), code = String(f.get('code')).trim(), name = String(f.get('name')).trim();
      if (!/^\d{7}$/.test(code)) { form.querySelector('.form-error').textContent = 'קוד החידון מורכב משבע ספרות.'; return; }
      busy = true; const submit = form.querySelector('[type="submit"]'); submit.disabled = true; submit.textContent = 'מצטרפים…';
      const existing = get('chana-quiz-session-player-' + code);
      const token = existing?.token || get('chana-quiz-pending-' + code) || crypto.randomUUID();
      put('chana-quiz-pending-' + code, token);
      try { const data = await request(`/rooms/${code}/join`, { method: 'POST', body: { name, playerToken: token }, token: null }); busy = false; enter(data, { code, token, role: 'player' }); }
      catch (error) { form.querySelector('.form-error').textContent = error.message; submit.disabled = false; submit.textContent = 'הצטרפות'; busy = false; }
    }
    if (e.target.id === 'quiz-write-form') {
      e.preventDefault();
      const text = String(new FormData(e.target).get('text')).trim();
      if (text) { await sendAnswer(text); }
    }
  });
  document.addEventListener('keydown', (e) => {
    if (session?.role !== 'host' || state?.room.phase !== 'playing' || ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (['ArrowLeft', 'PageDown'].includes(e.key)) { e.preventDefault(); hostAction('next', { from: state.room.step }); }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  window.addEventListener('online', poll);
}

export async function startQuiz() {
  listen();
  document.title = 'חנה גולדברג — החידון';
  const code = url.searchParams.get('quiz') || '', hostToken = new URLSearchParams(location.hash.slice(1)).get('host');
  let s = null;
  if (/^\d{7}$/.test(code)) {
    if (hostToken) s = { code, token: hostToken, role: 'host' };
    else s = get('chana-quiz-session-player-' + code) || (get('chana-quiz-pending-' + code) ? { code, token: get('chana-quiz-pending-' + code), role: 'player' } : null);
  }
  if (s) { try { enter(await request('/rooms/' + s.code, { token: s.token }), s); return; } catch (e) { toast(e.message); } }
  home();
}
