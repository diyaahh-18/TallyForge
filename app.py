# pyrefly: ignore [missing-import]
from flask import Flask, send_from_directory, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash
import json
import os

app = Flask(__name__, static_folder='public', static_url_path='')
app.secret_key = os.environ.get('SECRET_KEY', 'tallyforge-secret-key-2026')

DATA_FILE = 'data.json'

# Helper function to read data from data.json
def read_data():
    if not os.path.exists(DATA_FILE):
        return {"users": [], "expenses": [], "study": []}
    try:
        with open(DATA_FILE, 'r') as f:
            content = f.read().strip()
            if not content:
                return {"users": [], "expenses": [], "study": []}
            data = json.loads(content)
            if "users" not in data:
                data["users"] = []
            if "expenses" not in data:
                data["expenses"] = []
            if "study" not in data:
                data["study"] = []
            return data
    except Exception:
        return {"users": [], "expenses": [], "study": []}

# Helper function to write data to data.json
def write_data(data):
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=4)

# Route to serve the frontend web page from public/index.html
@app.route('/')
def home():
    return send_from_directory('public', 'index.html')

# API Route to check current session / logged in status
@app.route('/api/current-user', methods=['GET'])
def current_user():
    username = session.get('username')
    if username:
        return jsonify({"logged_in": True, "username": username})
    return jsonify({"logged_in": False, "username": None})

# API Route to register a new user
@app.route('/api/register', methods=['POST'])
def register():
    payload = request.get_json() or {}
    username = (payload.get('username') or '').strip()
    password = (payload.get('password') or '').strip()

    if not username or not password:
        return jsonify({"status": "error", "message": "Username and password are required."}), 400

    if len(username) < 3:
        return jsonify({"status": "error", "message": "Username must be at least 3 characters long."}), 400

    if len(password) < 4:
        return jsonify({"status": "error", "message": "Password must be at least 4 characters long."}), 400

    data = read_data()
    for user in data.get('users', []):
        if user.get('username', '').lower() == username.lower():
            return jsonify({"status": "error", "message": "Username already exists. Please choose another."}), 409

    hashed_pw = generate_password_hash(password)
    data['users'].append({
        "username": username,
        "password": hashed_pw
    })
    write_data(data)

    # Automatically log the user in
    session['username'] = username
    return jsonify({
        "status": "success",
        "username": username,
        "message": f"Welcome to TallyForge, {username}! Account created successfully."
    }), 201

# API Route to log in an existing user
@app.route('/api/login', methods=['POST'])
def login():
    payload = request.get_json() or {}
    username = (payload.get('username') or '').strip()
    password = (payload.get('password') or '').strip()

    if not username or not password:
        return jsonify({"status": "error", "message": "Username and password are required."}), 400

    data = read_data()
    user_match = None
    for user in data.get('users', []):
        if user.get('username', '').lower() == username.lower():
            user_match = user
            break

    if not user_match or not check_password_hash(user_match.get('password', ''), password):
        return jsonify({"status": "error", "message": "Invalid username or password."}), 401

    session['username'] = user_match['username']
    return jsonify({
        "status": "success",
        "username": user_match['username'],
        "message": f"Welcome back to TallyForge, {user_match['username']}!"
    })

# API Route to log out
@app.route('/api/logout', methods=['POST'])
def logout():
    session.pop('username', None)
    return jsonify({"status": "success", "message": "Logged out successfully."})

# API Route for 1-click Live Demo access from Landing Page
@app.route('/api/demo-login', methods=['POST'])
def demo_login():
    data = read_data()
    # Check if demo user exists, if not create default
    has_demo = any(u.get('username') == 'demo' for u in data.get('users', []))
    if not has_demo:
        data.setdefault('users', []).append({
            "username": "demo",
            "password": generate_password_hash("demo123")
        })
        write_data(data)

    session['username'] = 'demo'
    return jsonify({
        "status": "success",
        "username": "demo",
        "message": "Demo mode activated! Welcome to the live interactive TallyForge experience."
    })

# API Route to fetch expenses and study logs for the logged-in user
@app.route('/api/get-data', methods=['GET'])
def get_data():
    username = session.get('username')
    if not username:
        return jsonify({"error": "Unauthorized", "message": "Please log in to view data."}), 401

    data = read_data()
    user_expenses = [e for e in data.get('expenses', []) if e.get('username') == username]
    user_study = [s for s in data.get('study', []) if s.get('username') == username]

    # Optional date filtering
    filter_date = request.args.get('date')
    if filter_date:
        user_expenses = [e for e in user_expenses if e.get('date') == filter_date]
        user_study = [s for s in user_study if s.get('date') == filter_date]

    return jsonify({
        "username": username,
        "expenses": user_expenses,
        "study": user_study,
        "filter_date": filter_date
    })

# Helper function to normalize tags into clean hashtag format (e.g. ['#ExamPrep', '#Snacks'])
def normalize_tags(tags_input):
    if not tags_input:
        return []
    import re
    if isinstance(tags_input, list):
        raw_list = []
        for item in tags_input:
            if isinstance(item, str):
                tokens = re.findall(r'#[A-Za-z0-9_-]+|[A-Za-z0-9_-]+', item)
                raw_list.extend(tokens)
            elif item:
                raw_list.append(str(item))
    elif isinstance(tags_input, str):
        raw_list = re.findall(r'#[A-Za-z0-9_-]+|[A-Za-z0-9_-]+', tags_input)
    else:
        return []
    
    cleaned = []
    for t in raw_list:
        if not t:
            continue
        tag = str(t).strip()
        if not tag:
            continue
        # Ensure starts with #
        if not tag.startswith('#'):
            tag = '#' + tag
        if tag and tag not in cleaned:
            cleaned.append(tag)
    return cleaned

# API Route to save new expense entries for logged-in user
@app.route('/api/add-expense', methods=['POST'])
def add_expense():
    username = session.get('username')
    if not username:
        return jsonify({"error": "Unauthorized", "message": "Please log in to log expenses."}), 401

    data = read_data()
    new_entry = request.get_json() or {}

    category = (new_entry.get('category') or '').strip()
    amount = new_entry.get('amount')
    date = (new_entry.get('date') or '').strip()
    tags = normalize_tags(new_entry.get('tags'))

    if not category or amount is None or not date:
        return jsonify({"status": "error", "message": "Missing required fields."}), 400

    try:
        amount_val = float(amount)
        if amount_val <= 0:
            return jsonify({"status": "error", "message": "Amount must be greater than 0."}), 400
    except (ValueError, TypeError):
        return jsonify({"status": "error", "message": "Amount must be a valid number."}), 400

    expense_record = {
        "username": username,
        "category": category,
        "amount": str(amount_val),
        "date": date,
        "tags": tags
    }

    data['expenses'].append(expense_record)
    write_data(data)
    return jsonify({"status": "success", "message": "Expense logged successfully!", "record": expense_record})

# API Route to save new study session entries for logged-in user
@app.route('/api/add-study', methods=['POST'])
def add_study():
    username = session.get('username')
    if not username:
        return jsonify({"error": "Unauthorized", "message": "Please log in to log study sessions."}), 401

    data = read_data()
    new_entry = request.get_json() or {}

    subject = (new_entry.get('subject') or '').strip()
    hours = new_entry.get('hours')
    date = (new_entry.get('date') or '').strip()
    tags = normalize_tags(new_entry.get('tags'))

    if not subject or hours is None or not date:
        return jsonify({"status": "error", "message": "Missing required fields."}), 400

    try:
        hours_val = float(hours)
        if hours_val <= 0:
            return jsonify({"status": "error", "message": "Study hours must be greater than 0."}), 400
    except (ValueError, TypeError):
        return jsonify({"status": "error", "message": "Study hours must be a valid decimal number."}), 400

    study_record = {
        "username": username,
        "subject": subject,
        "hours": str(hours_val),
        "date": date,
        "tags": tags
    }

    data['study'].append(study_record)
    write_data(data)
    return jsonify({"status": "success", "message": "Study session logged successfully!", "record": study_record})

# Entry point to run the application
if __name__ == '__main__':
    print("Starting TallyForge Flask web server on http://127.0.0.1:8080 ...")
    app.run(host='0.0.0.0', port=8080, debug=True)