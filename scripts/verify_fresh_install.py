"""Verify that a clean Lumen install creates a valid, empty SQLite database."""

from __future__ import annotations

import os
import sqlite3
import sys
import tempfile
from contextlib import closing
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
REQUIRED_TABLES = {
    "time_logs",
    "tasks",
    "habits",
    "habit_logs",
    "goals",
    "daily_focus",
    "daily_journal",
    "day_schedule_sessions",
    "app_settings",
}


def main() -> int:
    try:
        flask_version = version("Flask")
    except PackageNotFoundError as error:
        raise RuntimeError("Flask is not installed in the Lumen environment") from error

    with tempfile.TemporaryDirectory(prefix="lumen-fresh-install-") as temp_dir:
        database_path = Path(temp_dir) / "database.db"
        os.environ["LUMEN_DB_FILE"] = str(database_path)
        sys.path.insert(0, str(PROJECT_ROOT))

        import database  # pylint: disable=import-outside-toplevel

        database.init_db()

        with closing(sqlite3.connect(database_path)) as connection:
            integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
            if integrity != "ok":
                raise RuntimeError(f"SQLite integrity check failed: {integrity}")

            actual_tables = {
                row[0]
                for row in connection.execute(
                    """
                    SELECT name
                    FROM sqlite_master
                    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
                    """
                )
            }
            missing_tables = REQUIRED_TABLES - actual_tables
            if missing_tables:
                missing = ", ".join(sorted(missing_tables))
                raise RuntimeError(f"Fresh database is missing tables: {missing}")

            populated_tables = {
                table
                for table in REQUIRED_TABLES
                if connection.execute(
                    f'SELECT COUNT(*) FROM "{table}"'
                ).fetchone()[0]
            }
            if populated_tables:
                populated = ", ".join(sorted(populated_tables))
                raise RuntimeError(
                    f"Fresh database unexpectedly contains data: {populated}"
                )

    print(f"  Flask {flask_version}")
    print("  Fresh database: valid schema, zero user records")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
