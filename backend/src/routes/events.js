import { Router } from 'express';
import { insertEvent } from '../db.js';

const router = Router();

// Only these event types are accepted — everything else is dropped.
const EVENT_TYPES = new Set([
  'session_started',
  'story_opened',
  'rating_submitted',
  'share_clicked',
  'fly_to_story',
]);

// Naive in-memory rate limit: max N events per IP per minute. Enough to stop
// accidental floods without adding a dependency; entries are pruned each window.
const WINDOW_MS = 60_000, MAX_PER_WINDOW = 120;
const buckets = new Map();
setInterval(() => buckets.clear(), WINDOW_MS).unref();

function allow(ip) {
  const n = (buckets.get(ip) || 0) + 1;
  buckets.set(ip, n);
  return n <= MAX_PER_WINDOW;
}

router.post('/', (req, res) => {
  if (!allow(req.ip)) return res.status(429).json({ error: 'Too many events' });

  const { event_type, article_id, category, session_id, meta } = req.body || {};
  if (!EVENT_TYPES.has(event_type)) {
    return res.status(400).json({ error: 'Unknown event_type' });
  }

  try {
    insertEvent({
      event_type,
      article_id: Number.isInteger(article_id) ? article_id : null,
      category: typeof category === 'string' ? category.slice(0, 40) : null,
      session_id: typeof session_id === 'string' ? session_id.slice(0, 64) : null,
      meta: meta != null ? JSON.stringify(meta).slice(0, 500) : null,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
