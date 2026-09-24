import sys
import os

# Ensure root directory is in sys.path so app.py is always importable on Vercel
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app

# Needed for Vercel Serverless execution
if __name__ == '__main__':
    app.run()
