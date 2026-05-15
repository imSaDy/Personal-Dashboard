from flask import Flask, render_template, request, jsonify
import database 

app = Flask(__name__)

# Boot up the database
database.init_db()

# --- PAGE ROUTES ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/habits')
def habits_page():
    return render_template('habits.html')

@app.route('/tasks')
def tasks_page():
    return render_template('tasks.html')

# --- DASHBOARD METRICS ROUTE ---
@app.route('/api/metrics', methods=['GET'])
def get_metrics():
    # Expects ?timeframe=weekly, daily, monthly, etc. Defaults to weekly.
    timeframe = request.args.get('timeframe', 'weekly')
    data = database.get_dashboard_metrics(timeframe)
    return jsonify(data)

# --- ANALYTICS ROUTE (With Timeframe filtering) ---
@app.route('/api/analytics', methods=['GET'])
def get_analytics():
    timeframe = request.args.get('timeframe', 'weekly')
    data = database.get_activity_totals(timeframe)
    return jsonify(data)

# --- TIME LOG API ROUTES ---
@app.route('/log', methods=['POST'])
def log_time():
    data = request.get_json()
    database.add_log(data.get('activity'), data.get('hours'))
    return jsonify({"status": "success", "message": "Log saved."})

@app.route('/api/logs/recent', methods=['GET'])
def get_recent_logs():
    data = database.get_recent_logs()
    return jsonify(data)

@app.route('/api/logs/<int:log_id>', methods=['DELETE'])
def delete_time_log(log_id):
    database.delete_log(log_id)
    return jsonify({"status": "success", "message": "Log purged."})

# --- ROUTINE/HABIT API ROUTES ---
@app.route('/api/habits', methods=['GET', 'POST'])
def handle_habits():
    # POST handles the "New Routine" button creation
    if request.method == 'POST':
        data = request.get_json()
        database.add_habit(data.get('name'))
        return jsonify({"status": "success"})
    
    # GET handles loading the daily matrix
    return jsonify(database.get_today_habits())

@app.route('/api/habits/toggle', methods=['POST'])
def toggle_habit():
    data = request.get_json()
    database.toggle_habit(data.get('habit_id'))
    return jsonify({"status": "success"})

# --- TASK API ROUTES ---
@app.route('/api/tasks', methods=['GET', 'POST'])
def handle_tasks():
    if request.method == 'POST':
        data = request.get_json()
        database.add_task(data.get('title'), data.get('deadline'), data.get('priority'))
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

if __name__ == '__main__':
    app.run(debug=True, port=5000)