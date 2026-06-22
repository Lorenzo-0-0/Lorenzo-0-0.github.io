// Build data/recent-visits.json from the GoatCounter export API.
// Run by .github/workflows/recent-visits.yml on a schedule (NOT client-side —
// the export API is heavily rate-limited, so a single periodic job is the only
// viable source). Token comes from the GOATCOUNTER_TOKEN Actions secret.
// Output rows: { date, country, browser, system } (newest first). No IP/city —
// GoatCounter doesn't store them.
import fs from 'node:fs';
import zlib from 'node:zlib';

const TOKEN = process.env.GOATCOUNTER_TOKEN;
const BASE = 'https://jingliangli.goatcounter.com/api/v0';
const OUT = 'data/recent-visits.json';
const LIMIT = 15;
const H = { Authorization: 'Bearer ' + TOKEN };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function bail(msg) { console.log(msg + ' — keeping existing ' + OUT); process.exit(0); }

function splitCSV(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else { if (ch === ',') { out.push(cur); cur = ''; } else if (ch === '"') q = true; else cur += ch; }
  }
  out.push(cur); return out;
}

function parse(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  console.log('CSV lines=' + lines.length + ' header=' + (lines[0] || '').slice(0, 200));
  if (lines.length < 2) return [];
  const head = splitCSV(lines[0]).map((h) => h.trim().toLowerCase());
  const ix = (k) => head.indexOf(k);
  const di = ix('date'), li = ix('location'), bi = ix('browser'), si = ix('system');
  const rows = lines.slice(1).map((l) => {
    const c = splitCSV(l);
    return { date: di >= 0 ? c[di] : '', country: li >= 0 ? (c[li] || '').slice(0, 2) : '', browser: bi >= 0 ? c[bi] : '', system: si >= 0 ? c[si] : '' };
  }).filter((r) => r.date);
  rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return rows.slice(0, LIMIT);
}

async function main() {
  if (!TOKEN) bail('no GOATCOUNTER_TOKEN');
  // 1) start export (the API requires a "format")
  const r = await fetch(BASE + '/export', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'csv' }) });
  if (r.status === 429) bail('export rate-limited (429)');
  if (!r.ok) { const b = await r.text().catch(() => ''); bail('export start HTTP ' + r.status + ' :: ' + b.slice(0, 200)); }
  const { id } = await r.json();
  if (!id) bail('no export id');
  // 2) poll
  let done = false;
  for (let i = 0; i < 20; i++) {
    await sleep(2000);
    const s = await (await fetch(BASE + '/export/' + id, { headers: H })).json();
    if (s.error) bail('export error: ' + s.error);
    if (s.finished_at) { done = true; break; }
  }
  if (!done) bail('export timed out');
  // 3) download (+gunzip) + parse
  const dl = await fetch(BASE + '/export/' + id + '/download', { headers: H });
  if (!dl.ok) bail('download HTTP ' + dl.status);
  let buf = Buffer.from(await dl.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  const rows = parse(buf.toString('utf8'));
  if (!rows.length) bail('parsed 0 rows');
  fs.writeFileSync(OUT, JSON.stringify(rows));
  console.log('wrote ' + rows.length + ' rows to ' + OUT);
}

main().catch((e) => bail('error: ' + (e && e.message)));
