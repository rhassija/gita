import os
import sqlite3
import pandas as pd

# Check for production database first
db_path = 'chroma_prod.sqlite3'
if not os.path.exists(db_path):
    db_path = 'backend/chroma_db_backup/chroma.sqlite3'
if not os.path.exists(db_path):
    db_path = 'backend/chroma_db_ollama/chroma.sqlite3'

print(f"Connecting to database: {os.path.abspath(db_path)}")

if not os.path.exists(db_path):
    print("❌ Database file not found!")
    exit(1)

try:
    conn = sqlite3.connect(db_path)
    
    # Ensure the table is created
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question TEXT,
            answer TEXT,
            sources TEXT,
            feedback_value INTEGER,
            latency_ms REAL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()
    
    # Query logs
    df = pd.read_sql_query("SELECT id, question, feedback_value, latency_ms, timestamp FROM user_feedback ORDER BY timestamp DESC;", conn)
    conn.close()
    
    print("\n📊 --- USER FEEDBACK LOGS ---")
    if len(df) == 0:
        print("No feedback entries recorded yet.")
    else:
        print(df.to_string(index=False))
except Exception as e:
    print(f"❌ Error: {e}")
