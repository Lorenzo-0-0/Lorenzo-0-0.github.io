-- Per-visit log. `ip` is the only sensitive column: stored for the owner
-- (queryable via `wrangler d1 execute`), but NEVER returned by any public
-- endpoint (/recent and /points both omit it).
CREATE TABLE IF NOT EXISTS visits (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ip        TEXT,            -- full IP — PRIVATE, owner-only
  city      TEXT,
  region    TEXT,
  country   TEXT,            -- ISO-3166-1 alpha-2 (from request.cf.country)
  lat       REAL,
  lng       REAL,
  org       TEXT,            -- ISP / ASN organization
  path      TEXT,
  referrer  TEXT,
  browser   TEXT,
  os        TEXT
);

CREATE INDEX IF NOT EXISTS idx_visits_ts ON visits (ts);
CREATE INDEX IF NOT EXISTS idx_visits_ip_path_ts ON visits (ip, path, ts);
