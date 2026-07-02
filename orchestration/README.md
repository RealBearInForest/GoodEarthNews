# Orchestration — Airflow ELT DAG

An [Apache Airflow](https://airflow.apache.org/) DAG that orchestrates the Good
Earth News analytics pipeline end-to-end:

```
trigger_production_load ──► data_quality_checks ──► build_reporting_views
        │                          │                        │
  POST /api/warehouse-sync   hard gates on the         CREATE OR REPLACE
  (SQLite → BigQuery batch   loaded data: non-empty    vw_* views in BigQuery
  load on the prod host;     snapshot, no NULL keys,   from analytics/queries/
  admin-token gated)         bounded duplicate ratio   (BI-ready entry points)
```

Design notes:

- **Right-sized deployment.** One nightly DAG doesn't justify a 24/7 hosted
  Airflow cluster — this runs on demand (or on a laptop schedule) in Airflow's
  single-container `standalone` mode, while the production host keeps its own
  cron fallback. The DAG is the orchestrated, observable, quality-gated path.
- **Graceful degradation.** Without `GEW_ADMIN_TOKEN`, the production-load
  trigger *skips* (Airflow skip, not failure) and the analytics tasks still run
  against the warehouse as-is (`trigger_rule="none_failed"`).
- **Quality gates fail the run.** Empty article snapshots, NULL event keys, or
  an event-duplicate ratio above 5% (loads are at-least-once by design) stop
  the pipeline before views are rebuilt.

## Run it — Option A: Docker

```bash
cd orchestration
cp .env.example .env      # point GOOGLE_KEY_FILE at your service-account JSON
docker compose up         # UI on http://localhost:8080, login printed in logs
```

Trigger `good_earth_elt` from the UI, or wait for the 06:15 schedule.

## Run it — Option B: local Python (no Docker)

```bash
cd orchestration
python3 -m venv .venv && source .venv/bin/activate
pip install "apache-airflow==2.10.4" google-cloud-bigquery requests \
  --constraint "https://raw.githubusercontent.com/apache/airflow/constraints-2.10.4/constraints-3.11.txt"

export AIRFLOW_HOME="$PWD/.airflow"
export AIRFLOW__CORE__DAGS_FOLDER="$PWD/dags"
export AIRFLOW__CORE__LOAD_EXAMPLES=false
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
# export GEW_ADMIN_TOKEN=...   # optional — enables the production-load trigger

airflow db migrate
airflow dags test good_earth_elt 2026-07-01   # one full run, logs to stdout
# or: airflow standalone                       # scheduler + UI on :8080
```

## Outputs

Each successful run (re)builds these BigQuery views in `good_earth_news`:

| View | Question it answers |
|---|---|
| `vw_engagement_by_category` | Which categories over/under-perform their library share? |
| `vw_daily_engagement_funnel` | Sessions → opens → ratings/shares by day |
| `vw_top_stories` | Highest-engagement stories, deduped, ranked |
| `vw_ai_score_vs_readers` | Does the LLM's upliftingness score agree with human star ratings? |
| `vw_featured_set_performance` | How each day's featured set converted |
