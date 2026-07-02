-- Does the AI's "upliftingness" score agree with human readers?
-- Correlates Claude's sentiment score (assigned at ingestion) with the star
-- ratings visitors actually give. CORR() over articles with enough ratings;
-- the bucketed breakdown shows where the model over/under-shoots.
WITH rated AS (
  SELECT
    a.id,
    a.sentiment_score,
    a.avg_rating,
    a.rating_count,
    a.category
  FROM `good_earth_news.articles` a
  WHERE a.rating_count >= 1 AND NOT a.is_demo
)
SELECT
  'overall' AS slice,
  COUNT(*) AS articles,
  ROUND(CORR(sentiment_score, avg_rating), 3) AS ai_vs_reader_correlation,
  ROUND(AVG(sentiment_score), 2) AS avg_ai_score,
  ROUND(AVG(avg_rating), 2)      AS avg_reader_rating
FROM rated

UNION ALL

SELECT
  CONCAT('category: ', category),
  COUNT(*),
  ROUND(CORR(sentiment_score, avg_rating), 3),
  ROUND(AVG(sentiment_score), 2),
  ROUND(AVG(avg_rating), 2)
FROM rated
GROUP BY category
ORDER BY slice;
