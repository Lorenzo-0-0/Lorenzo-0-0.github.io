// Build data/recent-visits.json from the GoatCounter JSON export API.
// Run by .github/workflows/recent-visits.yml on a schedule (the export API is
// heavily rate-limited, so a single periodic job is the only viable source).
// Token from the GOATCOUNTER_TOKEN secret. The JSON export downloads as a ZIP
// (info.json + a data file). Output rows: { date, country, browser, system }.
// No IP/city — GoatCounter doesn't expose them in exports.
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const TOKEN = process.env.GOATCOUNTER_TOKEN;
const BASE = 'https://jingliangli.goatcounter.com/api/v0';
const OUT = 'data/recent-visits.json';
const ZIP = '/tmp/gc-export.zip';
const DIR = '/tmp/gcexp';
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

function fromCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  if (lines.length < 2) return [];
  const head = splitCSV(lines[0]).map((h) => h.trim().toLowerCase());
  const ix = (k) => head.indexOf(k);
  const di = ix('date'), li = ix('location'), bi = ix('browser'), si = ix('system');
  return lines.slice(1).map((l) => { const c = splitCSV(l); return { date: di >= 0 ? c[di] : '', loc: li >= 0 ? c[li] : '', browser: bi >= 0 ? c[bi] : '', system: si >= 0 ? c[si] : '' }; });
}
function fromJSON(text) {
  let j; try { j = JSON.parse(text); } catch { j = null; }
  let arr = Array.isArray(j) ? j : (j && typeof j === 'object' ? (Object.values(j).find(Array.isArray) || []) : []);
  if (!arr.length) arr = text.split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  if (arr[0]) console.log('JSON firstKeys=' + Object.keys(arr[0]).join(','));
  return arr.map((h) => ({ date: h.created_at || h.date || '', loc: h.location || '', browser: h.browser || '', system: h.system || '', ua: h.user_agent || '' }));
}

async function main() {
  if (!TOKEN) bail('no GOATCOUNTER_TOKEN');
  // 1) start a JSON export over a wide range
  const since = new Date(Date.now() - 180 * 864e5).toISOString();
  const r = await fetch(BASE + '/export', {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'json', start_from_day: since })
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

  // 3) download ZIP → unzip
  const dl = await fetch(BASE + '/export/' + id + '/download', { headers: H });
  if (!dl.ok) bail('download HTTP ' + dl.status);
  fs.writeFileSync(ZIP, Buffer.from(await dl.arrayBuffer()));
  execSync('rm -rf ' + DIR + ' && mkdir -p ' + DIR + ' && unzip -o ' + ZIP + ' -d ' + DIR);
  const files = execSync('find ' + DIR + ' -type f').toString().trim().split('\n').filter(Boolean);
  console.log('zip files: ' + files.map((f) => f.replace(DIR + '/', '')).join(' | '));

  // 4) pick the data file (largest non-info file) and parse
  const dataFiles = files.filter((f) => !/info\.json$/.test(f));
  if (!dataFiles.length) bail('no data file in export zip');
  dataFiles.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
  const file = dataFiles[0];
  const text = fs.readFileSync(file, 'utf8').trim();
  console.log('data file=' + file.replace(DIR + '/', '') + ' bytes=' + text.length + ' head=' + text.slice(0, 120).replace(/\n/g, '\\n'));
  let rows = (text[0] === '[' || text[0] === '{') ? fromJSON(text) : fromCSV(text);

  rows = rows.filter((x) => x.date).map((x) => ({ date: x.date, country: String(x.loc || '').slice(0, 2), browser: x.browser, system: x.system }));
  rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const out = rows.slice(0, LIMIT);
  console.log('parsed ' + rows.length + ' rows total');
  if (!out.length) bail('parsed 0 dated rows');
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('wrote ' + out.length + ' rows to ' + OUT);
}

main().catch((e) => bail('error: ' + (e && e.message)));
