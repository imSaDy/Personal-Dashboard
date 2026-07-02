import os
import sqlite3
from datetime import datetime, timedelta

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.environ.get(
    'LUMEN_DB_FILE',
    os.path.join(PROJECT_ROOT, 'database.db')
)

def get_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row 
    return conn

# --- UNIFIED DATABASE INITIALIZATION ---
def init_db():
    conn = get_connection()
    
    conn.execute('''
        CREATE TABLE IF NOT EXISTS time_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            activity TEXT NOT NULL,
            hours REAL NOT NULL,
            date TIMESTAMP DEFAULT (datetime('now', 'localtime'))
        )
    ''')
    
    conn.execute('''
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            deadline DATE,
            priority TEXT DEFAULT 'Medium',
            status TEXT DEFAULT 'Pending'
        )
    ''')
    
    conn.execute('''
        CREATE TABLE IF NOT EXISTS habits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL
        )
    ''')
    
    conn.execute('''
        CREATE TABLE IF NOT EXISTS habit_logs (
            habit_id INTEGER,
            log_date DATE DEFAULT (date('now', 'localtime'))
        )
    ''')

    conn.execute('''
        CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            target_date DATE,
            progress INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'Active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    conn.execute('''
        CREATE TABLE IF NOT EXISTS daily_focus (
            plan_date DATE PRIMARY KEY,
            goal_id INTEGER,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    conn.execute('''
        CREATE TABLE IF NOT EXISTS daily_journal (
            entry_date DATE PRIMARY KEY,
            focus_note TEXT NOT NULL DEFAULT '',
            win_note TEXT NOT NULL DEFAULT '',
            tomorrow_note TEXT NOT NULL DEFAULT '',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    conn.execute('''
        CREATE TABLE IF NOT EXISTS day_schedule_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_date DATE NOT NULL,
            session_type TEXT NOT NULL CHECK (
                session_type IN ('work', 'short', 'long')
            ),
            label TEXT NOT NULL DEFAULT '',
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CHECK (start_time < end_time)
        )
    ''')

    conn.execute('''
        CREATE INDEX IF NOT EXISTS idx_day_schedule_date_time
        ON day_schedule_sessions (plan_date, start_time, end_time)
    ''')

    conn.execute('''
        CREATE TABLE IF NOT EXISTS app_settings (
            setting_key TEXT PRIMARY KEY,
            setting_value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()

def get_boolean_setting(setting_key, default=True):
    conn = get_connection()
    cursor = conn.execute('''
        SELECT setting_value
        FROM app_settings
        WHERE setting_key = ?
    ''', (setting_key,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return bool(default)
    return str(row['setting_value']).strip().lower() in ('1', 'true', 'yes', 'on')

def set_boolean_setting(setting_key, enabled):
    normalized_value = 'true' if enabled else 'false'
    conn = get_connection()
    conn.execute('''
        INSERT INTO app_settings (setting_key, setting_value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(setting_key) DO UPDATE SET
            setting_value = excluded.setting_value,
            updated_at = CURRENT_TIMESTAMP
    ''', (setting_key, normalized_value))
    conn.commit()
    conn.close()
    return bool(enabled)

# --- DASHBOARD SUMMARY METRICS ---
def get_dashboard_metrics(timeframe='weekly'):
    conn = get_connection()
    
    # FIXED: '0 days' locks it exactly to midnight today, no rolling hours.
    if timeframe == 'daily':
        date_mod = '0 days'
        prev_mod = '-1 days'
    elif timeframe == 'monthly':
        date_mod = '-30 days'
        prev_mod = '-60 days'
    elif timeframe == 'yearly':
        date_mod = '-365 days'
        prev_mod = '-730 days'
    else: 
        date_mod = '-7 days'
        prev_mod = '-14 days'

    cursor = conn.execute(f"SELECT SUM(hours) as total FROM time_logs WHERE date >= date('now', '{date_mod}', 'localtime')")
    current_hours = cursor.fetchone()['total'] or 0.0

    cursor = conn.execute(f"SELECT SUM(hours) as total FROM time_logs WHERE date >= date('now', '{prev_mod}', 'localtime') AND date < date('now', '{date_mod}', 'localtime')")
    prev_hours = cursor.fetchone()['total'] or 0.0

    trend = 0
    if prev_hours > 0:
        trend = round(((current_hours - prev_hours) / prev_hours) * 100)
    elif current_hours > 0:
        trend = 100 

    cursor = conn.execute("SELECT COUNT(*) as count FROM tasks WHERE status != 'Completed'")
    active_tasks = cursor.fetchone()['count']
    
    conn.close()
    
    return {
        "total_hours": round(current_hours, 1),
        "trend_percentage": trend,
        "active_tasks": active_tasks
    }

# --- TIME LOG FUNCTIONS ---
def add_log(activity, hours):
    conn = get_connection()
    canonical_activity = get_canonical_activity_name(activity, conn)
    conn.execute('''
        INSERT INTO time_logs (activity, hours, date)
        VALUES (?, ?, datetime('now', 'localtime'))
    ''', (canonical_activity, hours))
    conn.commit()
    conn.close()
    return canonical_activity

def get_canonical_activity_name(activity, conn=None):
    normalized_activity = ' '.join(str(activity or '').split())
    owns_connection = conn is None
    if owns_connection:
        conn = get_connection()

    cursor = conn.execute('''
        SELECT trim(activity) AS activity
        FROM time_logs
        WHERE lower(trim(activity)) = lower(?)
        ORDER BY id DESC
        LIMIT 1
    ''', (normalized_activity,))
    row = cursor.fetchone()

    if owns_connection:
        conn.close()
    return row['activity'] if row else normalized_activity

def get_activity_suggestions(limit=30):
    conn = get_connection()
    cursor = conn.execute('''
        WITH activity_groups AS (
            SELECT
                lower(trim(activity)) AS activity_key,
                COUNT(*) AS usage_count,
                SUM(hours) AS total_hours,
                MAX(id) AS last_used_id
            FROM time_logs
            WHERE trim(activity) != ''
            GROUP BY lower(trim(activity))
        )
        SELECT
            trim(t.activity) AS name,
            g.usage_count,
            ROUND(g.total_hours, 1) AS total_hours,
            g.last_used_id
        FROM activity_groups g
        JOIN time_logs t ON t.id = g.last_used_id
        ORDER BY g.last_used_id DESC
        LIMIT ?
    ''', (limit,))
    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results

def get_activity_totals(timeframe='weekly'):
    conn = get_connection()
    
    # 1. Raw totals for Bar and Doughnut charts
    if timeframe == 'daily': date_mod = '0 days' 
    elif timeframe == 'monthly': date_mod = '-30 days'
    elif timeframe == 'yearly': date_mod = '-365 days'
    else: date_mod = '-7 days'

    cursor = conn.execute(f'''
        WITH activity_groups AS (
            SELECT
                lower(trim(activity)) AS activity_key,
                SUM(hours) AS total_hours,
                MAX(id) AS last_used_id
            FROM time_logs
            WHERE date >= date('now', '{date_mod}', 'localtime')
              AND trim(activity) != ''
            GROUP BY lower(trim(activity))
        )
        SELECT trim(t.activity) AS activity, g.total_hours
        FROM activity_groups g
        JOIN time_logs t ON t.id = g.last_used_id
        ORDER BY g.total_hours DESC
    ''')
    totals = [{"activity": row["activity"], "total_hours": row["total_hours"]} for row in cursor.fetchall()]

    # 2. Timeline totals for the Smooth Line chart
    if timeframe == 'daily':
        timeline_query = f'''
            SELECT strftime('%H', date) as period, SUM(hours) as total_hours
            FROM time_logs
            WHERE date >= date('now', 'localtime')
            GROUP BY period
            ORDER BY period ASC
        '''
    elif timeframe == 'monthly':
        timeline_query = f'''
            SELECT strftime('%Y-%W', date) as period, SUM(hours) as total_hours
            FROM time_logs
            WHERE date >= date('now', '-27 days', 'localtime')
            GROUP BY period
            ORDER BY period ASC
        '''
    elif timeframe == 'yearly':
        timeline_query = f'''
            SELECT strftime('%Y-%m', date) as period, SUM(hours) as total_hours
            FROM time_logs
            WHERE date >= date('now', '-11 months', 'localtime')
            GROUP BY period
            ORDER BY period ASC
        '''
    else: 
        timeline_query = f'''
            SELECT date(date) as period, SUM(hours) as total_hours
            FROM time_logs
            WHERE date >= date('now', '-6 days', 'localtime')
            GROUP BY period
            ORDER BY period ASC
        '''

    cursor = conn.execute(timeline_query)
    # Store existing database records in a quick-lookup map
    existing_timeline = {row["period"]: row["total_hours"] for row in cursor.fetchall()}

    # Construct the true chronological baseline sequence
    expected_periods = []
    now_local = datetime.now()

    if timeframe == 'daily':
        expected_periods = [f"{i:02d}" for i in range(24)]
    elif timeframe == 'monthly':
        for i in range(27, -1, -1):
            d = now_local - timedelta(days=i)
            p = d.strftime('%Y-%W')
            if p not in expected_periods:
                expected_periods.append(p)
    elif timeframe == 'yearly':
        current_year = now_local.year
        current_month = now_local.month
        for i in range(11, -1, -1):
            m = current_month - i
            y = current_year
            while m <= 0:
                m += 12
                y -= 1
            expected_periods.append(f"{y}-{m:02d}")
    else: # weekly
        for i in range(6, -1, -1):
            d = now_local - timedelta(days=i)
            expected_periods.append(d.strftime('%Y-%m-%d'))

    # Reassemble timeline layout forcing 0.0 values into data holes
    timeline = [{"period": p, "total_hours": existing_timeline.get(p, 0.0)} for p in expected_periods]

    conn.close()
    
    return {
        "totals": totals,
        "timeline": timeline
    }

def get_recent_logs(limit=5):
    conn = get_connection()
    cursor = conn.execute('SELECT id, activity, hours, date FROM time_logs ORDER BY id DESC LIMIT ?', (limit,))
    results = [{"id": row["id"], "activity": row["activity"], "hours": row["hours"], "date": row["date"]} for row in cursor.fetchall()]
    conn.close()
    return results

def delete_log(log_id):
    conn = get_connection()
    conn.execute('DELETE FROM time_logs WHERE id = ?', (log_id,))
    conn.commit()
    conn.close()

def edit_time_log(log_id, activity, hours):
    conn = get_connection()
    canonical_activity = get_canonical_activity_name(activity, conn)
    conn.execute('UPDATE time_logs SET activity = ?, hours = ? WHERE id = ?', (canonical_activity, hours, log_id))
    conn.commit()
    conn.close()
    return canonical_activity

# --- AUTOMATED DAY PLANNER FUNCTIONS ---
def _serialize_schedule_session(row):
    session = dict(row)
    start_hour, start_minute = map(int, session['start_time'].split(':'))
    end_hour, end_minute = map(int, session['end_time'].split(':'))
    session['duration_minutes'] = (
        (end_hour * 60 + end_minute)
        - (start_hour * 60 + start_minute)
    )
    return session

def get_schedule_sessions(plan_date):
    conn = get_connection()
    cursor = conn.execute('''
        SELECT
            id,
            plan_date,
            session_type,
            label,
            start_time,
            end_time,
            created_at,
            updated_at
        FROM day_schedule_sessions
        WHERE plan_date = ?
        ORDER BY start_time ASC, id ASC
    ''', (plan_date,))
    results = [_serialize_schedule_session(row) for row in cursor.fetchall()]
    conn.close()
    return results

def get_schedule_session(session_id):
    conn = get_connection()
    cursor = conn.execute('''
        SELECT
            id,
            plan_date,
            session_type,
            label,
            start_time,
            end_time,
            created_at,
            updated_at
        FROM day_schedule_sessions
        WHERE id = ?
    ''', (session_id,))
    row = cursor.fetchone()
    conn.close()
    return _serialize_schedule_session(row) if row else None

def schedule_session_overlaps(plan_date, start_time, end_time, exclude_id=None):
    conn = get_connection()
    parameters = [plan_date, end_time, start_time]
    exclude_clause = ''
    if exclude_id is not None:
        exclude_clause = 'AND id != ?'
        parameters.append(exclude_id)

    cursor = conn.execute(f'''
        SELECT 1
        FROM day_schedule_sessions
        WHERE plan_date = ?
          AND start_time < ?
          AND end_time > ?
          {exclude_clause}
        LIMIT 1
    ''', parameters)
    overlaps = cursor.fetchone() is not None
    conn.close()
    return overlaps

def add_schedule_session(plan_date, session_type, label, start_time, end_time):
    if schedule_session_overlaps(plan_date, start_time, end_time):
        raise ValueError('This time overlaps another session in the plan.')

    conn = get_connection()
    cursor = conn.execute('''
        INSERT INTO day_schedule_sessions (
            plan_date,
            session_type,
            label,
            start_time,
            end_time
        )
        VALUES (?, ?, ?, ?, ?)
    ''', (plan_date, session_type, label, start_time, end_time))
    session_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return get_schedule_session(session_id)

def edit_schedule_session(
    session_id,
    plan_date,
    session_type,
    label,
    start_time,
    end_time
):
    if schedule_session_overlaps(
        plan_date,
        start_time,
        end_time,
        exclude_id=session_id
    ):
        raise ValueError('This time overlaps another session in the plan.')

    conn = get_connection()
    cursor = conn.execute('''
        UPDATE day_schedule_sessions
        SET plan_date = ?,
            session_type = ?,
            label = ?,
            start_time = ?,
            end_time = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (
        plan_date,
        session_type,
        label,
        start_time,
        end_time,
        session_id
    ))
    conn.commit()
    updated = cursor.rowcount > 0
    conn.close()
    return get_schedule_session(session_id) if updated else None

def delete_schedule_session(session_id):
    conn = get_connection()
    cursor = conn.execute(
        'DELETE FROM day_schedule_sessions WHERE id = ?',
        (session_id,)
    )
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted

def replace_schedule_sessions(plan_date, sessions):
    conn = get_connection()
    try:
        conn.execute(
            'DELETE FROM day_schedule_sessions WHERE plan_date = ?',
            (plan_date,)
        )
        for session in sessions:
            conn.execute('''
                INSERT INTO day_schedule_sessions (
                    plan_date,
                    session_type,
                    label,
                    start_time,
                    end_time
                )
                VALUES (?, ?, ?, ?, ?)
            ''', (
                plan_date,
                session['session_type'],
                session['label'],
                session['start_time'],
                session['end_time']
            ))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return get_schedule_sessions(plan_date)

def clear_schedule_sessions(plan_date):
    conn = get_connection()
    cursor = conn.execute(
        'DELETE FROM day_schedule_sessions WHERE plan_date = ?',
        (plan_date,)
    )
    conn.commit()
    deleted_count = cursor.rowcount
    conn.close()
    return deleted_count

# --- HABIT / ROUTINE FUNCTIONS ---
def get_today_habits():
    conn = get_connection()
    cursor = conn.execute('''
        SELECT h.id, h.name, 
               CASE WHEN l.habit_id IS NOT NULL THEN 1 ELSE 0 END as completed
        FROM habits h
        LEFT JOIN habit_logs l ON h.id = l.habit_id AND l.log_date = date('now', 'localtime')
    ''')
    results = [{"id": row["id"], "name": row["name"], "completed": bool(row["completed"])} for row in cursor.fetchall()]
    conn.close()
    return results

def get_routine_report():
    conn = get_connection()
    
    cursor = conn.execute('SELECT COUNT(*) as count FROM habits')
    total_routines = cursor.fetchone()['count']
    
    if total_routines == 0:
        conn.close()
        return {"score": 0, "days": []}
        
    cursor = conn.execute('''
        SELECT log_date, COUNT(habit_id) as completions
        FROM habit_logs
        WHERE log_date >= date('now', '-6 days', 'localtime')
        GROUP BY log_date
    ''')
    completions_map = {row['log_date']: row['completions'] for row in cursor.fetchall()}
    
    days = []
    total_completions_week = 0
    
    for i in range(6, -1, -1):
        date_obj = datetime.now() - timedelta(days=i)
        date_str = date_obj.strftime('%Y-%m-%d')
        day_name = date_obj.strftime('%a') 
        
        daily_completed = completions_map.get(date_str, 0)
        total_completions_week += daily_completed
        
        percentage = round((daily_completed / total_routines) * 100)
        
        days.append({
            "date": date_str,
            "day_name": day_name,
            "completed": daily_completed,
            "total": total_routines,
            "percentage": percentage
        })
        
    overall_score = round((total_completions_week / (total_routines * 7)) * 100)
    
    conn.close()
    
    return {
        "score": overall_score,
        "days": days
    }

def toggle_habit(habit_id):
    conn = get_connection()
    cursor = conn.execute('SELECT 1 FROM habit_logs WHERE habit_id = ? AND log_date = date("now", "localtime")', (habit_id,))
    if cursor.fetchone():
        conn.execute('DELETE FROM habit_logs WHERE habit_id = ? AND log_date = date("now", "localtime")', (habit_id,))
    else:
        conn.execute('INSERT INTO habit_logs (habit_id) VALUES (?)', (habit_id,))
    conn.commit()
    conn.close()

def add_habit(name):
    conn = get_connection()
    conn.execute('INSERT INTO habits (name) VALUES (?)', (name,))
    conn.commit()
    conn.close()

def edit_habit(habit_id, name):
    conn = get_connection()
    conn.execute('UPDATE habits SET name = ? WHERE id = ?', (name, habit_id))
    conn.commit()
    conn.close()

def delete_habit(habit_id):
    conn = get_connection()
    conn.execute('DELETE FROM habits WHERE id = ?', (habit_id,))
    conn.execute('DELETE FROM habit_logs WHERE habit_id = ?', (habit_id,))
    conn.commit()
    conn.close()

# --- TASK MODULE FUNCTIONS ---
def get_all_tasks():
    conn = get_connection()
    cursor = conn.execute("SELECT * FROM tasks ORDER BY status DESC, deadline ASC")
    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results

def add_task(title, deadline, priority):
    conn = get_connection()
    conn.execute('INSERT INTO tasks (title, deadline, priority) VALUES (?, ?, ?)', (title, deadline, priority))
    conn.commit()
    conn.close()

def toggle_task_status(task_id):
    conn = get_connection()
    cursor = conn.execute('SELECT status FROM tasks WHERE id = ?', (task_id,))
    current_status = cursor.fetchone()['status']
    
    new_status = 'Completed' if current_status == 'Pending' else 'Pending'
    conn.execute('UPDATE tasks SET status = ? WHERE id = ?', (new_status, task_id))
    conn.commit()
    conn.close()

def delete_task(task_id):
    conn = get_connection()
    conn.execute('DELETE FROM tasks WHERE id = ?', (task_id,))
    conn.commit()
    conn.close()

def edit_task(task_id, title, deadline, priority):
    conn = get_connection()
    conn.execute('UPDATE tasks SET title = ?, deadline = ?, priority = ? WHERE id = ?', (title, deadline, priority, task_id))
    conn.commit()
    conn.close()

# --- GOAL MODULE FUNCTIONS ---
def get_all_goals():
    conn = get_connection()
    cursor = conn.execute('''
        SELECT id, title, description, target_date, progress, status, created_at, updated_at
        FROM goals
        ORDER BY
            CASE WHEN status = 'Completed' THEN 1 ELSE 0 END,
            CASE WHEN target_date IS NULL THEN 1 ELSE 0 END,
            target_date ASC,
            id DESC
    ''')
    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results

def get_goal(goal_id):
    conn = get_connection()
    cursor = conn.execute('''
        SELECT id, title, description, target_date, progress, status, created_at, updated_at
        FROM goals
        WHERE id = ?
    ''', (goal_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def add_goal(title, description='', target_date=None):
    conn = get_connection()
    cursor = conn.execute('''
        INSERT INTO goals (title, description, target_date)
        VALUES (?, ?, ?)
    ''', (title, description, target_date))
    goal_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return goal_id

def edit_goal(goal_id, title, description, target_date, progress):
    progress = max(0, min(100, int(progress)))
    status = 'Completed' if progress == 100 else 'Active'

    conn = get_connection()
    cursor = conn.execute('''
        UPDATE goals
        SET title = ?,
            description = ?,
            target_date = ?,
            progress = ?,
            status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (title, description, target_date, progress, status, goal_id))
    conn.commit()
    updated = cursor.rowcount > 0
    conn.close()
    return updated

def delete_goal(goal_id):
    conn = get_connection()
    cursor = conn.execute('DELETE FROM goals WHERE id = ?', (goal_id,))
    conn.execute('DELETE FROM daily_focus WHERE goal_id = ?', (goal_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted

# --- TODAY & DAILY JOURNAL FUNCTIONS ---
def get_today_focus():
    conn = get_connection()
    cursor = conn.execute('''
        SELECT
            g.id,
            g.title,
            g.description,
            g.target_date,
            g.progress,
            g.status
        FROM daily_focus f
        LEFT JOIN goals g ON g.id = f.goal_id
        WHERE f.plan_date = date('now', 'localtime')
    ''')
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row and row['id'] is not None else None

def set_today_focus(goal_id):
    conn = get_connection()
    if goal_id is None:
        conn.execute('''
            DELETE FROM daily_focus
            WHERE plan_date = date('now', 'localtime')
        ''')
    else:
        conn.execute('''
            INSERT INTO daily_focus (plan_date, goal_id, updated_at)
            VALUES (date('now', 'localtime'), ?, CURRENT_TIMESTAMP)
            ON CONFLICT(plan_date) DO UPDATE SET
                goal_id = excluded.goal_id,
                updated_at = CURRENT_TIMESTAMP
        ''', (goal_id,))
    conn.commit()
    conn.close()

def get_journal_entry(entry_date):
    conn = get_connection()
    cursor = conn.execute('''
        SELECT entry_date, focus_note, win_note, tomorrow_note, updated_at
        FROM daily_journal
        WHERE entry_date = ?
    ''', (entry_date,))
    row = cursor.fetchone()
    conn.close()

    if row:
        return dict(row)
    return {
        'entry_date': entry_date,
        'focus_note': '',
        'win_note': '',
        'tomorrow_note': '',
        'updated_at': None
    }

def save_journal_entry(entry_date, focus_note, win_note, tomorrow_note):
    conn = get_connection()
    conn.execute('''
        INSERT INTO daily_journal (
            entry_date,
            focus_note,
            win_note,
            tomorrow_note,
            updated_at
        )
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(entry_date) DO UPDATE SET
            focus_note = excluded.focus_note,
            win_note = excluded.win_note,
            tomorrow_note = excluded.tomorrow_note,
            updated_at = CURRENT_TIMESTAMP
    ''', (entry_date, focus_note, win_note, tomorrow_note))
    conn.commit()
    conn.close()
    return get_journal_entry(entry_date)

def get_recent_journal_entries(limit=7):
    conn = get_connection()
    cursor = conn.execute('''
        SELECT entry_date, focus_note, win_note, tomorrow_note, updated_at
        FROM daily_journal
        WHERE
            trim(focus_note) != ''
            OR trim(win_note) != ''
            OR trim(tomorrow_note) != ''
        ORDER BY entry_date DESC
        LIMIT ?
    ''', (limit,))
    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results
