"""
Good Earth News — ELT orchestration DAG.

Nightly pipeline over the BigQuery warehouse:

    trigger_production_load  →  data_quality_checks  →  build_reporting_views

1. **trigger_production_load** — kicks the production service's SQLite→BigQuery
   batch load (articles/ratings snapshots + incremental, day-partitioned events).
   Skips cleanly when GEW_ADMIN_TOKEN isn't configured, so the analytics half of
   the DAG still runs against whatever is already in the warehouse.
2. **data_quality_checks** — hard gates on the loaded data: non-empty article
   snapshot, no NULL keys in the event stream, and a bounded duplicate ratio
   (the loader's retry semantics allow at-least-once delivery; queries dedupe).
3. **build_reporting_views** — materialises every query in analytics/queries/
   as a `vw_*` reporting view in BigQuery, so BI tools (Looker Studio) and
   interviews have stable, named entry points instead of raw SQL files.

Credentials: GOOGLE_APPLICATION_CREDENTIALS (service-account JSON path).
"""
from __future__ import annotations

import os
import re
from datetime import datetime, timedelta
from pathlib import Path

import requests
from airflow.decorators import dag, task
from airflow.exceptions import AirflowSkipException

# orchestration/dags/ → repo root is two levels up
REPO_ROOT = Path(__file__).resolve().parents[2]
QUERIES_DIR = REPO_ROOT / "analytics" / "queries"

BASE_URL = os.environ.get("GEW_BASE_URL", "https://goodearthnews.org")
DATASET = os.environ.get("BIGQUERY_DATASET", "good_earth_news")

# Loader retries mean events can be delivered at-least-once; queries dedupe on
# id. Fail the pipeline only when duplication climbs past this ratio.
MAX_EVENT_DUP_RATIO = 0.05

DEFAULT_ARGS = {
    "retries": 2,
    "retry_delay": timedelta(minutes=2),
}


def _bq():
    from google.cloud import bigquery  # imported lazily so DAG parses without the lib

    return bigquery.Client()


@dag(
    dag_id="good_earth_elt",
    schedule="15 6 * * *",          # after the site's own 06:10 fallback sync
    start_date=datetime(2026, 7, 1),
    catchup=False,
    default_args=DEFAULT_ARGS,
    tags=["elt", "bigquery", "good-earth-news"],
    doc_md=__doc__,
)
def good_earth_elt():

    @task
    def trigger_production_load() -> dict:
        """POST /api/warehouse-sync on the production service (admin-token gated)."""
        token = os.environ.get("GEW_ADMIN_TOKEN")
        if not token:
            raise AirflowSkipException(
                "GEW_ADMIN_TOKEN not set — skipping the production load trigger; "
                "downstream tasks run against the warehouse as-is."
            )
        resp = requests.post(
            f"{BASE_URL}/api/warehouse-sync",
            headers={"x-admin-token": token},
            timeout=180,
        )
        resp.raise_for_status()
        stats = resp.json()
        if not stats.get("success"):
            raise ValueError(f"Production load reported failure: {stats}")
        print(f"Production load complete: {stats}")
        return stats

    # trigger_rule="none_failed": run even when the upstream trigger was skipped
    # (no token) — but never after a genuine failure.
    @task(trigger_rule="none_failed")
    def data_quality_checks() -> dict:
        client = _bq()

        def scalar(sql: str):
            return list(client.query(sql).result())[0][0]

        articles = scalar(f"SELECT COUNT(*) FROM `{DATASET}.articles`")
        null_keys = scalar(
            f"SELECT COUNT(*) FROM `{DATASET}.events` "
            "WHERE id IS NULL OR event_type IS NULL"
        )
        total_events = scalar(f"SELECT COUNT(*) FROM `{DATASET}.events`")
        distinct_events = scalar(f"SELECT COUNT(DISTINCT id) FROM `{DATASET}.events`")
        dup_ratio = 1 - (distinct_events / total_events) if total_events else 0.0

        results = {
            "articles": articles,
            "events": total_events,
            "distinct_events": distinct_events,
            "event_dup_ratio": round(dup_ratio, 4),
            "null_event_keys": null_keys,
        }
        print(f"Data quality: {results}")

        failures = []
        if articles == 0:
            failures.append("articles snapshot is empty")
        if null_keys > 0:
            failures.append(f"{null_keys} events with NULL id/event_type")
        if dup_ratio > MAX_EVENT_DUP_RATIO:
            failures.append(f"event duplicate ratio {dup_ratio:.1%} exceeds {MAX_EVENT_DUP_RATIO:.0%}")
        if failures:
            raise ValueError("Data quality gate failed: " + "; ".join(failures))
        return results

    @task(trigger_rule="none_failed")
    def build_reporting_views() -> list[str]:
        """CREATE OR REPLACE one vw_* view per file in analytics/queries/."""
        client = _bq()
        created = []
        for sql_file in sorted(QUERIES_DIR.glob("*.sql")):
            view_name = "vw_" + re.sub(r"^\d+_", "", sql_file.stem)
            sql = sql_file.read_text()
            client.query(
                f"CREATE OR REPLACE VIEW `{DATASET}.{view_name}` AS\n{sql}"
            ).result()
            created.append(view_name)
            print(f"materialised {DATASET}.{view_name}  ←  {sql_file.name}")
        if not created:
            raise ValueError(f"No .sql files found in {QUERIES_DIR}")
        return created

    trigger_production_load() >> data_quality_checks() >> build_reporting_views()


good_earth_elt()
