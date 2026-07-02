import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
// In production set DATA_DIR to a persistent disk (e.g. /var/data on Render) so
// the article library and ratings survive restarts/redeploys.
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '../../data');
mkdirSync(DATA_DIR, { recursive: true });

// We build a one-time curated library of Claude-verified feel-good articles,
// then stop scraping. Each day a random handful is "featured" on the globe.
export const LIBRARY_TARGET = 200;   // how many verified articles to collect
export const DAILY_MIN = 10;         // featured per day (inclusive range)
export const DAILY_MAX = 15;

export const db = new Database(join(DATA_DIR, 'articles.db'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    url TEXT UNIQUE NOT NULL,
    source TEXT,
    image_url TEXT,
    published_at TEXT,
    sentiment_score REAL DEFAULT 0,
    latitude REAL DEFAULT 0,
    longitude REAL DEFAULT 0,
    category TEXT DEFAULT 'environment',
    is_demo INTEGER DEFAULT 0,
    featured_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id INTEGER NOT NULL REFERENCES articles(id),
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC);
  CREATE INDEX IF NOT EXISTS idx_ratings_article ON ratings(article_id);
`);

// Migrations: add columns to databases created before they existed. Must run
// before any index that references those columns.
const cols = db.prepare(`PRAGMA table_info(articles)`).all().map(c => c.name);
if (!cols.includes('is_demo'))     db.exec(`ALTER TABLE articles ADD COLUMN is_demo INTEGER DEFAULT 0`);
if (!cols.includes('featured_at')) db.exec(`ALTER TABLE articles ADD COLUMN featured_at TEXT`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_articles_featured ON articles(featured_at)`);

// Anonymous engagement events (story opens, ratings, shares). This is the OLTP
// side of the analytics pipeline — a nightly batch job ships these to the
// BigQuery warehouse (see warehouse.js). No PII: session_id is a random
// per-browser-session UUID.
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    article_id INTEGER,
    category TEXT,
    session_id TEXT,
    meta TEXT,
    created_at TEXT DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS idx_events_id ON events(id);
  CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
`);

export function insertEvent({ event_type, article_id = null, category = null, session_id = null, meta = null }) {
  return db.prepare(`
    INSERT INTO events (event_type, article_id, category, session_id, meta)
    VALUES (?, ?, ?, ?, ?)
  `).run(event_type, article_id, category, session_id, meta);
}

// Incremental read for the warehouse export (events are append-only).
export function getEventsAfter(id, limit = 50000) {
  return db.prepare(`SELECT * FROM events WHERE id > ? ORDER BY id LIMIT ?`).all(id, limit);
}

export function countEvents() {
  return db.prepare(`SELECT COUNT(*) AS n FROM events`).get().n;
}

// Full snapshot exports for the warehouse (small tables, truncate-and-reload).
export function getAllArticlesForExport() {
  return db.prepare(`
    SELECT a.id, a.title, a.source, a.url, a.category, a.sentiment_score,
           a.latitude, a.longitude, a.published_at, a.is_demo, a.featured_at,
           a.created_at,
           COALESCE(AVG(r.rating), 0) AS avg_rating,
           COUNT(r.id) AS rating_count
    FROM articles a
    LEFT JOIN ratings r ON r.article_id = a.id
    GROUP BY a.id
  `).all();
}

export function getAllRatingsForExport() {
  return db.prepare(`SELECT id, article_id, rating, created_at FROM ratings`).all();
}

// Small key/value store for one-time maintenance markers (e.g. library audits).
db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`);
export function getMeta(key) {
  const row = db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key);
  return row ? row.value : null;
}
export function setMeta(key, value) {
  db.prepare(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, String(value));
}

// ─── Counts ─────────────────────────────────────────────────────────────────
// Size of the curated library (Claude-verified articles, excluding demo seeds).
export function countLibrary() {
  return db.prepare(`SELECT COUNT(*) AS n FROM articles WHERE is_demo = 0`).get().n;
}

export function countAll() {
  return db.prepare(`SELECT COUNT(*) AS n FROM articles`).get().n;
}

// ─── Inserts / lookups ──────────────────────────────────────────────────────
// Cheap existence check used to skip the (paid) Claude analysis for URLs we've
// already processed. The URL column is UNIQUE, so this is an index lookup.
export function hasArticle(url) {
  return !!db.prepare(`SELECT 1 FROM articles WHERE url = ? LIMIT 1`).get(url);
}

export function insertArticle(article) {
  return db.prepare(`
    INSERT OR IGNORE INTO articles
      (title, description, url, source, image_url, published_at, sentiment_score, latitude, longitude, category, is_demo)
    VALUES
      (@title, @description, @url, @source, @image_url, @published_at, @sentiment_score, @latitude, @longitude, @category, @is_demo)
  `).run({ is_demo: 0, ...article });
}

export function insertRating(articleId, rating) {
  return db.prepare(`INSERT INTO ratings (article_id, rating) VALUES (?, ?)`).run(articleId, rating);
}

export function getArticleById(id) {
  return db.prepare(`
    SELECT a.*,
      COALESCE(AVG(r.rating), 0) as avg_rating,
      COUNT(r.id) as rating_count
    FROM articles a
    LEFT JOIN ratings r ON r.article_id = a.id
    WHERE a.id = ?
    GROUP BY a.id
  `).get(id);
}

// All verified (non-demo) library articles — used by the quality audit.
export function getLibraryArticles() {
  return db.prepare(`SELECT * FROM articles WHERE is_demo = 0 ORDER BY id`).all();
}

// Hard-delete one article and its ratings (used when an audit rejects it).
export function deleteArticle(id) {
  db.prepare(`DELETE FROM ratings WHERE article_id = ?`).run(id);
  return db.prepare(`DELETE FROM articles WHERE id = ?`).run(id).changes;
}

// Remove demo seeds once the real library can stand on its own — but never one
// that's currently featured, so today's set never points at a deleted row. The
// next daily refresh un-features it, and a later call prunes it.
export function deleteDemoArticles() {
  db.prepare(`DELETE FROM ratings WHERE article_id IN (SELECT id FROM articles WHERE is_demo = 1 AND featured_at IS NULL)`).run();
  return db.prepare(`DELETE FROM articles WHERE is_demo = 1 AND featured_at IS NULL`).run().changes;
}

// ─── Daily featured selection ───────────────────────────────────────────────
// Promote a fresh random set of `count` articles as today's featured stories.
// Prefers the verified library; only falls back to demo seeds when the library
// is still too small to fill the set.
export function selectDailyFeatured(count) {
  // Feature only verified articles once the library can sustain a full daily set
  // on its own; below that, fall back to including the demo seeds.
  const pool = countLibrary() >= DAILY_MAX ? 'WHERE is_demo = 0' : '';
  db.prepare(`UPDATE articles SET featured_at = NULL`).run();
  db.prepare(`
    UPDATE articles SET featured_at = datetime('now')
    WHERE id IN (SELECT id FROM articles ${pool} ORDER BY RANDOM() LIMIT ?)
  `).run(count);
  return getFeaturedArticles().length;
}

// Today's featured set — this is what the globe displays.
export function getFeaturedArticles() {
  return db.prepare(`
    SELECT a.*,
      COALESCE(AVG(r.rating), 0) as avg_rating,
      COUNT(r.id) as rating_count
    FROM articles a
    LEFT JOIN ratings r ON r.article_id = a.id
    WHERE a.featured_at IS NOT NULL
    GROUP BY a.id
    ORDER BY a.published_at DESC
  `).all();
}

export function hasFeaturedForToday() {
  // Compare local calendar day so the set rotates at local midnight, not UTC.
  return !!db.prepare(
    `SELECT 1 FROM articles WHERE date(featured_at, 'localtime') = date('now', 'localtime') LIMIT 1`
  ).get();
}

export default db;
