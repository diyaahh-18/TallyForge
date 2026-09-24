# pyrefly: ignore [missing-import]
from flask import Flask, send_from_directory, request, jsonify, session
# pyrefly: ignore [missing-import]
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import timedelta
import json
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')
DATA_FILE = os.path.join(BASE_DIR, 'data.json')

app = Flask(__name__, static_folder=PUBLIC_DIR, static_url_path='')
app.secret_key = os.environ.get('SECRET_KEY', 'tallyforge-secret-key-2026')
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
    SESSION_COOKIE_SECURE=False,
    PERMANENT_SESSION_LIFETIME=timedelta(days=7)
)

# Global in-memory cache to support serverless environments (read-only filesystem)
_IN_MEMORY_DATA = None

def get_initial_data():
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if content:
                    return json.loads(content)
        except Exception as e:
            print(f"Notice: Could not read data file {DATA_FILE}: {e}")
    return {
        "users": [
            {
                "username": "demo",
                "password": "scrypt:32768:8:1$v1W89ibb5iFXpvRM$6b32ab88e401069adf2bc031598bde6f28961800dc2c64496df939dc95e612e6650b52a50d083baad10641881bee0a71aacdd1b805e453df191b99e1f5910fa3"
            }
        ],
        "expenses": [],
        "study": []
    }

# Helper function to read data safely
def read_data():
    global _IN_MEMORY_DATA
    if _IN_MEMORY_DATA is None:
        _IN_MEMORY_DATA = get_initial_data()
    if not isinstance(_IN_MEMORY_DATA, dict):
        _IN_MEMORY_DATA = {"users": [], "expenses": [], "study": []}
    _IN_MEMORY_DATA.setdefault("users", [])
    _IN_MEMORY_DATA.setdefault("expenses", [])
    _IN_MEMORY_DATA.setdefault("study", [])
    return _IN_MEMORY_DATA

# Helper function to write data safely without crashing on read-only serverless filesystems
def write_data(data):
    global _IN_MEMORY_DATA
    _IN_MEMORY_DATA = data
    try:
        with open(DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4)
        return True
    except Exception as e:
        # On serverless platforms like Vercel, the local filesystem is read-only.
        # Data is maintained seamlessly in memory and synced client-side.
        print(f"Notice: Serverless read-only filesystem ({e}). Maintained in memory/session.")
        return False

# Route to serve the frontend web page from public/index.html
@app.route('/')
def index():
    return send_from_directory(PUBLIC_DIR, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    if os.path.exists(os.path.join(PUBLIC_DIR, path)):
        return send_from_directory(PUBLIC_DIR, path)
    return send_from_directory(PUBLIC_DIR, 'index.html')

# API Route to check current session / logged in status
@app.route('/api/current-user', methods=['GET'])
def current_user():
    username = session.get('username')
    if not username:
        # Fallback query param for client-side demo state
        username = request.args.get('username')
    if username:
        return jsonify({"logged_in": True, "username": username})
    return jsonify({"logged_in": False, "username": None})

# API Route to register a new user
@app.route('/api/register', methods=['POST'])
def register():
    payload = request.get_json(silent=True) or {}
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
    session.permanent = True
    return jsonify({
        "status": "success",
        "username": username,
        "message": f"Welcome to TallyForge, {username}! Account created successfully."
    }), 201

# API Route to log in an existing user
@app.route('/api/login', methods=['POST'])
def login():
    payload = request.get_json(silent=True) or {}
    username = (payload.get('username') or '').strip()
    password = (payload.get('password') or '').strip()

    # Instant demo user support without requiring disk write or password check
    if not username or username.lower() == 'demo':
        session['username'] = 'demo'
        session.permanent = True
        return jsonify({
            "status": "success",
            "username": "demo",
            "message": "Welcome back to TallyForge, demo!"
        })

    data = read_data()
    user_match = None
    for user in data.get('users', []):
        if user.get('username', '').lower() == username.lower():
            user_match = user
            break

    if user_match:
        if check_password_hash(user_match.get('password', ''), password) or user_match.get('password') == password:
            session['username'] = user_match['username']
            session.permanent = True
            return jsonify({
                "status": "success",
                "username": user_match['username'],
                "message": f"Welcome back to TallyForge, {user_match['username']}!"
            })
        else:
            return jsonify({"status": "error", "message": "Invalid password for user."}), 401

    # In serverless/demo environment, allow signing in as the requested username seamlessly
    session['username'] = username
    session.permanent = True
    return jsonify({
        "status": "success",
        "username": username,
        "message": f"Welcome to TallyForge, {username}!"
    })

# API Route to log out
@app.route('/api/logout', methods=['GET', 'POST'])
def logout():
    session.pop('username', None)
    return jsonify({"status": "success", "message": "Logged out successfully."})

# API Route for 1-click Live Demo access from Landing Page
@app.route('/api/demo-login', methods=['GET', 'POST'])
def demo_login():
    session['username'] = 'demo'
    session.permanent = True
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
        # Check query parameter for client-side demo state
        username = request.args.get('username') or 'demo'

    data = read_data()
    user_expenses = [e for e in data.get('expenses', []) if e.get('username') == username]
    user_study = [s for s in data.get('study', []) if s.get('username') == username]

    # If demo user has no entries or user has no records, fallback to all demo records
    if username == 'demo' and not user_expenses and not user_study:
        user_expenses = [e for e in data.get('expenses', []) if e.get('username') == 'demo']
        user_study = [s for s in data.get('study', []) if s.get('username') == 'demo']

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
    username = session.get('username') or request.args.get('username') or 'demo'

    data = read_data()
    new_entry = request.get_json(silent=True) or {}

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
    username = session.get('username') or request.args.get('username') or 'demo'

    data = read_data()
    new_entry = request.get_json(silent=True) or {}

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