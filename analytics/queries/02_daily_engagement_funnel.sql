-- Daily engagement funnel: sessions → story opens → ratings/shares.
-- Uses the day partition on events.created_at, so scans stay tiny and cheap.
WITH daily AS (
  SELECT
    DATE(created_at)                                             AS day,
    COUNT(DISTINCT IF(event_type = 'session_started', session_id, NULL)) AS sessions,
    COUNT(DISTINCT IF(event_type = 'story_opened',   id, NULL))  AS story_opens,
    COUNT(DISTINCT IF(event_type = 'rating_submitted', id, NULL)) AS ratings,
    COUNT(DISTINCT IF(event_type = 'share_clicked',  id, NULL))  AS shares
  FROM `good_earth_news.events`
  WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
  GROUP BY day
)
SELECT
  day,
  sessions,
  story_opens,
  ratings,
  shares,
  ROUND(SAFE_DIVIDE(story_opens, sessions), 2) AS opens_per_session,
  ROUND(SAFE_DIVIDE(ratings, story_opens), 3)  AS rating_conversion,
  ROUND(SAFE_DIVIDE(shares,  story_opens), 3)  AS share_conversion
FROM daily
ORDER BY day DESC;
