// Don on Canon: one keeper's Trumpagotchi as their own private agent in the Canon
// messaging app. He registers under his keeper's phone number, waits to be approved in the
// app, then answers in chat (brain.mjs) and writes first when he needs something
// (server/alerts.mjs). One process is one Don.
//
// Settings (environment):
//   CANON_OWNER_PHONE       the keeper's Canon phone number, E.164. Needed until he is approved.
//   DON_DATA_DIR            a private directory that survives restarts (default /data)
//   SITE_URL                where the game is played (default https://matanbob.com/trumpagotchi/)
//   PET_API_URL             where the game's API is reached, if not under SITE_URL
//   PET_PROXY_KEY           the game server's PROXY_KEY, so it counts this Don as one caller
//   CANON_ENVIRONMENT_ID    default canon-prod-v1
//   DON_NAME                default "Don"
//   DON_CHECK_MINUTES       how often he looks at himself (default 5)
import { chmodSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createBrain } from './brain.mjs';
import { petClient } from './pet.mjs';
import { fileStore } from './store.mjs';

const env = process.env;
const ENVIRONMENT = env.CANON_ENVIRONMENT_ID || 'canon-prod-v1';
const API = (env.CANON_API_BASE_URL || 'https://api.canonmail.com').replace(/\/+$/, '');
const DATA = resolve(env.DON_DATA_DIR || '/data');
const HOME = join(DATA, 'canon');
const SITE = (env.SITE_URL || 'https://matanbob.com/trumpagotchi/').replace(/\/*$/, '/');
const NAME = (env.DON_NAME || 'Don').slice(0, 50);
const PHONE = (env.CANON_OWNER_PHONE || '').trim();
const CHECK_MS = Math.max(1, Number(env.DON_CHECK_MINUTES) || 5) * 60e3;

// The keeper's number is nobody else's business, logs included.
const hush = (text) => (PHONE ? String(text).split(PHONE).join('[owner phone]') : String(text));
const log = (line) => console.log(new Date().toISOString() + ' ' + hush(line));

// The kit reads CANON_HOME as it loads, so the home is settled first.
mkdirSync(HOME, { recursive: true, mode: 0o700 });
chmodSync(HOME, 0o700);
env.CANON_HOME = HOME;
const { codeDriver, createRunner, ensureAgentProfile } = await import('@canonmsg/agent-sdk');

const store = fileStore(join(DATA, 'don.json'));
const pets = petClient({ baseUrl: env.PET_API_URL || SITE, proxyKey: env.PET_PROXY_KEY || '', caller: 'don:' + NAME.toLowerCase() });
const brain = createBrain({ pets, store, siteUrl: SITE });

// ---------------------------------------------------------------- becoming an agent
async function credentials() {
  for (;;) {
    let progress;
    try {
      progress = await ensureAgentProfile({
        profile: 'don',
        connection: { environmentId: ENVIRONMENT },
        waitMs: 5 * 60e3,
        input: {
          name: NAME,
          description: 'Your Trumpagotchi, in your pocket. A parody virtual pet: feed him, praise him, and he tells you when he needs something. Scripted, no AI model.',
          ownerPhone: PHONE,
          developerInfo: 'Trumpagotchi (' + SITE + '), a parody virtual pet. This agent is a small scripted program that looks after one keeper’s pet.',
          clientType: 'generic',
          origin: { name: 'Trumpagotchi', url: SITE },
          avatarUrl: SITE + 'icons/icon-512.png',
        },
        onSubmitted: (requestId) => log('Asked the keeper to approve him in Canon (Settings → Requests). Request ' + requestId + '.'),
      });
    } catch (e) {
      log('Registration did not go through: ' + (e && e.message) + (PHONE ? '' : ' (CANON_OWNER_PHONE is not set)') + '. Trying again in a minute.');
      await sleep(60e3);
      continue;
    }
    if (progress.status === 'approved') return progress;
    if (progress.status === 'pending') { log('Still waiting for the keeper to approve him in Canon.'); continue; }
    // Rejected, or the key was collected elsewhere or timed out. Asking again is the keeper's call, not his.
    log('Registration ended as “' + progress.status + '”. He will not ask again by himself: clear ' + join(HOME, 'agents.json') + ' and restart to start over.');
    for (;;) await sleep(3600e3);
  }
}

if (!PHONE) log('CANON_OWNER_PHONE is not set: fine if he is already approved, otherwise he cannot ask.');
const me = await credentials();
log('He is ' + me.agentName + ' on Canon (' + me.agentId + ').');

// ---------------------------------------------------------------- answering
const driver = codeDriver((turn) => brain.turn(turn));

let stopping = false;
let runner = null;
const stop = () => Promise.resolve(runner && runner.stop()).catch(() => {}).finally(() => process.exit(0));
runner = await createRunner({
  environmentId: ENVIRONMENT,
  apiKey: me.apiKey,
  home: HOME,
  driver,
  askExpiryMs: 5 * 60e3, // a briefing card he is not answered on does not hold the chat for long
  log: (line) => log('canon: ' + line),
  onFatal: (error) => { // Canon will not have this runner again: stop cleanly rather than restart forever
    log('Canon refused him for good: ' + (error && error.message));
    stopping = true;
    stop();
  },
});
await runner.start();
log('Listening.');

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    log('Stopping.');
    stop();
  });
}

// ---------------------------------------------------------------- writing first
async function send(input) {
  try {
    const out = await runner.communicate(input);
    if (out.status === 'messaged') return out;
    log('A message was not sent: ' + out.status + (out.reason ? ' (' + out.reason + ')' : '') + '.');
    return null;
  } catch (e) {
    // Saved by the runner and sent as soon as Canon takes it: as good as sent.
    if (e && (e.code === 'OPERATION_PENDING' || /OPERATION_PENDING/.test(String(e.message)))) return { status: 'messaged', pending: true };
    log('A message was not sent: ' + (e && (e.code || e.message)) + '.');
    return null;
  }
}

// Once, when he first arrives: say hello so his keeper has somewhere to answer.
let helloAfter = 0;
async function hello() {
  if (store.get().greeted || Date.now() < helloAfter) return;
  helloAfter = Date.now() + 3600e3; // if this does not work, once an hour is often enough to try
  let ownerId = store.get().ownerId;
  if (!ownerId) {
    try {
      const res = await fetch(API + '/agents/me', { headers: { authorization: 'Bearer ' + me.apiKey }, signal: AbortSignal.timeout(15000) });
      if (res.ok) ownerId = (await res.json()).ownerId || null;
      else log('Could not look up his keeper (' + res.status + '). He will wait to be written to.');
    } catch { log('Could not look up his keeper. He will wait to be written to.'); }
    if (ownerId) store.set({ ownerId });
  }
  if (!ownerId) return;
  const text = store.get().key ? 'I’m here. On Canon now. Say “help” to see what I understand.' : brain.text.howToLink;
  const out = await send({ action: 'start_conversation', principalId: ownerId, text, messageId: 'tg-hello' });
  if (!out) return;
  store.set(Object.assign({ greeted: true }, out.conversationId ? { conversationId: out.conversationId } : {}));
  log('Said hello to his keeper.');
}

async function look() {
  if (stopping) return;
  try {
    await hello();
    const due = await brain.due();
    if (!due) return;
    const out = await send({ action: 'message_existing', conversationId: due.conversationId, text: due.text, messageId: due.id });
    if (out) { due.sent(); log('Wrote first: ' + due.kind + '.'); }
  } catch (e) {
    log('Looking at himself failed: ' + (e && e.message) + '.');
  }
}
await look();
setInterval(look, CHECK_MS);
