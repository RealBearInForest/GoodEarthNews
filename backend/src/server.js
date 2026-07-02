import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import schedule from 'node-schedule';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import articlesRouter from './routes/articles.js';
import ratingsRouter from './routes/ratings.js';
import { fetchAndStoreArticles, seedDemoArticles } from './newsAggregator.js';
import {
  selectDailyFeatured, hasFeaturedForToday, countLibrary,
  LIBRARY_TARGET, DAILY_MIN, DAILY_MAX,
} from './db.js';

const app = express();
const PORT = process.env.PORT || 3001;
const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = path.join(__dirname, '../../frontend/dist');

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000'] }));
app.use(express.json());

app.use('/api/articles', articlesRouter);
app.use('/api/ratings', ratingsRouter);

// Random number of stories to feature each day (10–15 inclusive).
const dailyCount = () => DAILY_MIN + Math.floor(Math.random() * (DAILY_MAX - DAILY_MIN + 1));

// The daily job: top up the library toward 200 (only while it isn't full and we
// have an API key), then rotate in a fresh random featured set. Once the library
// is full this does no scraping at all — it just re-features.
async function runDailyJob() {
  try {
    if (hasApiKey && countLibrary() < LIBRARY_TARGET) {
      await fetchAndStoreArticles();
    }
    const n = selectDailyFeatured(dailyCount());
    console.log(`Featured ${n} stories for today (library ${countLibrary()}/${LIBRARY_TARGET}).`);
  } catch (err) {
    console.error('Daily job failed:', err.message);
  }
}

// Manual trigger (admin only): scrape toward the target, then re-feature.
// Fail closed — this endpoint spends real API credits, so it refuses to run at
// all unless ADMIN_TOKEN is configured, and requires the caller to present it.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

app.post('/api/fetch', async (req, res) => {
  if (!ADMIN_TOKEN) {
    return res.status(503).json({ error: 'Admin endpoint disabled: ADMIN_TOKEN is not configured.' });
  }
  // Header only — a ?token= query param would leak the secret into server and
  // proxy logs.
  if (req.get('x-admin-token') !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const result = await fetchAndStoreArticles();
    const featured = selectDailyFeatured(dailyCount());
    res.json({ success: true, ...result, library: countLibrary(), featured });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// In production, serve the built frontend from this same server (one origin, no
// CORS). Any non-API GET falls back to index.html so the single-page app loads.
if (existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.use((req, res) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });
  console.log(`Serving frontend from ${FRONTEND_DIST}`);
}

// Start server and initialize
app.listen(PORT, async () => {
  console.log(`Good Earth News backend running on port ${PORT}`);

  // Make sure there's content + a featured set to show immediately.
  await seedDemoArticles();
  if (!hasFeaturedForToday()) {
    const n = selectDailyFeatured(dailyCount());
    console.log(`Featured ${n} stories for today (library ${countLibrary()}/${LIBRARY_TARGET}).`);
  }

  // Re-feature every day at 06:00, building the library first if it isn't full.
  schedule.scheduleJob('0 6 * * *', runDailyJob);

  if (hasApiKey) {
    if (countLibrary() < LIBRARY_TARGET) {
      // Keep building toward the target in the background (non-blocking startup).
      console.log(`Library ${countLibrary()}/${LIBRARY_TARGET} — building in the background…`);
      setTimeout(() => runDailyJob(), 3000);
    } else {
      console.log(`Library full (${countLibrary()}/${LIBRARY_TARGET}) — serving stored articles, no scraping.`);
    }
  } else {
    console.warn('ANTHROPIC_API_KEY not set — running with demo/stored articles only.');
    console.warn('Set ANTHROPIC_API_KEY to build the verified article library.');
  }
});
