"""Native always-on-top timer for active Lumen Day Planner blocks."""

from __future__ import annotations

import argparse
import ctypes
import json
import math
import os
import time
import tkinter as tk
from pathlib import Path
from tkinter import font as tkfont
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


WINDOW_WIDTH = 382
WINDOW_HEIGHT = 198
WINDOW_MARGIN = 24
POLL_INTERVAL_MS = 1000
REQUEST_TIMEOUT_SECONDS = 2
TRANSPARENT_COLOR = "#010203"
SURFACE = "#FFFFFF"
CANVAS = "#F4F7FE"
TEXT = "#2B3674"
MUTED = "#8F9BBA"
TRACK = "#E9EDF7"
PROJECT_ROOT = Path(__file__).resolve().parent.parent
LOGO_PATH = PROJECT_ROOT / "static" / "lumen-icon.png"
MODE_STYLES = {
    "work": {
        "accent": "#4318FF",
        "soft": "#F0EDFF",
        "title": "FOCUS TIME",
        "fallback": "Deep Work",
    },
    "short": {
        "accent": "#05B98C",
        "soft": "#E6FAF5",
        "title": "SHORT BREAK",
        "fallback": "Quick recovery",
    },
    "long": {
        "accent": "#F59E0B",
        "soft": "#FFF4DC",
        "title": "LONG BREAK",
        "fallback": "Extended recovery",
    },
}


def enable_windows_dpi_awareness():
    if os.name != "nt":
        return
    try:
        ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
    except (AttributeError, OSError):
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)
        except (AttributeError, OSError):
            pass


def parent_process_is_alive(parent_pid):
    if not parent_pid:
        return True

    if os.name == "nt":
        process_query_limited_information = 0x1000
        still_active = 259
        handle = ctypes.windll.kernel32.OpenProcess(
            process_query_limited_information,
            False,
            int(parent_pid),
        )
        if not handle:
            return False
        exit_code = ctypes.c_ulong()
        try:
            if not ctypes.windll.kernel32.GetExitCodeProcess(
                handle,
                ctypes.byref(exit_code),
            ):
                return False
            return exit_code.value == still_active
        finally:
            ctypes.windll.kernel32.CloseHandle(handle)

    try:
        os.kill(int(parent_pid), 0)
        return True
    except OSError:
        return False


def format_countdown(total_seconds):
    safe_seconds = max(0, int(total_seconds or 0))
    hours, remainder = divmod(safe_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes:02d}:{seconds:02d}"


def truncate_copy(value, max_length=27):
    copy = str(value or "")
    if len(copy) <= max_length:
        return copy
    return f"{copy[:max_length - 1].rstrip()}…"


def session_key(status):
    session = status.get("active_session") or {}
    if not session:
        return ""
    return ":".join(
        str(value)
        for value in (
            status.get("date", ""),
            session.get("id", ""),
            session.get("session_type", ""),
            session.get("start_time", ""),
            session.get("end_time", ""),
            session.get("updated_at", ""),
        )
    )


def rounded_rectangle(canvas, x1, y1, x2, y2, radius, **options):
    points = [
        x1 + radius, y1,
        x2 - radius, y1,
        x2, y1,
        x2, y1 + radius,
        x2, y2 - radius,
        x2, y2,
        x2 - radius, y2,
        x1 + radius, y2,
        x1, y2,
        x1, y2 - radius,
        x1, y1 + radius,
        x1, y1,
    ]
    return canvas.create_polygon(
        points,
        smooth=True,
        splinesteps=32,
        **options,
    )


class DesktopFloatingTimer:
    def __init__(self, api_url, parent_pid=0):
        enable_windows_dpi_awareness()
        self.api_url = api_url
        self.parent_pid = parent_pid
        self.dismissed_session_key = ""
        self.current_session_key = ""
        self.current_source = None
        self.last_command_id = None
        self.manual_open_requested = False
        self.force_visibility_report = False
        self.visible = False
        self.drag_origin = None
        self.control_url = (
            f"{self.api_url.split('/api/', 1)[0]}/api/desktop-floating"
        )

        self.root = tk.Tk()
        self.root.withdraw()
        self.root.title("Lumen Day Planner")
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        self.root.configure(bg=TRANSPARENT_COLOR)
        if os.name == "nt":
            self.root.attributes("-transparentcolor", TRANSPARENT_COLOR)
        self.root.attributes("-alpha", 0.985)

        self.canvas = tk.Canvas(
            self.root,
            width=WINDOW_WIDTH,
            height=WINDOW_HEIGHT,
            bg=TRANSPARENT_COLOR,
            highlightthickness=0,
            borderwidth=0,
        )
        self.canvas.pack(fill="both", expand=True)
        self.logo_image = self.load_logo_image()

        self.font_brand = tkfont.Font(
            family="Segoe UI",
            size=8,
            weight="bold",
        )
        self.font_mode = tkfont.Font(
            family="Segoe UI",
            size=8,
            weight="bold",
        )
        self.font_time = tkfont.Font(
            family="Segoe UI",
            size=31,
            weight="bold",
        )
        self.font_label = tkfont.Font(
            family="Segoe UI",
            size=10,
            weight="bold",
        )
        self.font_meta = tkfont.Font(
            family="Segoe UI",
            size=8,
        )
        self.font_close = tkfont.Font(
            family="Segoe UI",
            size=11,
            weight="bold",
        )

        self.root.bind("<ButtonPress-1>", self.start_drag)
        self.root.bind("<B1-Motion>", self.drag_window)
        self.root.bind("<ButtonRelease-1>", self.stop_drag)
        self.root.bind("<Escape>", lambda _event: self.dismiss_current_session())
        self.canvas.bind("<Button-1>", self.handle_click)

        self.position_window()

    def load_logo_image(self):
        try:
            source_image = tk.PhotoImage(
                master=self.root,
                file=str(LOGO_PATH),
            )
            return source_image.subsample(16, 16)
        except tk.TclError:
            return None

    def position_window(self):
        screen_width = self.root.winfo_screenwidth()
        screen_height = self.root.winfo_screenheight()
        x_position = max(0, screen_width - WINDOW_WIDTH - WINDOW_MARGIN)
        y_position = max(0, screen_height - WINDOW_HEIGHT - 72)
        self.root.geometry(
            f"{WINDOW_WIDTH}x{WINDOW_HEIGHT}+{x_position}+{y_position}"
        )

    def start_drag(self, event):
        if event.x >= WINDOW_WIDTH - 55 and event.y <= 55:
            return
        self.drag_origin = (
            event.x_root,
            event.y_root,
            self.root.winfo_x(),
            self.root.winfo_y(),
        )

    def drag_window(self, event):
        if not self.drag_origin:
            return
        start_x, start_y, window_x, window_y = self.drag_origin
        self.root.geometry(
            f"+{window_x + event.x_root - start_x}"
            f"+{window_y + event.y_root - start_y}"
        )

    def stop_drag(self, _event):
        self.drag_origin = None

    def handle_click(self, event):
        if event.x >= WINDOW_WIDTH - 55 and event.y <= 55:
            self.dismiss_current_session()

    def dismiss_current_session(self):
        if self.current_source == "schedule":
            self.dismissed_session_key = self.current_session_key
        if self.current_source == "manual":
            self.manual_open_requested = False
        self.hide()

    def report_visibility(self, visible, source=None):
        payload = json.dumps({
            "action": "report",
            "visible": bool(visible),
            "source": source,
        }).encode("utf-8")
        request = Request(
            self.control_url,
            data=payload,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS):
                pass
        except (HTTPError, URLError, TimeoutError, OSError):
            pass

    def show(self, source):
        source_changed = self.current_source != source
        self.current_source = source
        if self.visible and not source_changed:
            if self.force_visibility_report:
                self.report_visibility(True, source)
                self.force_visibility_report = False
            return
        self.root.deiconify()
        self.root.lift()
        self.root.attributes("-topmost", True)
        self.visible = True
        self.report_visibility(True, source)
        self.force_visibility_report = False

    def hide(self):
        if not self.visible:
            self.current_source = None
            return
        self.root.withdraw()
        self.visible = False
        self.current_source = None
        self.report_visibility(False)

    def fetch_status(self):
        request = Request(
            self.api_url,
            headers={"Accept": "application/json"},
        )
        with urlopen(
            request,
            timeout=REQUEST_TIMEOUT_SECONDS,
        ) as response:
            return json.loads(response.read().decode("utf-8"))

    def draw(self, status):
        session = status["active_session"]
        source = status.get("_floating_source", "schedule")
        mode = MODE_STYLES.get(
            session.get("session_type"),
            MODE_STYLES["work"],
        )
        remaining_seconds = max(0, int(status.get("remaining_seconds") or 0))
        total_seconds = max(
            1,
            int(session.get("duration_minutes") or 1) * 60,
        )
        remaining_ratio = min(1, remaining_seconds / total_seconds)
        label = str(session.get("label") or mode["fallback"])
        next_session = status.get("next_session")

        self.canvas.delete("all")
        rounded_rectangle(
            self.canvas,
            8,
            10,
            WINDOW_WIDTH - 5,
            WINDOW_HEIGHT - 4,
            25,
            fill="#DDE3F2",
            outline="",
        )
        rounded_rectangle(
            self.canvas,
            4,
            4,
            WINDOW_WIDTH - 9,
            WINDOW_HEIGHT - 10,
            24,
            fill=SURFACE,
            outline="#EEF1F8",
            width=1,
        )
        if self.logo_image:
            self.canvas.create_image(
                35,
                33.5,
                image=self.logo_image,
            )
        else:
            rounded_rectangle(
                self.canvas,
                21,
                20,
                48,
                47,
                9,
                fill=mode["accent"],
                outline="",
            )
            self.canvas.create_text(
                34.5,
                33.5,
                text="L",
                fill="#FFFFFF",
                font=self.font_brand,
            )
        self.canvas.create_text(
            57,
            27,
            text=(
                "LUMEN DAY PLANNER"
                if source == "schedule"
                else "LUMEN FOCUS TIMER"
            ),
            fill=TEXT,
            font=self.font_brand,
            anchor="w",
        )
        self.canvas.create_text(
            57,
            41,
            text=(
                f"{session.get('start_time')} – {session.get('end_time')}"
                if source == "schedule"
                else status.get("_manual_status", "MANUAL TIMER")
            ),
            fill=MUTED,
            font=self.font_meta,
            anchor="w",
        )

        rounded_rectangle(
            self.canvas,
            WINDOW_WIDTH - 102,
            21,
            WINDOW_WIDTH - 52,
            43,
            11,
            fill=mode["soft"],
            outline="",
        )
        self.canvas.create_text(
            WINDOW_WIDTH - 77,
            32,
            text=status.get("_badge", "LIVE"),
            fill=mode["accent"],
            font=self.font_mode,
        )
        rounded_rectangle(
            self.canvas,
            WINDOW_WIDTH - 45,
            19,
            WINDOW_WIDTH - 19,
            45,
            9,
            fill=CANVAS,
            outline="",
        )
        self.canvas.create_text(
            WINDOW_WIDTH - 32,
            32,
            text="×",
            fill=MUTED,
            font=self.font_close,
        )

        ring_x = 22
        ring_y = 65
        ring_size = 93
        self.canvas.create_oval(
            ring_x,
            ring_y,
            ring_x + ring_size,
            ring_y + ring_size,
            outline=TRACK,
            width=7,
        )
        self.canvas.create_arc(
            ring_x,
            ring_y,
            ring_x + ring_size,
            ring_y + ring_size,
            start=90,
            extent=-359.9 * remaining_ratio,
            style="arc",
            outline=mode["accent"],
            width=7,
        )
        self.canvas.create_text(
            ring_x + ring_size / 2,
            ring_y + ring_size / 2 - 4,
            text=f"{round(remaining_ratio * 100)}%",
            fill=mode["accent"],
            font=self.font_label,
        )
        self.canvas.create_text(
            ring_x + ring_size / 2,
            ring_y + ring_size / 2 + 14,
            text="remaining",
            fill=MUTED,
            font=self.font_meta,
        )

        self.canvas.create_text(
            135,
            76,
            text=mode["title"],
            fill=mode["accent"],
            font=self.font_mode,
            anchor="w",
        )
        self.canvas.create_text(
            131,
            110,
            text=format_countdown(remaining_seconds),
            fill=TEXT,
            font=self.font_time,
            anchor="w",
        )
        self.canvas.create_text(
            135,
            142,
            text=truncate_copy(label),
            fill=TEXT,
            font=self.font_label,
            anchor="w",
        )

        self.canvas.create_line(
            21,
            169,
            WINDOW_WIDTH - 25,
            169,
            fill="#EEF1F8",
        )
        if source == "manual":
            next_text = (
                "Running independently of the browser"
                if status.get("_manual_running")
                else "Ready · control it from the Timer page"
            )
        elif next_session:
            next_mode = MODE_STYLES.get(
                next_session.get("session_type"),
                MODE_STYLES["work"],
            )
            next_text = (
                f"Next  {next_session.get('start_time')}  ·  "
                f"{next_session.get('label') or next_mode['fallback']}"
            )
        else:
            next_text = f"Ends at {session.get('end_time')}"
        self.canvas.create_text(
            22,
            181,
            text=next_text[:58],
            fill=MUTED,
            font=self.font_meta,
            anchor="w",
        )

    def apply_runtime_command(self, status):
        runtime = status.get("desktop_float_runtime") or {}
        command_id = int(runtime.get("command_id") or 0)
        if self.last_command_id == command_id:
            return
        self.last_command_id = command_id
        command = runtime.get("command")
        requested_source = runtime.get("requested_source")

        if command == "open":
            self.dismissed_session_key = ""
            self.manual_open_requested = requested_source == "manual"
            self.force_visibility_report = True
        elif command == "close":
            if self.current_source == "schedule":
                self.dismissed_session_key = self.current_session_key
            self.manual_open_requested = False
            self.hide()

    def manual_timer_status(self, status):
        runtime = status.get("desktop_float_runtime") or {}
        timer = runtime.get("manual_timer") or {}
        if not timer:
            return None

        total_seconds = max(1, int(timer.get("total_seconds") or 1))
        running = bool(timer.get("is_running"))
        if running and int(timer.get("end_time_ms") or 0) > 0:
            remaining = max(
                0,
                math.ceil(
                    (
                        int(timer["end_time_ms"])
                        - int(time.time() * 1000)
                    )
                    / 1000
                ),
            )
        else:
            remaining = max(
                0,
                min(
                    total_seconds,
                    int(timer.get("remaining_seconds") or 0),
                ),
            )
        badge = (
            "LIVE"
            if running
            else "DONE"
            if remaining <= 0
            else "READY"
            if remaining >= total_seconds
            else "PAUSED"
        )

        raw_mode = timer.get("mode")
        mode = raw_mode if raw_mode in MODE_STYLES else "work"
        end_label = (
            time.strftime(
                "%H:%M",
                time.localtime(int(timer["end_time_ms"]) / 1000),
            )
            if running and int(timer.get("end_time_ms") or 0) > 0
            else "Paused"
        )
        return {
            "date": status.get("date"),
            "active_session": {
                "id": "manual",
                "session_type": mode,
                "label": (
                    timer.get("label")
                    or MODE_STYLES[mode]["fallback"]
                ),
                "start_time": "Now",
                "end_time": end_label,
                "duration_minutes": max(
                    1,
                    math.ceil(total_seconds / 60),
                ),
                "updated_at": timer.get("updated_at_ms"),
            },
            "next_session": None,
            "remaining_seconds": remaining,
            "_floating_source": "manual",
            "_manual_running": running,
            "_manual_status": (
                timer.get("status")
                or ("RUNNING" if running else "PAUSED")
            ).upper(),
            "_badge": badge,
        }

    def apply_status(self, status):
        self.apply_runtime_command(status)
        active_session = status.get("active_session")
        enabled = status.get("desktop_floating_enabled", True)
        remaining = int(status.get("remaining_seconds") or 0)
        current_key = session_key(status)

        if enabled and active_session and remaining > 0:
            self.manual_open_requested = False
            self.current_session_key = current_key
            if current_key == self.dismissed_session_key:
                self.hide()
                return False

            status["_floating_source"] = "schedule"
            status["_badge"] = "LIVE"
            self.draw(status)
            self.show("schedule")
            return True

        self.current_session_key = ""
        if self.manual_open_requested:
            manual_status = self.manual_timer_status(status)
            if manual_status:
                self.draw(manual_status)
                self.show("manual")
                return True

        if not enabled or not active_session or remaining <= 0:
            self.hide()
            return False
        return False

    def poll(self):
        if not parent_process_is_alive(self.parent_pid):
            self.root.destroy()
            return

        try:
            status = self.fetch_status()
            self.apply_status(status)
        except (HTTPError, URLError, TimeoutError, ValueError, OSError):
            self.hide()

        self.root.after(POLL_INTERVAL_MS, self.poll)

    def run(self):
        self.root.after(100, self.poll)
        self.root.mainloop()


def demo_status():
    return {
        "date": "2026-07-01",
        "desktop_floating_enabled": True,
        "remaining_seconds": 2142,
        "active_session": {
            "id": 1,
            "session_type": "work",
            "label": "Design the next meaningful thing",
            "start_time": "20:00",
            "end_time": "21:00",
            "duration_minutes": 60,
            "updated_at": "2026-07-01 20:00:00",
        },
        "next_session": {
            "session_type": "short",
            "label": "Quick recovery",
            "start_time": "21:00",
        },
    }


def parse_arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--api-url",
        default="http://127.0.0.1:5000/api/schedule/status",
    )
    parser.add_argument("--parent-pid", type=int, default=0)
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--demo-seconds", type=float, default=0)
    return parser.parse_args()


def main():
    arguments = parse_arguments()
    timer = DesktopFloatingTimer(
        arguments.api_url,
        arguments.parent_pid,
    )

    if arguments.probe or arguments.demo_seconds > 0:
        visible = timer.apply_status(demo_status())
        timer.root.update_idletasks()
        if arguments.probe:
            print(json.dumps({
                "visible": visible,
                "topmost": bool(timer.root.attributes("-topmost")),
                "logo_loaded": timer.logo_image is not None,
                "logo_size": [
                    timer.logo_image.width(),
                    timer.logo_image.height(),
                ] if timer.logo_image else None,
                "width": timer.root.winfo_width(),
                "height": timer.root.winfo_height(),
            }))
            timer.root.destroy()
            return
        timer.root.after(
            max(250, int(arguments.demo_seconds * 1000)),
            timer.root.destroy,
        )
        timer.root.mainloop()
        return

    timer.run()


if __name__ == "__main__":
    main()
