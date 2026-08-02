import os
import unittest
from uuid import uuid4

from launcher import desktop_floating_timer


class DesktopFloatingTimerTests(unittest.TestCase):
    @unittest.skipUnless(os.name == "nt", "Windows mutex behavior")
    def test_only_one_companion_can_hold_the_instance_mutex(self):
        mutex_name = (
            f"{desktop_floating_timer.INSTANCE_MUTEX_NAME}_test_{uuid4().hex}"
        )
        first_handle, first_acquired = (
            desktop_floating_timer.acquire_single_instance_mutex(mutex_name)
        )
        self.assertTrue(first_acquired)
        try:
            second_handle, second_acquired = (
                desktop_floating_timer.acquire_single_instance_mutex(
                    mutex_name
                )
            )
            self.assertFalse(second_acquired)
            self.assertIsNone(second_handle)
        finally:
            desktop_floating_timer.release_single_instance_mutex(first_handle)

    def test_schedule_window_identity_survives_session_edits(self):
        before = {
            "date": "2030-01-01",
            "active_session": {
                "id": 42,
                "session_type": "work",
                "label": "First label",
                "start_time": "09:00",
                "end_time": "10:00",
                "updated_at": "2030-01-01 09:00:00",
            },
        }
        after = {
            "date": "2030-01-01",
            "active_session": {
                **before["active_session"],
                "label": "Edited label",
                "end_time": "10:30",
                "updated_at": "2030-01-01 09:01:00",
            },
        }
        self.assertEqual(
            desktop_floating_timer.session_key(before),
            desktop_floating_timer.session_key(after),
        )


if __name__ == "__main__":
    unittest.main()
