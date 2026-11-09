import './leaderboard.css';

const nameKey = 'marker-games-initials';
const validName = /^(?:[A-Z]{3}|[א-ת]{3})$/u;
const artifact = typeof __ARTIFACT__ !== 'undefined' && __ARTIFACT__;

// Each game supplies a score at game over. Requests stay relative to the page so
// both the Railway domain and the /kids/ reverse proxy use the same database.
export function createLeaderboard({ gameId, form, boards, intro }) {
  if (artifact) {
    document.querySelectorAll('[data-shared-scores]').forEach((el) => { el.hidden = true; });
    return { begin() {}, finish() {} };
  }
  const endpoint = new URL(`./api/leaderboards/${encodeURIComponent(gameId)}`, location.href);
  const input = form.querySelector('input');
  const submit = form.querySelector('[type="submit"]');
  const skip = form.querySelector('[data-skip]');
  const status = form.querySelector('[role="status"]');
  let round = null, generation = 0, loadVersion = 0, loading = null;
  const requests = new Set();

  try { input.value = localStorage.getItem(nameKey) || ''; } catch { /* private mode */ }
  function validate() {
    input.value = input.value.normalize('NFKC').replace(/[^a-zA-Zא-ת]/gu, '').toUpperCase().slice(0, 3);
    input.setCustomValidity(validName.test(input.value) ? '' : 'כתבו 3 אותיות בעברית או באנגלית');
  }
  validate();
  input.addEventListener('input', (event) => { if (!event.isComposing) validate(); });
  input.addEventListener('compositionend', validate);

  async function request(options = {}) {
    const controller = new AbortController();
    requests.add(controller);
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(endpoint, { ...options, signal: controller.signal, cache: 'no-store' });
      if (!response.ok) { const error = new Error('Request failed'); error.status = response.status; throw error; }
      return await response.json();
    } finally {
      clearTimeout(timer);
      requests.delete(controller);
    }
  }

  function render(entries) {
    for (const board of boards) {
      const body = board.querySelector('tbody');
      body.replaceChildren();
      for (const entry of entries) {
        const tr = document.createElement('tr');
        const mine = entry.id === round?.savedId;
        tr.classList.toggle('leaderboard-mine', mine);
        for (const value of [entry.rank, entry.name, entry.score]) {
          const td = document.createElement('td');
          td.textContent = String(value);
          tr.appendChild(td);
        }
        tr.children[1].dir = 'auto';
        if (mine) tr.setAttribute('aria-label', `התוצאה שלכם: ${entry.name}, ${entry.score} נקודות, מקום ${entry.rank}`);
        body.appendChild(tr);
      }
      board.querySelector('table').hidden = entries.length === 0;
      board.querySelector('[role="status"]').textContent = entries.length ? '' : 'הטבלה עוד ריקה. מי יהיו הראשונים?';
      board.querySelector('[data-retry]').hidden = true;
    }
  }

  async function refresh() {
    loading?.abort();
    // A generation check also protects against a late result from an earlier round.
    const version = ++loadVersion, currentGeneration = generation;
    for (const board of boards) {
      board.querySelector('[role="status"]').textContent = 'טוענים את השיאים…';
      board.querySelector('[data-retry]').hidden = true;
    }
    // request() owns cancellation and timeout; keep the latest controller for refreshes.
    const pending = request();
    loading = [...requests].at(-1);
    try {
      const data = await pending;
      if (version === loadVersion && currentGeneration === generation) render(data.entries);
    } catch {
      if (version !== loadVersion || currentGeneration !== generation) return;
      for (const board of boards) {
        board.querySelector('[role="status"]').textContent = 'טבלת השיאים לא זמינה כרגע. אפשר להמשיך לשחק.';
        board.querySelector('[data-retry]').hidden = false;
      }
    }
  }
  for (const board of boards) board.querySelector('[data-retry]').addEventListener('click', refresh);
  intro?.addEventListener('toggle', () => { if (intro.open) refresh(); });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    validate();
    if (!round || round.pending || round.savedId || round.skipped || !form.reportValidity()) return;
    const current = round;
    // Freeze the submitted payload so a retry after a lost response cannot create
    // another entry or change the name of a score that was already committed.
    current.payload ||= { submissionId: crypto.randomUUID(), name: input.value, score: current.score };
    current.pending = true;
    input.readOnly = true;
    submit.disabled = true;
    skip.disabled = true;
    status.textContent = 'שומרים את התוצאה…';
    try { localStorage.setItem(nameKey, current.payload.name); } catch { /* private mode */ }
    try {
      const data = await request({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(current.payload) });
      if (round !== current) return;
      current.savedId = data.entry.id;
      status.textContent = `נשמר! מקום ${data.entry.rank} בטבלה 🎉`;
      submit.textContent = 'נשמר ✓';
      skip.hidden = true;
      await refresh();
    } catch (error) {
      if (round !== current) return;
      status.textContent = error.status === 429 ? 'הרבה תוצאות בבת אחת! חכו דקה ונסו שוב.'
        : 'לא הצלחנו לאשר שהשמירה הצליחה. נסו שוב — אותה תוצאה לא תישמר פעמיים. השיא האישי נשאר במכשיר.';
      submit.textContent = 'לנסות שוב';
      submit.disabled = false;
      // Once a request was sent, a missing response does not prove it wasn't saved.
      skip.hidden = true;
    } finally {
      current.pending = false;
    }
  });
  skip.addEventListener('click', () => {
    if (!round || round.pending) return;
    round.skipped = true;
    input.disabled = submit.disabled = true;
    skip.hidden = true;
    status.textContent = 'התוצאה לא נשלחה. השיא האישי נשמר במכשיר.';
  });

  return {
    begin() {
      generation++;
      round = null;
      for (const controller of requests) controller.abort();
      if (intro) intro.open = false;
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    },
    finish(score) {
      round = { score, pending: false, savedId: null };
      input.disabled = input.readOnly = submit.disabled = skip.disabled = false;
      submit.textContent = 'שמירת התוצאה';
      skip.hidden = false;
      status.textContent = '';
      refresh();
    },
  };
}
