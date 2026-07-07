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
REQUIRED_RELEASE_FILES = (
    ("README.md", 5_000),
    ("Setup-Lumen.cmd", 100),
    ("Setup-Lumen.ps1", 5_000),
    ("requirements.txt", 10),
    ("schema.sql", 1_000),
    ("launcher/Install-DesktopShortcut.ps1", 500),
    ("launcher/Lumen.ico", 10_000),
    ("launcher/Open Personal Dashboard.vbs", 500),
    ("launcher/Start-PersonalDashboard.ps1", 5_000),
    ("launcher/dashboard_server.py", 500),
    ("launcher/desktop_floating_timer.py", 10_000),
    ("media/lumen-dashboard-preview.png", 100_000),
    ("media/lumen-architecture.png", 100_000),
    ("static/activity-autocomplete.js", 1_000),
    ("static/beep.mp3", 1_000),
    ("static/chart.min.js", 100_000),
    ("static/charts.js", 10_000),
    ("static/fonts/OFL.txt", 1_000),
    ("static/fonts/Poppins-Bold.ttf", 100_000),
    ("static/fonts/Poppins-Medium.ttf", 100_000),
    ("static/fonts/Poppins-Regular.ttf", 100_000),
    ("static/fonts/Poppins-SemiBold.ttf", 100_000),
    ("static/lumen-icon.png", 10_000),
    ("static/modal-a11y.js", 1_000),
    ("static/planner.js", 10_000),
    ("static/quick-capture.js", 1_000),
    ("static/schedule-runner.js", 5_000),
    ("static/script.js", 1_000),
    ("static/streak.js", 1_000),
    ("static/style.css", 10_000),
    ("static/tailwind-built.css", 50_000),
    ("static/tasks.js", 1_000),
    ("static/timer.js", 10_000),
    ("static/today.js", 1_000),
    ("templates/base.html", 1_000),
    ("templates/today.html", 1_000),
    ("templates/performance.html", 1_000),
    ("templates/planner.html", 1_000),
    ("templates/timer.html", 1_000),
    ("templates/tasks.html", 1_000),
    ("templates/habits.html", 1_000),
    ("templates/goals.html", 1_000),
)


def verify_required_files() -> None:
    missing_or_incomplete = []
    for relative_path, minimum_size in REQUIRED_RELEASE_FILES:
        path = PROJECT_ROOT / relative_path
        if not path.is_file():
            missing_or_incomplete.append(f"{relative_path} is missing")
            continue
        actual_size = path.stat().st_size
        if actual_size < minimum_size:
            missing_or_incomplete.append(
                f"{relative_path} is unexpectedly small ({actual_size} bytes)"
            )

    if missing_or_incomplete:
        details = "\n  - ".join(missing_or_incomplete)
        raise RuntimeError(f"Release package is incomplete:\n  - {details}")


def main() -> int:
    verify_required_files()

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

    print("  Assets: required fonts, images, scripts, and launcher files are present")
    print("  Pages: all public routes returned HTTP 200")
    print("  Health: app identity and revision are valid")
    print("  Privacy: fresh user collections are empty")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
