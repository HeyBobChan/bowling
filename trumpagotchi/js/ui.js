/* Trumpagotchi — the screen: HUD, sheets, speech, modals, and the loop that keeps him alive. */
(function () {
  'use strict';
  const TG = window.TG, C = TG.content, G = TG.game, A = TG.art, S = TG.audio, M = TG.minigames, K = TG.cloud;
  const $ = function (id) { return document.getElementById(id); };
  const params = new URLSearchParams(location.search);
  const DEBUG = params.has('debug');
  // Wiping from the URL is for development only. On a public address a shared link
  // ending in ?reset must not be able to erase a visitor's pet.
  const LOCAL = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  let s = null;
  // More than one copy of the game can be open on one device: two tabs, or a tab and the
  // installed app. They share one save. `s.edits` counts the keeper's changes, and a copy never
  // writes over a save holding more of them: it carries on from that save instead.
  let written = null, writtenEdits = 0; // what this copy saved last
  const canvas = $('scene'), g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  const view = {
    frame: 0, x: 80, face: 1, target: null, think: 30,
    anim: 'idle', animUntil: 0, animItem: null, talkUntil: 0,
    particles: [], mode: 'room', game: null, buttonLit: 0, chatterAt: 0, turkeyX: 30, turkeyDir: 1,
  };
  TG.view = view;

  const NEED_UI = [
    { k: 'food', icon: '🍔', label: 'Food' },
    { k: 'ego', icon: '👑', label: 'Ego' },
    { k: 'fun', icon: '⛳', label: 'Fun' },
    { k: 'glow', icon: '✨', label: 'Glow' },
    { k: 'energy', icon: '⚡', label: 'Energy' },
  ];
  const ACTIONS = [
    { id: 'feed', icon: '🍔', label: 'Feed' },
    { id: 'praise', icon: '👏', label: 'Praise' },
    { id: 'play', icon: '⛳', label: 'Play' },
    { id: 'groom', icon: '💇', label: 'Groom' },
    { id: 'post', icon: '📱', label: 'Post' },
    { id: 'sleep', icon: '💤', label: 'Sleep' },
    { id: 'brief', icon: '📋', label: 'Briefing' },
    { id: 'shop', icon: '🛍️', label: 'Shop' },
  ];

  // ---------------------------------------------------------------- dom helper
  function h(tag, props) {
    const e = document.createElement(tag);
    if (props) for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (k === 'disabled' || k === 'hidden' || k === 'checked' || k === 'value') e[k] = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (let i = 2; i < arguments.length; i++) {
      const kid = arguments[i];
      const list = Array.isArray(kid) ? kid : [kid];
      for (const c of list) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return e;
  }
  // append that skips the nulls left by conditional pieces
  function put(parent) {
    for (let i = 1; i < arguments.length; i++) {
      const list = Array.isArray(arguments[i]) ? arguments[i] : [arguments[i]];
      for (const c of list) if (c != null && c !== false) parent.append(c);
    }
  }
  const now = function () { return G.now(); };
  const clock = function () { return performance.now(); };

  // ---------------------------------------------------------------- speech, toasts, floats
  let bubbleTimer = 0, typeTimer = 0;
  function say(text, o) {
    if (!text) return;
    o = o || {};
    const b = $('bubble'), t = $('bubbleText');
    clearTimeout(bubbleTimer); clearInterval(typeTimer);
    b.hidden = false;
    b.classList.toggle('shout', /[A-Z]{5,}/.test(text));
    b.classList.toggle('humble', !!o.humble);
    b.style.setProperty('--tail', Math.max(12, Math.min(88, (view.mode === 'room' && !s.asleep ? view.x : 80) / 1.6)) + '%');
    $('sr').textContent = text;
    if (reduced) t.textContent = text;
    else {
      let i = 0; t.textContent = '';
      typeTimer = setInterval(function () {
        i += 2; t.textContent = text.slice(0, i);
        if (i % 6 === 0) S.play('blip', i % 3);
        if (i >= text.length) clearInterval(typeTimer);
      }, 28);
    }
    view.talkUntil = clock() + Math.min(text.length * 28 + 400, 4200);
    bubbleTimer = setTimeout(function () { b.hidden = true; }, 2200 + text.length * 58);
  }
  function hush() { clearTimeout(bubbleTimer); clearInterval(typeTimer); $('bubble').hidden = true; view.talkUntil = 0; }

  function toast(text, cls) {
    const el = h('div', { class: 'toast' + (cls ? ' ' + cls : ''), text: text });
    const box = $('toasts');
    box.append(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(function () { el.remove(); }, 3300);
  }
  function floatText(text, cls) {
    const el = h('div', { class: 'float' + (cls ? ' ' + cls : ''), text: text });
    const x = view.mode === 'room' && !s.asleep ? view.x : 80;
    el.style.left = Math.max(14, Math.min(86, x / 1.6 + (Math.random() * 10 - 5))) + '%';
    el.style.top = (cls === 'cash' ? 50 : 40) + '%';
    $('floats').append(el);
    setTimeout(function () { el.remove(); }, 1450);
  }
  function spawn(type, n, o) {
    o = o || {};
    for (let i = 0; i < n; i++) {
      view.particles.push({
        type: type, c: o.colors ? o.colors[i % o.colors.length] : o.c,
        x: (o.x != null ? o.x : view.x) + (Math.random() - 0.5) * (o.spread || 20),
        y: (o.y != null ? o.y : 60) + (Math.random() - 0.5) * (o.spreadY || 10),
        vx: (Math.random() - 0.5) * (o.vx != null ? o.vx : 1), vy: o.vy != null ? o.vy : -0.6, g: o.g || 0,
        life: (o.life || 18) + Math.floor(Math.random() * 8),
      });
    }
    if (view.particles.length > 140) view.particles.splice(0, view.particles.length - 140);
  }
  const CONFETTI = ['#d0182e', '#f7dc7a', '#ffffff', '#3558b8', '#e0b43c'];
  function confetti() { spawn('confetti', 46, { x: 80, y: 10, spread: 150, spreadY: 20, vx: 1.6, vy: 0.9, g: 0.05, life: 46, colors: CONFETTI }); }
  function setAnim(name, ms, item) { view.anim = name; view.animUntil = clock() + (ms || 1600); view.animItem = item || null; view.target = null; }

  // ---------------------------------------------------------------- modals (one at a time)
  const modalQueue = [];
  let modalOpen = false, modalReturnFocus = null;
  function queueModal(build) { modalQueue.push(build); if (!modalOpen) nextModal(); }
  function nextModal() {
    const build = modalQueue.shift();
    const m = $('modal'), card = $('modalCard');
    if (!build) {
      modalOpen = false; m.hidden = true; card.textContent = '';
      if (modalReturnFocus && document.contains(modalReturnFocus)) modalReturnFocus.focus();
      return;
    }
    if (!modalOpen) modalReturnFocus = document.activeElement;
    modalOpen = true; card.textContent = ''; m.hidden = false;
    build(card, nextModal);
    const btn = card.querySelector('button');
    if (btn) btn.focus();
  }
  function heroCanvas(draw) {
    const c = h('canvas', { class: 'hero', width: 44, height: 44 });
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    draw(x);
    return c;
  }
  function heroLook(level) {
    return heroCanvas(function (x) {
      A.R(x, 0, 0, 44, 44, '#142248');
      for (let i = 0; i < 12; i++) { x.save(); x.translate(22, 30); x.rotate((i * Math.PI) / 6); A.R(x, -1, -40, 3, 40, i % 2 ? 'rgba(247,220,122,0.22)' : 'rgba(247,220,122,0.08)'); x.restore(); }
      A.drawBust(x, 21, 66, A.look(level, { term: s.term }), 'smile');
    });
  }

  function showEvolve(stageId, level) {
    queueModal(function (card, done) {
      const st = C.STAGES.find(function (x) { return x.id === stageId; });
      S.play('evolve'); confetti();
      const tierBefore = C.tierForLevel(level - 1), tierNow = C.tierForLevel(level);
      put(card, 
        h('p', { class: 'kicker', text: 'He evolved' }),
        heroLook(level),
        h('h2', { id: 'modalTitle', text: st.name }),
        h('p', { class: 'muted', text: st.blurb }),
        h('p', { class: 'quote', text: C.EVOLVE_LINES[stageId] || '' }),
        tierNow > tierBefore ? h('p', { class: 'muted', text: 'His voice is now: ' + C.TIER_NAMES[tierNow] + '.' }) : null,
        A.sceneFor(level) !== A.sceneFor(Math.max(1, level - 1)) ? h('p', { class: 'muted', text: level >= 100 ? 'There is no outside any more.' : level >= 93 ? 'He has left the planet. He is one.' : level >= 78 ? 'He no longer fits in the office.' : level >= 45 ? 'New office unlocked. It is oval.' : 'New office unlocked. It has a view.' }) : null,
        h('button', { class: 'btn gold', type: 'button', text: 'Tremendous', onclick: function () { done(); say(C.EVOLVE_LINES[stageId]); setAnim('dance', 2600); } })
      );
    });
  }
  function showHatch() {
    queueModal(function (card, done) {
      S.play('evolve'); confetti();
      put(card, 
        h('p', { class: 'kicker', text: 'It hatched' }),
        heroLook(1),
        h('h2', { id: 'modalTitle', text: 'Meet Regular Don' }),
        h('p', { class: 'muted', text: 'Polite. Modest. Brown hair. This will not last.' }),
        h('ul', null,
          h('li', { text: '🍔 Feed him, flatter him, keep him glowing.' }),
          h('li', { text: '📈 The better you care for him, the more tremendous he gets: the hair, the glow, the tie, the vocabulary.' }),
          h('li', { text: '⏰ He keeps living while you are away. Check in.' }),
          h('li', { text: '💰 He comes with a small loan of $1,000,000.' })),
        h('button', { class: 'btn gold', type: 'button', text: 'Let’s go', onclick: function () { done(); say(C.EVOLVE_LINES.regular); } })
      );
    });
  }
  function showRecap(r) {
    const lines = G.recap(s, r);
    if (!lines.length) return;
    queueModal(function (card, done) {
      const hrs = r.awayH, label = hrs >= 48 ? Math.floor(hrs / 24) + ' days' : hrs >= 1 ? Math.floor(hrs) + 'h ' + Math.round((hrs % 1) * 60) + 'm' : Math.round(hrs * 60) + ' minutes';
      put(card, 
        h('p', { class: 'kicker', text: 'While you were away' }),
        h('h2', { id: 'modalTitle', text: label }),
        h('ul', null, lines.map(function (l) { return h('li', { text: l }); })),
        h('button', { class: 'btn gold', type: 'button', text: s.sulking ? 'Oh no' : 'Back to work', onclick: function () { done(); greet(hrs); } })
      );
    });
  }
  function confirmModal(title, text, yes, onYes) {
    queueModal(function (card, done) {
      put(card, 
        h('h2', { id: 'modalTitle', text: title }), h('p', { class: 'muted', text: text }),
        h('button', { class: 'btn red', type: 'button', text: yes, onclick: function () { done(); onYes(); } }),
        h('button', { class: 'btn', type: 'button', text: 'Never mind', onclick: done })
      );
    });
  }

  // ---------------------------------------------------------------- events from the simulation
  function handle(events) {
    let leveled = 0, evolved = null;
    for (const e of events) {
      if (e.type === 'ach') {
        const a = C.ACHIEVEMENTS.find(function (x) { return x.id === e.id; });
        if (a) { toast('🏆 ' + a.name, 'gold'); S.play('ach'); }
      } else if (e.type === 'levelup') leveled = e.level;
      else if (e.type === 'evolve') evolved = e;
      else if (e.type === 'newday') {
        if (e.streak > 1) toast('🔥 Day ' + e.streak + ' in a row: +' + G.money(e.cash), 'gold');
        else if (e.cash > 0) toast('New day: +' + G.money(e.cash), 'gold');
      } else if (e.type === 'woke') { toast('He woke up.'); S.play('wake'); }
      else if (e.type === 'slept') { toast('He fell asleep.'); S.play('sleep'); hush(); }
      else if (e.type === 'sulk') { hush(); closeSheet(); toast('He has left the building.'); S.play('sad'); }
      else if (e.type === 'term') { confetti(); toast('Term ' + G.roman(e.term) + ' begins', 'gold'); }
    }
    if (evolved) showEvolve(evolved.stage, evolved.level);
    else if (leveled) {
      toast('Level ' + leveled + '!', 'gold'); S.play('level');
      spawn('spark', 14, { y: 50, spread: 40, spreadY: 30, vy: -0.4, life: 16 });
      setTimeout(function () { if (!modalOpen && !s.asleep && $('bubble').hidden) say(G.say(s, 'levelUp')); }, 2200);
    }
  }

  // Run an action result through sound, animation, speech and the HUD.
  function react(r, o) {
    o = o || {};
    if (!r.ok) {
      if (r.reason === 'asleep') { toast('Shh. He’s asleep.'); }
      else if (r.reason === 'gone') toast('He’s gone golfing.');
      else if (r.reason === 'egg') toast('Hatch him first.');
      else if (r.reason === 'charges') toast('He’s thinking of the next one.');
      else { if (r.say) say(r.say); setAnim(r.anim || 'no', 1300); }
      S.play('no');
      return false;
    }
    if (r.anim) setAnim(r.anim, o.ms || 1900, r.item);
    if (r.say) say(r.say);
    S.play(o.sound || 'ok');
    if (r.xp > 0.5) floatText('+' + Math.round(r.xp) + ' ★');
    else if (r.xp < -0.5) floatText(Math.round(r.xp) + ' ★', 'bad');
    if (r.cash > 0) floatText('+' + G.money(r.cash), 'cash');
    if (o.fx) o.fx();
    handle(r.events);
    refreshHud();
    dirty();
    persist();
    return true;
  }

  // ---------------------------------------------------------------- HUD
  function buildHud() {
    const needs = $('needs');
    NEED_UI.forEach(function (n) {
      needs.append(h('div', { class: 'need', id: 'need-' + n.k, role: 'meter', 'aria-label': n.label, 'aria-valuemin': 0, 'aria-valuemax': 100 },
        h('div', { class: 'need-top' }, h('span', { class: 'need-icon', 'aria-hidden': 'true', text: n.icon }), h('span', { class: 'need-val', id: 'needv-' + n.k })),
        h('div', { class: 'bar' }, h('i', { id: 'needf-' + n.k })),
        h('span', { class: 'need-name', id: 'needn-' + n.k, text: n.label })));
    });
    const acts = $('actions');
    ACTIONS.forEach(function (a) {
      acts.append(h('button', { class: 'act', id: 'act-' + a.id, type: 'button', onclick: function () { S.unlock(); onAction(a.id); } },
        h('span', { class: 'act-icon', 'aria-hidden': 'true', id: 'acti-' + a.id, text: a.icon }),
        h('span', { class: 'act-label', id: 'actl-' + a.id, text: a.label }),
        h('span', { class: 'badge', id: 'badge-' + a.id, hidden: true })));
    });
  }
  function needClass(v) { return v < 25 ? 'low' : v < 50 ? 'mid' : ''; }
  function refreshHud() {
    const lv = G.level(s), st = G.stage(s), mood = G.mood(s);
    document.body.dataset.hatched = s.hatched ? '1' : '0';
    document.body.dataset.form = s.hatched && !s.sulking ? lookNow(now()).form : 'man'; // the page itself turns gold at the very end
    $('cash').textContent = G.money(s.cash);
    $('stageLine').textContent = s.hatched ? s.name + ' · ' + st.name + (s.term > 1 ? ' · Term ' + G.roman(s.term) : '') : st.name;
    $('lvl').textContent = 'LV ' + lv;
    $('tierName').textContent = C.TIER_NAMES[G.tier(s)];
    const pct = G.progress(s) * 100;
    $('xpFill').style.width = pct.toFixed(1) + '%';
    $('xpBar').setAttribute('aria-valuenow', Math.round(pct));
    $('runAgainBtn').hidden = !G.canRunAgain(s);
    $('linkBtn').hidden = !(K.available === true && !K.linked() && !s.hatched);
    NEED_UI.forEach(function (n) {
      const v = Math.round(s.needs[n.k]);
      const box = $('need-' + n.k);
      box.className = 'need ' + needClass(v);
      box.setAttribute('aria-valuenow', v);
      $('needv-' + n.k).textContent = v;
      $('needf-' + n.k).style.width = v + '%';
      $('needn-' + n.k).textContent = n.k === 'energy' && v < 25 ? 'Low energy!' : n.label;
    });
    const br = G.briefing(s);
    $('badge-brief').hidden = !br; $('badge-brief').textContent = '!';
    $('badge-post').hidden = !(s.postCharges > 0); $('badge-post').textContent = s.postCharges;
    $('actl-sleep').textContent = s.asleep ? 'Wake' : 'Sleep';
    $('acti-sleep').textContent = s.asleep ? '☀️' : '💤';
    const off = s.asleep || s.sulking;
    ACTIONS.forEach(function (a) { $('act-' + a.id).setAttribute('aria-disabled', off && a.id !== 'sleep' && a.id !== 'shop' ? 'true' : 'false'); });
    // chips on the screen
    const chips = $('chips'); chips.textContent = '';
    if (view.mode !== 'room') return;
    if (mood === 'gone') chips.append(h('span', { class: 'chip warn', text: 'Gone golfing' }));
    else if (mood === 'asleep') chips.append(h('span', { class: 'chip', text: 'Asleep' }));
    else if (mood === 'humble') chips.append(h('span', { class: 'chip warn', text: 'Becoming humble!' }));
    if (s.hatched && s.streak.n > 1) chips.append(h('span', { class: 'chip gold', text: '🔥 ' + s.streak.n }));
    const season = C.seasonFor(new Date(now()));
    if (season) chips.append(h('span', { class: 'chip', text: C.SEASONS[season].name }));
    canvas.setAttribute('aria-label', describe());
  }
  function describe() {
    if (!s.hatched) return 'A golden egg on a cushion. Tap it to hatch.';
    const mood = G.mood(s);
    const m = { gone: 'He has gone golfing and left a note.', asleep: A.hasRoom(sceneNow()) ? 'He is asleep in bed.' : 'He is asleep.', humble: 'He looks deflated and oddly reasonable.', angry: 'He looks angry.', sad: 'He looks unhappy.', happy: 'He looks very pleased with himself.', ok: 'He is standing in his office.' }[mood];
    const what = G.level(s) > 50 && mood !== 'humble' && mood !== 'gone' ? G.stage(s).blurb + ' ' : ''; // past the presidency, say what he is
    return s.name + ', level ' + G.level(s) + ', ' + G.stage(s).name + '. ' + what + m;
  }

  // ---------------------------------------------------------------- sheets
  let sheet = null; // { id, title, render, onClose }
  function openSheet(id, title, render, onClose) {
    if (sheet && sheet.onClose) sheet.onClose();
    sheet = { id: id, title: title, render: render, onClose: onClose };
    $('sheetTitle').textContent = title;
    $('sheet').hidden = false;
    drawSheet();
    $('sheetBody').scrollTop = 0;
    $('sheetClose').focus({ preventScroll: true });
  }
  function drawSheet() {
    if (!sheet) return;
    const body = $('sheetBody');
    const top = body.scrollTop;
    body.textContent = '';
    sheet.render(body);
    body.scrollTop = top;
  }
  function closeSheet() {
    if (!sheet) return;
    const sh = sheet; sheet = null;
    $('sheet').hidden = true;
    if (sh.onClose) sh.onClose();
    const btn = $('act-' + sh.id);
    if (btn) btn.focus({ preventScroll: true });
  }
  function meters(keys) {
    return h('div', { class: 'meters' }, keys.map(function (k) {
      const n = NEED_UI.find(function (x) { return x.k === k; }), v = Math.round(s.needs[k]);
      const bar = h('i'); bar.style.width = v + '%';
      return h('div', { class: 'meter ' + needClass(v) }, h('div', { class: 'meter-top' }, h('span', { text: n.icon + ' ' + n.label }), h('b', { text: v })), h('div', { class: 'bar' }, bar));
    }));
  }
  function fxText(o) {
    const out = [];
    NEED_UI.forEach(function (n) { if (o[n.k]) out.push(n.icon + (o[n.k] > 0 ? '+' : '') + o[n.k]); });
    return out.join('  ');
  }

  function sheetFeed(body) {
    put(body, meters(['food', 'energy']));
    put(body, h('div', { class: 'list' }, C.FOODS.map(function (f) {
      const cost = G.foodCost(s, f);
      return h('button', { class: 'item', type: 'button', onclick: function () {
        react(G.feed(s, f.id, now()), { sound: 'eat', fx: function () { const m = A.mouth(lookNow(now()), view.x); spawn('crumb', 8, { y: m[1], spread: 10, vy: 0.5, g: 0.08, life: 12, x: m[0] + 6 * view.face }); } });
        drawSheet();
      } },
        h('span', { class: 'item-icon', 'aria-hidden': 'true', text: f.icon }),
        h('span', { class: 'item-main' }, h('b', { text: f.name }), h('small', { text: f.note }), h('span', { class: 'fx', text: fxText(f) + (f.xp ? '  ★' + f.xp : '') })),
        h('span', { class: 'price' + (cost > s.cash ? ' poor' : '') }, cost ? G.money(cost) : 'FREE', f.tariff && s.tariff ? h('small', { text: s.tariff + '% tariff' }) : null));
    })));
  }

  let praiseOpts = null;
  function sheetPraise(body) {
    if (!praiseOpts) praiseOpts = G.praiseOptions();
    put(body, meters(['ego']));
    put(body, h('p', { class: 'muted', text: 'Tell him something. Bigger is better. Honesty is a risk.' }));
    put(body, h('div', { class: 'list' }, praiseOpts.map(function (opt) {
      return h('button', { class: 'choice quote', type: 'button', text: opt.t, onclick: function () {
        const good = opt.p > 0;
        react(G.praise(s, opt, now()), { sound: good ? 'ok' : 'no', fx: function () { if (good) spawn('heart', 3 + opt.p * 2, { y: 54, spread: 30, vy: -0.7, life: 20 }); else spawn('anger', 3, { y: 50, spread: 24, vy: -0.3 }); } });
        praiseOpts = G.praiseOptions();
        drawSheet();
      } });
    })));
  }

  function sheetGroom(body) {
    put(body, meters(['glow']));
    put(body, h('div', { class: 'list' }, C.GROOM.map(function (it) {
      return h('button', { class: 'item', type: 'button', onclick: function () {
        react(G.groom(s, it.id, now()), { sound: it.id === 'comb' ? 'ok' : 'spray', ms: 2000, fx: function () {
          if (it.id === 'spray') spawn('mist', 16, { y: 50, spread: 34, spreadY: 14, vy: -0.2, life: 16 });
          spawn('spark', 6, { y: 52, spread: 30, spreadY: 16, vy: -0.3 });
        } });
        drawSheet();
      } },
        h('span', { class: 'item-icon', 'aria-hidden': 'true', text: it.icon }),
        h('span', { class: 'item-main' }, h('b', { text: it.name }), h('small', { text: it.note }), h('span', { class: 'fx', text: fxText(it) })),
        h('span', { class: 'price', text: 'FREE' }));
    })));
  }

  let draft = null;
  function avatar() {
    const c = h('canvas', { class: 'post-avatar', width: 30, height: 30 });
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    A.R(x, 0, 0, 30, 30, '#142248');
    A.drawBust(x, 14, 58, A.look(G.level(s), { term: s.term }), 'pout');
    return c;
  }
  function postCard(text, meta, small) {
    return h('div', { class: 'post' + (small ? ' small' : '') },
      h('div', { class: 'post-head' }, avatar(), h('div', null, h('div', { class: 'post-name', text: s.name }), h('div', { class: 'post-handle', text: '@real' + s.name.replace(/[^A-Za-z0-9]/g, '') }))),
      h('p', { class: 'post-text', text: text }),
      meta ? h('div', { class: 'post-meta' }, meta.map(function (m) { return h('span', { text: m }); })) : null);
  }
  function ago(t) {
    const m = Math.max(0, Math.round((now() - t) / 60e3));
    return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.floor(m / 60) + 'h ago' : Math.floor(m / 1440) + 'd ago';
  }
  function sheetPost(body) {
    if (!draft) draft = G.draftPost(s);
    const left = s.postCharges, wait = G.nextPostIn(s, now());
    put(body, h('p', { class: 'muted', text: left > 0 ? 'He has drafted something. ' + left + ' of 3 posts ready.' : 'He is out of material. Next one in ' + Math.ceil(wait / 60e3) + ' min.' }));
    put(body, postCard(draft.text, ['Draft']));
    put(body, h('div', { class: 'row' },
      h('button', { class: 'btn gold', type: 'button', disabled: left < 1, text: 'Post it', onclick: function () {
        const d = draft;
        if (react(G.publish(s, d, now()), { sound: 'coin' })) { draft = G.draftPost(s); spawn('spark', 8, { y: 50, spread: 30 }); }
        drawSheet();
      } }),
      h('button', { class: 'btn', type: 'button', text: 'Redraft', onclick: function () { draft = G.draftPost(s); S.play('tap'); drawSheet(); } })));
    if (s.posts.length) {
      put(body, h('p', { class: 'muted', text: 'His feed' }));
      put(body, h('div', { class: 'list' }, s.posts.slice(0, 12).map(function (p) { return postCard(p.t, [(p.night ? '🌙 3 AM · ' : '') + ago(p.at), '♥ ' + p.likes], true); })));
    }
  }

  function delivered(r) { if (r.ok && r.quiet) toast(r.quiet === 'asleep' ? 'Delivered quietly. He’ll find it when he wakes up.' : 'Delivered. It’ll be here when he’s back.'); }
  function sheetShop(body) {
    put(body, h('div', { class: 'card center' }, h('div', { class: 'big-num', text: G.money(s.cash) }), h('p', { class: 'muted', text: 'Licensing income: ' + G.money(G.incomePerHour(s)) + ' / hour, even while you are away.' })));
    // Acquisitions: the shop that never runs out. The next one can be bought; two more are shown.
    const owned = G.owned(s), next = G.acqNext(s, 3);
    put(body, h('h3', { class: 'sheet-h', text: 'Acquisitions' }));
    put(body, h('p', { class: 'muted', id: 'acqLine', text: (owned ? 'He owns ' + owned.toLocaleString('en-US') + (owned === 1 ? ' thing' : ' things') + ', worth ' + G.money(s.stats.acqSpent) + '. ' : '') + 'Each one pays 1% more income, for good. There is always something else.' }));
    put(body, h('div', { class: 'list' }, next.map(function (it, i) {
      const level = G.acqLevel(s, i), later = level > G.level(s);
      const main = h('span', { class: 'item-main' }, h('b', { text: it.name }), h('small', { text: it.note }), h('span', { class: 'fx', text: it.kind + ' · +1% income' }));
      const price = h('span', { class: 'price' + (it.cost > s.cash ? ' poor' : '') }, G.money(it.cost), later ? h('small', { text: 'AT LEVEL ' + level }) : null);
      if (i > 0) return h('div', { class: 'item then', 'aria-label': 'After that: ' + it.name + ', ' + G.money(it.cost) }, h('span', { class: 'item-icon', 'aria-hidden': 'true', text: it.icon }), main, price);
      return h('button', { class: 'item', type: 'button', id: 'acqBuy', onclick: function () {
        const r = G.buyNext(s, now());
        if (r.reason === 'later') toast('He can take on more at level ' + r.level + '. One thing at a time. Two, maybe.');
        react(r, { sound: 'coin', ms: 2400, fx: r.quiet ? null : confetti });
        delivered(r);
        drawSheet();
      } }, h('span', { class: 'item-icon', 'aria-hidden': 'true', text: it.icon }), main, price);
    })));
    // the office: twelve pieces, each with a perk; the ones he has go to the bottom
    put(body, h('h3', { class: 'sheet-h', text: 'For the office' }));
    const decor = C.DECOR.filter(function (d) { return s.decor.indexOf(d.id) < 0; }).concat(C.DECOR.filter(function (d) { return s.decor.indexOf(d.id) >= 0; }));
    if (s.decor.length >= C.DECOR.length) { put(body, h('p', { class: 'muted', text: 'Every piece of office decor: owned. Gold everything.' })); return; }
    put(body, h('div', { class: 'list' }, decor.map(function (d) {
      const owned = s.decor.indexOf(d.id) >= 0;
      return h('button', { class: 'item' + (owned ? ' owned' : ''), type: 'button', disabled: owned, onclick: function () {
        const r = G.buyDecor(s, d.id, now());
        react(r, { sound: 'coin', ms: 2400, fx: r.quiet ? null : confetti });
        delivered(r);
        drawSheet();
      } },
        h('span', { class: 'item-icon', 'aria-hidden': 'true', text: owned ? '✅' : '🖼️' }),
        h('span', { class: 'item-main' }, h('b', { text: d.name }), h('small', { text: d.note }), h('span', { class: 'fx', text: d.perk })),
        h('span', { class: 'price' + (owned ? ' owned' : d.cost > s.cash ? ' poor' : ''), text: owned ? 'OWNED' : G.money(d.cost) }));
    })));
  }

  let briefResult = null;
  function untilMidnight() {
    const d = new Date(now()), m = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - d.getTime();
    return Math.floor(m / 3600e3) + 'h ' + Math.floor((m % 3600e3) / 60e3) + 'm';
  }
  function orderCard(o) {
    return h('div', { class: 'order' }, h('div', { class: 'order-no', text: 'Executive Order No. ' + o.no.toLocaleString('en-US') }), h('h3', { text: o.title }), h('p', { text: o.note }), h('span', { class: 'order-sig', 'aria-label': 'Signed', text: 'Dmmmmmmld Mmmm' }));
  }
  function sheetBrief(body) {
    if (briefResult) {
      const r = briefResult;
      put(body, h('div', { class: 'card' }, h('p', { text: r.result })));
      if (r.order) { put(body, h('p', { class: 'muted', text: 'Then he signed something:' })); put(body, orderCard(r.order)); }
      else if (r.bonus) put(body, h('p', { class: 'muted', text: 'Every order is signed. He took a ' + G.money(r.bonus) + ' consulting fee instead.' }));
      put(body, h('p', { class: 'muted center', text: 'Orders collected: ' + s.orders.length + ' of ' + C.ORDERS.length + '. Next briefing in ' + untilMidnight() + '.' }));
      put(body, h('button', { class: 'btn gold', type: 'button', text: 'Done', onclick: closeSheet }));
      return;
    }
    const br = G.briefing(s);
    if (!br) {
      put(body, h('div', { class: 'card center' }, h('h3', { text: 'Briefing complete' }), h('p', { class: 'muted', text: 'He has been briefed. He retained some of it. Next one in ' + untilMidnight() + '.' })));
      put(body, h('p', { class: 'muted center', text: '🔥 ' + s.streak.n + '-day streak · ' + s.orders.length + ' of ' + C.ORDERS.length + ' orders signed' }));
      return;
    }
    put(body, h('div', { class: 'card' }, h('h3', { text: br.title }), h('p', { text: br.text })));
    put(body, h('div', { class: 'list' }, br.choices.map(function (ch, i) {
      return h('button', { class: 'choice', type: 'button', text: ch.t, onclick: function () {
        const r = G.chooseBriefing(s, i, now());
        if (react(r, { sound: 'coin', ms: 3200 })) briefResult = r;
        drawSheet();
      } });
    })));
  }

  // ---- play
  function sheetPlay(body) {
    put(body, meters(['fun', 'energy']));
    const games = [
      { id: 'golf', icon: '⛳', name: 'Club Championship', note: 'Three putts. Stop the meter on the green mark.', run: startGolf },
      { id: 'deal', icon: '🤝', name: 'Make a Deal', note: 'Demand more until they walk. Or just before.', run: startDeal },
      { id: 'rally', icon: '📣', name: 'Hold a Rally', note: 'Eight seconds. Cheer as fast as you can.', run: startRally },
    ];
    put(body, h('div', { class: 'list' }, games.map(function (gm) {
      return h('button', { class: 'item', type: 'button', onclick: function () {
        const ok = G.canPlay(s, gm.id);
        if (!ok.ok) { react({ ok: false, reason: ok.reason, say: ok.say }); return; }
        S.play('tap'); gm.run();
      } },
        h('span', { class: 'item-icon', 'aria-hidden': 'true', text: gm.icon }),
        h('span', { class: 'item-main' }, h('b', { text: gm.name }), h('small', { text: gm.note })),
        h('span', { class: 'price' + (s.needs.energy < G.COST[gm.id] ? ' poor' : ''), text: '⚡' + G.COST[gm.id] }));
    })));
  }
  function endGame() { view.mode = 'room'; view.game = null; view.particles.length = 0; refreshHud(); }
  function enterGame(mode, game) { hush(); view.particles.length = 0; view.mode = mode; view.game = game; refreshHud(); }
  function resultCard(body, title, r, extra) {
    put(body, h('div', { class: 'card center' }, h('h3', { text: title }), extra ? h('p', { text: extra }) : null,
      h('p', { class: 'muted', text: '+' + Math.round(r.xp) + ' tremendousness' + (r.cash > 0 ? ' · +' + G.money(r.cash) : '') })));
    put(body, h('div', { class: 'row' },
      h('button', { class: 'btn gold', type: 'button', text: 'Again', onclick: function () { openSheet('play', 'Play', sheetPlay); } }),
      h('button', { class: 'btn', type: 'button', text: 'Done', onclick: closeSheet })));
  }

  function startGolf() {
    const game = new M.Golf(A.look(G.level(s), { term: s.term, person: true }), G.tier(s));
    enterGame('golf', game);
    let result = null;
    game.onEvent = function (ev) {
      if (ev === 'sunk') S.play('level'); else if (ev === 'miss') S.play('no');
      if (ev === 'done') { result = G.finishGolf(s, game.holed, now()); endGame(); react(result, { sound: game.holed ? 'ach' : 'sad', ms: 2600 }); }
      drawSheet();
    };
    const swing = function () { if (game.swing()) { S.play('swing'); drawSheet(); } };
    game.tap = swing;
    openSheet('play', 'Club Championship', function (body) {
      if (result) {
        const big = G.tier(s) >= 2;
        return resultCard(body, game.holed + ' of 3 holes', result, game.holed === 3 ? 'A perfect round. He will tell everyone.'
          : game.holed ? (big ? 'He is reporting it as 3 of 3.' : 'Not bad. He is quietly pleased.') : (big ? 'He is reporting it as a win.' : 'He says he will practice.'));
      }
      put(body, h('p', { class: 'muted center', text: 'Hole ' + game.hole + ' of 3. Stop the marker on the green mark.' }));
      put(body, h('button', { class: 'btn gold big', id: 'gameBtn', type: 'button', disabled: game.phase !== 'aim', text: 'Swing', onclick: swing }));
      put(body, h('p', { class: 'muted center', text: 'You can also tap the screen.' }));
      const b = $('gameBtn'); if (b && !b.disabled) b.focus({ preventScroll: true });
    }, function () { if (view.game === game) { endGame(); } });
  }

  function startRally() {
    const game = new M.Rally(A.look(G.level(s), { term: s.term, person: true }), G.tier(s));
    enterGame('rally', game);
    let result = null;
    game.onEvent = function (ev) {
      if (ev === 'done') { result = G.finishRally(s, game.taps, now()); endGame(); react(result, { sound: 'ach', ms: 2800, fx: confetti }); drawSheet(); }
    };
    const cheer = function () { if (game.tap()) { S.play('cheer'); const c = $('cheerCount'); if (c) c.textContent = game.taps; } };
    game.tap2 = cheer;
    openSheet('play', 'Hold a Rally', function (body) {
      if (result) return resultCard(body, 'The rally is over', result, 'Actual attendance: ' + result.real.toLocaleString('en-US') + '. ' +
        (result.claimed === result.real ? 'He reported the real number. He is still honest. For now.' : 'Officially: ' + result.claimed.toLocaleString('en-US') + '.'));
      put(body, h('div', { class: 'big-num', id: 'cheerCount', text: game.taps }));
      put(body, h('button', { class: 'btn red big', id: 'gameBtn', type: 'button', text: 'Cheer!', onclick: cheer, onkeydown: function (e) { if (e.repeat) e.preventDefault(); } }));
      put(body, h('p', { class: 'muted center', text: 'Tap as fast as you can. The clock starts on your first cheer.' }));
      $('gameBtn').focus({ preventScroll: true });
    }, function () { if (view.game === game) endGame(); });
  }

  function startDeal() {
    const deal = new M.Deal(s);
    let result = null;
    const finish = function () {
      result = G.finishDeal(s, deal.won, deal.raises, deal.offer, now());
      react(result, { sound: deal.won ? 'coin' : 'sad', ms: 2600, fx: deal.won ? function () { spawn('coin', 14, { y: 40, spread: 60, vy: 0.8, g: 0.06, life: 30 }); } : null });
      drawSheet();
    };
    openSheet('play', 'Make a Deal', function (body) {
      if (result) return resultCard(body, deal.won ? 'Deal closed' : 'They walked out', result, deal.won ? G.money(deal.offer) + ' for ' + deal.item + '.' : G.tier(s) >= 2 ? 'No deal. He says he walked out first.' : 'No deal. He feels bad about pushing.');
      put(body, h('div', { class: 'card center' },
        h('p', { class: 'muted', text: deal.buyer + ' wants to buy ' + deal.item + '.' }),
        h('div', { class: 'big-num', text: G.money(deal.offer) }),
        h('p', { class: 'muted', text: deal.raises ? 'Up from ' + G.money(deal.first) + ' after ' + deal.raises + (deal.raises === 1 ? ' demand.' : ' demands.') : 'Their opening offer.' })));
      const pips = [];
      for (let i = 0; i < deal.max; i++) pips.push(h('span', { class: 'pip' + (i < deal.patience ? '' : ' off') }));
      put(body, h('div', null, h('p', { class: 'muted center', text: 'Their patience' }), h('div', { class: 'pips', role: 'img', 'aria-label': deal.patience + ' of ' + deal.max + ' patience left' }, pips)));
      put(body, h('div', { class: 'row' },
        h('button', { class: 'btn red', type: 'button', text: 'Demand more', onclick: function () {
          const out = deal.demand();
          if (out === 'walk') finish();
          else { S.play('tap'); if (deal.raises % 2 === 1) say(G.say(s, 'dealRaise')); setAnim('point', 900); drawSheet(); }
        } }),
        h('button', { class: 'btn gold', type: 'button', text: 'Take the deal', onclick: function () { deal.take(); finish(); } })));
    });
  }

  // ---- menu: trophies, orders, stats, settings
  let menuTab = 'trophies', installEvent = null;
  function sheetMenu(body) {
    const tabs = [['trophies', 'Trophies'], ['orders', 'Orders'], ['stats', 'Stats'], ['settings', 'Settings']];
    put(body, h('div', { class: 'tabs', role: 'tablist' }, tabs.map(function (t) {
      return h('button', { class: 'tab', type: 'button', role: 'tab', 'aria-selected': menuTab === t[0] ? 'true' : 'false', text: t[1], onclick: function () { menuTab = t[0]; S.play('tap'); drawSheet(); $('sheetBody').scrollTop = 0; } });
    })));
    if (menuTab === 'trophies') {
      const got = C.ACHIEVEMENTS.filter(function (a) { return s.ach[a.id]; }).length;
      put(body, h('p', { class: 'muted center', text: got + ' of ' + C.ACHIEVEMENTS.length + ' trophies. All of them the best trophies.' }));
      put(body, h('div', { class: 'grid2' }, C.ACHIEVEMENTS.map(function (a) {
        const done = !!s.ach[a.id], hide = a.secret && !done;
        return h('div', { class: 'ach ' + (done ? 'done' : 'locked') }, h('span', { class: 'ach-icon', 'aria-hidden': 'true', text: hide ? '❓' : a.icon }),
          h('div', null, h('b', { text: hide ? 'Secret' : a.name }), h('small', { text: hide ? 'He isn’t telling.' : a.desc })));
      })));
    } else if (menuTab === 'orders') {
      put(body, h('p', { class: 'muted center', text: s.orders.length + ' of ' + C.ORDERS.length + ' executive orders signed. One per daily briefing.' }));
      put(body, h('div', { class: 'list' }, C.ORDERS.map(function (o) {
        return s.orders.indexOf(o.id) >= 0 ? orderCard(o) : h('div', { class: 'order locked' }, h('div', { class: 'order-no', text: 'Executive Order No. ' + o.no.toLocaleString('en-US') }), h('p', { text: 'Not yet signed.' }));
      })));
    } else if (menuTab === 'stats') {
      const st = s.stats, days = Math.max(1, Math.ceil((now() - s.born) / 864e5));
      const rows = [
        ['Level', G.level(s) + ' · ' + G.stage(s).name], ['Term', G.roman(s.term)], ['Age', days + (days === 1 ? ' day' : ' days')],
        ['Acquisitions', G.owned(s).toLocaleString('en-US') + ' (' + G.money(st.acqSpent) + ')'],
        ['Streak', s.streak.n + ' (best ' + s.streak.best + ')'], ['Money earned', G.money(st.earned)], ['Income', G.money(G.incomePerHour(s)) + '/h'],
        ['Hamberders', st.burgers], ['Diet Cokes', st.cokes], ['Salads (regrettable)', st.salads], ['Lettuce tariff', s.tariff + '%'],
        ['Compliments paid', st.praises], ['Times fired', st.fired], ['Posts', st.posts], ['3 AM posts', st.posts3am],
        ['Rounds of golf', st.golf], ['Putts sunk', st.golfHoles], ['Deals', st.deals], ['Best deal', G.money(st.bestDeal)],
        ['Rallies', st.rallies], ['Biggest crowd (official)', st.bestCrowd.toLocaleString('en-US')], ['Hair touched', st.hairTouches], ['Briefings', st.briefings],
      ];
      put(body, h('div', null, rows.map(function (r) { return h('div', { class: 'stat' }, h('span', { text: r[0] }), h('b', { text: String(r[1]) })); })));
      put(body, h('button', { class: 'btn gold', type: 'button', text: 'Make a share card', onclick: shareCard }));
    } else {
      put(body, cloudCard());
      put(body, h('label', { class: 'field' }, 'His name',
        h('input', { type: 'text', maxlength: 18, value: s.name, onchange: function (e) { s.name = e.target.value.trim().slice(0, 18) || 'The Donald'; dirty(); persist(); refreshHud(); } })));
      put(body, h('label', { class: 'toggle' }, h('span', { text: 'Sound' }), h('input', { type: 'checkbox', checked: s.settings.sound, onchange: function (e) { s.settings.sound = e.target.checked; S.enabled = s.settings.sound; persist(); S.play('ok'); } })));
      put(body, h('label', { class: 'toggle' }, h('span', null, 'Alerts when he needs you', h('br'), h('small', { class: 'muted', text: 'Works while the app stays open in the background.' })),
        h('input', { type: 'checkbox', checked: s.settings.alerts, onchange: function (e) { toggleAlerts(e.target); } })));
      put(body, canonCard());
      if (installEvent) put(body, h('button', { class: 'btn gold', type: 'button', text: 'Install as an app', onclick: function () { installEvent.prompt(); installEvent = null; drawSheet(); } }));
      else put(body, h('p', { class: 'muted', text: 'Tip: add this page to your home screen and he lives there like an app.' }));
      const code = h('textarea', { 'aria-label': 'Save code', placeholder: 'Paste a save code here to move him to this device.' });
      put(body, h('div', { class: 'card' }, h('h3', { text: 'Move him by hand' }), h('p', { class: 'muted', text: 'A save code is a snapshot of him as he is now. It carries him to another browser without the cloud.' }),
        h('label', { class: 'field' }, code),
        h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', text: 'Copy save code', onclick: function () {
            const c = G.exportCode(s); code.value = c; code.select();
            if (navigator.clipboard) navigator.clipboard.writeText(c).then(function () { toast('Save code copied.'); }, function () { toast('Select and copy the code.'); });
            else toast('Select and copy the code.');
          } }),
          h('button', { class: 'btn', type: 'button', text: 'Load code', onclick: function () {
            const n = G.importCode(code.value, now());
            if (!n) { toast('That code is not right. Sad!'); S.play('no'); return; }
            confirmModal('Load this save?', 'It replaces the pet living in this browser' + (K.linked() ? ' and, because cloud save is on, on your other devices too.' : '.'), 'Load it', function () { s = n; S.enabled = s.settings.sound; G.catchUp(s, now()); dirty(); persist(); closeSheet(); refreshHud(); toast('Welcome back, ' + s.name + '.'); });
          } }))));
      put(body, h('button', { class: 'btn ghost', type: 'button', text: 'Start over with a new egg', onclick: function () {
        confirmModal('Start over?', 'This erases him, his trophies and all the gold from this device. It cannot be undone.' + (K.linked() ? ' The cloud copy is left alone: this device is unlinked first, and your other devices keep him.' : ''), 'Erase everything', function () { const floor = Math.max(s.edits, storedEdits()); K.unlink(); G.wipe(); s = G.newState(now()); s.edits = floor + 1; G.catchUp(s, now()); persist(); closeSheet(); view.particles.length = 0; hush(); refreshHud(); });
      } }));
      put(body, h('p', { class: 'muted', text: 'Trumpagotchi is a parody for laughs. Everything he “says” is made up. It is not affiliated with or endorsed by any real person, campaign, company or toy.' }));
      if (DEBUG) put(body, debugPanel());
    }
  }
  // The page can only alert while it is open. On Canon he is Don and writes first (see don/),
  // so Settings says where to get the app. Plain links: the stores open outside the game.
  const CANON_STORES = [
    ['canonIos', 'App Store', 'Canon on the App Store', 'https://apps.apple.com/app/id6761249945'],
    ['canonAndroid', 'Google Play', 'Canon on Google Play', 'https://play.google.com/store/apps/details?id=com.canon.app'],
  ];
  // His own Don on Canon: the keeper gives their Canon number, approves him in the app, and
  // he arrives already looking after this pet.
  let donState = null, donKey = null, donTimer = 0;
  function canonCard() {
    const card = h('div', { class: 'card', id: 'canonCard' }, h('h3', { text: 'Alerts that reach your phone' }),
      h('p', { class: 'muted', text: 'This page can only alert you while it stays open. In Canon, a messaging app, he is Don: he writes to you first when he needs something, and typing “burger” feeds him.' }),
      h('div', { class: 'row' }, CANON_STORES.map(function (st) {
        return h('a', { class: 'btn', id: st[0], href: st[3], target: '_blank', rel: 'noopener noreferrer', 'aria-label': st[2] + ' (opens in a new tab)', text: st[1] });
      })));
    if (!K.don) { put(card, h('p', { class: 'muted', text: 'For now each Don is set up by hand, one keeper at a time.' })); return card; }
    if (!K.linked()) { put(card, h('p', { class: 'muted', id: 'donStatus', text: 'Turn on cloud save above, and he can have his own Don.' })); return card; }
    if (donKey !== K.key()) { donKey = K.key(); donState = null; lookAtDon(); return card; } // a new code: look again
    if (donState === 'here') put(card, h('p', { id: 'donStatus', text: 'Don is on Canon. Say “help” to him there.' }));
    else if (donState === 'asked') { put(card, h('p', { id: 'donStatus', text: 'Open Canon and approve Don: Settings → Requests. He writes to you as soon as you do.' })); watchDon(); }
    else if (donState) {
      const input = h('input', { type: 'tel', id: 'donPhone', placeholder: '+1 555 123 4567', autocomplete: 'tel', maxlength: 24 });
      if (donState === 'declined' || donState === 'stopped') put(card, h('p', { class: 'muted', id: 'donStatus', text: 'The last Don was not let in. Ask again?' }));
      put(card, h('label', { class: 'field' }, 'Your Canon phone number', input),
        h('button', { class: 'btn gold', type: 'button', id: 'donAsk', text: 'Send me my Don', onclick: function () { askDon(input.value); } }));
    }
    return card;
  }
  const onSettings = function () { return sheet && sheet.id === 'menu' && menuTab === 'settings'; };
  function lookAtDon() {
    K.donStatus().then(function (st) {
      donState = st || 'none'; // if the server cannot say, asking again finds out
      if (onSettings()) drawSheet();
    });
  }
  // While he waits to be let in, look every ten seconds, as long as Settings is open.
  function watchDon() {
    clearTimeout(donTimer);
    donTimer = setTimeout(function () {
      if (!onSettings() || donState !== 'asked') return;
      K.donStatus().then(function (st) {
        if (!st || st === donState) { watchDon(); return; }
        donState = st;
        if (st === 'here') { S.play('ach'); toast('Don is on Canon. Say hello.', 'gold'); }
        drawSheet();
      });
    }, 10000);
  }
  function askDon(number) {
    const button = $('donAsk');
    if (button) button.disabled = true;
    K.askDon(number).then(function (r) {
      if (button) button.disabled = false;
      const trouble = {
        'number-taken': 'That number already has a Don. Send him your keeper code in Canon.',
        full: 'No room for another Don right now. Try again later.',
        'bad-number': 'Include the country code, like +1 555 123 4567.',
        busy: 'Too many tries. Wait a little.',
        offline: 'Could not reach Don. Try again.',
      }[r.status];
      if (r.status === 'gone') { cloudGone(); return; }
      if (trouble) { toast(trouble); S.play('no'); return; }
      donState = r.status; S.play('ok'); drawSheet();
    });
  }
  function debugPanel() {
    const skip = function (hrs) { return function () { G.clockOffset += hrs * 3600e3; tick(true); drawSheet(); }; };
    const lvl = function (n) { return function () {
      const ev = [], target = G.cumXp(Math.min(C.MAX_LEVEL, G.level(s) + n));
      G.addXp(s, (target - s.xp) / G.xpMult(s) + 0.01, ev, now());
      handle(ev); refreshHud(); dirty(); persist(); drawSheet();
    }; };
    return h('div', { class: 'card' }, h('h3', { text: 'Debug' }), h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', text: '+1h', onclick: skip(1) }), h('button', { class: 'btn', type: 'button', text: '+8h', onclick: skip(8) }), h('button', { class: 'btn', type: 'button', text: '+1d', onclick: skip(24) }),
      h('button', { class: 'btn', type: 'button', text: '+1 lv', onclick: lvl(1) }), h('button', { class: 'btn', type: 'button', text: '+5 lv', onclick: lvl(5) }),
      h('button', { class: 'btn', type: 'button', text: '+cash', onclick: function () { s.cash = Math.max(1e6, s.cash * 10); dirty(); refreshHud(); drawSheet(); } }),
      h('button', { class: 'btn', type: 'button', text: 'needs 5', onclick: function () { for (const k of G.NEEDS) s.needs[k] = 5; refreshHud(); } }),
      h('button', { class: 'btn', type: 'button', text: 'needs 60', onclick: function () { for (const k of G.NEEDS) s.needs[k] = 60; refreshHud(); } })));
  }

  // ---- share card
  function renderRoom(target, w, hgt) {
    const c = h('canvas', { width: A.W, height: A.H }), x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    drawRoom(x, true);
    target.imageSmoothingEnabled = false;
    target.drawImage(c, 0, 0, A.W, A.H, (1080 - w) / 2, 250, w, hgt);
  }
  function wrapText(x, text, cx, y, maxW, lh) {
    const words = text.split(' '); let line = '';
    for (const w of words) {
      if (x.measureText(line + w).width > maxW && line) { x.fillText(line.trim(), cx, y); line = ''; y += lh; }
      line += w + ' ';
    }
    x.fillText(line.trim(), cx, y);
    return y + lh;
  }
  function shareCard() {
    const c = h('canvas', { width: 1080, height: 1350 }), x = c.getContext('2d');
    const grad = x.createLinearGradient(0, 0, 0, 1350); grad.addColorStop(0, '#1d2f5f'); grad.addColorStop(1, '#070d1f');
    x.fillStyle = grad; x.fillRect(0, 0, 1080, 1350);
    x.strokeStyle = '#e0b43c'; x.lineWidth = 10; x.strokeRect(25, 25, 1030, 1300);
    x.strokeStyle = '#a87a1e'; x.lineWidth = 3; x.strokeRect(42, 42, 996, 1266);
    x.textAlign = 'center'; x.fillStyle = '#f7dc7a';
    x.font = '700 78px "Didot","Bodoni MT","Times New Roman",serif';
    x.fillText('T R U M P A G O T C H I', 540, 150);
    x.font = '600 30px system-ui,sans-serif'; x.fillStyle = '#a9b4d0';
    x.fillText('THE MOST TREMENDOUS VIRTUAL PET. EVERYBODY SAYS SO.', 540, 205);
    x.fillStyle = '#e0b43c'; x.fillRect(84, 244, 912, 696);
    renderRoom(x, 900, 675); // drawn at y=250
    x.fillStyle = '#fbf7ee'; x.font = '800 56px system-ui,sans-serif';
    x.fillText(s.name + ' · Level ' + G.level(s), 540, 1030);
    x.fillStyle = '#f7dc7a'; x.font = '700 40px "Didot","Bodoni MT","Times New Roman",serif';
    x.fillText(G.stage(s).name.toUpperCase() + (s.term > 1 ? '  ·  TERM ' + G.roman(s.term) : ''), 540, 1088);
    x.fillStyle = '#a9b4d0'; x.font = '500 30px system-ui,sans-serif';
    const days = Math.max(1, Math.ceil((now() - s.born) / 864e5));
    x.fillText('Day ' + days + '  ·  ' + s.streak.n + '-day streak  ·  ' + G.money(s.stats.earned) + ' earned', 540, 1138);
    x.fillStyle = '#fbf7ee'; x.font = 'italic 600 32px system-ui,sans-serif';
    const quote = s.posts.length ? s.posts[0].t : C.line('idleHappy', G.tier(s));
    wrapText(x, '“' + (quote.length > 150 ? quote.slice(0, 147) + '…' : quote) + '”', 540, 1200, 900, 40);
    x.fillStyle = '#6f7ba0'; x.font = '500 22px system-ui,sans-serif';
    x.fillText('A parody. Not affiliated with anyone. Especially him.', 540, 1305);

    queueModal(function (card, done) {
      const img = h('img', { class: 'share-img', alt: 'Share card showing ' + describe() });
      put(card, h('h2', { id: 'modalTitle', text: 'Show him off' }), img);
      const fallback = function (blob) {
        const a = h('a', { download: 'trumpagotchi.png' }); a.href = URL.createObjectURL(blob); document.put(body, a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      };
      c.toBlob(function (blob) {
        if (!blob) { put(card, h('p', { class: 'muted', text: 'Could not make the picture here.' })); return; }
        img.src = URL.createObjectURL(blob);
        const file = typeof File === 'function' ? new File([blob], 'trumpagotchi.png', { type: 'image/png' }) : null;
        const canShare = file && navigator.canShare && navigator.canShare({ files: [file] });
        put(card, 
          canShare ? h('button', { class: 'btn gold', type: 'button', text: 'Share', onclick: function () { navigator.share({ files: [file], title: 'Trumpagotchi', text: 'My Trumpagotchi is level ' + G.level(s) + '. Tremendous.' }).catch(function () {}); } }) : null,
          h('button', { class: 'btn' + (canShare ? '' : ' gold'), type: 'button', text: 'Save picture', onclick: function () { fallback(blob); } }),
          h('button', { class: 'btn', type: 'button', text: 'Close', onclick: done }));
      }, 'image/png');
    });
  }

  // ---- when he has stormed off
  function sheetGone(body) {
    put(body, h('div', { class: 'card center' }, h('h3', { text: 'He left a note' }), h('p', { text: '“Gone golfing. Very unfair treatment. Nobody has ever been treated so unfairly. I’m not coming back. Unless you ask nicely.”' })));
    put(body, h('p', { class: 'muted center', text: 'Winning him back costs some tremendousness. He keeps his level title.' }));
    put(body, h('button', { class: 'btn gold big', type: 'button', text: 'Tell him he was right', onclick: function () { closeSheet(); react(G.winBack(s, now()), { sound: 'level', ms: 2600, fx: confetti }); } }));
  }

  // ---------------------------------------------------------------- cloud save
  // Optional. With it on, every change here is sent to the server and changes made on
  // another device are fetched, so the same pet lives on all of a keeper's devices.
  let syncing = false, lastPush = 0, lastPull = 0, lastCheck = 0, pushGap = 6000, conflictOpen = false, cloudNote = '';
  function cloudState() { const c = JSON.parse(JSON.stringify(s)); delete c.settings; return c; } // sound and alerts stay with the device
  function dirty() { bump(); K.markDirty(); }
  function brief(st) { return st.hatched ? 'level ' + G.level(st) + ', ' + G.stage(st).name + ', ' + G.money(st.cash) : 'an unhatched egg'; }
  function careCount(st) { const t = st.stats; return t.feeds + t.praises + t.grooms + t.posts + t.golf + t.deals + t.rallies + t.briefings; }
  function cloudStatus() {
    const i = K.info();
    if (!i) return '';
    if (cloudNote) return cloudNote;
    if (i.dirty) return 'Changes waiting to be saved…';
    return 'Saved to the cloud' + (i.syncedAt ? ', ' + ago(i.syncedAt) : '') + '.';
  }
  function showCloudStatus() { const el = $('cloudStatus'); if (el) el.textContent = cloudStatus(); }
  function copyText(text, done) {
    const fail = function () { toast('Could not copy. Select it and copy by hand.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(done); }, fail);
    else fail();
  }
  // Make the pet that arrived from the server the pet on this device.
  function adopt(remote) {
    const fresh = G.revive(remote.state, now());
    if (!fresh) return false;
    const floor = Math.max(s.edits, storedEdits());
    fresh.settings = s.settings;
    s = fresh;
    s.edits = Math.max(s.edits, floor) + 1;
    K.accept(remote.rev);
    zoneNew = noteZone();
    G.catchUp(s, now()); persist();
    hush(); view.particles.length = 0; view.target = null; praiseOpts = null; draft = null; briefResult = null;
    if (sheet && sheet.id !== 'menu') closeSheet(); else drawSheet();
    refreshHud(); rotateTicker();
    return true;
  }
  function cloudGone() { // the code was changed or the cloud copy deleted from another device
    K.unlink();
    toast('This device was unlinked from the cloud. He still lives here.');
    if (sheet && sheet.id === 'menu') drawSheet();
  }
  // Both this device and another changed him since they last agreed. The keeper picks.
  function resolveConflict(remote) {
    if (conflictOpen) return;
    const other = G.revive(remote.state, now());
    if (!other) return;
    conflictOpen = true;
    queueModal(function (card, done) {
      const finish = function () { conflictOpen = false; done(); };
      put(card,
        h('p', { class: 'kicker', text: 'Two devices, one pet' }),
        h('h2', { id: 'modalTitle', text: 'Which one is he?' }),
        h('p', { class: 'muted', text: 'He was looked after on another device while this one was busy too. Only one of them can carry on.' }),
        h('button', { class: 'btn gold', type: 'button', id: 'keepMine', text: 'Keep this device’s: ' + brief(s) + ', cared for ' + careCount(s) + ' times', onclick: function () {
          finish();
          K.push(cloudState(), { baseRev: remote.rev }).then(function (r) {
            if (r.status === 'conflict') resolveConflict(r);
            else if (r.status === 'ok') toast('Saved. Your other device will catch up.', 'gold');
            else if (r.status === 'gone') cloudGone();
            showCloudStatus();
          });
        } }),
        h('button', { class: 'btn', type: 'button', id: 'keepTheirs', text: 'Use the other one: ' + brief(other) + ', cared for ' + careCount(other) + ' times', onclick: function () { finish(); if (adopt(remote)) toast('Picked up from your other device.', 'gold'); } }),
        h('p', { class: 'muted', text: 'The other one was last saved ' + ago(Date.parse(remote.updatedAt)) + '.' }));
    });
  }
  // One round trip: send what changed here, or fetch what changed elsewhere.
  function syncNow(o) {
    o = o || {};
    if (!K.linked() || K.available === false || syncing || conflictOpen) return;
    if (view.mode !== 'room' && !o.leaving) return; // never swap the pet out from under a game in progress
    K.reload(); // another tab on this device may have just synced
    if (behind()) { if (view.mode !== 'room') return; takeOver(); } // and may have changed him
    const info = K.info();
    if (!info) return;
    if (o.leaving) { if (info.dirty) K.push(cloudState(), { keepalive: true }); return; }
    syncing = true; cloudNote = '';
    if (info.dirty) lastPush = clock(); else lastPull = clock();
    (info.dirty ? K.push(cloudState()) : K.pull()).then(function (r) {
      syncing = false;
      pushGap = r.status === 'offline' || r.status === 'busy' ? Math.min(pushGap * 2, 60000) : 6000;
      if (zoneNew && (r.status === 'same' || r.status === 'ok')) { zoneNew = false; if (r.status === 'same') dirty(); }
      if (r.status === 'conflict') resolveConflict(r);
      else if (r.status === 'newer') { const i = K.info(); if (i && i.dirty) resolveConflict(r); else if (adopt(r)) toast('Picked up from your other device.', 'gold'); }
      else if (r.status === 'gone') cloudGone();
      else if (r.status === 'offline') cloudNote = 'Cannot reach the cloud right now. He is safe here, and it will try again.';
      showCloudStatus();
    }, function () { syncing = false; });
  }
  function syncTick() {
    if (!K.linked() || document.hidden) return;
    const c = clock();
    if (K.available !== true) { // the server was not reachable at start: look again now and then
      if (c - lastCheck > 60000) { lastCheck = c; K.check().then(function (ok) { if (ok) syncNow(); }); }
      return;
    }
    const i = K.info();
    if (i.dirty ? c - lastPush > pushGap : c - lastPull > 90000) syncNow();
    showCloudStatus();
  }
  function showKeeperCode(title) {
    queueModal(function (card, done) {
      const key = K.formatKey(K.key());
      put(card,
        h('p', { class: 'kicker', text: 'Cloud save' }),
        h('h2', { id: 'modalTitle', text: title }),
        h('p', { class: 'code-box', id: 'keeperCode', text: key }),
        h('p', { class: 'muted', text: 'This is his keeper code. On another phone or computer, open the menu, go to Settings and enter it, and he is there too. Keep it secret: anyone who has it can play him.' }),
        h('button', { class: 'btn', type: 'button', text: 'Copy the code', onclick: function () { copyText(key, 'Code copied.'); } }),
        h('button', { class: 'btn', type: 'button', text: 'Copy a link for another device', onclick: function () { copyText(K.shareLink(), 'Link copied. Open it on the other device.'); } }),
        h('button', { class: 'btn gold', type: 'button', text: 'Done', onclick: done }));
    });
  }
  function enableCloud() {
    if (!s.hatched) { toast('Hatch him first.'); return; }
    K.enable(cloudState()).then(function (r) {
      if (!r.ok) { toast(r.status === 'busy' ? 'Too many new cloud saves from here. Try again later.' : 'Could not reach the cloud. Try again.'); S.play('no'); return; }
      S.play('ach');
      zoneNew = false; // he went up with his zone
      showKeeperCode('He is saved to the cloud');
      if (sheet && sheet.id === 'menu') drawSheet();
    });
  }
  function linkWithCode(raw, fromLink) {
    const key = K.normalizeKey(raw);
    if (!key) { toast('That code does not look right: it is 20 letters and numbers.'); S.play('no'); return; }
    if (K.linked() && K.key() === key) { toast('This device is already linked to him.'); return; }
    K.peek(key).then(function (r) {
      if (!r.ok) { toast(r.status === 'gone' ? 'No pet answers to that code.' : r.status === 'busy' ? 'Too many tries. Wait a few minutes.' : 'Could not reach the cloud. Try again.'); S.play('no'); return; }
      const other = G.revive(r.state, now());
      if (!other) { toast('That pet could not be read.'); return; }
      const go = function () { K.join(key, r.rev); if (adopt(r)) { S.play('ach'); toast('Linked. He is the same pet here now.', 'gold'); } };
      if (!s.hatched && !fromLink) { go(); return; }
      const about = [];
      if (fromLink) about.push('This link connects this device to a pet from another device (' + brief(other) + '). Only do this if the link is yours.');
      if (s.hatched) about.push('The pet on this device (' + brief(s) + ') will be replaced by ' + (fromLink ? 'it.' : 'the linked one (' + brief(other) + ').') + (K.linked() ? '' : ' Copy a save code first if you want to keep him.'));
      confirmModal(fromLink ? 'Link this device?' : 'Bring him here?', about.join(' '), s.hatched ? 'Replace and link' : 'Link', go);
    });
  }
  function cloudCard() {
    if (!K.linked() && K.available !== true) {
      return K.available === false ? h('p', { class: 'muted', text: 'Cloud save is not available on this copy of the game. A save code still moves him between browsers.' }) : null;
    }
    if (!K.linked()) {
      const input = h('input', { type: 'text', id: 'keeperInput', 'aria-label': 'Keeper code', placeholder: 'XXXXX-XXXXX-XXXXX-XXXXX', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: 40 });
      return h('div', { class: 'card', id: 'cloudCard' }, h('h3', { text: 'Take him everywhere' }),
        h('p', { class: 'muted', text: 'Turn on cloud save and he follows you to any phone or computer. No account, no email, no password: he gets a secret keeper code.' }),
        h('button', { class: 'btn gold', type: 'button', id: 'cloudOn', disabled: !s.hatched, text: s.hatched ? 'Turn on cloud save' : 'Hatch him first', onclick: enableCloud }),
        h('p', { class: 'muted', text: 'Already have a keeper code from another device?' }),
        h('label', { class: 'field' }, input),
        h('button', { class: 'btn', type: 'button', id: 'cloudLink', text: 'Link this device', onclick: function () { linkWithCode(input.value); } }));
    }
    const dots = function () { return K.formatKey(K.key()).replace(/[0-9A-Z]/g, '•'); };
    const shown = h('p', { class: 'code-box small', id: 'cloudCode', text: dots() });
    let visible = false;
    return h('div', { class: 'card', id: 'cloudCard' }, h('h3', { text: 'Cloud save is on' }),
      h('p', { class: 'muted', id: 'cloudStatus', text: cloudStatus() }),
      h('p', { class: 'muted', text: 'His keeper code. Enter it on another device and he is there too. Anyone who has it can play him, so keep it secret.' }),
      shown,
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', id: 'cloudShow', text: 'Show', onclick: function (e) { visible = !visible; shown.textContent = visible ? K.formatKey(K.key()) : dots(); e.target.textContent = visible ? 'Hide' : 'Show'; } }),
        h('button', { class: 'btn', type: 'button', text: 'Copy code', onclick: function () { copyText(K.formatKey(K.key()), 'Code copied.'); } }),
        h('button', { class: 'btn', type: 'button', text: 'Copy link', onclick: function () { copyText(K.shareLink(), 'Link copied. Open it on the other device.'); } })),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', id: 'cloudUnlink', text: 'Unlink this device', onclick: function () {
          confirmModal('Unlink this device?', 'He stays on this device as he is now and stops following the cloud. Your other devices keep the cloud pet.', 'Unlink', function () { K.unlink(); toast('Unlinked. He lives only here now.'); drawSheet(); });
        } }),
        h('button', { class: 'btn', type: 'button', id: 'cloudRotate', text: 'New code', onclick: function () {
          confirmModal('Get a new keeper code?', 'The old code stops working at once. Every other device is unlinked until you enter the new code there.', 'Get a new code', function () {
            K.rotate().then(function (r) { if (r.ok) { showKeeperCode('His new keeper code'); drawSheet(); } else if (r.status === 'gone') cloudGone(); else toast('Could not reach the cloud. Try again.'); });
          });
        } })),
      h('button', { class: 'btn ghost', type: 'button', id: 'cloudDelete', text: 'Delete the cloud copy', onclick: function () {
        confirmModal('Delete the cloud copy?', 'He is erased from the server and every other device is unlinked. He stays on this device.', 'Delete it', function () {
          K.remove().then(function (r) { if (r.ok) { toast('Cloud copy deleted. He lives only here now.'); drawSheet(); } else toast('Could not reach the cloud. Try again.'); });
        });
      } }));
  }

  // ---------------------------------------------------------------- actions
  const SHEETS = { feed: ['Feed', sheetFeed], praise: ['Praise', sheetPraise], play: ['Play', sheetPlay], groom: ['Groom', sheetGroom], post: ['Post', sheetPost], brief: ['Daily Briefing', sheetBrief], shop: ['Shop', sheetShop] };
  function onAction(id) {
    if (!s.hatched) return;
    if (s.sulking && id !== 'shop') { openSheet('gone', 'Gone Golfing', sheetGone); return; }
    if (id === 'sleep') {
      const r = G.toggleSleep(s, now());
      if (r.ok && r.slept) { closeSheet(); say(r.say); S.play('sleep'); setTimeout(hush, 2600); refreshHud(); dirty(); persist(); }
      else if (r.ok) { react(r, { sound: 'wake' }); setAnim('idle', 400); }
      else react(r);
      return;
    }
    if (s.asleep && id !== 'shop') { toast('Shh. He’s asleep. Wake him first.'); S.play('no'); return; }
    if (sheet && sheet.id === id && view.mode === 'room') { closeSheet(); return; }
    if (id === 'brief') briefResult = null;
    if (id === 'praise') praiseOpts = null;
    S.play('tap');
    openSheet(id, SHEETS[id][0], SHEETS[id][1]);
  }

  function tapScene(ev) {
    S.unlock();
    const rect = canvas.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * A.W, y = ((ev.clientY - rect.top) / rect.height) * A.H;
    if (view.mode === 'golf') { if (view.game.tap) view.game.tap(); return; }
    if (view.mode === 'rally') { if (view.game.tap2) view.game.tap2(); return; }
    if (!s.hatched) return tapEgg();
    if (s.sulking) return openSheet('gone', 'Gone Golfing', sheetGone);
    if (s.asleep) { toast('Shh. He’s asleep.'); return; }
    if (A.hasRoom(sceneNow()) && s.decor.indexOf('button') >= 0 && x > 104 && x < 122 && y > 52 && y < 66) {
      view.buttonLit = view.frame + 8;
      react(G.feed(s, 'coke', now()), { sound: 'eat' });
      return;
    }
    const where = A.hit(lookNow(now()), view.x, x, y);
    if (where) {
      const onHair = where === 'hair';
      react(G.pet(s, now(), onHair), { sound: onHair ? 'no' : 'ok', ms: 1200, fx: function () { if (!onHair) spawn('heart', 2, { y: 52, spread: 20, vy: -0.6 }); else spawn('puff', 3, { y: 46, spread: 20, vy: -0.3 }); } });
    }
  }
  function tapEgg() {
    const r = G.tapEgg(s, now());
    if (!r.ok) return;
    S.play('crack');
    const sc = $('screen'); sc.classList.remove('shake'); void sc.offsetWidth; sc.classList.add('shake');
    spawn('spark', 5, { x: 80, y: 86, spread: 30, spreadY: 20, vy: -0.5 });
    if (r.hatched) { handle(r.events); refreshHud(); dirty(); persist(); showHatch(); }
    else { $('hatchBtn').textContent = ['Tap the egg', 'Again', 'It moved', 'Keep going', 'It’s cracking', 'Almost', 'One more', 'One more'][Math.min(7, s.eggTaps)]; persist(); }
  }

  // ---------------------------------------------------------------- drawing
  const FESTIVE = ['inaug', 'presidents', 'july4', 'laborday']; // days the office hangs bunting
  function decorMap() { const m = {}; for (const d of s.decor) m[d] = true; return m; }
  // What he looks like right now, and where that puts him (see A.look and A.sceneFor).
  function lookNow(t) {
    const season = C.seasonFor(new Date(t));
    return A.look(G.level(s), { humble: G.mood(s) === 'humble', bronze: t < s.bronzeUntil, wilt: s.needs.glow < 25, term: s.term, tie: season === 'stpatrick' ? '#1f9d55' : null });
  }
  function sceneNow() { return A.sceneFor(G.level(s), !s.hatched || s.sulking || G.mood(s) === 'humble'); }
  function drawRoom(x, still) {
    const t = now(), d = new Date(t), lv = G.level(s), mood = G.mood(s);
    const season = C.seasonFor(d);
    const look = lookNow(t), scene = sceneNow(), indoors = A.hasRoom(scene);
    const f = still ? 12 : view.frame;
    if (look.fixed) view.x = 80;
    const env = {
      scene: scene, frame: f, decor: decorMap(), hour: d.getHours() + d.getMinutes() / 60,
      season: season, bunting: lv >= 32 && lv < 45, festive: FESTIVE.indexOf(season) >= 0, buttonLit: view.buttonLit > view.frame,
      look: look, x: view.x, resting: !s.hatched || s.sulking || (s.asleep && indoors), holdings: G.owned(s), built: s.ach,
    };
    A.drawRoom(x, env);
    if (!s.hatched) { A.drawEgg(x, 80, A.FLOOR, s.eggTaps, f); return; }
    if (s.sulking) { A.drawGone(x, f); return; }
    if (s.asleep) {
      if (indoors) { A.drawBed(x); A.drawDon(x, A.BED.x, A.BED.y, look, A.pose('sleep', f, {}), { lying: true }); A.drawBlanket(x); }
      else { A.drawDon(x, view.x, A.FLOOR, look, A.pose('sleep', f, {}), { face: view.face }); A.drawOver(x, env); } // nothing that size has a bed
      x.fillStyle = 'rgba(8,12,40,0.5)'; x.fillRect(0, 0, A.W, A.H);
      return;
    }
    if (season === 'turkey' && indoors) A.drawTurkey(x, Math.round(view.turkeyX), 114, f);
    let anim = 'idle';
    const c = clock();
    if (still) anim = mood === 'happy' ? 'thumbs' : 'idle';
    else if (c < view.animUntil) anim = view.anim;
    else if (c < view.talkUntil) anim = 'talk';
    else if (view.target != null) anim = 'walk';
    A.drawDon(x, view.x, A.FLOOR, look, A.pose(anim, f, { mood: mood, item: view.animItem }), { face: view.face });
    A.drawOver(x, env);
  }
  function draw() {
    if (view.mode !== 'room' && view.game) view.game.draw(g, view.frame);
    else drawRoom(g, false);
    for (const p of view.particles) A.drawParticle(g, p);
  }

  function stepFrame() {
    view.frame++;
    // particles
    for (let i = view.particles.length - 1; i >= 0; i--) {
      const p = view.particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life--;
      if (p.life <= 0) view.particles.splice(i, 1);
    }
    if (view.mode !== 'room' || !s.hatched || s.sulking) return;
    if (s.asleep) {
      const inBed = A.hasRoom(sceneNow());
      if (view.frame % 14 === 0) spawn('z', 1, { x: inBed ? 70 : 104, y: inBed ? 76 : 40, spread: 4, vx: 0.3, vy: -0.5, life: 22 });
      return;
    }
    const c = clock(), busy = c < view.animUntil || c < view.talkUntil;
    if (c < view.animUntil && view.anim === 'dance' && view.frame % 6 === 0) spawn('note', 1, { y: 50, spread: 36, vy: -0.5 });
    if (c < view.animUntil && view.anim === 'angry' && view.frame % 8 === 0) spawn('anger', 1, { y: 48, spread: 26, vy: -0.3 });
    // wander (only while he is still something that can walk)
    if (lookNow(now()).fixed) { view.x = 80; view.target = null; }
    else if (!busy) {
      if (view.target != null) {
        const dx = view.target - view.x;
        if (Math.abs(dx) < 1) view.target = null;
        else { view.face = dx > 0 ? 1 : -1; if (view.frame % 2 === 0) view.x += view.face; }
      } else if (--view.think <= 0) {
        view.think = 30 + Math.floor(Math.random() * 50);
        const mood = G.mood(s);
        if (Math.random() < (mood === 'humble' || mood === 'sad' ? 0.25 : 0.55)) view.target = 38 + Math.floor(Math.random() * 84);
      }
    }
    // the turkey has places to be
    view.turkeyX += view.turkeyDir * 0.25;
    if (view.turkeyX > 60) view.turkeyDir = -1; else if (view.turkeyX < 14) view.turkeyDir = 1;
  }

  // ---------------------------------------------------------------- the news ticker
  let tickerN = 0, tickerKind = 'post';
  function headline() {
    tickerN++;
    if (s.sulking) { tickerKind = 'gone'; return 'He has left the building. A note was found.'; }
    if (s.asleep) { tickerKind = 'none'; return 'He is asleep. The phone is on the pillow.'; }
    if (G.isHumble(s)) { tickerKind = 'feed'; return 'CRISIS: he was heard saying \u201CI may have been wrong.\u201D'; }
    const want = G.want(s);
    if (want && tickerN % 2) { tickerKind = { hungry: 'feed', needEgo: 'praise', bored: 'play', needGlow: 'groom', tired: 'none' }[want]; const w = (C.NEWS && C.NEWS.want[want]) || ['He needs something.']; return w[tickerN % w.length]; }
    const pool = [];
    const tn = (C.NEWS && C.NEWS.tier[G.tier(s)]) || ['He is doing tremendously.']; // tolerate an older content file mid-release
    pool.push(['post', tn[tickerN % tn.length]]);
    pool.push(['shop', 'Licensing income: ' + G.money(G.incomePerHour(s)) + ' an hour and climbing.']);
    if (s.hatched) pool.push(['shop', 'Rumour: his next acquisition is \u201C' + G.acqNext(s, 1)[0].name + '\u201D. Price on request.']);
    if (s.posts.length) pool.push(['post', 'He posted: \u201C' + s.posts[0].t + '\u201D']);
    if (G.briefing(s)) pool.push(['brief', 'Today\u2019s briefing is ready. He has not read it.']);
    if (s.streak.n > 1) pool.push(['brief', 'Day ' + s.streak.n + ' of your streak. Loyalty has been noted.']);
    if (s.tariff > 0) pool.push(['feed', 'Lettuce tariff holds at ' + s.tariff + '%. Markets shaken.']);
    if (K.available === true && !K.linked() && s.stats.days >= 2) pool.push(['cloud', 'Tip: turn on cloud save in Settings and he follows you to every device.']);
    if (G.level(s) < C.MAX_LEVEL) pool.push(['post', Math.round(G.progress(s) * 100) + '% of the way to level ' + (G.level(s) + 1) + '. Experts call it tremendous.']);
    else pool.push(['post', 'Peak tremendousness reached. Another term is being discussed.']);
    const pick = pool[tickerN % pool.length];
    tickerKind = pick[0];
    return pick[1];
  }
  function rotateTicker() {
    const el = $('tickerText');
    el.textContent = headline();
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  }

  // ---------------------------------------------------------------- chatter
  function chatter() {
    if (!s.hatched || s.asleep || s.sulking || modalOpen || view.mode !== 'room') return;
    if (!$('bubble').hidden) return;
    const c = clock();
    if (c < view.chatterAt) return;
    view.chatterAt = c + (sheet ? 26000 : 14000) + Math.random() * 12000;
    if (G.isHumble(s)) { say(C.HUMBLE_LINES[Math.floor(Math.random() * C.HUMBLE_LINES.length)], { humble: true }); return; }
    const want = G.want(s);
    if (want && Math.random() < 0.75) say(G.say(s, want));
    else if (!want) say(G.say(s, 'idleHappy'));
  }
  function greet(awayH) {
    if (!s.hatched || s.asleep || s.sulking) return;
    const d = new Date(now()), season = C.seasonFor(d);
    if (season && !s.daily.seasonGreeted) {
      const hello = [].concat(C.SEASONS[season].greet);
      s.daily.seasonGreeted = true; say(hello[Math.floor(Math.random() * hello.length)]); setAnim('dance', 2400); return;
    }
    if (G.isHumble(s)) { say(C.HUMBLE_LINES[0], { humble: true }); return; }
    if (awayH >= 8) say(G.say(s, 'greetLong', { hours: Math.round(awayH) }));
    else if (d.getHours() >= 5 && d.getHours() < 10 && awayH >= 3) say(G.say(s, 'greetMorning'));
    else say(G.say(s, 'greet'));
    view.chatterAt = clock() + 16000;
  }

  // ---------------------------------------------------------------- one save, many copies
  function persist() { written = G.save(s); writtenEdits = s.edits; }
  function storedEdits() {
    const raw = G.storedRaw();
    if (!raw) return 0;
    if (raw === written) return writtenEdits;
    try { return Math.max(0, Math.floor(Number(JSON.parse(raw).edits)) || 0); } catch (e) { return 0; }
  }
  // Another copy saved something the keeper did that this copy has not seen.
  function behind() { const raw = G.storedRaw(); return !!raw && raw !== written && storedEdits() > s.edits; }
  // A change made here outranks every save so far, wherever it was made.
  function bump() { s.edits = Math.max(s.edits, storedEdits()) + 1; }
  // Carry on from the other copy's save: it holds what the keeper did there.
  function takeOver() {
    const other = G.stored(now());
    if (!other) return false;
    s = other; S.enabled = s.settings.sound;
    written = G.storedRaw(); writtenEdits = s.edits;
    K.reload();
    hush(); view.particles.length = 0; view.target = null; praiseOpts = null; draft = null; briefResult = null;
    if (sheet && sheet.id !== 'menu') closeSheet(); else if (sheet) drawSheet();
    refreshHud(); rotateTicker();
    return true;
  }
  // Save, unless another copy has moved on: then follow it (never in the middle of a game).
  function saveOrCatchUp() {
    if (!behind()) persist();
    else if (view.mode === 'room') takeOver();
  }

  // ---------------------------------------------------------------- time
  let lastSave = 0, tickCount = 0;
  function tick(force) {
    const t = now();
    const r = G.catchUp(s, t);
    handle(r.events);
    if (r.offline && r.awayH >= 0.5 && s.hatched) showRecap(r);
    refreshHud();
    chatter();
    syncTick();
    if (++tickCount % 7 === 0) rotateTicker();
    if (force || t - lastSave > 5000) { saveOrCatchUp(); lastSave = t; }
    updateTitle();
  }

  let lastFrameAt = 0, acc = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    const dt = Math.min(250, ts - (lastFrameAt || ts)); lastFrameAt = ts;
    if (view.mode !== 'room' && view.game) {
      const ev = view.game.update(dt);
      if (ev && view.game.onEvent) view.game.onEvent(ev);
    }
    acc += dt;
    let stepped = false;
    while (acc >= 83) { acc -= 83; stepFrame(); stepped = true; }
    if (stepped || view.mode !== 'room') draw();
  }

  // ---------------------------------------------------------------- alerts
  let alertTimer = 0;
  const NEED_ALERT = { food: 'He is HUNGRY. Very unfair!', ego: 'Nobody has told him he is great lately.', fun: 'He is bored. This is low energy.', glow: 'The hair is deflating.' };
  function notify(body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const opts = { body: body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'trumpagotchi' };
    if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.ready.then(function (reg) { reg.showNotification('Trumpagotchi', opts); }).catch(function () {});
    else { try { new Notification('Trumpagotchi', opts); } catch (e) { /* some browsers only allow it from a worker */ } }
  }
  function scheduleAlert() {
    clearTimeout(alertTimer);
    if (!s.settings.alerts || !document.hidden) return;
    const nx = G.nextAlert(s, 25);
    if (!nx) return;
    alertTimer = setTimeout(function () { if (document.hidden) notify(NEED_ALERT[nx.need]); }, Math.min(nx.ms, 2147e6));
  }
  function toggleAlerts(box) {
    if (!box.checked) { s.settings.alerts = false; persist(); return; }
    if (!('Notification' in window)) { box.checked = false; toast('This browser cannot send alerts.'); return; }
    Notification.requestPermission().then(function (p) {
      s.settings.alerts = p === 'granted'; box.checked = s.settings.alerts; persist();
      toast(s.settings.alerts ? 'Alerts on. He will find you.' : 'Alerts are blocked in this browser.');
    });
  }
  function updateTitle() {
    const want = s.hatched && !s.asleep && !s.sulking ? G.want(s) : null;
    document.title = document.hidden && (want || s.sulking) ? '(!) He needs you — Trumpagotchi' : 'Trumpagotchi';
    if (navigator.setAppBadge) { if (want || s.sulking) navigator.setAppBadge(1).catch(function () {}); else if (navigator.clearAppBadge) navigator.clearAppBadge().catch(function () {}); }
  }

  // Where the keeper is, so a helper acting for them elsewhere (Don on Canon) keeps his hours.
  // The zone travels to the cloud with his next real change; the device that last looked
  // after him sets it. Only a save that had no zone at all is sent for the zone's sake, and
  // then only once this device and the cloud agree (see syncNow), so a time zone can never
  // start a "which one is he?" question or bounce between two devices.
  let zoneNew = false;
  function noteZone() {
    let zone = '';
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* stays unknown */ }
    if (!zone || zone === s.zone || !/^[A-Za-z0-9_+\-\/]{1,64}$/.test(zone)) return false;
    const first = !s.zone;
    s.zone = zone;
    return first;
  }

  // ---------------------------------------------------------------- boot
  function init() {
    if (params.has('reset') && LOCAL) G.wipe();
    s = G.load(now());
    S.enabled = s.settings.sound;
    zoneNew = noteZone();
    buildHud();
    const r = G.catchUp(s, now());
    view.chatterAt = clock() + 9000;
    handle(r.events);
    refreshHud();
    persist();
    if (s.hatched) {
      if (r.offline && r.awayH >= 0.5) showRecap(r);
      else setTimeout(function () { if (!modalOpen) greet(r.awayH); }, 700);
    }

    canvas.addEventListener('click', tapScene);
    $('hatchBtn').addEventListener('click', function () { S.unlock(); tapEgg(); });
    $('bubble').addEventListener('click', hush);
    $('sheetClose').addEventListener('click', function () { S.play('tap'); closeSheet(); });
    $('menuBtn').addEventListener('click', function () { S.unlock(); if (sheet && sheet.id === 'menu') closeSheet(); else { S.play('tap'); openSheet('menu', 'The Trophy Room', sheetMenu); } });
    $('cashBtn').addEventListener('click', function () { S.unlock(); if (s.hatched) onAction('shop'); });
    $('ticker').addEventListener('click', function () {
      S.unlock();
      if (tickerKind === 'gone') openSheet('gone', 'Gone Golfing', sheetGone);
      else if (tickerKind === 'cloud') { menuTab = 'settings'; openSheet('menu', 'The Trophy Room', sheetMenu); }
      else if (tickerKind !== 'none') onAction(tickerKind);
    });
    rotateTicker();
    $('runAgainBtn').addEventListener('click', function () {
      confirmModal('Run for another term?', 'He goes back to level 1 as Regular Don, but keeps the gold, the trophies and the orders, and earns 25% more of everything. Forever.', 'Run again', function () {
        react(G.runAgain(s, now()), { sound: 'evolve', ms: 3000, fx: confetti });
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { if (modalOpen) return; if (sheet) closeSheet(); }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { saveOrCatchUp(); scheduleAlert(); syncNow({ leaving: true }); }
      else {
        clearTimeout(alertTimer);
        // if he was looked after in another tab meanwhile, carry on from that tab's save
        if (behind() && view.mode === 'room') takeOver();
        tick(true);
        lastPull = 0; syncNow(); // and if he was looked after on another device, fetch that
      }
      updateTitle();
    });
    window.addEventListener('pagehide', function () { saveOrCatchUp(); syncNow({ leaving: true }); });
    // another copy on this device saved something the keeper did there: follow it
    window.addEventListener('storage', function (e) {
      if (e.key === G.SAVE_KEY && view.mode === 'room' && behind()) { takeOver(); tick(true); }
    });
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvent = e; });
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !DEBUG) navigator.serviceWorker.register('sw.js').catch(function () {});

    setInterval(tick, 1000);
    requestAnimationFrame(loop);
    draw();

    // hooks for the smoke test and the ?debug panel
    // cloud save: find out whether this copy has a server behind it, then catch up with it
    const pendingLink = K.takeLinkFromUrl();
    $('linkBtn').addEventListener('click', function () { S.unlock(); menuTab = 'settings'; openSheet('menu', 'The Trophy Room', sheetMenu); });
    K.check().then(function (ok) {
      refreshHud();
      if (ok && pendingLink) linkWithCode(pendingLink, true);
      else if (ok && K.linked()) syncNow();
      if (sheet && sheet.id === 'menu') drawSheet();
    });

    TG.ui = { state: function () { return s; }, tick: tick, onAction: onAction, say: say, refresh: refreshHud, draw: draw, share: shareCard, sync: syncNow, set: function (n) { s = n; refreshHud(); } };
  }
  init();
})();
