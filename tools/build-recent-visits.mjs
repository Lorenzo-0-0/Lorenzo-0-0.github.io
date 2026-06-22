// Build data/recent-visits.json from the GoatCounter CSV export API.
// Run by .github/workflows/recent-visits.yml on a schedule (NOT client-side —
// the export API is heavily rate-limited). Token from the GOATCOUNTER_TOKEN secret.
// CSV export returns a single .csv.gz; start_from_hit_id:0 exports ALL hits
// (omitting it defaults to "newest only" → 0 rows). Output rows:
// { date, country, browser, system }. No IP/city — not in GoatCounter exports.
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

async function main() {
  if (!TOKEN) bail('no GOATCOUNTER_TOKEN');
  // 1) start CSV export of ALL hits (start_from_hit_id:0)
  const r = await fetch(BASE + '/export', {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'csv', start_from_hit_id: 0 })
  });
  if (r.status === 429) bail('export rate-limited (429)');
  if (!r.ok) { const b = await r.text().catch(() => ''); bail('export start HTTP ' + r.status + ' :: ' + b.slice(0, 200)); }
  const id = (await r.json()).id;
  if (!id) bail('no export id');

  // 2) poll
  let meta = null;
  for (let i = 0; i < 20; i++) {
    await sleep(2000);
    const s = await (await fetch(BASE + '/export/' + id, { headers: H })).json();
    if (s.error) bail('export error: ' + s.error);
    if (s.finished_at) { meta = s; break; }
  }
  if (!meta) bail('export timed out');
  console.log('export meta :: num_rows=' + meta.num_rows + ' size=' + meta.size);

  // 3) download (.csv.gz → gunzip)
  const dl = await fetch(BASE + '/export/' + id + '/download', { headers: H });
  if (!dl.ok) bail('download HTTP ' + dl.status);
  let buf = Buffer.from(await dl.arrayBuffer());
  if (buf.length > 1 && buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  const text = buf.toString('utf8').trim();
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  console.log('CSV lines=' + lines.length + ' header=' + (lines[0] || '').slice(0, 160));
  if (lines.length < 2) bail('CSV had no data rows');

  // 4) parse (header-mapped)
  const head = splitCSV(lines[0]).map((h) => h.trim().toLowerCase());
  const ix = (k) => head.indexOf(k);
  const di = ix('date'), li = ix('location'), bi = ix('browser'), si = ix('system');
  const rows = lines.slice(1).map((l) => {
    const c = splitCSV(l);
    return {
      date: di >= 0 ? c[di] : '',
      country: li >= 0 ? (c[li] || '').slice(0, 2) : '',
      browser: bi >= 0 ? c[bi] : '',
      system: si >= 0 ? c[si] : ''
    };
  }).filter((x) => x.date);
  rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const out = rows.slice(0, LIMIT);
  if (!out.length) bail('parsed 0 dated rows');
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('wrote ' + out.length + ' rows to ' + OUT);
}

main().catch((e) => bail('error: ' + (e && e.message)));
