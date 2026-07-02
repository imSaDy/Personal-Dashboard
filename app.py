from flask import Flask, render_template, request, jsonify, redirect, url_for
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from math import ceil, isfinite
from pathlib import Path
from threading import Lock
import os
import subprocess
import sys
import database

app = Flask(__name__)
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
APP_STARTED_AT = datetime.now(timezone.utc).isoformat()
DESKTOP_FLOAT_SETTING = 'desktop_floating_timer_enabled'
DESKTOP_FLOAT_RUNTIME_LOCK = Lock()
DESKTOP_FLOAT_RUNTIME = {
    'command_id': 0,
    'command': '',
    'requested_source': 'schedule',
    'manual_timer': None,
    'window_visible': False,
    'window_source': None
}

def desktop_float_runtime_snapshot():
    with DESKTOP_FLOAT_RUNTIME_LOCK:
        return {
            **DESKTOP_FLOAT_RUNTIME,
            'manual_timer': (
                dict(DESKTOP_FLOAT_RUNTIME['manual_timer'])
                if DESKTOP_FLOAT_RUNTIME['manual_timer']
                else None
            )
        }

def normalize_desktop_manual_timer(raw_timer):
    if not isinstance(raw_timer, dict):
        raise ValueError('timer must be an object')

    mode = str(raw_timer.get('mode') or 'work').strip().lower()
    if mode not in ('work', 'short', 'long', 'custom'):
        raise ValueError('Unsupported timer mode')

    try:
        total_seconds = int(raw_timer.get('total_seconds'))
        remaining_seconds = int(raw_timer.get('remaining_seconds'))
        end_time_ms = int(raw_timer.get('end_time_ms') or 0)
    except (TypeError, ValueError) as error:
        raise ValueError('Timer values must be valid numbers') from error

    if total_seconds < 1 or total_seconds > 24 * 60 * 60:
        raise ValueError('Timer duration is outside the supported range')
    remaining_seconds = max(0, min(total_seconds, remaining_seconds))

    return {
        'mode': mode,
        'label': str(raw_timer.get('label') or '')[:80],
        'status': str(raw_timer.get('status') or '')[:80],
        'total_seconds': total_seconds,
        'remaining_seconds': remaining_seconds,
        'end_time_ms': max(0, end_time_ms),
        'is_running': bool(raw_timer.get('is_running')),
        'updated_at_ms': int(datetime.now().timestamp() * 1000)
    }

def calculate_app_revision():
    project_root = Path(__file__).resolve().parent
    source_files = [
        project_root / 'app.py',
        project_root / 'database.py',
        project_root / 'schema.sql',
        project_root / 'launcher' / 'dashboard_server.py',
        project_root / 'launcher' / 'desktop_floating_timer.py'
    ]
    source_files.extend((project_root / 'templates').rglob('*.html'))
    source_files.extend((project_root / 'static').rglob('*.js'))
    source_files.extend((project_root / 'static').rglob('*.css'))

    file_fingerprints = []
    for source_file in sorted(source_files, key=lambda path: path.relative_to(project_root).as_posix()):
        relative_path = source_file.relative_to(project_root).as_posix()
        file_hash = sha256(source_file.read_bytes()).hexdigest().upper()
        file_fingerprints.append(f'{relative_path}:{file_hash}')

    payload = '\n'.join(file_fingerprints).encode('utf-8')
    return sha256(payload).hexdigest().upper()

APP_REVISION = calculate_app_revision()

# Boot up the database
database.init_db()

# --- PAGE ROUTES ---
@app.route('/')
def index():
    return render_template('today.html')

@app.route('/performance')
def performance_page():
    return render_template('performance.html')

@app.route('/overview')
def overview_redirect():
    return redirect(url_for('performance_page'))

@app.route('/habits')
def habits_page():
    return render_template('habits.html')

@app.route('/tasks')
def tasks_page():
    return render_template('tasks.html')

@app.route('/timer')
def timer_page():
    return render_template('timer.html')

@app.route('/planner')
def planner_page():
    return render_template('planner.html')

@app.route('/goals')
def goals_page():
    return render_template('goals.html')

@app.route('/today')
def today_page():
    return redirect(url_for('index'))

# --- APPLICATION HEALTH ---
@app.route('/api/health', methods=['GET'])
def app_health():
    return jsonify({
        "app": "lumen-dashboard",
        "started_at": APP_STARTED_AT,
        "revision": APP_REVISION
    })

# --- DASHBOARD METRICS & ANALYTICS ---
@app.route('/api/metrics', methods=['GET'])
def get_metrics():
    timeframe = request.args.get('timeframe', 'weekly')
    data = database.get_dashboard_metrics(timeframe)
    return jsonify(data)

@app.route('/api/analytics', methods=['GET'])
def get_analytics():
    timeframe = request.args.get('timeframe', 'weekly')
    data = database.get_activity_totals(timeframe)
    return jsonify(data)

# --- TIME LOG API ROUTES ---
def parse_time_log_payload():
    data = request.get_json(silent=True) or {}
    activity = ' '.join(str(data.get('activity') or '').split())
    if not activity:
        raise ValueError('Activity name is required.')
    if len(activity) > 100:
        raise ValueError('Activity name must be 100 characters or fewer.')

    try:
        hours = float(data.get('hours'))
    except (TypeError, ValueError):
        raise ValueError('Duration must be a number.')
    if not isfinite(hours) or hours <= 0 or hours > 24:
        raise ValueError('Duration must be greater than 0 and no more than 24 hours.')
    return activity, hours

@app.route('/log', methods=['POST'])
def log_time():
    try:
        activity, hours = parse_time_log_payload()
    except ValueError as error:
        return jsonify({"status": "error", "message": str(error)}), 400

    canonical_activity = database.add_log(activity, hours)
    return jsonify({
        "status": "success",
        "message": "Log saved.",
        "activity": canonical_activity
    }), 201

@app.route('/api/activities', methods=['GET'])
def get_activities():
    try:
        limit = max(1, min(100, int(request.args.get('limit', 30))))
    except (TypeError, ValueError):
        limit = 30
    return jsonify(database.get_activity_suggestions(limit))

@app.route('/api/logs/recent', methods=['GET'])
def get_recent_logs():
    data = database.get_recent_logs()
    return jsonify(data)

@app.route('/api/logs/<int:log_id>', methods=['DELETE'])
def delete_time_log(log_id):
    database.delete_log(log_id)
    return jsonify({"status": "success", "message": "Log purged."})

@app.route('/api/logs/<int:log_id>', methods=['PUT'])
def update_time_log(log_id):
    try:
        activity, hours = parse_time_log_payload()
    except ValueError as error:
        return jsonify({"status": "error", "message": str(error)}), 400

    canonical_activity = database.edit_time_log(log_id, activity, hours)
    return jsonify({"status": "success", "activity": canonical_activity})

# --- AUTOMATED DAY PLANNER API ROUTES ---
def normalize_schedule_time(value):
    normalized = str(value or '').strip()
    try:
        parsed = datetime.strptime(normalized, '%H:%M')
    except (TypeError, ValueError):
        raise ValueError('Time must use 24-hour HH:MM format.')
    return parsed.strftime('%H:%M')

def parse_schedule_payload(data, existing=None):
    existing = existing or {}
    raw_date = data.get('plan_date', existing.get('plan_date'))
    plan_date = normalize_iso_date(raw_date)
    if not plan_date:
        raise ValueError('Plan date is required.')

    session_type = str(
        data.get('session_type', existing.get('session_type', ''))
    ).strip()
    if session_type not in ('work', 'short', 'long'):
        raise ValueError('Choose Focus, Short Break, or Long Break.')

    label = ' '.join(
        str(data.get('label', existing.get('label', '')) or '').split()
    )
    if len(label) > 80:
        raise ValueError('Session label must be 80 characters or fewer.')

    start_time = normalize_schedule_time(
        data.get('start_time', existing.get('start_time'))
    )
    end_time = normalize_schedule_time(
        data.get('end_time', existing.get('end_time'))
    )
    if start_time >= end_time:
        raise ValueError('End time must be later than start time.')

    return plan_date, session_type, label, start_time, end_time

@app.route('/api/schedule', methods=['GET', 'POST', 'DELETE'])
def schedule_collection():
    if request.method == 'GET':
        requested_date = request.args.get('date')
        if not requested_date:
            requested_date = (
                datetime.now() + timedelta(days=1)
            ).strftime('%Y-%m-%d')
        try:
            plan_date = normalize_iso_date(requested_date)
        except ValueError as error:
            return jsonify({"status": "error", "message": str(error)}), 400
        return jsonify(database.get_schedule_sessions(plan_date))

    if request.method == 'DELETE':
        try:
            plan_date = normalize_iso_date(request.args.get('date'))
            if not plan_date:
                raise ValueError('Plan date is required.')
        except ValueError as error:
            return jsonify({"status": "error", "message": str(error)}), 400
        deleted_count = database.clear_schedule_sessions(plan_date)
        return jsonify({
            "status": "success",
            "deleted_count": deleted_count
        })

    data = request.get_json(silent=True) or {}
    try:
        payload = parse_schedule_payload(data)
        session = database.add_schedule_session(*payload)
    except ValueError as error:
        return jsonify({"status": "error", "message": str(error)}), 400

    return jsonify({"status": "success", "session": session}), 201

def normalize_schedule_batch(plan_date, raw_sessions):
    if not isinstance(raw_sessions, list) or not raw_sessions:
        raise ValueError('Add at least one session to the plan.')
    if len(raw_sessions) > 64:
        raise ValueError('A day plan can contain at most 64 sessions.')

    normalized_sessions = []
    for raw_session in raw_sessions:
        if not isinstance(raw_session, dict):
            raise ValueError('Each session must be a valid object.')
        _, session_type, label, start_time, end_time = parse_schedule_payload({
            **raw_session,
            'plan_date': plan_date
        })
        normalized_sessions.append({
            'session_type': session_type,
            'label': label,
            'start_time': start_time,
            'end_time': end_time
        })

    normalized_sessions.sort(key=lambda session: session['start_time'])
    for previous, current in zip(
        normalized_sessions,
        normalized_sessions[1:]
    ):
        if current['start_time'] < previous['end_time']:
            raise ValueError('Generated sessions overlap each other.')
    return normalized_sessions

@app.route('/api/schedule/bulk', methods=['POST'])
def schedule_bulk_replace():
    data = request.get_json(silent=True) or {}
    try:
        plan_date = normalize_iso_date(data.get('plan_date'))
        if not plan_date:
            raise ValueError('Plan date is required.')
        sessions = normalize_schedule_batch(plan_date, data.get('sessions'))
    except ValueError as error:
        return jsonify({"status": "error", "message": str(error)}), 400

    existing_sessions = database.get_schedule_sessions(plan_date)
    if existing_sessions and not bool(data.get('replace_existing')):
        return jsonify({
            "status": "error",
            "message": "This day already has a plan. Confirm replacement first."
        }), 409

    saved_sessions = database.replace_schedule_sessions(plan_date, sessions)
    return jsonify({
        "status": "success",
        "sessions": saved_sessions
    })

@app.route('/api/schedule/copy', methods=['POST'])
def schedule_copy_day():
    data = request.get_json(silent=True) or {}
    try:
        source_date = normalize_iso_date(data.get('source_date'))
        target_date = normalize_iso_date(data.get('target_date'))
        if not source_date or not target_date:
            raise ValueError('Source and target dates are required.')
        if source_date == target_date:
            raise ValueError('Choose two different days.')
    except ValueError as error:
        return jsonify({"status": "error", "message": str(error)}), 400

    source_sessions = database.get_schedule_sessions(source_date)
    if not source_sessions:
        return jsonify({
            "status": "error",
            "message": "The source day has no sessions to copy."
        }), 400

    target_sessions = database.get_schedule_sessions(target_date)
    if target_sessions and not bool(data.get('replace_existing')):
        return jsonify({
            "status": "error",
            "message": "The target day already has a plan. Confirm replacement first."
        }), 409

    copied_sessions = database.replace_schedule_sessions(
        target_date,
        source_sessions
    )
    return jsonify({
        "status": "success",
        "sessions": copied_sessions
    })

@app.route('/api/schedule/<int:session_id>', methods=['PUT', 'DELETE'])
def schedule_detail(session_id):
    existing = database.get_schedule_session(session_id)
    if not existing:
        return jsonify({"status": "error", "message": "Session not found."}), 404

    if request.method == 'DELETE':
        database.delete_schedule_session(session_id)
        return jsonify({"status": "success"})

    data = request.get_json(silent=True) or {}
    try:
        payload = parse_schedule_payload(data, existing)
        session = database.edit_schedule_session(session_id, *payload)
    except ValueError as error:
        return jsonify({"status": "error", "message": str(error)}), 400

    return jsonify({"status": "success", "session": session})

@app.route('/api/schedule/status', methods=['GET'])
def schedule_status():
    now = datetime.now()
    plan_date = now.strftime('%Y-%m-%d')
    sessions = database.get_schedule_sessions(plan_date)
    active_session = None
    next_session = None
    remaining_seconds = 0
    seconds_until_next = None

    for session in sessions:
        start_at = datetime.combine(
            now.date(),
            datetime.strptime(session['start_time'], '%H:%M').time()
        )
        end_at = datetime.combine(
            now.date(),
            datetime.strptime(session['end_time'], '%H:%M').time()
        )

        if start_at <= now < end_at:
            active_session = session
            remaining_seconds = max(
                0,
                ceil((end_at - now).total_seconds())
            )
            break
        if start_at > now and next_session is None:
            next_session = session
            seconds_until_next = max(
                0,
                ceil((start_at - now).total_seconds())
            )

    if active_session:
        active_index = next(
            index
            for index, session in enumerate(sessions)
            if session['id'] == active_session['id']
        )
        if active_index + 1 < len(sessions):
            next_session = sessions[active_index + 1]
            next_start = datetime.combine(
                now.date(),
                datetime.strptime(
                    next_session['start_time'],
                    '%H:%M'
                ).time()
            )
            seconds_until_next = max(
                0,
                ceil((next_start - now).total_seconds())
            )

    return jsonify({
        "date": plan_date,
        "server_time": now.isoformat(timespec='seconds'),
        "active_session": active_session,
        "next_session": next_session,
        "remaining_seconds": remaining_seconds,
        "seconds_until_next": seconds_until_next,
        "desktop_floating_enabled": database.get_boolean_setting(
            DESKTOP_FLOAT_SETTING,
            True
        ),
        "desktop_float_runtime": desktop_float_runtime_snapshot()
    })

@app.route('/api/desktop-floating', methods=['GET', 'PUT', 'POST'])
def desktop_floating_setting():
    if request.method == 'GET':
        runtime = desktop_float_runtime_snapshot()
        return jsonify({
            "enabled": database.get_boolean_setting(
                DESKTOP_FLOAT_SETTING,
                True
            ),
            "native": os.name == 'nt',
            "window_visible": runtime['window_visible'],
            "window_source": runtime['window_source'],
            "command_id": runtime['command_id']
        })

    data = request.get_json(silent=True) or {}
    if request.method == 'POST':
        action = str(data.get('action') or '').strip().lower()
        if action not in ('open', 'close', 'sync', 'report'):
            return jsonify({
                "status": "error",
                "message": "Unsupported floating timer action"
            }), 400

        try:
            manual_timer = (
                normalize_desktop_manual_timer(data.get('timer'))
                if data.get('timer') is not None
                else None
            )
        except ValueError as error:
            return jsonify({
                "status": "error",
                "message": str(error)
            }), 400

        with DESKTOP_FLOAT_RUNTIME_LOCK:
            if manual_timer is not None:
                DESKTOP_FLOAT_RUNTIME['manual_timer'] = manual_timer

            if action in ('open', 'close'):
                DESKTOP_FLOAT_RUNTIME['command_id'] += 1
                DESKTOP_FLOAT_RUNTIME['command'] = action
                DESKTOP_FLOAT_RUNTIME['requested_source'] = (
                    'manual'
                    if manual_timer is not None
                    or data.get('source') == 'manual'
                    else 'schedule'
                )
                if action == 'close':
                    DESKTOP_FLOAT_RUNTIME['window_visible'] = False
                    DESKTOP_FLOAT_RUNTIME['window_source'] = None
            elif action == 'report':
                if not isinstance(data.get('visible'), bool):
                    return jsonify({
                        "status": "error",
                        "message": "visible must be true or false"
                    }), 400
                source = data.get('source')
                DESKTOP_FLOAT_RUNTIME['window_visible'] = data['visible']
                DESKTOP_FLOAT_RUNTIME['window_source'] = (
                    source
                    if data['visible'] and source in ('schedule', 'manual')
                    else None
                )

            runtime = {
                **DESKTOP_FLOAT_RUNTIME,
                'manual_timer': (
                    dict(DESKTOP_FLOAT_RUNTIME['manual_timer'])
                    if DESKTOP_FLOAT_RUNTIME['manual_timer']
                    else None
                )
            }

        return jsonify({
            "status": "success",
            "enabled": database.get_boolean_setting(
                DESKTOP_FLOAT_SETTING,
                True
            ),
            "native": os.name == 'nt',
            "window_visible": runtime['window_visible'],
            "window_source": runtime['window_source'],
            "command_id": runtime['command_id']
        })

    if not isinstance(data.get('enabled'), bool):
        return jsonify({
            "status": "error",
            "message": "enabled must be true or false"
        }), 400

    enabled = database.set_boolean_setting(
        DESKTOP_FLOAT_SETTING,
        data['enabled']
    )
    return jsonify({
        "status": "success",
        "enabled": enabled,
        "native": os.name == 'nt',
        "window_visible": desktop_float_runtime_snapshot()['window_visible'],
        "window_source": desktop_float_runtime_snapshot()['window_source']
    })

# --- HABIT / ROUTINE API ROUTES ---
@app.route('/api/habits', methods=['GET', 'POST'])
def handle_habits():
    if request.method == 'POST':
        data = request.get_json()
        database.add_habit(data.get('name'))
        return jsonify({"status": "success"})
    return jsonify(database.get_today_habits())

@app.route('/api/habits/report', methods=['GET'])
def get_habit_report():
    data = database.get_routine_report()
    return jsonify(data)

@app.route('/api/habits/toggle', methods=['POST'])
def toggle_habit():
    data = request.get_json()
    database.toggle_habit(data.get('habit_id'))
    return jsonify({"status": "success"})

@app.route('/api/habits/<int:habit_id>', methods=['PUT'])
def update_habit(habit_id):
    data = request.get_json()
    database.edit_habit(habit_id, data.get('name'))
    return jsonify({"status": "success"})

@app.route('/api/habits/<int:habit_id>', methods=['DELETE'])
def delete_habit_route(habit_id):
    database.delete_habit(habit_id)
    return jsonify({"status": "success"})

# --- TASK API ROUTES ---
@app.route('/api/tasks', methods=['GET', 'POST'])
def handle_tasks():
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        title = str(data.get('title') or '').strip()
        if not title:
            return jsonify({"status": "error", "message": "Task title is required."}), 400

        database.add_task(
            title,
            data.get('deadline') or None,
            data.get('priority') or 'Medium'
        )
        return jsonify({"status": "success"})
    return jsonify(database.get_all_tasks())

@app.route('/api/tasks/<int:task_id>/toggle', methods=['PUT'])
def toggle_task(task_id):
    database.toggle_task_status(task_id)
    return jsonify({"status": "success"})

@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
def delete_task_route(task_id):
    database.delete_task(task_id)
    return jsonify({"status": "success"})

@app.route('/api/tasks/<int:task_id>', methods=['PUT'])
def update_task_route(task_id):
    data = request.get_json()
    database.edit_task(task_id, data.get('title'), data.get('deadline'), data.get('priority'))
    return jsonify({"status": "success"})

# --- GOAL API ROUTES ---
def normalize_iso_date(value):
    if not value:
        return None
    try:
        datetime.strptime(value, '%Y-%m-%d')
    except (TypeError, ValueError):
        raise ValueError('Date must use YYYY-MM-DD format.')
    return value

@app.route('/api/goals', methods=['GET', 'POST'])
def handle_goals():
    if request.method == 'GET':
        return jsonify(database.get_all_goals())

    data = request.get_json(silent=True) or {}
    title = str(data.get('title') or '').strip()
    description = str(data.get('description') or '').strip()

    if not title:
        return jsonify({"status": "error", "message": "Goal title is required."}), 400
    if len(title) > 120 or len(description) > 600:
        return jsonify({"status": "error", "message": "Goal content is too long."}), 400

    try:
        target_date = normalize_iso_date(data.get('target_date'))
    except ValueError as error:
        return jsonify({"status": "error", "message": str(error)}), 400

    goal_id = database.add_goal(title, description, target_date)
    return jsonify({
        "status": "success",
        "goal": database.get_goal(goal_id)
    }), 201

@app.route('/api/goals/<int:goal_id>', methods=['PUT', 'DELETE'])
def goal_detail(goal_id):
    existing_goal = database.get_goal(goal_id)
    if not existing_goal:
        return jsonify({"status": "error", "message": "Goal not found."}), 404

    if request.method == 'DELETE':
        database.delete_goal(goal_id)
        return jsonify({"status": "success"})

    data = request.get_json(silent=True) or {}
    title = str(data.get('title', existing_goal['title']) or '').strip()
    description = str(data.get('description', existing_goal['description']) or '').strip()

    if not title:
        return jsonify({"status": "error", "message": "Goal title is required."}), 400
    if len(title) > 120 or len(description) > 600:
        return jsonify({"status": "error", "message": "Goal content is too long."}), 400

    try:
        target_date = normalize_iso_date(data.get('target_date', existing_goal['target_date']))
    except ValueError as error:
        return jsonify({"status": "error", "message": str(error)}), 400

    try:
        progress = int(data.get('progress', existing_goal['progress']))
    except (TypeError, ValueError):
        return jsonify({"status": "error", "message": "Progress must be a number between 0 and 100."}), 400

    if progress < 0 or progress > 100:
        return jsonify({"status": "error", "message": "Progress must be between 0 and 100."}), 400

    database.edit_goal(goal_id, title, description, target_date, progress)
    return jsonify({
        "status": "success",
        "goal": database.get_goal(goal_id)
    })

# --- TODAY & DAILY JOURNAL API ROUTES ---
@app.route('/api/today/focus', methods=['GET', 'PUT'])
def today_focus():
    if request.method == 'GET':
        return jsonify({"goal": database.get_today_focus()})

    data = request.get_json(silent=True) or {}
    goal_id = data.get('goal_id')

    if goal_id in (None, ''):
        database.set_today_focus(None)
        return jsonify({"status": "success", "goal": None})

    try:
        goal_id = int(goal_id)
    except (TypeError, ValueError):
        return jsonify({"status": "error", "message": "Goal ID must be a number."}), 400

    goal = database.get_goal(goal_id)
    if not goal:
        return jsonify({"status": "error", "message": "Goal not found."}), 404
    if goal['status'] == 'Completed':
        return jsonify({"status": "error", "message": "Choose an active goal for today."}), 400

    database.set_today_focus(goal_id)
    return jsonify({"status": "success", "goal": database.get_today_focus()})

@app.route('/api/journal', methods=['GET'])
def recent_journal_entries():
    try:
        limit = max(1, min(30, int(request.args.get('limit', 7))))
    except (TypeError, ValueError):
        limit = 7
    return jsonify(database.get_recent_journal_entries(limit))

@app.route('/api/journal/<entry_date>', methods=['GET', 'PUT'])
def journal_entry(entry_date):
    try:
        normalized_date = normalize_iso_date(entry_date)
    except ValueError as error:
        return jsonify({"status": "error", "message": str(error)}), 400

    if request.method == 'GET':
        return jsonify(database.get_journal_entry(normalized_date))

    data = request.get_json(silent=True) or {}
    focus_note = str(data.get('focus_note') or '').strip()
    win_note = str(data.get('win_note') or '').strip()
    tomorrow_note = str(data.get('tomorrow_note') or '').strip()

    if any(len(value) > 1500 for value in (focus_note, win_note, tomorrow_note)):
        return jsonify({
            "status": "error",
            "message": "Each journal answer must be 1500 characters or fewer."
        }), 400

    entry = database.save_journal_entry(
        normalized_date,
        focus_note,
        win_note,
        tomorrow_note
    )
    return jsonify({"status": "success", "entry": entry})

def start_desktop_floating_timer():
    if os.name != 'nt':
        return None

    helper_path = (
        Path(__file__).resolve().parent
        / 'launcher'
        / 'desktop_floating_timer.py'
    )
    if not helper_path.exists():
        return None

    return subprocess.Popen(
        [
            sys.executable,
            str(helper_path),
            '--parent-pid',
            str(os.getpid())
        ],
        cwd=str(helper_path.parent.parent),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)
    )

if __name__ == '__main__':
    desktop_floating_timer = start_desktop_floating_timer()
    try:
        app.run(debug=True, port=5000, use_reloader=False)
    finally:
        if desktop_floating_timer and desktop_floating_timer.poll() is None:
            desktop_floating_timer.terminate()
