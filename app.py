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

# NEW: The missing Timer Route!
@app.route('/timer')
def timer_page():
    return render_template('timer.html')

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

@app.route('/api/logs/<int:log_id>', methods=['PUT'])
def update_time_log(log_id):
    data = request.get_json()
    database.edit_time_log(log_id, data.get('activity'), data.get('hours'))
    return jsonify({"status": "success"})

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

@app.route('/api/tasks/<int:task_id>', methods=['PUT'])
def update_task_route(task_id):
    data = request.get_json()
    database.edit_task(task_id, data.get('title'), data.get('deadline'), data.get('priority'))
    return jsonify({"status": "success"})

if __name__ == '__main__':
    app.run(debug=True, port=5000)