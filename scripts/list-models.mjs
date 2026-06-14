// Lists the model IDs your AI/ML API key can use, filtered to the families we
// care about. Run: `npm run models`
import fs from 'node:fs';

const env = fs.readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();
const key = pick('AIML_API_KEY');
const base = pick('AIML_BASE_URL') || 'https://api.aimlapi.com/v1';
if (!key) {
  console.error('AIML_API_KEY not found in .env.local');
  process.exit(1);
}

const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
if (!res.ok) {
  console.error(`models request failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const data = await res.json();
const items = Array.isArray(data) ? data : data.data || [];
const ids = items.map((m) => (typeof m === 'string' ? m : m.id)).filter(Boolean).sort();

console.log(`Total models: ${ids.length}\n`);
for (const term of ['gemini', 'gemma', 'claude', 'gpt-4o']) {
  const hits = ids.filter((i) => i.toLowerCase().includes(term));
  console.log(`== ${term} (${hits.length}) ==`);
  for (const i of hits) console.log('  ', i);
  console.log('');
}
