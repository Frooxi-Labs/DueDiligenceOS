// Band capability spike — probes what's REAL on this account's tier before we
// build advanced coordination on top of it. Creates a couple of throwaway rooms.
// Run: `node scripts/band-spike.mjs`  (reads .env.local; never prints secrets)
import fs from 'node:fs';

const env = fs.readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();

const BASE = pick('BAND_BASE_URL') || 'https://app.band.ai/api/v1';
const agent = (prefix) => ({ key: pick(`${prefix}_API_KEY`), id: pick(`${prefix}_AGENT_ID`) });
const A = {
  archivist: agent('BAND_ARCHIVIST'),
  legal: agent('BAND_LEGAL'),
  financial: agent('BAND_FINANCIAL'),
  synthesis: agent('BAND_SYNTHESIS'),
  environmental: agent('BAND_ENVIRONMENTAL'),
};

if (!A.archivist.key) {
  console.error('BAND_ARCHIVIST_API_KEY not found in .env.local');
  process.exit(1);
}

const short = (v) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s && s.length > 220 ? s.slice(0, 220) + '…' : s;
};

async function call(who, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'X-API-Key': A[who].key, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let parsed;
  const text = await res.text();
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  const data = parsed && typeof parsed === 'object' && 'data' in parsed ? parsed.data : parsed;
  return { ok: res.ok, status: res.status, data, raw: parsed };
}

const log = (label, r) => console.log(`${r.ok ? '✅' : '❌'} [${r.status}] ${label}${r.ok ? '' : ` → ${short(r.raw)}`}`);

console.log(`\n=== BAND CAPABILITY SPIKE — ${BASE} ===\n`);

// 0) Identity
const me = await call('archivist', 'GET', '/agent/me');
log('GET /agent/me', me);
if (me.ok) console.log(`   identity: ${short(me.data?.name || me.data?.handle || me.data?.id)}`);

// 1) Create room
const room = await call('archivist', 'POST', '/agent/chats', { chat: {} });
log('POST /agent/chats (create room)', room);
const roomId = room.data?.id;
if (!roomId) { console.error('No room id — aborting.'); process.exit(1); }
console.log(`   roomId: ${roomId}`);

// 2) Add participants
for (const p of ['legal', 'financial', 'synthesis']) {
  if (!A[p].id) { console.log(`⚠️  skip add ${p} (no agent id)`); continue; }
  const r = await call('archivist', 'POST', `/agent/chats/${roomId}/participants`, { participant: { participant_id: A[p].id } });
  log(`POST participants (+${p})`, r);
}

// 3) Baseline message + mention
const msg = await call('archivist', 'POST', `/agent/chats/${roomId}/messages`, {
  message: { content: 'SPIKE: baseline message from archivist', mentions: A.legal.id ? [{ id: A.legal.id }] : [] },
});
log('POST messages (baseline + mention)', msg);
const msgId = msg.data?.id;
console.log(`   messageId: ${msgId ?? '(none returned)'}`);

// 4) PROBE A — structured delegation via events (task / tool_call)
console.log('\n--- PROBE A: structured delegation (events) ---');
for (const mt of ['task', 'tool_call', 'thought']) {
  const r = await call('legal', 'POST', `/agent/chats/${roomId}/events`, {
    event: { content: `SPIKE: ${mt} event`, message_type: mt, metadata: { intent: 're-underwrite', authority: 'drop clean-title assumption' } },
  });
  log(`POST events (message_type=${mt})`, r);
}

// 5) PROBE B — processing / processed states (accountability)
console.log('\n--- PROBE B: processing / processed states ---');
if (msgId) {
  log('POST messages/{id}/processing', await call('legal', 'POST', `/agent/chats/${roomId}/messages/${msgId}/processing`));
  log('POST messages/{id}/processed', await call('legal', 'POST', `/agent/chats/${roomId}/messages/${msgId}/processed`));
} else {
  console.log('⚠️  no messageId returned — cannot test processing states');
}

// 6) PROBE C — context: does an un-mentioned participant see traffic? what shape?
console.log('\n--- PROBE C: context visibility (mention-routed?) ---');
const ctxLegal = await call('legal', 'GET', `/agent/chats/${roomId}/context`);
log('GET context (as legal — was mentioned)', ctxLegal);
const ctxFin = await call('financial', 'GET', `/agent/chats/${roomId}/context`);
log('GET context (as financial — NOT mentioned)', ctxFin);
const count = (r) => (Array.isArray(r.data) ? r.data.length : Array.isArray(r.data?.messages) ? r.data.messages.length : '?');
console.log(`   legal sees ${count(ctxLegal)} msgs · financial sees ${count(ctxFin)} msgs  (if financial=0, room is mention-routed)`);

// 7) PROBE D — fork: create a child room + replay, link via metadata
console.log('\n--- PROBE D: room forking (counterfactual) ---');
const child = await call('synthesis', 'POST', '/agent/chats', { chat: { metadata: { parent_room: roomId, branch: 'proceed' } } });
log('POST /agent/chats (child room w/ parent metadata)', child);
const childId = child.data?.id;
if (childId) {
  console.log(`   childId: ${childId}  (parent metadata accepted: ${child.data?.metadata ? 'yes' : 'unknown'})`);
  const replay = await call('synthesis', 'POST', `/agent/chats/${childId}/messages`, { message: { content: 'SPIKE: replayed parent context into fork', mentions: A.synthesis.id ? [{ id: A.synthesis.id }] : [] } });
  log('POST messages (replay into child)', replay);
}

// 8) PROBE E — rejoin / context persistence (resilience)
console.log('\n--- PROBE E: rejoin + context persistence ---');
const reAdd = A.legal.id ? await call('archivist', 'POST', `/agent/chats/${roomId}/participants`, { participant: { participant_id: A.legal.id } }) : { ok: false, status: 0, raw: 'no id' };
log('POST participants (re-add legal — idempotent rejoin?)', reAdd);
const ctxAfter = await call('legal', 'GET', `/agent/chats/${roomId}/context`);
log('GET context after rejoin (history preserved?)', ctxAfter);
console.log(`   legal still sees ${count(ctxAfter)} msgs after rejoin`);

console.log(`\n=== DONE. Rooms created: ${roomId}${childId ? `, ${childId}` : ''} ===\n`);
