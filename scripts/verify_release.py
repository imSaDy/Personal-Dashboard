"""Smoke-test a clean Lumen checkout without touching the user's database."""

from __future__ import annotations

import os
import sqlite3
import sys
import tempfile
from contextlib import closing
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PAGE_ROUTES = (
    "/",
    "/today",
    "/performance",
    "/planner",
    "/timer",
    "/tasks",
    "/habits",
    "/goals",
)
EMPTY_COLLECTION_ROUTES = (
    "/api/tasks",
    "/api/habits",
    "/api/goals",
)


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="lumen-release-check-") as temp_dir:
        database_path = Path(temp_dir) / "database.db"
        os.environ["LUMEN_DB_FILE"] = str(database_path)
        sys.path.insert(0, str(PROJECT_ROOT))

        import app as lumen_app  # pylint: disable=import-outside-toplevel

        lumen_app.app.config.update(TESTING=True)
        with lumen_app.app.test_client() as client:
            for route in PAGE_ROUTES:
                response = client.get(route, follow_redirects=True)
                if response.status_code != 200:
                    raise RuntimeError(
                        f"Page smoke test failed for {route}: {response.status_code}"
                    )

            health = client.get("/api/health")
            payload = health.get_json(silent=True) or {}
            if health.status_code != 200 or payload.get("app") != "lumen-dashboard":
                raise RuntimeError("Health endpoint did not identify Lumen correctly")
            if payload.get("revision") != lumen_app.APP_REVISION:
                raise RuntimeError("Health endpoint returned an unexpected source revision")

            for route in EMPTY_COLLECTION_ROUTES:
                response = client.get(route)
                if response.status_code != 200 or response.get_json() != []:
                    raise RuntimeError(
                        f"Fresh-install privacy check failed for {route}"
                    )

        with closing(sqlite3.connect(database_path)) as connection:
            integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
            if integrity != "ok":
                raise RuntimeError(f"Release database integrity failed: {integrity}")

    print("  Pages: all public routes returned HTTP 200")
    print("  Health: app identity and revision are valid")
    print("  Privacy: fresh user collections are empty")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
