import os
import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier


TEST_DIRECTORY = tempfile.TemporaryDirectory(prefix="lumen-planner-tests-")
os.environ["LUMEN_DB_FILE"] = os.path.join(
    TEST_DIRECTORY.name,
    "planner-tests.db",
)

import app as lumen_app  # noqa: E402
import database  # noqa: E402


class DayPlannerApiTests(unittest.TestCase):
    def setUp(self):
        self.client = lumen_app.app.test_client()
        connection = database.get_connection()
        connection.execute("DELETE FROM day_schedule_sessions")
        connection.commit()
        connection.close()

    def add_session(
        self,
        plan_date="2030-01-01",
        session_type="work",
        label="Deep work",
        start_time="09:00",
        end_time="10:00",
    ):
        return self.client.post(
            "/api/schedule",
            json={
                "plan_date": plan_date,
                "session_type": session_type,
                "label": label,
                "start_time": start_time,
                "end_time": end_time,
            },
        )

    def sessions_for(self, plan_date):
        response = self.client.get(
            f"/api/schedule?date={plan_date}",
        )
        self.assertEqual(response.status_code, 200)
        return response.get_json()

    def test_repeated_edits_then_delete_leave_no_stale_rows(self):
        created = self.add_session().get_json()["session"]
        session_id = created["id"]

        for index in range(6):
            response = self.client.put(
                f"/api/schedule/{session_id}",
                json={
                    "plan_date": "2030-01-01",
                    "session_type": "work",
                    "label": f"Revision {index}",
                    "start_time": "09:00",
                    "end_time": "10:00",
                },
            )
            self.assertEqual(response.status_code, 200)
            sessions = self.sessions_for("2030-01-01")
            self.assertEqual(len(sessions), 1)
            self.assertEqual(sessions[0]["label"], f"Revision {index}")

        deleted = self.client.delete(f"/api/schedule/{session_id}")
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(self.sessions_for("2030-01-01"), [])
        self.assertEqual(
            self.client.delete(f"/api/schedule/{session_id}").status_code,
            404,
        )

    def test_overlapping_requests_cannot_create_duplicate_blocks(self):
        barrier = Barrier(2)

        def create_once(label):
            barrier.wait()
            try:
                return database.add_schedule_session(
                    "2030-01-02",
                    "work",
                    label,
                    "09:00",
                    "10:00",
                )
            except ValueError:
                return None

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(create_once, ("First", "Second")))

        self.assertEqual(sum(result is not None for result in results), 1)
        self.assertEqual(len(self.sessions_for("2030-01-02")), 1)

    def test_bulk_paste_requires_explicit_replacement(self):
        self.add_session(plan_date="2030-01-03")
        pasted_plan = [
            {
                "session_type": "work",
                "label": "Focus",
                "start_time": "11:00",
                "end_time": "12:00",
            },
            {
                "session_type": "short",
                "label": "Reset",
                "start_time": "12:00",
                "end_time": "12:15",
            },
        ]

        conflict = self.client.post(
            "/api/schedule/bulk",
            json={
                "plan_date": "2030-01-03",
                "sessions": pasted_plan,
                "replace_existing": False,
            },
        )
        self.assertEqual(conflict.status_code, 409)

        invalid_flag = self.client.post(
            "/api/schedule/bulk",
            json={
                "plan_date": "2030-01-03",
                "sessions": pasted_plan,
                "replace_existing": "false",
            },
        )
        self.assertEqual(invalid_flag.status_code, 400)

        replaced = self.client.post(
            "/api/schedule/bulk",
            json={
                "plan_date": "2030-01-03",
                "sessions": pasted_plan,
                "replace_existing": True,
            },
        )
        self.assertEqual(replaced.status_code, 200)
        sessions = self.sessions_for("2030-01-03")
        self.assertEqual(
            [(item["label"], item["start_time"]) for item in sessions],
            [("Focus", "11:00"), ("Reset", "12:00")],
        )

    def test_copy_endpoint_replaces_only_the_target_day(self):
        self.add_session(
            plan_date="2030-01-04",
            label="Source",
            start_time="08:00",
            end_time="09:00",
        )
        self.add_session(
            plan_date="2030-01-05",
            label="Old target",
            start_time="12:00",
            end_time="13:00",
        )

        copied = self.client.post(
            "/api/schedule/copy",
            json={
                "source_date": "2030-01-04",
                "target_date": "2030-01-05",
                "replace_existing": True,
            },
        )
        self.assertEqual(copied.status_code, 200)
        target = self.sessions_for("2030-01-05")
        self.assertEqual(len(target), 1)
        self.assertEqual(target[0]["label"], "Source")
        self.assertEqual(len(self.sessions_for("2030-01-04")), 1)

    def test_planner_mutations_reject_non_object_json(self):
        for path in (
            "/api/schedule",
            "/api/schedule/bulk",
            "/api/schedule/copy",
        ):
            with self.subTest(path=path):
                response = self.client.post(path, json=["not", "an", "object"])
                self.assertEqual(response.status_code, 400)
                self.assertIn("JSON object", response.get_json()["message"])


class HabitApiTests(unittest.TestCase):
    def setUp(self):
        self.client = lumen_app.app.test_client()
        connection = database.get_connection()
        connection.execute("DELETE FROM habit_logs")
        connection.execute("DELETE FROM habits")
        connection.commit()
        connection.close()

    def test_habit_payloads_are_validated_and_missing_rows_return_404(self):
        for payload in (["not", "an", "object"], {}, {"name": "   "}):
            with self.subTest(payload=payload):
                response = self.client.post("/api/habits", json=payload)
                self.assertEqual(response.status_code, 400)

        too_long = self.client.post(
            "/api/habits",
            json={"name": "x" * 101},
        )
        self.assertEqual(too_long.status_code, 400)
        self.assertEqual(
            self.client.put("/api/habits/9999", json={"name": "Missing"}).status_code,
            404,
        )
        self.assertEqual(
            self.client.delete("/api/habits/9999").status_code,
            404,
        )

    def test_habit_toggle_returns_state_and_never_duplicates_a_day(self):
        created = self.client.post(
            "/api/habits",
            json={"name": "  Deep   work  "},
        )
        self.assertEqual(created.status_code, 201)
        habit = created.get_json()["habit"]
        self.assertEqual(habit["name"], "Deep work")

        completed = self.client.post(
            "/api/habits/toggle",
            json={"habit_id": habit["id"]},
        )
        self.assertEqual(completed.status_code, 200)
        self.assertTrue(completed.get_json()["completed"])

        connection = database.get_connection()
        count = connection.execute(
            "SELECT COUNT(*) FROM habit_logs WHERE habit_id = ?",
            (habit["id"],),
        ).fetchone()[0]
        connection.close()
        self.assertEqual(count, 1)

        reopened = self.client.post(
            "/api/habits/toggle",
            json={"habit_id": habit["id"]},
        )
        self.assertEqual(reopened.status_code, 200)
        self.assertFalse(reopened.get_json()["completed"])

        missing = self.client.post(
            "/api/habits/toggle",
            json={"habit_id": 9999},
        )
        self.assertEqual(missing.status_code, 404)

    def test_legacy_habit_duplicates_are_safely_migrated(self):
        with tempfile.TemporaryDirectory(prefix="lumen-legacy-habits-") as temp_dir:
            legacy_path = os.path.join(temp_dir, "legacy.db")
            connection = sqlite3.connect(legacy_path)
            connection.execute(
                "CREATE TABLE habits (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)"
            )
            connection.execute(
                "CREATE TABLE habit_logs (habit_id INTEGER, log_date DATE)"
            )
            connection.execute("INSERT INTO habits (name) VALUES ('Reading')")
            connection.executemany(
                "INSERT INTO habit_logs (habit_id, log_date) VALUES (1, '2030-01-01')",
                [(), ()],
            )
            connection.commit()
            connection.close()

            original_database_path = database.DB_FILE
            database.DB_FILE = legacy_path
            try:
                database.init_db()
                connection = database.get_connection()
                duplicate_count = connection.execute(
                    """
                    SELECT COUNT(*)
                    FROM habit_logs
                    WHERE habit_id = 1 AND log_date = '2030-01-01'
                    """
                ).fetchone()[0]
                self.assertEqual(duplicate_count, 1)
                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        """
                        INSERT INTO habit_logs (habit_id, log_date)
                        VALUES (1, '2030-01-01')
                        """
                    )
                connection.close()
            finally:
                database.DB_FILE = original_database_path

    def test_unknown_timeframe_is_normalized_to_weekly(self):
        malicious_timeframe = "weekly'); DROP TABLE tasks; --"
        metrics = database.get_dashboard_metrics(malicious_timeframe)
        activity = database.get_activity_totals(malicious_timeframe)

        self.assertIn("active_tasks", metrics)
        self.assertEqual(len(activity["timeline"]), 7)
        connection = database.get_connection()
        tasks_table = connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'"
        ).fetchone()
        connection.close()
        self.assertIsNotNone(tasks_table)


def tearDownModule():
    TEST_DIRECTORY.cleanup()


if __name__ == "__main__":
    unittest.main()
