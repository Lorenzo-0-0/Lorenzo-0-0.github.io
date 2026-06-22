// Build data/recent-visits.json from the GoatCounter JSON export API.
// Run by .github/workflows/recent-visits.yml on a schedule (NOT client-side —
// the export API is heavily rate-limited, so a single periodic job is the only
// viable source). Token comes from the GOATCOUNTER_TOKEN Actions secret.
// Output rows: { date, country, browser, system } (newest first). No IP/city —
// GoatCounter doesn't expose them in exports.
import fs from 'node:fs';
import zlib from 'node:zlib';

const TOKEN = process.env.GOATCOUNTER_TOKEN;
const BASE = 'https://jingliangli.goatcounter.com/api/v0';
const OUT = 'data/recent-visits.json';
const LIMIT = 15;
const H = { Authorization: 'Bearer ' + TOKEN };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function bail(msg) { console.log(msg + ' — keeping existing ' + OUT); process.exit(0); }

async function main() {
  if (!TOKEN) bail('no GOATCOUNTER_TOKEN');
  // 1) start a JSON export covering a wide date range (start_from_day).
  const since = new Date(Date.now() - 180 * 864e5).toISOString();
  const r = await fetch(BASE + '/export', {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'json', start_from_day: since })
  });
  if (r.status === 429) bail('export rate-limited (429)');
  if (!r.ok) { const b = await r.text().catch(() => ''); bail('export start HTTP ' + r.status + ' :: ' + b.slice(0, 200)); }
  const id = (await r.json()).id;
  if (!id) bail('no export id');

  // 2) poll until finished
  let meta = null;
  for (let i = 0; i < 20; i++) {
    await sleep(2000);
    const s = await (await fetch(BASE + '/export/' + id, { headers: H })).json();
    if (s.error) bail('export error: ' + s.error);
    if (s.finished_at) { meta = s; break; }
  }
  if (!meta) bail('export timed out');
  console.log('export meta :: num_rows=' + meta.num_rows + ' format=' + meta.format);

  // 3) download (+gunzip)
  const dl = await fetch(BASE + '/export/' + id + '/download', { headers: H });
  if (!dl.ok) bail('download HTTP ' + dl.status);
  let buf = Buffer.from(await dl.arrayBuffer());
  if (buf.length > 1 && buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  const text = buf.toString('utf8').trim();
  console.log('download bytes=' + buf.length + ' textlen=' + text.length);
  if (!text) bail('empty export');

  // 4) parse — JSON array, {hits:[...]}, or newline-delimited JSON
  let arr = [];
  try {
    const j = JSON.parse(text);
    arr = Array.isArray(j) ? j : (j.hits || j.rows || []);
  } catch {
    arr = text.split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  }
  console.log('parsed ' + arr.length + ' rows; firstKeys=' + (arr[0] ? Object.keys(arr[0]).join(',') : 'none'));
  if (!arr.length) bail('0 rows in export');

  const rows = arr.map((h) => ({
    date: h.created_at || h.date || '',
    country: String(h.location || '').slice(0, 2),
    browser: h.browser || '',
    system: h.system || '',
    ua: h.user_agent || ''
  })).filter((x) => x.date);
  rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const out = rows.slice(0, LIMIT);
  if (!out.length) bail('no dated rows');
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('wrote ' + out.length + ' rows to ' + OUT);
}

main().catch((e) => bail('error: ' + (e && e.message)));
