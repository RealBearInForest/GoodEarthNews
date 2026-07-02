-- How well does each day's featured set perform?
-- The daily job features 10–15 random stories; this measures what share of the
-- day's featured stories actually got opened (open coverage) and total pull.
WITH featured_days AS (
  SELECT DATE(featured_at) AS featured_day, id AS article_id
  FROM `good_earth_news.articles`
  WHERE featured_at IS NOT NULL
),
opens AS (
  SELECT DISTINCT id, article_id, DATE(created_at) AS open_day
  FROM `good_earth_news.events`
  WHERE event_type = 'story_opened' AND article_id IS NOT NULL
)
SELECT
  f.featured_day,
  COUNT(DISTINCT f.article_id)                       AS stories_featured,
  COUNT(DISTINCT o.article_id)                       AS stories_opened,
  ROUND(SAFE_DIVIDE(COUNT(DISTINCT o.article_id),
                    COUNT(DISTINCT f.article_id)), 2) AS open_coverage,
  COUNT(o.id)                                        AS total_opens
FROM featured_days f
LEFT JOIN opens o
  ON o.article_id = f.article_id AND o.open_day = f.featured_day
GROUP BY f.featured_day
ORDER BY f.featured_day DESC;
