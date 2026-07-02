-- Leaderboard: the stories readers engage with most, with a simple weighted
-- score (a share signals more than an open). Window function ranks within
-- category so each category's champion is visible too.
WITH per_story AS (
  SELECT
    e.article_id,
    COUNTIF(e.event_type = 'story_opened')     AS opens,
    COUNTIF(e.event_type = 'rating_submitted') AS ratings,
    COUNTIF(e.event_type = 'share_clicked')    AS shares
  FROM (SELECT DISTINCT id, event_type, article_id FROM `good_earth_news.events`) e
  WHERE e.article_id IS NOT NULL
  GROUP BY e.article_id
)
SELECT
  a.title,
  a.category,
  a.source,
  s.opens, s.ratings, s.shares,
  ROUND(a.avg_rating, 2)                              AS avg_rating,
  s.opens + 2 * s.ratings + 3 * s.shares              AS engagement_score,
  RANK() OVER (PARTITION BY a.category
               ORDER BY s.opens + 2 * s.ratings + 3 * s.shares DESC) AS rank_in_category
FROM per_story s
JOIN `good_earth_news.articles` a ON a.id = s.article_id
QUALIFY RANK() OVER (ORDER BY s.opens + 2 * s.ratings + 3 * s.shares DESC) <= 25
ORDER BY engagement_score DESC;
