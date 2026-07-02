"""Run the personal dashboard without Flask's development reloader."""

import os
import sys
from pathlib import Path


sys.dont_write_bytecode = True

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from app import app, start_desktop_floating_timer  # noqa: E402


if __name__ == "__main__":
    desktop_floating_timer = start_desktop_floating_timer()
    try:
        app.run(
            host="127.0.0.1",
            port=int(os.environ.get("LUMEN_PORT", "5000")),
            debug=False,
            use_reloader=False,
        )
    finally:
        if desktop_floating_timer and desktop_floating_timer.poll() is None:
            desktop_floating_timer.terminate()
