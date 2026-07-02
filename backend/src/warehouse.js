import { BigQuery } from '@google-cloud/bigquery';
import { writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  getAllArticlesForExport, getAllRatingsForExport, getEventsAfter,
  getMeta, setMeta,
} from './db.js';

// ── BigQuery ELT ──────────────────────────────────────────────────────────────
// Nightly batch pipeline: SQLite (production OLTP) → BigQuery (analytics).
//  • articles / ratings: small snapshot tables, truncate-and-reload
//  • events: append-only incremental load, day-partitioned, cursor kept in meta
// Batch *load jobs* are free on BigQuery (unlike streaming inserts), which is
// why this ships NDJSON files instead of streaming rows.
//
// Dormant unless credentials are configured (same pattern as ANTHROPIC_API_KEY):
//  GOOGLE_APPLICATION_CREDENTIALS_JSON — full service-account JSON (one env var)
//  BIGQUERY_DATASET                    — optional, default 'good_earth_news'

const DATASET = process.env.BIGQUERY_DATASET || 'good_earth_news';

function credentials() {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    console.error('GOOGLE_APPLICATION_CREDENTIALS_JSON is set but is not valid JSON.');
    return null;
  }
}

export function isWarehouseConfigured() {
  const creds = credentials();
  return !!(creds && creds.project_id);
}

let _bq = null;
function client() {
  if (_bq) return _bq;
  const creds = credentials();
  _bq = new BigQuery({ projectId: creds.project_id, credentials: creds });
  return _bq;
}

const SCHEMAS = {
  articles: [
    { name: 'id', type: 'INT64' },
    { name: 'title', type: 'STRING' },
    { name: 'source', type: 'STRING' },
    { name: 'url', type: 'STRING' },
    { name: 'category', type: 'STRING' },
    { name: 'sentiment_score', type: 'FLOAT64' },
    { name: 'latitude', type: 'FLOAT64' },
    { name: 'longitude', type: 'FLOAT64' },
    { name: 'published_at', type: 'TIMESTAMP' },
    { name: 'is_demo', type: 'BOOL' },
    { name: 'featured_at', type: 'TIMESTAMP' },
    { name: 'created_at', type: 'TIMESTAMP' },
    { name: 'avg_rating', type: 'FLOAT64' },
    { name: 'rating_count', type: 'INT64' },
  ],
  ratings: [
    { name: 'id', type: 'INT64' },
    { name: 'article_id', type: 'INT64' },
    { name: 'rating', type: 'INT64' },
    { name: 'created_at', type: 'TIMESTAMP' },
  ],
  events: [
    { name: 'id', type: 'INT64' },
    { name: 'event_type', type: 'STRING' },
    { name: 'article_id', type: 'INT64' },
    { name: 'category', type: 'STRING' },
    { name: 'session_id', type: 'STRING' },
    { name: 'meta', type: 'STRING' },
    { name: 'created_at', type: 'TIMESTAMP' },
  ],
};

// SQLite timestamps come in two flavors ('YYYY-MM-DD HH:MM:SS' and ISO-8601);
// BigQuery accepts both for TIMESTAMP columns, so rows only need light shaping.
export function buildExports(lastEventId = 0) {
  const articles = getAllArticlesForExport().map(a => ({
    ...a,
    is_demo: !!a.is_demo,
    published_at: a.published_at || null,
    featured_at: a.featured_at || null,
  }));
  const ratings = getAllRatingsForExport();
  const events = getEventsAfter(lastEventId);
  return { articles, ratings, events };
}

async function ensureSchema() {
  const bq = client();
  const [datasets] = await bq.getDatasets();
  if (!datasets.some(d => d.id === DATASET)) {
    await bq.createDataset(DATASET);
    console.log(`Warehouse: created dataset ${DATASET}`);
  }
  const ds = bq.dataset(DATASET);
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    const table = ds.table(name);
    const [exists] = await table.exists();
    if (!exists) {
      const options = { schema: { fields: schema } };
      if (name === 'events') {
        options.timePartitioning = { type: 'DAY', field: 'created_at' };
      }
      await ds.createTable(name, options);
      console.log(`Warehouse: created table ${DATASET}.${name}`);
    }
  }
}

async function loadTable(name, rows, { truncate }) {
  if (!rows.length) return 0;
  const file = join(tmpdir(), `gew-${name}-${Date.now()}.ndjson`);
  writeFileSync(file, rows.map(r => JSON.stringify(r)).join('\n'));
  try {
    await client().dataset(DATASET).table(name).load(file, {
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      writeDisposition: truncate ? 'WRITE_TRUNCATE' : 'WRITE_APPEND',
    });
    return rows.length;
  } finally {
    rmSync(file, { force: true });
  }
}

// One sync pass. Returns stats, or { skipped: true } when unconfigured —
// callers never need to special-case the dormant state.
export async function syncToWarehouse() {
  if (!isWarehouseConfigured()) {
    return { skipped: true, reason: 'GOOGLE_APPLICATION_CREDENTIALS_JSON not configured' };
  }

  await ensureSchema();

  const lastEventId = Number(getMeta('warehouse_last_event_id') || 0);
  const { articles, ratings, events } = buildExports(lastEventId);

  const loadedArticles = await loadTable('articles', articles, { truncate: true });
  const loadedRatings  = await loadTable('ratings',  ratings,  { truncate: true });
  const loadedEvents   = await loadTable('events',   events,   { truncate: false });
  // Advance the cursor only after the events load succeeded, so a failed run
  // retries the same window (duplicates are possible on partial retry — the
  // analytics queries dedupe on event id).
  if (events.length) setMeta('warehouse_last_event_id', events[events.length - 1].id);

  const stats = { articles: loadedArticles, ratings: loadedRatings, events: loadedEvents };
  console.log(`Warehouse sync complete: ${JSON.stringify(stats)}`);
  return stats;
}
