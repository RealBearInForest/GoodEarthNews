-- Which story categories do visitors actually engage with?
-- Joins the events stream to the article dimension and compares each
-- category's share of opens against its share of the library — a category
-- punching above its library share is over-performing.
WITH opens AS (
  SELECT DISTINCT id, article_id, category          -- DISTINCT id dedupes retried loads
  FROM `good_earth_news.events`
  WHERE event_type = 'story_opened' AND article_id IS NOT NULL
),
library AS (
  SELECT category, COUNT(*) AS articles_in_library
  FROM `good_earth_news.articles`
  WHERE NOT is_demo
  GROUP BY category
)
SELECT
  l.category,
  l.articles_in_library,
  COUNT(o.id)                                       AS story_opens,
  ROUND(COUNT(o.id) / SUM(COUNT(o.id)) OVER (), 3)  AS share_of_opens,
  ROUND(l.articles_in_library / SUM(l.articles_in_library) OVER (), 3) AS share_of_library,
  ROUND(SAFE_DIVIDE(
    COUNT(o.id) / SUM(COUNT(o.id)) OVER (),
    l.articles_in_library / SUM(l.articles_in_library) OVER ()), 2)    AS engagement_index
FROM library l
LEFT JOIN opens o USING (category)
GROUP BY l.category, l.articles_in_library
ORDER BY engagement_index DESC;
