# Good Earth News — Analytics Pipeline (BigQuery)

A classic **OLTP → ELT → warehouse** pipeline layered on the production app:

```
 Browser (anonymous events)          Express + SQLite (production OLTP)
   story_opened / rating_submitted     articles · ratings · events
   share_clicked / fly_to_story  ───►  POST /api/events
   session_started                          │
                                            │  nightly batch ELT (06:10)
                                            ▼
                                   Google BigQuery  (dataset: good_earth_news)
                                     • articles  — snapshot, truncate-and-reload
                                     • ratings   — snapshot, truncate-and-reload
                                     • events    — incremental append,
                                                   day-partitioned on created_at
                                            │
                                            ▼
                                   Analytical SQL (queries/)
```

## Design decisions

- **Batch load jobs, not streaming inserts.** BigQuery load jobs are free;
  streaming inserts are billed. The nightly job writes NDJSON and submits load
  jobs — the entire pipeline runs within BigQuery's free tier
  (10 GB storage, 1 TB query/month; this project is kilobytes).
- **Incremental events with a cursor.** Events are append-only; the exporter
  keeps the last-shipped id in the app's `meta` table and only ships new rows.
  On a partial failure the cursor doesn't advance, so the window retries —
  duplicates are possible and analytics queries dedupe on event id
  (`SELECT DISTINCT id, …`).
- **Day-partitioned events table.** Queries filter on `created_at`, so
  partition pruning keeps scan sizes (and cost) minimal as the table grows.
- **Warehouse out of the serving path.** The website never queries BigQuery;
  it's purely the analytics layer. The pipeline is dormant (clean no-op) until
  credentials are configured — the app runs fine without it.
- **No PII.** Events carry a random per-browser-session UUID only.

## The queries (`queries/`)

| File | Question it answers | Techniques |
|---|---|---|
| `01_engagement_by_category.sql` | Which categories over/under-perform vs their share of the library? | CTEs, window aggregates, engagement index |
| `02_daily_engagement_funnel.sql` | Sessions → opens → ratings/shares per day | conditional aggregation, partition pruning, conversion rates |
| `03_top_stories.sql` | Most engaging stories, overall and per category | weighted scoring, `RANK() OVER`, `QUALIFY` |
| `04_ai_score_vs_readers.sql` | Does Claude's upliftingness score agree with human star ratings? | `CORR()`, sliced aggregates |
| `05_featured_set_performance.sql` | What share of each day's featured set gets opened? | date-aligned joins, coverage ratios |

## Setup

1. Create a Google Cloud project → enable the **BigQuery API**.
2. Create a **service account** with roles **BigQuery Data Editor** and
   **BigQuery Job User** → create a **JSON key**.
3. Set env vars on the server (Render → Environment):
   - `GOOGLE_APPLICATION_CREDENTIALS_JSON` — the key file's JSON, pasted as one value
   - `BIGQUERY_DATASET` — optional, defaults to `good_earth_news`
4. The nightly job (06:10) creates the dataset/tables on first run. To sync
   immediately: `curl -X POST -H "x-admin-token: …" https://goodearthnews.org/api/warehouse-sync`
5. Run the queries in the BigQuery console (adjust the dataset qualifier if
   your project id differs).
