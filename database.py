import sqlite3
from datetime import datetime, timedelta

DB_FILE = 'database.db'

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
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
            log_date DATE DEFAULT (date('now', 'localtime')),
            PRIMARY KEY (habit_id, log_date)
        )
    ''')
    
    cursor = conn.execute('SELECT COUNT(*) FROM habits')
    if cursor.fetchone()[0] == 0:
        conn.execute('INSERT INTO habits (name) VALUES ("Morning Review"), ("Daily Exercise"), ("Deep Work")')
    
    conn.commit()
    conn.close()

# --- DASHBOARD SUMMARY METRICS ---
def get_dashboard_metrics(timeframe='weekly'):
    conn = get_connection()
    
    if timeframe == 'daily':
        date_mod = '-1 days'
        prev_mod = '-2 days'
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
    conn.execute('INSERT INTO time_logs (activity, hours) VALUES (?, ?)', (activity, hours))
    conn.commit()
    conn.close()

def get_activity_totals(timeframe='weekly'):
    conn = get_connection()
    
    # 1. Raw totals for Bar and Doughnut charts
    if timeframe == 'daily': date_mod = '-1 days'
    elif timeframe == 'monthly': date_mod = '-30 days'
    elif timeframe == 'yearly': date_mod = '-365 days'
    else: date_mod = '-7 days'

    cursor = conn.execute(f'''
        SELECT activity, SUM(hours) as total_hours 
        FROM time_logs 
        WHERE date >= date('now', '{date_mod}', 'localtime')
        GROUP BY activity
    ''')
    totals = [{"activity": row["activity"], "total_hours": row["total_hours"]} for row in cursor.fetchall()]

    # 2. Timeline totals for the Smooth Line chart (Total hours per period)
    if timeframe == 'daily':
        timeline_query = f'''
            SELECT strftime('%H', date) as period, SUM(hours) as total_hours
            FROM time_logs
            WHERE date >= datetime('now', '-24 hours', 'localtime')
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
    timeline = [{"period": row["period"], "total_hours": row["total_hours"]} for row in cursor.fetchall()]

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
    conn.execute('UPDATE time_logs SET activity = ?, hours = ? WHERE id = ?', (activity, hours, log_id))
    conn.commit()
    conn.close()

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

# NEW: 7-Day Routine Report
def get_routine_report():
    conn = get_connection()
    
    # 1. Total active routines currently in the database
    cursor = conn.execute('SELECT COUNT(*) as count FROM habits')
    total_routines = cursor.fetchone()['count']
    
    if total_routines == 0:
        conn.close()
        return {"score": 0, "days": []}
        
    # 2. Get completions grouped by date for the last 7 days
    cursor = conn.execute('''
        SELECT log_date, COUNT(habit_id) as completions
        FROM habit_logs
        WHERE log_date >= date('now', '-6 days', 'localtime')
        GROUP BY log_date
    ''')
    completions_map = {row['log_date']: row['completions'] for row in cursor.fetchall()}
    
    # 3. Build the 7-day array, filling in days with 0 if no routines were completed
    days = []
    total_completions_week = 0
    
    for i in range(6, -1, -1):
        date_obj = datetime.now() - timedelta(days=i)
        date_str = date_obj.strftime('%Y-%m-%d')
        day_name = date_obj.strftime('%a') # Returns 'Mon', 'Tue', etc.
        
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
        
    # Calculate the overall score out of 100%
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